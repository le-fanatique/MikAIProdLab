import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import {
  insertProject,
  insertSequence,
  insertShot,
  insertSequenceStoryboardImage,
  insertStoryboardExtraction,
  insertExtractionRegion,
  readExtraction,
  readExtractionRegions,
  readStoryboardImagesByShot,
  readShotReferenceImages,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// storyboardExtraction — IND.STORYBOARD.1. Characterization tests: they lock
// down `src/actions/storyboardExtraction.ts` exactly as it behaves today, as
// the net the future split of this 1 016-line file will land on. No
// production behavior is changed by this ticket.
//
// `startStoryboardExtraction` and `confirmStoryboardExtraction` are the only
// two actions that reach `src/lib/storyboardExtraction/opencvWorker.ts`
// (runDetect/runCrop), which spawns a real Python (+ OpenCV) subprocess.
// Unlike the bundled ffmpeg binary the sequenceVideoSplit precedent relies
// on, there is no vendored Python interpreter in this repo — `OPENCV_PYTHON_BIN`
// falls back to a bare "python3", whose availability and behavior differ by
// machine (on the Windows box this ran on, "python3" resolves to a
// Microsoft-Store stub, not a real interpreter). Testing the real subprocess
// path here would make the suite's pass/fail depend on the machine it runs
// on, which is not a valid characterization test.
//
// `opencvWorker`'s `runDetect`/`runCrop` are therefore replaced with test
// doubles via `vi.mock` — a test-file-only substitution, no production file
// is touched. This still exercises 100% of the REAL server-action code (the
// geometry/ordering/mapping/crop-region math this ticket prioritizes) with a
// controlled, deterministic worker response, exactly the same principle as
// swapping `DB_PATH` for a throwaway database. For the two "the subprocess
// genuinely failed" cases, the mock delegates to the REAL `runDetect`/
// `runCrop` (via `vi.importActual`) against a source path that simply does
// not exist on disk — `validateInputImage`'s `fs.stat` rejects it before any
// subprocess is ever spawned, so this exercises real production code and
// stays 100% deterministic across machines.
// ---------------------------------------------------------------------------

const { mockRunDetect, mockRunCrop } = vi.hoisted(() => ({
  mockRunDetect: vi.fn(),
  mockRunCrop: vi.fn(),
}));

vi.mock("@/lib/storyboardExtraction/opencvWorker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storyboardExtraction/opencvWorker")>();
  return { ...actual, runDetect: mockRunDetect, runCrop: mockRunCrop };
});

let ctx: TempDb;
let actions: typeof import("@/actions/storyboardExtraction");
let actualRunDetect: typeof import("@/lib/storyboardExtraction/opencvWorker")["runDetect"];
let actualRunCrop: typeof import("@/lib/storyboardExtraction/opencvWorker")["runCrop"];

let projectId: number;
let sequenceId: number;
let otherSequenceId: number;
let sourceImageId: number;

/** shot-<id> destination directories actually written to disk by a confirm-happy-path test — removed in afterAll. */
const confirmShotDirsToCleanup: number[] = [];

/**
 * A dedicated, empty-of-Shots sequence — used only by tests that read EVERY
 * Shot belonging to a sequenceId (assignAllExtractionRegions and
 * startStoryboardExtraction's own Shot-mapping). Every other describe block
 * in this file freely inserts Shots into the shared `sequenceId` fixture;
 * reusing that same id here would silently pollute "all Shots for this
 * Sequence, in order" with rows from unrelated tests and make assertions
 * about exact Shot order/count flaky (same pattern as sequenceVideoSplit's
 * own `freshSequence`).
 */
async function freshSequence(): Promise<number> {
  return insertSequence(ctx, projectId, { title: `Isolated sequence ${Date.now()}-${Math.random()}` });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  actions = await import("@/actions/storyboardExtraction");
  const real = await vi.importActual<typeof import("@/lib/storyboardExtraction/opencvWorker")>(
    "@/lib/storyboardExtraction/opencvWorker"
  );
  actualRunDetect = real.runDetect;
  actualRunCrop = real.runCrop;

  projectId = await insertProject(ctx, "Storyboard extraction project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, projectId, { title: "Other sequence" });
  sourceImageId = await insertSequenceStoryboardImage(ctx, sequenceId);
});

afterEach(() => {
  mockRunDetect.mockReset();
  mockRunCrop.mockReset();
});

afterAll(async () => {
  ctx.cleanup();
  for (const shotId of confirmShotDirsToCleanup) {
    await rm(path.join(process.cwd(), "public", "uploads", "storyboard-images", `shot-${shotId}`), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// addExtractionRegion — geometry: default centered box, orderIndex continuity
// ---------------------------------------------------------------------------

describe("addExtractionRegion", () => {
  it("adds a centered 30%x30% region at the next orderIndex, and records its Content Crop base rect", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });

    await captureRedirect(() =>
      actions.addExtractionRegion(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    const regions = await readExtractionRegions(ctx, extractionId);
    expect(regions).toHaveLength(2);
    const added = regions[1];
    expect(added.orderIndex).toBe(1);
    expect(added.width).toBe(300); // round(1000*0.3)
    expect(added.height).toBe(240); // round(800*0.3)
    expect(added.x).toBe(350); // round((1000-300)/2)
    expect(added.y).toBe(280); // round((800-240)/2)
    expect(added.detectionMode).toBe("manual");
    expect(added.status).toBe("pending");
    expect(added.confidence).toBe(1);
    expect(added.targetShotId).toBeNull();

    const extraction = await readExtraction(ctx, extractionId);
    const params = JSON.parse(extraction.paramsJson!);
    expect(params.contentCropBaseRects["1"]).toEqual({ x: 350, y: 280, width: 300, height: 240 });
  });

  it("continues orderIndex from the max existing value, not from the region count — a gap left by a prior delete is never reused", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });
    await insertExtractionRegion(ctx, extractionId, { orderIndex: 5 }); // simulates a gap (e.g. after other deletions)

    await captureRedirect(() =>
      actions.addExtractionRegion(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    const regions = await readExtractionRegions(ctx, extractionId);
    expect(regions.map((r) => r.orderIndex)).toEqual([0, 5, 6]); // next = max(0,5)+1 = 6, not count(2)
  });

  it("clamps the default box to a minimum of 8px on a tiny source image", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 10, sourceHeight: 10 });

    await captureRedirect(() =>
      actions.addExtractionRegion(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    const [added] = await readExtractionRegions(ctx, extractionId);
    expect(added.width).toBe(8); // max(8, round(10*0.3)=3)
    expect(added.height).toBe(8);
    expect(added.x).toBe(1); // round((10-8)/2)
    expect(added.y).toBe(1);
  });

  it("refuses when the extraction is not in the ready state, and writes nothing", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { status: "confirmed" });
    await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });
    const before = await readExtractionRegions(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.addExtractionRegion(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("This extraction can no longer be edited."));
    expect(await readExtractionRegions(ctx, extractionId)).toEqual(before);
  });

  it("refuses an unknown extraction", async () => {
    const target = await captureRedirect(() =>
      actions.addExtractionRegion(form({ extractionId: "999999", returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("Extraction not found."));
  });
});

// ---------------------------------------------------------------------------
// resizeExtractionRegion — geometry bounds
// ---------------------------------------------------------------------------

describe("resizeExtractionRegion", () => {
  it("updates x/y/width/height when the new rectangle is within bounds", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const regionId = await insertExtractionRegion(ctx, extractionId);

    await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "10", y: "20", width: "300", height: "200", returnTo: "/x" })
      )
    );

    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(300);
    expect(region.height).toBe(200);
  });

  it("accepts a rectangle that exactly touches the source image's far edge (x+width === sourceWidth)", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const regionId = await insertExtractionRegion(ctx, extractionId);

    await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "700", y: "600", width: "300", height: "200", returnTo: "/x" })
      )
    );

    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.x).toBe(700);
    expect(region.width).toBe(300);
  });

  it("refuses a rectangle one pixel past the source image bounds, and writes nothing", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const regionId = await insertExtractionRegion(ctx, extractionId, { x: 1, y: 1, width: 10, height: 10 });
    const before = (await readExtractionRegions(ctx, extractionId))[0];

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "701", y: "600", width: "300", height: "200", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Region is outside the source image bounds."));
    expect((await readExtractionRegions(ctx, extractionId))[0]).toEqual(before);
  });

  it("refuses a zero or negative width/height", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "0", y: "0", width: "0", height: "10", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Region dimensions must be positive."));
  });

  it("refuses a negative x or y", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "-1", y: "0", width: "10", height: "10", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Region dimensions must be positive."));
  });

  it("refuses genuinely non-numeric coordinates", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "abc", y: "0", width: "10", height: "10", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Invalid request."));
  });

  it("CHARACTERIZATION: a decimal coordinate is silently truncated, not refused — x/y/width/height use plain parseInt (no whole-string regex, unlike the strict parsers used elsewhere in this file)", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const regionId = await insertExtractionRegion(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "1.9", y: "0", width: "10", height: "10", returnTo: "/x" })
      )
    );

    expect(target).toBe("/x?extractRegionResized=1"); // succeeds — parseInt("1.9", 10) === 1
    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.x).toBe(1);
  });

  it("refuses to resize a region that has already been extracted, and writes nothing", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "extracted", x: 1, y: 1, width: 10, height: 10 });
    const before = (await readExtractionRegions(ctx, extractionId))[0];

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), x: "5", y: "5", width: "20", height: "20", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("This region has already been extracted and can no longer be edited."));
    expect((await readExtractionRegions(ctx, extractionId))[0]).toEqual(before);
  });

  it("refuses a region that does not belong to this extraction", async () => {
    const extractionA = await insertStoryboardExtraction(ctx, sequenceId);
    const extractionB = await insertStoryboardExtraction(ctx, sequenceId);
    const regionInB = await insertExtractionRegion(ctx, extractionB);

    const target = await captureRedirect(() =>
      actions.resizeExtractionRegion(
        form({ extractionId: String(extractionA), regionId: String(regionInB), x: "0", y: "0", width: "10", height: "10", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Region does not belong to this extraction."));
  });
});

// ---------------------------------------------------------------------------
// reassignExtractionRegion — Shot mapping
// ---------------------------------------------------------------------------

describe("reassignExtractionRegion", () => {
  it("assigns a Shot from the same Sequence and marks the region assigned", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId);

    await captureRedirect(() =>
      actions.reassignExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), targetShotId: String(shotId), returnTo: "/x" })
      )
    );

    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.targetShotId).toBe(shotId);
    expect(region.status).toBe("assigned");
  });

  it("clears the assignment to pending when targetShotId is blank", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "assigned", targetShotId: shotId });

    await captureRedirect(() =>
      actions.reassignExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), targetShotId: "", returnTo: "/x" })
      )
    );

    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.targetShotId).toBeNull();
    expect(region.status).toBe("pending");
  });

  it("refuses a Shot belonging to a different Sequence, and writes nothing", async () => {
    const foreignShotId = await insertShot(ctx, otherSequenceId, { title: "Foreign shot" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId);
    const before = (await readExtractionRegions(ctx, extractionId))[0];

    const target = await captureRedirect(() =>
      actions.reassignExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), targetShotId: String(foreignShotId), returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Shot does not belong to this Sequence."));
    expect((await readExtractionRegions(ctx, extractionId))[0]).toEqual(before);
  });

  it("refuses an unknown Shot id", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.reassignExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), targetShotId: "999999", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Shot not found."));
  });

  it("refuses a region that has already been extracted", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "extracted" });

    const target = await captureRedirect(() =>
      actions.reassignExtractionRegion(
        form({ extractionId: String(extractionId), regionId: String(regionId), targetShotId: String(shotId), returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("This region has already been extracted and can no longer be edited."));
  });
});

// ---------------------------------------------------------------------------
// skipExtractionRegion — CHARACTERIZATION: unlike sequenceVideoSplit's
// skipSegment, this action does NOT clear targetShotId. Frozen as-is, not
// corrected — see the ticket's "tests de caractérisation" contract.
// ---------------------------------------------------------------------------

describe("skipExtractionRegion", () => {
  it("marks the region skipped but leaves targetShotId untouched (characterization: no clearing, unlike the analogous sequenceVideoSplit action)", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "assigned", targetShotId: shotId });

    const target = await captureRedirect(() =>
      actions.skipExtractionRegion(form({ extractionId: String(extractionId), regionId: String(regionId), returnTo: "/x" }))
    );
    expect(target).toBe("/x?extractRegionSkipped=1");

    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.status).toBe("skipped");
    expect(region.targetShotId).toBe(shotId); // NOT cleared — frozen as observed
  });

  it("refuses a region that does not belong to this extraction, and writes nothing", async () => {
    const extractionA = await insertStoryboardExtraction(ctx, sequenceId);
    const extractionB = await insertStoryboardExtraction(ctx, sequenceId);
    const regionInB = await insertExtractionRegion(ctx, extractionB);
    const before = (await readExtractionRegions(ctx, extractionB))[0];

    const target = await captureRedirect(() =>
      actions.skipExtractionRegion(form({ extractionId: String(extractionA), regionId: String(regionInB), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Region does not belong to this extraction."));
    expect((await readExtractionRegions(ctx, extractionB))[0]).toEqual(before);
  });

  it("refuses a region that has already been extracted", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "extracted" });

    const target = await captureRedirect(() =>
      actions.skipExtractionRegion(form({ extractionId: String(extractionId), regionId: String(regionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("This region has already been extracted and can no longer be edited."));
  });
});

// ---------------------------------------------------------------------------
// deleteExtractionRegion — destructive. Proof of what survives.
// CHARACTERIZATION: unlike addExtractionRegion/resizeAllExtractionRegions,
// this action never checks the parent extraction's own status — only the
// region's own "not already extracted" gate (via loadEditableRegion).
// ---------------------------------------------------------------------------

describe("deleteExtractionRegion", () => {
  it("removes only the targeted region; a sibling region's every column is untouched", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const keptId = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0, x: 5, y: 5, width: 50, height: 60 });
    const deletedId = await insertExtractionRegion(ctx, extractionId, { orderIndex: 1 });
    const keptBefore = (await readExtractionRegions(ctx, extractionId)).find((r) => r.id === keptId)!;

    await captureRedirect(() =>
      actions.deleteExtractionRegion(form({ extractionId: String(extractionId), regionId: String(deletedId), returnTo: "/x" }))
    );

    const remaining = await readExtractionRegions(ctx, extractionId);
    expect(remaining).toHaveLength(1);
    expect(remaining.map((r) => r.id)).not.toContain(deletedId); // genuinely gone
    expect(remaining[0]).toEqual(keptBefore); // the survivor's own row is byte-for-byte unchanged
  });

  it("CHARACTERIZATION: deletes a region even when the parent extraction is no longer 'ready' (e.g. already confirmed) — no extraction-status gate on this action", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { status: "confirmed" });
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "pending" });

    const target = await captureRedirect(() =>
      actions.deleteExtractionRegion(form({ extractionId: String(extractionId), regionId: String(regionId), returnTo: "/x" }))
    );

    expect(target).toBe("/x?extractRegionDeleted=1");
    expect(await readExtractionRegions(ctx, extractionId)).toHaveLength(0);
  });

  it("refuses to delete a region that has already been extracted, and it survives", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionId = await insertExtractionRegion(ctx, extractionId, { status: "extracted" });

    const target = await captureRedirect(() =>
      actions.deleteExtractionRegion(form({ extractionId: String(extractionId), regionId: String(regionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("This region has already been extracted and can no longer be edited."));
    expect(await readExtractionRegions(ctx, extractionId)).toHaveLength(1);
  });

  it("refuses a region that does not belong to this extraction, and writes nothing", async () => {
    const extractionA = await insertStoryboardExtraction(ctx, sequenceId);
    const extractionB = await insertStoryboardExtraction(ctx, sequenceId);
    const regionInB = await insertExtractionRegion(ctx, extractionB);

    const target = await captureRedirect(() =>
      actions.deleteExtractionRegion(form({ extractionId: String(extractionA), regionId: String(regionInB), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Region does not belong to this extraction."));
    expect(await readExtractionRegions(ctx, extractionB)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resizeAllExtractionRegions — bulk geometry, all-or-nothing
// ---------------------------------------------------------------------------

describe("resizeAllExtractionRegions", () => {
  it("applies every edit atomically, and backfills each edited region's Content Crop base rect from its PRE-edit rectangle", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const region0 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0, x: 0, y: 0, width: 100, height: 100 });
    const region1 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 1, x: 200, y: 200, width: 100, height: 100 });

    const regionsJson = JSON.stringify([
      { regionId: region0, x: 10, y: 10, width: 110, height: 120 },
      { regionId: region1, x: 210, y: 210, width: 90, height: 95 },
    ]);

    await captureRedirect(() =>
      actions.resizeAllExtractionRegions(form({ extractionId: String(extractionId), regionsJson, returnTo: "/x" }))
    );

    const regions = await readExtractionRegions(ctx, extractionId);
    expect(regions[0]).toMatchObject({ x: 10, y: 10, width: 110, height: 120 });
    expect(regions[1]).toMatchObject({ x: 210, y: 210, width: 90, height: 95 });

    const extraction = await readExtraction(ctx, extractionId);
    const params = JSON.parse(extraction.paramsJson!);
    expect(params.contentCropBaseRects["0"]).toEqual({ x: 0, y: 0, width: 100, height: 100 }); // PRE-edit rect
    expect(params.contentCropBaseRects["1"]).toEqual({ x: 200, y: 200, width: 100, height: 100 });
  });

  it("rejects the WHOLE batch when a single entry is out of bounds — the valid entry in the same batch is left untouched", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const region0 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0, x: 0, y: 0, width: 100, height: 100 });
    const region1 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 1, x: 200, y: 200, width: 100, height: 100 });
    const before = await readExtractionRegions(ctx, extractionId);

    const regionsJson = JSON.stringify([
      { regionId: region0, x: 10, y: 10, width: 110, height: 120 }, // valid on its own
      { regionId: region1, x: 950, y: 200, width: 100, height: 100 }, // 950+100 > 1000 sourceWidth
    ]);

    const target = await captureRedirect(() =>
      actions.resizeAllExtractionRegions(form({ extractionId: String(extractionId), regionsJson, returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent(`Region ${region1} is outside the source image bounds.`));
    expect(await readExtractionRegions(ctx, extractionId)).toEqual(before); // region0's own valid edit never applied either
  });

  it("rejects the whole batch when one region has already been extracted", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const regionExtracted = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0, status: "extracted" });
    const before = await readExtractionRegions(ctx, extractionId);

    const regionsJson = JSON.stringify([{ regionId: regionExtracted, x: 1, y: 1, width: 10, height: 10 }]);
    const target = await captureRedirect(() =>
      actions.resizeAllExtractionRegions(form({ extractionId: String(extractionId), regionsJson, returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("has already been extracted and can no longer be edited."));
    expect(await readExtractionRegions(ctx, extractionId)).toEqual(before);
  });

  it("refuses an empty edit list", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const target = await captureRedirect(() =>
      actions.resizeAllExtractionRegions(form({ extractionId: String(extractionId), regionsJson: "[]", returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("No editable regions to update."));
  });

  it("refuses malformed regionsJson", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const target = await captureRedirect(() =>
      actions.resizeAllExtractionRegions(form({ extractionId: String(extractionId), regionsJson: "{not json", returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("Invalid region data."));
  });

  it("refuses when the extraction is not in the ready state", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { status: "confirmed" });
    const region0 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });
    const regionsJson = JSON.stringify([{ regionId: region0, x: 1, y: 1, width: 10, height: 10 }]);

    const target = await captureRedirect(() =>
      actions.resizeAllExtractionRegions(form({ extractionId: String(extractionId), regionsJson, returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("This extraction can no longer be edited."));
  });

  it("persists Content Crop mode+percentages when supplied, validating header/caption strictly", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const region0 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });
    const regionsJson = JSON.stringify([{ regionId: region0, x: 0, y: 0, width: 100, height: 100 }]);

    await captureRedirect(() =>
      actions.resizeAllExtractionRegions(
        form({
          extractionId: String(extractionId),
          regionsJson,
          contentCropMode: "remove_top_and_bottom",
          contentCropHeaderPercent: "15",
          contentCropCaptionPercent: "20",
          returnTo: "/x",
        })
      )
    );

    const extraction = await readExtraction(ctx, extractionId);
    const params = JSON.parse(extraction.paramsJson!);
    expect(params.contentCrop).toEqual({
      mode: "remove_top_and_bottom",
      headerPercent: 15,
      captionPercent: 20,
      ratio: null,
      sizeMultiplier: null,
    });
  });

  it("rejects the whole batch on a malformed Content Crop percentage (e.g. '20abc'), never truncating", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const region0 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });
    const regionsJson = JSON.stringify([{ regionId: region0, x: 0, y: 0, width: 10, height: 10 }]);
    const before = await readExtractionRegions(ctx, extractionId);

    const target = await captureRedirect(() =>
      actions.resizeAllExtractionRegions(
        form({
          extractionId: String(extractionId),
          regionsJson,
          contentCropMode: "remove_top",
          contentCropHeaderPercent: "20abc",
          contentCropCaptionPercent: "0",
          returnTo: "/x",
        })
      )
    );

    expect(target).toContain(
      encodeURIComponent("Content Crop header/caption percentages must be whole numbers between 0 and 45.")
    );
    expect(await readExtractionRegions(ctx, extractionId)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// assignAllExtractionRegions — bulk mapping in reading order
// ---------------------------------------------------------------------------

describe("assignAllExtractionRegions", () => {
  it("maps mappable regions to Shots in orderIndex order, and clears a stale assignment beyond the Shot count — skipped/extracted regions are never touched", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const shotB = await insertShot(ctx, seqId, { title: "Shot B", orderIndex: 1 });
    const extractionId = await insertStoryboardExtraction(ctx, seqId);
    const region0 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });
    const region1 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 1 });
    // Beyond the 2-Shot count, and carrying a stale prior assignment that must be cleared.
    const region2 = await insertExtractionRegion(ctx, extractionId, { orderIndex: 2, status: "assigned", targetShotId: shotB });
    const skippedRegion = await insertExtractionRegion(ctx, extractionId, { orderIndex: 3, status: "skipped", targetShotId: null });
    const extractedRegion = await insertExtractionRegion(ctx, extractionId, { orderIndex: 4, status: "extracted", targetShotId: shotA });

    await captureRedirect(() => actions.assignAllExtractionRegions(form({ extractionId: String(extractionId), returnTo: "/x" })));

    const regions = await readExtractionRegions(ctx, extractionId);
    const byId = new Map(regions.map((r) => [r.id, r]));
    expect(byId.get(region0)!.targetShotId).toBe(shotA);
    expect(byId.get(region0)!.status).toBe("assigned");
    expect(byId.get(region1)!.targetShotId).toBe(shotB);
    expect(byId.get(region1)!.status).toBe("assigned");
    expect(byId.get(region2)!.targetShotId).toBeNull(); // stale mapping cleared — 3rd mappable region, only 2 Shots exist
    expect(byId.get(region2)!.status).toBe("pending");
    expect(byId.get(skippedRegion)!.status).toBe("skipped");
    expect(byId.get(skippedRegion)!.targetShotId).toBeNull();
    expect(byId.get(extractedRegion)!.status).toBe("extracted");
    expect(byId.get(extractedRegion)!.targetShotId).toBe(shotA); // untouched, not cleared
  });

  it("refuses when every region is already extracted or skipped", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    await insertExtractionRegion(ctx, extractionId, { orderIndex: 0, status: "skipped" });

    const target = await captureRedirect(() =>
      actions.assignAllExtractionRegions(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("No regions available to assign (all are extracted or skipped)."));
  });

  it("refuses when the extraction is not in the ready state", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { status: "failed" });
    await insertExtractionRegion(ctx, extractionId, { orderIndex: 0 });

    const target = await captureRedirect(() =>
      actions.assignAllExtractionRegions(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("This extraction can no longer be edited."));
  });
});

// ---------------------------------------------------------------------------
// startStoryboardExtraction — detection: ordering, mapping, grid-fallback gate
// ---------------------------------------------------------------------------

describe("startStoryboardExtraction", () => {
  it("refuses an invalid sequenceId before creating anything", async () => {
    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(form({ sequenceId: "0", sourceStoryboardImageId: String(sourceImageId), returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("Invalid request."));
  });

  it("refuses an unknown source image", async () => {
    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(form({ sequenceId: String(sequenceId), sourceStoryboardImageId: "999999", returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("Source image not found."));
  });

  it("refuses a source image belonging to a different Sequence", async () => {
    const foreignImageId = await insertSequenceStoryboardImage(ctx, otherSequenceId);
    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(sequenceId), sourceStoryboardImageId: String(foreignImageId), returnTo: "/x" })
      )
    );
    expect(target).toContain(encodeURIComponent("Source image does not belong to this Sequence."));
  });

  it("refuses an invalid detection engine", async () => {
    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(sequenceId), sourceStoryboardImageId: String(sourceImageId), engine: "bogus", returnTo: "/x" })
      )
    );
    expect(target).toContain(encodeURIComponent("Invalid detection engine."));
  });

  it("refuses Columns without Rows", async () => {
    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(sequenceId), sourceStoryboardImageId: String(sourceImageId), columns: "3", returnTo: "/x" })
      )
    );
    expect(target).toContain(encodeURIComponent("Provide both Columns and Rows, or neither."));
  });

  it("refuses a grid dimension above the maximum (13 > 12)", async () => {
    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(sequenceId), sourceStoryboardImageId: String(sourceImageId), columns: "13", rows: "2", returnTo: "/x" })
      )
    );
    expect(target).toContain(encodeURIComponent("Columns and Rows must each be a whole number between 1 and 12."));
  });

  it("refuses a source image whose path resolves outside the allowed uploads root, and creates no extraction row", async () => {
    const outsideImageId = await insertSequenceStoryboardImage(ctx, sequenceId, { imagePath: "../outside.jpg" });

    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(sequenceId), sourceStoryboardImageId: String(outsideImageId), returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("Source image path is not in the expected location."));
    // Scoped to THIS source image's id (unique to this test) rather than the
    // whole shared `sequenceId` fixture, which other describe blocks above
    // also insert extraction rows into.
    const rows = await ctx.db
      .select()
      .from(ctx.schema.sequenceStoryboardExtractions)
      .where(eq(ctx.schema.sequenceStoryboardExtractions.sourceStoryboardImageId, outsideImageId));
    expect(rows).toHaveLength(0);
  });

  it("real subprocess path: a source image missing on disk fails detection gracefully — the extraction row survives with status 'failed', and the action still redirects to the extraction page (not an error redirect)", async () => {
    mockRunDetect.mockImplementationOnce(actualRunDetect);

    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(sequenceId), sourceStoryboardImageId: String(sourceImageId), returnTo: "/x" })
      )
    );

    expect(target).toMatch(/^\/x\?extractionId=\d+$/); // success-shaped redirect, NOT extractError
    const extractionId = Number(new URL(target, "http://x").searchParams.get("extractionId"));
    const extraction = await readExtraction(ctx, extractionId);
    expect(extraction.status).toBe("failed");
    expect(extraction.errorMessage).toBe("Input image not found on disk.");
  });

  it("persists regions in READING ORDER (not detection order), maps them to Shots by that order, and records each region's Content Crop base rect", async () => {
    const seqId = await freshSequence();
    const seqSourceImageId = await insertSequenceStoryboardImage(ctx, seqId);
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const shotB = await insertShot(ctx, seqId, { title: "Shot B", orderIndex: 1 });

    // Detection returns the bottom-left cell FIRST and the top-left cell
    // SECOND — deliberately out of reading order, to prove the persisted
    // orderIndex/mapping follow sortRegionsReadingOrder, not raw array order.
    mockRunDetect.mockResolvedValueOnce({
      sourceWidth: 1000,
      sourceHeight: 800,
      regions: [
        { x: 0, y: 400, width: 500, height: 400, confidence: 0.9, detectionMode: "border", illustrationHeight: null, textSeparationDetected: false },
        { x: 0, y: 0, width: 500, height: 400, confidence: 0.9, detectionMode: "border", illustrationHeight: null, textSeparationDetected: false },
      ],
      diagnostics: {
        primaryEngine: "canny",
        detectedCount: 2,
        confidence: 0.9,
        threshold: null,
        fallbackTriggered: false,
        fallbackReason: null,
        finalEngine: "canny",
      },
    });

    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(seqId), sourceStoryboardImageId: String(seqSourceImageId), returnTo: "/x" })
      )
    );
    const extractionId = Number(new URL(target, "http://x").searchParams.get("extractionId"));

    const extraction = await readExtraction(ctx, extractionId);
    expect(extraction.status).toBe("ready");
    expect(extraction.sourceWidth).toBe(1000);
    expect(extraction.sourceHeight).toBe(800);

    const regions = await readExtractionRegions(ctx, extractionId);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ orderIndex: 0, x: 0, y: 0, width: 500, height: 400, targetShotId: shotA, status: "assigned" });
    expect(regions[1]).toMatchObject({ orderIndex: 1, x: 0, y: 400, width: 500, height: 400, targetShotId: shotB, status: "assigned" });

    const params = JSON.parse(extraction.paramsJson!);
    expect(params.contentCropBaseRects["0"]).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(params.contentCropBaseRects["1"]).toEqual({ x: 0, y: 400, width: 500, height: 400 });
  });

  it("a grid-fallback region is pre-filled with the proposed Shot but NEVER auto-assigned — status stays 'pending' pending explicit confirmation", async () => {
    const seqId = await freshSequence();
    const seqSourceImageId = await insertSequenceStoryboardImage(ctx, seqId);
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });

    mockRunDetect.mockResolvedValueOnce({
      sourceWidth: 500,
      sourceHeight: 500,
      regions: [
        { x: 0, y: 0, width: 500, height: 500, confidence: 0.3, detectionMode: "grid-fallback", illustrationHeight: null, textSeparationDetected: false },
      ],
      diagnostics: {
        primaryEngine: "canny",
        detectedCount: 0,
        confidence: 0.3,
        threshold: null,
        fallbackTriggered: true,
        fallbackReason: "ambiguous",
        finalEngine: "grid-fallback",
      },
    });

    const target = await captureRedirect(() =>
      actions.startStoryboardExtraction(
        form({ sequenceId: String(seqId), sourceStoryboardImageId: String(seqSourceImageId), returnTo: "/x" })
      )
    );
    const extractionId = Number(new URL(target, "http://x").searchParams.get("extractionId"));

    const [region] = await readExtractionRegions(ctx, extractionId);
    expect(region.detectionMode).toBe("grid-fallback");
    expect(region.targetShotId).toBe(shotA); // pre-filled
    expect(region.status).toBe("pending"); // but NOT "assigned"
  });
});

// ---------------------------------------------------------------------------
// confirmStoryboardExtraction — the only action that creates files/drafts.
// Proof of what survives (unassigned/skipped regions, a second confirm
// attempt) as much as what is created.
// ---------------------------------------------------------------------------

describe("confirmStoryboardExtraction", () => {
  it("refuses when the extraction is not ready (e.g. already confirmed)", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { status: "confirmed" });
    const target = await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("This extraction is not ready to confirm (already confirmed or failed)."));
  });

  it("refuses a negative padding", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    const target = await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), padding: "-1", returnTo: "/x" }))
    );
    expect(target).toContain(encodeURIComponent("Padding must be a non-negative whole number."));
  });

  it("refuses when no region is assigned to a Shot yet, and creates nothing", async () => {
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId);
    await insertExtractionRegion(ctx, extractionId, { status: "pending" });
    await insertExtractionRegion(ctx, extractionId, { status: "skipped" });

    const target = await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("No regions are assigned to a Shot yet."));
    expect(mockRunCrop).not.toHaveBeenCalled();
  });

  it("real subprocess path: a source image missing on disk fails the crop, leaves the extraction 'ready', and creates no draft/reference", async () => {
    mockRunCrop.mockImplementationOnce(actualRunCrop);
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId); // default sourceImagePath points to a non-existent file
    await insertExtractionRegion(ctx, extractionId, { status: "assigned", targetShotId: shotId });

    const target = await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Input image not found on disk."));
    expect((await readExtraction(ctx, extractionId)).status).toBe("ready"); // untouched
    expect(await readStoryboardImagesByShot(ctx, shotId)).toHaveLength(0);
    expect(await readShotReferenceImages(ctx, shotId)).toHaveLength(0);
  });

  it("confirms: creates a draft + reference per assigned region, marks those regions 'extracted', leaves skipped/pending regions untouched, and transitions the extraction to 'confirmed'", async () => {
    const shotA = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const shotB = await insertShot(ctx, sequenceId, { title: "Shot B" });
    confirmShotDirsToCleanup.push(shotA, shotB);

    mockRunCrop.mockImplementation(async (_input: string, regions: { index: number }[], scratchOutputDir: string) => {
      await mkdir(scratchOutputDir, { recursive: true });
      const files: { index: number; filename: string }[] = [];
      for (const r of regions) {
        const filename = `region-${r.index}.png`;
        await writeFile(path.join(scratchOutputDir, filename), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        files.push({ index: r.index, filename });
      }
      return { files };
    });

    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const regionA = await insertExtractionRegion(ctx, extractionId, { orderIndex: 0, status: "assigned", targetShotId: shotA, x: 0, y: 0, width: 100, height: 100 });
    const regionB = await insertExtractionRegion(ctx, extractionId, { orderIndex: 1, status: "assigned", targetShotId: shotB, x: 100, y: 0, width: 100, height: 100 });
    const skippedRegion = await insertExtractionRegion(ctx, extractionId, { orderIndex: 2, status: "skipped" });
    const pendingRegion = await insertExtractionRegion(ctx, extractionId, { orderIndex: 3, status: "pending" });

    const target = await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );
    expect(target).toBe("/x?extractConfirmed=1");

    const draftsA = await readStoryboardImagesByShot(ctx, shotA);
    const draftsB = await readStoryboardImagesByShot(ctx, shotB);
    expect(draftsA).toHaveLength(1);
    expect(draftsB).toHaveLength(1);
    expect(draftsA[0].status).toBe("draft");
    expect(draftsA[0].extractionRegionId).toBe(regionA);

    const refsA = await readShotReferenceImages(ctx, shotA);
    expect(refsA).toHaveLength(1);
    expect(refsA[0].imageRole).toBe("storyboard_frame");
    expect(refsA[0].label).toBe("Storyboard Frame");
    expect(refsA[0].sourceStoryboardImageId).toBe(draftsA[0].id);
    expect(refsA[0].imagePath).toBe(draftsA[0].imagePath); // shares the exact same file — no binary copy

    const regions = await readExtractionRegions(ctx, extractionId);
    const byId = new Map(regions.map((r) => [r.id, r]));
    expect(byId.get(regionA)!.status).toBe("extracted");
    expect(byId.get(regionA)!.cropImagePath).not.toBeNull();
    expect(byId.get(regionB)!.status).toBe("extracted");
    // What survives untouched: skipped and pending regions are never processed.
    expect(byId.get(skippedRegion)!.status).toBe("skipped");
    expect(byId.get(skippedRegion)!.cropImagePath).toBeNull();
    expect(byId.get(pendingRegion)!.status).toBe("pending");
    expect(byId.get(pendingRegion)!.cropImagePath).toBeNull();

    const extraction = await readExtraction(ctx, extractionId);
    expect(extraction.status).toBe("confirmed");
    expect(JSON.parse(extraction.paramsJson!).padding).toBe(0);

    // A second confirm on the same (now-confirmed) extraction is refused and creates no duplicate.
    const secondTarget = await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), returnTo: "/x" }))
    );
    expect(secondTarget).toContain(encodeURIComponent("This extraction is not ready to confirm (already confirmed or failed)."));
    expect(await readStoryboardImagesByShot(ctx, shotA)).toHaveLength(1);
    expect(await readShotReferenceImages(ctx, shotA)).toHaveLength(1);
  });

  it("crop-region geometry: excludes the detected caption band (illustrationHeight) and applies padding as a clamped inward shrink", async () => {
    let capturedRegions: unknown;
    mockRunCrop.mockImplementationOnce(async (_input, regions) => {
      capturedRegions = regions;
      return { files: [] }; // no files copied; region stays "assigned" (worker returned nothing) but we only assert on the call args
    });

    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, { sourceWidth: 1000, sourceHeight: 800 });
    const regionId = await insertExtractionRegion(ctx, extractionId, {
      status: "assigned",
      targetShotId: shotId,
      x: 10,
      y: 10,
      width: 200,
      height: 150,
      textSeparationDetected: true,
      illustrationHeight: 100, // caption band below y=100 within the cell is excluded
    });

    await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), padding: "5", returnTo: "/x" }))
    );

    expect(capturedRegions).toEqual([
      {
        index: regionId,
        x: 10 + 5, // padX = min(5, floor((200-1)/2)) = 5
        y: 10 + 5, // padY = min(5, floor((100-1)/2)) = 5, against the ILLUSTRATION height (100), not the full cell height (150)
        width: 200 - 10, // width - 2*padX
        height: 100 - 10, // effectiveHeight(100) - 2*padY
      },
    ]);
  });

  it("crop-region geometry: once this extraction has ever used Content Crop, the region's current width/height is used verbatim — illustrationHeight is never applied even if present", async () => {
    let capturedRegions: unknown;
    mockRunCrop.mockImplementationOnce(async (_input, regions) => {
      capturedRegions = regions;
      return { files: [] };
    });

    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const extractionId = await insertStoryboardExtraction(ctx, sequenceId, {
      sourceWidth: 1000,
      sourceHeight: 800,
      paramsJson: JSON.stringify({ contentCrop: { mode: "full", headerPercent: 0, captionPercent: 0, ratio: null, sizeMultiplier: null } }),
    });
    const regionId = await insertExtractionRegion(ctx, extractionId, {
      status: "assigned",
      targetShotId: shotId,
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      textSeparationDetected: true,
      illustrationHeight: 100,
    });

    await captureRedirect(() =>
      actions.confirmStoryboardExtraction(form({ extractionId: String(extractionId), padding: "0", returnTo: "/x" }))
    );

    expect(capturedRegions).toEqual([{ index: regionId, x: 0, y: 0, width: 200, height: 150 }]); // full height, illustrationHeight ignored
  });
});
