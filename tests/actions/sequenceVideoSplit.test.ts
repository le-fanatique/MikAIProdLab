import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import {
  insertProject,
  insertSequence,
  insertShot,
  insertSequenceVideoDraft,
  insertSplitRun,
  insertSplitSegment,
  insertShotVideoCandidate,
  readSplitRun,
  readSplitSegments,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// sequenceVideoSplit — IND.VIDEOSPLIT.1. Characterization tests: they lock
// down `src/actions/sequenceVideoSplitDetection.ts`,
// `src/actions/sequenceVideoSplitCleanup.ts`,
// `src/actions/sequenceVideoSplitSegments.ts`, and
// `src/actions/sequenceVideoSplitValidate.ts` (split from the former
// 1 828-line `src/actions/sequenceVideoSplit.ts` by IND.SPLIT.1) exactly as
// they behave today. No production behavior is changed by this ticket.
//
// Real-file-dependent actions (adjustSegmentBoundary, splitSegmentAt,
// splitSegmentAtFrame, mergeSegment) resolve `run.sourceVideoPathSnapshot`
// against a REAL file on disk (resolveSequenceVideoDraftAbsolutePath does an
// `fs.stat`) and then call the bundled ffmpeg to regenerate a thumbnail. A
// small, deliberately NOT-a-real-video fixture file is written under
// `public/uploads/sequence-video-drafts/` (the exact root production code
// resolves against — same pattern as
// tests/llmWorkspace/referenceAnalysisFileGate.characterization.test.ts) so
// `fs.stat` succeeds; the ffmpeg thumbnail generation itself then fails fast
// and degrades to a `splitWarning` (by design — see
// `generateSegmentThumbnail`'s own doc comment), which is why none of the
// assertions below depend on thumbnail content. skipSegment/restoreSegment/
// reassignSegmentShot/assignAllSegments/validateSplitPlan/
// clearUnusedSplitRuns never touch the filesystem and need no fixture file.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let actions: typeof import("@/actions/sequenceVideoSplitDetection") &
  typeof import("@/actions/sequenceVideoSplitCleanup") &
  typeof import("@/actions/sequenceVideoSplitSegments") &
  typeof import("@/actions/sequenceVideoSplitValidate");

let projectId: number;
let sequenceId: number;
let otherSequenceId: number;
let draftId: number;

const FIXTURE_RELATIVE_DIR = "uploads/sequence-video-drafts/ind-videosplit-1-test";
const FIXTURE_RELATIVE_PATH = `${FIXTURE_RELATIVE_DIR}/fixture.mp4`;
const FIXTURE_ABSOLUTE_DIR = path.join(process.cwd(), "public", FIXTURE_RELATIVE_DIR);

/**
 * A dedicated, empty-of-Shots sequence — used only by `assignAllSegments`
 * and `validateSplitPlan` tests, the two actions that read EVERY Shot
 * belonging to a sequenceId. Every other describe block in this file freely
 * inserts Shots into the shared `sequenceId` fixture; reusing that same id
 * here would silently pollute "all Shots for this Sequence" with rows from
 * unrelated tests and make assertions about exact Shot counts/order flaky.
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
  actions = {
    ...(await import("@/actions/sequenceVideoSplitDetection")),
    ...(await import("@/actions/sequenceVideoSplitCleanup")),
    ...(await import("@/actions/sequenceVideoSplitSegments")),
    ...(await import("@/actions/sequenceVideoSplitValidate")),
  };
  await mkdir(FIXTURE_ABSOLUTE_DIR, { recursive: true });
  await writeFile(path.join(FIXTURE_ABSOLUTE_DIR, "fixture.mp4"), Buffer.from("not a real video file", "utf8"));

  projectId = await insertProject(ctx, "Video split project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, projectId, { title: "Other sequence" });
  draftId = await insertSequenceVideoDraft(ctx, sequenceId, { videoPath: FIXTURE_RELATIVE_PATH });
});

afterAll(async () => {
  ctx.cleanup();
  await rm(FIXTURE_ABSOLUTE_DIR, { recursive: true, force: true });
});

/** Fresh 3-segment run [0,30] [30,60] [60,100] over a 100s source, VFR/unknown FPS (paramsJson has no frameRateMode) — every boundary math test below stays in the high-precision (non-frame-quantized) branch unless a test explicitly asks for CFR. */
async function makeThreeSegmentRun(status: "ready" | "validated" | "detecting" | "failed" = "ready") {
  const runId = await insertSplitRun(ctx, sequenceId, draftId, {
    sourceVideoPathSnapshot: FIXTURE_RELATIVE_PATH,
    sourceDurationSeconds: 100,
    status,
  });
  const seg0 = await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 30 });
  const seg1 = await insertSplitSegment(ctx, runId, { orderIndex: 1, startSeconds: 30, endSeconds: 60 });
  const seg2 = await insertSplitSegment(ctx, runId, { orderIndex: 2, startSeconds: 60, endSeconds: 100 });
  return { runId, seg0, seg1, seg2 };
}

// ---------------------------------------------------------------------------
// adjustSegmentBoundary — shared-boundary math, the reordering risk area
// ---------------------------------------------------------------------------

describe("adjustSegmentBoundary", () => {
  it("moves a shared boundary: the two adjoining segments change together, everything else is untouched", async () => {
    const { runId, seg0, seg1, seg2 } = await makeThreeSegmentRun();

    await captureRedirect(() =>
      actions.adjustSegmentBoundary(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg0), field: "end", valueSeconds: "40", returnTo: "/x" })
      )
    );

    const segments = await readSplitSegments(ctx, runId);
    const s0 = segments.find((s) => s.id === seg0)!;
    const s1 = segments.find((s) => s.id === seg1)!;
    const s2 = segments.find((s) => s.id === seg2)!;
    expect(s0.endSeconds).toBe(40);
    expect(s1.startSeconds).toBe(40);
    expect(s0.boundaryProvenance).toBe("manual");
    expect(s1.boundaryProvenance).toBe("manual");
    // Not touched by this call at all.
    expect(s1.endSeconds).toBe(60);
    expect(s2.startSeconds).toBe(60);
    expect(s2.endSeconds).toBe(100);
    expect(s2.boundaryProvenance).toBe("manual"); // fixture default, unchanged
  });

  it("refuses to move the first segment's start", async () => {
    const { runId, seg0 } = await makeThreeSegmentRun();
    const before = await readSplitSegments(ctx, runId);

    const target = await captureRedirect(() =>
      actions.adjustSegmentBoundary(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg0), field: "start", valueSeconds: "5", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("The first segment always starts at 0 and cannot be moved."));
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });

  it("refuses to move the last segment's end", async () => {
    const { runId, seg2 } = await makeThreeSegmentRun();
    const before = await readSplitSegments(ctx, runId);

    const target = await captureRedirect(() =>
      actions.adjustSegmentBoundary(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg2), field: "end", valueSeconds: "90", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("The last segment always ends at the source duration and cannot be moved."));
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });

  it("refuses a boundary that would create a zero-length or overlapping segment", async () => {
    const { runId, seg1 } = await makeThreeSegmentRun();
    const before = await readSplitSegments(ctx, runId);

    // seg1 = [30,60]; moving its own end down to exactly its own start (30)
    // leaves no room for the minimum gap.
    const target = await captureRedirect(() =>
      actions.adjustSegmentBoundary(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg1), field: "end", valueSeconds: "30", returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("The new boundary would create a zero-length or overlapping segment."));
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });

  it("refuses to edit a run that is not in the ready state", async () => {
    const { runId, seg0 } = await makeThreeSegmentRun("validated");
    const before = await readSplitSegments(ctx, runId);

    const target = await captureRedirect(() =>
      actions.adjustSegmentBoundary(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg0), field: "end", valueSeconds: "40", returnTo: "/x" })
      )
    );

    expect(target).toContain(
      encodeURIComponent("This Split Plan can no longer be edited (not in a ready state, or already validated).")
    );
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// splitSegmentAt / splitSegmentAtFrame — insertion + renumbering
// ---------------------------------------------------------------------------

describe("splitSegmentAt", () => {
  it("splits a middle segment: the new segment is inserted right after it, and every FOLLOWING segment's orderIndex shifts by exactly one — untouched segments keep their exact boundaries", async () => {
    const { runId, seg0, seg1, seg2 } = await makeThreeSegmentRun();

    const target = await captureRedirect(() =>
      actions.splitSegmentAt(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg0), splitAtSeconds: "15", returnTo: "/x" })
      )
    );
    expect(target).toContain("splitEdited=1");
    expect(target).toContain("newSegmentId=");

    const segments = await readSplitSegments(ctx, runId);
    expect(segments).toHaveLength(4);
    const byOrder = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(byOrder.map((s) => s.orderIndex)).toEqual([0, 1, 2, 3]);

    const first = byOrder[0];
    const inserted = byOrder[1];
    const origSeg1 = byOrder[2];
    const origSeg2 = byOrder[3];

    expect(first.id).toBe(seg0);
    expect(first.startSeconds).toBe(0);
    expect(first.endSeconds).toBe(15);
    expect(first.status).toBe("pending");
    expect(first.boundaryProvenance).toBe("manual");

    expect(inserted.startSeconds).toBe(15);
    expect(inserted.endSeconds).toBe(30);
    expect(inserted.boundaryProvenance).toBe("manual");
    expect(inserted.status).toBe("pending");

    // The two segments that were never touched by this split — proof the
    // renumbering shift did not also mutate their geometry.
    expect(origSeg1.id).toBe(seg1);
    expect(origSeg1.startSeconds).toBe(30);
    expect(origSeg1.endSeconds).toBe(60);
    expect(origSeg2.id).toBe(seg2);
    expect(origSeg2.startSeconds).toBe(60);
    expect(origSeg2.endSeconds).toBe(100);
  });

  it("unassigns the split segment's target Shot — mapping becomes ambiguous", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId, { sourceVideoPathSnapshot: FIXTURE_RELATIVE_PATH, sourceDurationSeconds: 100 });
    const segId = await insertSplitSegment(ctx, runId, {
      orderIndex: 0,
      startSeconds: 0,
      endSeconds: 100,
      status: "mapped",
      targetShotId: shotId,
    });

    await captureRedirect(() =>
      actions.splitSegmentAt(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), splitAtSeconds: "50", returnTo: "/x" }))
    );

    const segments = await readSplitSegments(ctx, runId);
    const first = segments.find((s) => s.id === segId)!;
    expect(first.targetShotId).toBeNull();
    expect(first.status).toBe("pending");
  });

  it("refuses a split point touching either edge of the segment", async () => {
    const runId = await insertSplitRun(ctx, sequenceId, draftId, { sourceVideoPathSnapshot: FIXTURE_RELATIVE_PATH, sourceDurationSeconds: 100 });
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 10, endSeconds: 20 });

    const target = await captureRedirect(() =>
      actions.splitSegmentAt(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), splitAtSeconds: "10", returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Split point must be strictly inside the segment (not touching either edge)."));
    expect(await readSplitSegments(ctx, runId)).toHaveLength(1);
  });
});

describe("splitSegmentAtFrame", () => {
  async function makeCfrRun() {
    const runId = await insertSplitRun(ctx, sequenceId, draftId, {
      sourceVideoPathSnapshot: FIXTURE_RELATIVE_PATH,
      sourceDurationSeconds: 100,
      sourceFps: 24,
      paramsJson: JSON.stringify({ sceneThreshold: 0.35, minSegmentDurationSeconds: 0, frameRateMode: "cfr" }),
    });
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 100 });
    return { runId, segId };
  }

  it("splits at an explicit frame, deriving seconds from the run's own snapshotted FPS (frame 1200 @ 24fps = 50s)", async () => {
    const { runId, segId } = await makeCfrRun();

    await captureRedirect(() =>
      actions.splitSegmentAtFrame(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), frame: "1200", returnTo: "/x" }))
    );

    const segments = (await readSplitSegments(ctx, runId)).sort((a, b) => a.orderIndex - b.orderIndex);
    expect(segments).toHaveLength(2);
    expect(segments[0].endSeconds).toBe(50);
    expect(segments[1].startSeconds).toBe(50);
  });

  it("refuses on a run with no verified constant frame rate, even with a numeric sourceFps present", async () => {
    // A run whose paramsJson never recorded frameRateMode: "cfr" (e.g. VFR,
    // unknown, or persisted before this field existed) — sourceFps alone is
    // never sufficient proof, by design (see resolveRunFps's doc comment).
    const runId = await insertSplitRun(ctx, sequenceId, draftId, {
      sourceVideoPathSnapshot: FIXTURE_RELATIVE_PATH,
      sourceDurationSeconds: 100,
      sourceFps: 24,
      paramsJson: JSON.stringify({ sceneThreshold: 0.35, minSegmentDurationSeconds: 0 }),
    });
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 100 });

    const target = await captureRedirect(() =>
      actions.splitSegmentAtFrame(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), frame: "1200", returnTo: "/x" }))
    );

    expect(target).toContain("splitError=");
    expect(await readSplitSegments(ctx, runId)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// mergeSegment — deletion + renumbering, proof of what survives untouched
// ---------------------------------------------------------------------------

describe("mergeSegment", () => {
  it("merges with the next segment: the removed segment's row is gone, the kept segment absorbs its range, and every OTHER segment's own boundaries are untouched even though its orderIndex shifts", async () => {
    const { runId, seg0, seg1, seg2 } = await makeThreeSegmentRun();

    await captureRedirect(() =>
      actions.mergeSegment(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg0), direction: "next", returnTo: "/x" }))
    );

    const segments = (await readSplitSegments(ctx, runId)).sort((a, b) => a.orderIndex - b.orderIndex);
    expect(segments).toHaveLength(2);
    expect(segments.map((s) => s.id)).toEqual([seg0, seg2]);
    expect(segments.map((s) => s.orderIndex)).toEqual([0, 1]); // seg2 renumbered from 2 down to 1

    const merged = segments[0];
    expect(merged.startSeconds).toBe(0);
    expect(merged.endSeconds).toBe(60);
    expect(merged.status).toBe("pending");
    expect(merged.targetShotId).toBeNull();
    expect(merged.boundaryProvenance).toBe("manual");

    const survivor = segments[1];
    expect(survivor.startSeconds).toBe(60); // untouched — proof the renumbered row's own geometry never moved
    expect(survivor.endSeconds).toBe(100);

    // seg1's row is genuinely gone, not just hidden — `readSplitSegments`
    // reads every segment for this run, and seg1's id is absent from it.
    expect(segments.map((s) => s.id)).not.toContain(seg1);
  });

  it("refuses when there is no next segment to merge with", async () => {
    const { runId, seg2 } = await makeThreeSegmentRun();
    const before = await readSplitSegments(ctx, runId);

    const target = await captureRedirect(() =>
      actions.mergeSegment(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg2), direction: "next", returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("No next segment to merge with."));
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });

  it("merges with the previous segment via direction=\"prev\"", async () => {
    const { runId, seg0, seg1, seg2 } = await makeThreeSegmentRun();

    await captureRedirect(() =>
      actions.mergeSegment(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(seg2), direction: "prev", returnTo: "/x" }))
    );

    const segments = (await readSplitSegments(ctx, runId)).sort((a, b) => a.orderIndex - b.orderIndex);
    expect(segments).toHaveLength(2);
    expect(segments.map((s) => s.id)).toEqual([seg0, seg1]);
    const merged = segments[1];
    expect(merged.startSeconds).toBe(30);
    expect(merged.endSeconds).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// skipSegment / restoreSegment — no filesystem, pure DB. Proof of what is
// NOT deleted: the row itself always survives, only its status changes.
// ---------------------------------------------------------------------------

describe("skipSegment / restoreSegment", () => {
  it("skip marks the segment skipped and clears its target Shot, but never deletes the row", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId);
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, status: "mapped", targetShotId: shotId });

    const target = await captureRedirect(() =>
      actions.skipSegment(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), returnTo: "/x" }))
    );
    expect(target).toBe("/x?splitEdited=1");

    const segments = await readSplitSegments(ctx, runId);
    expect(segments).toHaveLength(1); // still present
    expect(segments[0].status).toBe("skipped");
    expect(segments[0].targetShotId).toBeNull();
  });

  it("restore always returns to pending — a skip+restore cycle does not recover the previous target Shot mapping (characterization: skip already cleared it, restore never re-derives it)", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId);
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, status: "mapped", targetShotId: shotId });

    await captureRedirect(() => actions.skipSegment(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), returnTo: "/x" })));
    await captureRedirect(() => actions.restoreSegment(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), returnTo: "/x" })));

    const segments = await readSplitSegments(ctx, runId);
    expect(segments[0].status).toBe("pending");
    expect(segments[0].targetShotId).toBeNull(); // was shotId before the skip
  });

  it("refuses a segment that does not belong to this run, and writes nothing", async () => {
    const runA = await insertSplitRun(ctx, sequenceId, draftId);
    const runB = await insertSplitRun(ctx, sequenceId, draftId);
    const segInB = await insertSplitSegment(ctx, runB, { orderIndex: 0 });
    const before = await readSplitSegments(ctx, runB);

    const target = await captureRedirect(() =>
      actions.skipSegment(form({ runId: String(runA), sequenceId: String(sequenceId), segmentId: String(segInB), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Segment not found in this run."));
    expect(await readSplitSegments(ctx, runB)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// reassignSegmentShot / assignAllSegments
// ---------------------------------------------------------------------------

describe("reassignSegmentShot", () => {
  it("assigns a Shot from this Sequence and marks the segment mapped", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId);
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0 });

    await captureRedirect(() =>
      actions.reassignSegmentShot(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), targetShotId: String(shotId), returnTo: "/x" }))
    );

    const segments = await readSplitSegments(ctx, runId);
    expect(segments[0].targetShotId).toBe(shotId);
    expect(segments[0].status).toBe("mapped");
  });

  it("clears the assignment to null/pending when targetShotId is blank", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId);
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, status: "mapped", targetShotId: shotId });

    await captureRedirect(() =>
      actions.reassignSegmentShot(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), targetShotId: "", returnTo: "/x" }))
    );

    const segments = await readSplitSegments(ctx, runId);
    expect(segments[0].targetShotId).toBeNull();
    expect(segments[0].status).toBe("pending");
  });

  it("refuses a Shot that belongs to a different Sequence, and writes nothing", async () => {
    const foreignShotId = await insertShot(ctx, otherSequenceId, { title: "Foreign shot" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId);
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0 });
    const before = await readSplitSegments(ctx, runId);

    const target = await captureRedirect(() =>
      actions.reassignSegmentShot(
        form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), targetShotId: String(foreignShotId), returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("That Shot does not belong to this Sequence."));
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });

  it("refuses to assign a Shot to a skipped segment", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const runId = await insertSplitRun(ctx, sequenceId, draftId);
    const segId = await insertSplitSegment(ctx, runId, { orderIndex: 0, status: "skipped" });
    const before = await readSplitSegments(ctx, runId);

    const target = await captureRedirect(() =>
      actions.reassignSegmentShot(form({ runId: String(runId), sequenceId: String(sequenceId), segmentId: String(segId), targetShotId: String(shotId), returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Restore this segment before assigning a Shot to it."));
    expect(await readSplitSegments(ctx, runId)).toEqual(before);
  });
});

describe("assignAllSegments", () => {
  it("maps active segments to Shots in reading order, and clears any active segment beyond the Shot count — skipped segments are never touched", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const shotB = await insertShot(ctx, seqId, { title: "Shot B", orderIndex: 1 });
    const runId = await insertSplitRun(ctx, seqId, draftId);
    const seg0 = await insertSplitSegment(ctx, runId, { orderIndex: 0 });
    const seg1 = await insertSplitSegment(ctx, runId, { orderIndex: 1 });
    // Third active segment — this Sequence has only 2 Shots (A, B), so with
    // 3 active segments this one falls beyond `n = min(active, shots) = 2`.
    // It starts with a manual (now stale) assignment that assignAllSegments
    // must clear.
    const seg2 = await insertSplitSegment(ctx, runId, { orderIndex: 2, status: "mapped", targetShotId: shotB });
    const skippedSeg = await insertSplitSegment(ctx, runId, { orderIndex: 3, status: "skipped", targetShotId: null });

    await captureRedirect(() => actions.assignAllSegments(form({ runId: String(runId), sequenceId: String(seqId), returnTo: "/x" })));

    const segments = await readSplitSegments(ctx, runId);
    const byId = new Map(segments.map((s) => [s.id, s]));
    expect(byId.get(seg0)!.targetShotId).toBe(shotA);
    expect(byId.get(seg0)!.status).toBe("mapped");
    expect(byId.get(seg1)!.targetShotId).toBe(shotB);
    expect(byId.get(seg1)!.status).toBe("mapped");
    expect(byId.get(seg2)!.targetShotId).toBeNull(); // stale assignment cleared
    expect(byId.get(seg2)!.status).toBe("pending");
    // The skipped segment is entirely outside `active` — proof it is never read or written.
    expect(byId.get(skippedSeg)!.status).toBe("skipped");
    expect(byId.get(skippedSeg)!.targetShotId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateSplitPlan — the only transition to "validated"
// ---------------------------------------------------------------------------

describe("validateSplitPlan", () => {
  it("validates a fully-mapped, contiguous plan and transitions the run to validated", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const shotB = await insertShot(ctx, seqId, { title: "Shot B", orderIndex: 1 });
    const runId = await insertSplitRun(ctx, seqId, draftId, {
      sourceDurationSeconds: 100,
      expectedShotCount: 2,
      expectedShotOrderSnapshot: JSON.stringify([shotA, shotB]),
    });
    await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 50, status: "mapped", targetShotId: shotA });
    await insertSplitSegment(ctx, runId, { orderIndex: 1, startSeconds: 50, endSeconds: 100, status: "mapped", targetShotId: shotB });

    const target = await captureRedirect(() => actions.validateSplitPlan(form({ runId: String(runId), sequenceId: String(seqId), returnTo: "/x" })));
    expect(target).toBe("/x?splitValidated=1");

    const run = await readSplitRun(ctx, runId);
    expect(run.status).toBe("validated");
    expect(run.validatedAt).not.toBeNull();
  });

  it("refuses (and leaves the run untouched) when the Shot list has changed since detection", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const runId = await insertSplitRun(ctx, seqId, draftId, {
      sourceDurationSeconds: 100,
      expectedShotCount: 1,
      expectedShotOrderSnapshot: JSON.stringify([9999999]), // stale — does not match the live [shotA]
    });
    await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 100, status: "mapped", targetShotId: shotA });

    const target = await captureRedirect(() => actions.validateSplitPlan(form({ runId: String(runId), sequenceId: String(seqId), returnTo: "/x" })));
    expect(target).toContain(
      encodeURIComponent("The Sequence's Shot list or order has changed since this Split Plan was detected. Run detection again to get an up-to-date plan.")
    );
    expect((await readSplitRun(ctx, runId)).status).toBe("ready");
  });

  it("refuses when an active segment has no target Shot", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const runId = await insertSplitRun(ctx, seqId, draftId, {
      sourceDurationSeconds: 100,
      expectedShotCount: 1,
      expectedShotOrderSnapshot: JSON.stringify([shotA]),
    });
    await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 100, status: "pending", targetShotId: null });

    const target = await captureRedirect(() => actions.validateSplitPlan(form({ runId: String(runId), sequenceId: String(seqId), returnTo: "/x" })));
    expect(target).toContain(encodeURIComponent("1 active segment(s) have no target Shot assigned."));
    expect((await readSplitRun(ctx, runId)).status).toBe("ready");
  });

  it("refuses a duplicated mapping and reports the resulting unmapped Shot", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const shotB = await insertShot(ctx, seqId, { title: "Shot B", orderIndex: 1 });
    const runId = await insertSplitRun(ctx, seqId, draftId, {
      sourceDurationSeconds: 100,
      expectedShotCount: 2,
      expectedShotOrderSnapshot: JSON.stringify([shotA, shotB]),
    });
    await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 50, status: "mapped", targetShotId: shotA });
    await insertSplitSegment(ctx, runId, { orderIndex: 1, startSeconds: 50, endSeconds: 100, status: "mapped", targetShotId: shotA });

    const target = await captureRedirect(() => actions.validateSplitPlan(form({ runId: String(runId), sequenceId: String(seqId), returnTo: "/x" })));
    expect(target).toContain(encodeURIComponent("1 Shot(s) are targeted by more than one active segment."));
    expect(target).toContain(encodeURIComponent("1 of this Sequence's Shot(s) are not mapped to any segment."));
    expect((await readSplitRun(ctx, runId)).status).toBe("ready");
  });

  it("refuses a run that is already validated", async () => {
    const seqId = await freshSequence();
    const shotA = await insertShot(ctx, seqId, { title: "Shot A", orderIndex: 0 });
    const runId = await insertSplitRun(ctx, seqId, draftId, {
      sourceDurationSeconds: 100,
      expectedShotCount: 1,
      expectedShotOrderSnapshot: JSON.stringify([shotA]),
      status: "validated",
      validatedAt: new Date().toISOString(),
    });
    await insertSplitSegment(ctx, runId, { orderIndex: 0, startSeconds: 0, endSeconds: 100, status: "mapped", targetShotId: shotA });

    const target = await captureRedirect(() => actions.validateSplitPlan(form({ runId: String(runId), sequenceId: String(seqId), returnTo: "/x" })));
    expect(target).toContain(encodeURIComponent("This Split Plan was already validated or is no longer editable."));
  });
});

// ---------------------------------------------------------------------------
// clearUnusedSplitRuns — the destructive endpoint. The proof that matters is
// what survives: the displayed run, any run still referenced by a
// shot_video_candidate, and every run belonging to a DIFFERENT draft.
// ---------------------------------------------------------------------------

describe("clearUnusedSplitRuns", () => {
  // Every test in this block uses ITS OWN draft: `clearUnusedSplitRuns`
  // scopes its candidate set to every run sharing `sequenceVideoDraftId`,
  // and the shared top-level `draftId` fixture already accumulates runs
  // from every other describe block above — reusing it here would make the
  // deleted/protected counts depend on test execution order.

  it("deletes only the genuinely unused run; the displayed run, the referenced run (and its segments/candidate), and a run from a different draft all survive untouched", async () => {
    const shotA = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const ownDraftId = await insertSequenceVideoDraft(ctx, sequenceId, { videoPath: FIXTURE_RELATIVE_PATH });
    const otherDraftId = await insertSequenceVideoDraft(ctx, sequenceId, { videoPath: FIXTURE_RELATIVE_PATH });

    const currentRunId = await insertSplitRun(ctx, sequenceId, ownDraftId);
    const usedRunId = await insertSplitRun(ctx, sequenceId, ownDraftId);
    const usedSegId = await insertSplitSegment(ctx, usedRunId, { orderIndex: 0 });
    await insertShotVideoCandidate(ctx, { shotId: shotA, splitRunId: usedRunId, splitSegmentId: usedSegId });
    const unusedRunId = await insertSplitRun(ctx, sequenceId, ownDraftId);
    await insertSplitSegment(ctx, unusedRunId, { orderIndex: 0 });
    const otherDraftRunId = await insertSplitRun(ctx, sequenceId, otherDraftId);

    const target = await captureRedirect(() =>
      actions.clearUnusedSplitRuns(
        form({ sequenceId: String(sequenceId), sequenceVideoDraftId: String(ownDraftId), currentRunId: String(currentRunId), returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("1 run(s) deleted, 1 run(s) protected/skipped."));

    expect(await readSplitRun(ctx, currentRunId)).toBeDefined();
    expect(await readSplitRun(ctx, usedRunId)).toBeDefined();
    expect(await readSplitSegments(ctx, usedRunId)).toHaveLength(1);
    expect(await readSplitRun(ctx, otherDraftRunId)).toBeDefined();
    expect(await readSplitRun(ctx, unusedRunId)).toBeUndefined(); // the only one actually removed
    expect(await readSplitSegments(ctx, unusedRunId)).toHaveLength(0); // cascade
  });

  it("refuses a malformed currentRunId outright and deletes nothing", async () => {
    const ownDraftId = await insertSequenceVideoDraft(ctx, sequenceId, { videoPath: FIXTURE_RELATIVE_PATH });
    const runA = await insertSplitRun(ctx, sequenceId, ownDraftId);
    const runB = await insertSplitRun(ctx, sequenceId, ownDraftId);

    const target = await captureRedirect(() =>
      // Trailing garbage after leading digits (`parseInt` would happily parse
      // this as `3`) — the strict `^\d+$` regex is what actually refuses it,
      // not the later `Number.isInteger`/`> 0` check, which a value like
      // this would otherwise sail through.
      actions.clearUnusedSplitRuns(form({ sequenceId: String(sequenceId), sequenceVideoDraftId: String(ownDraftId), currentRunId: "3abc", returnTo: "/x" }))
    );

    expect(target).toContain(encodeURIComponent("Invalid current run reference."));
    expect(await readSplitRun(ctx, runA)).toBeDefined();
    expect(await readSplitRun(ctx, runB)).toBeDefined();
  });

  it("refuses when currentRunId does not actually belong to this draft, and deletes nothing", async () => {
    const ownDraftId = await insertSequenceVideoDraft(ctx, sequenceId, { videoPath: FIXTURE_RELATIVE_PATH });
    const otherDraftId = await insertSequenceVideoDraft(ctx, sequenceId, { videoPath: FIXTURE_RELATIVE_PATH });
    const foreignRunId = await insertSplitRun(ctx, sequenceId, otherDraftId);
    const runA = await insertSplitRun(ctx, sequenceId, ownDraftId);

    const target = await captureRedirect(() =>
      actions.clearUnusedSplitRuns(
        form({ sequenceId: String(sequenceId), sequenceVideoDraftId: String(ownDraftId), currentRunId: String(foreignRunId), returnTo: "/x" })
      )
    );

    expect(target).toContain(encodeURIComponent("The currently displayed run could not be confirmed for this draft — refusing to clean up."));
    expect(await readSplitRun(ctx, runA)).toBeDefined();
    expect(await readSplitRun(ctx, foreignRunId)).toBeDefined();
  });
});
