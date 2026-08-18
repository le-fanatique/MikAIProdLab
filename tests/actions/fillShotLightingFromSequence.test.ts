import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, insertSequence, insertShot, readShot } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// fillShotLightingFromSequence — LLMW.LIGHTING.SHOTFILL.1, the "Fill from
// sequence" button's write side. Never a parallel write path: it computes
// the text via `computeShotLightingFill` and delegates the actual write to
// `updateShotLighting` (B15a) as a plain FormData `lighting` value — so
// ownership, the blank-becomes-null rule and the redirect shape are
// inherited, not reimplemented.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let fillShotLightingFromSequence: typeof import("@/actions/shots").fillShotLightingFromSequence;
let projectId: number;
let otherProjectId: number;
let sequenceId: number;
let otherSequenceId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function insertSequenceAsset(seqId: number, assetId: number): Promise<void> {
  await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId: seqId, assetId });
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ fillShotLightingFromSequence } = await import("@/actions/shots"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, otherProjectId);
});

afterAll(() => ctx.cleanup());

describe("fillShotLightingFromSequence — writes through updateShotLighting", () => {
  it("writes the sequence's own effective lighting and touches no other column", async () => {
    const seqId = await insertSequence(ctx, projectId, { lighting: "Sequence's own lighting" });
    const shotId = await insertShot(ctx, seqId, {
      lighting: "Already typed by hand",
      shotPrompt: "Untouched shot prompt",
    });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(seqId), shotId: String(shotId) })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(target).toBe(
      `/projects/${projectId}/sequences/${seqId}/shots/${shotId}?shotLightingSaved=1`
    );
    expect(after.lighting).toBe("Sequence's own lighting");
    expect(after.shotPrompt).toBe("Untouched shot prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
  });

  it("falls back to environment lighting when the sequence's own field is blank", async () => {
    const seqId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Cold neon, blue-heavy",
    });
    await insertSequenceAsset(seqId, environmentId);
    const shotId = await insertShot(ctx, seqId);

    await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(seqId), shotId: String(shotId) })
      )
    );

    expect((await readShot(ctx, shotId)).lighting).toBe("Rooftop: Cold neon, blue-heavy");
  });

  it("concatenates several environments in name order when there is no own sequence lighting", async () => {
    const seqId = await insertSequence(ctx, projectId);
    const zeta = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Zeta Station",
      lighting: "Fluorescent, flat",
    });
    const alpha = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Alpha Bay",
      lighting: "Moonlight, cool",
    });
    await insertSequenceAsset(seqId, zeta);
    await insertSequenceAsset(seqId, alpha);
    const shotId = await insertShot(ctx, seqId);

    await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(seqId), shotId: String(shotId) })
      )
    );

    expect((await readShot(ctx, shotId)).lighting).toBe(
      "Alpha Bay: Moonlight, cool\n\nZeta Station: Fluorescent, flat"
    );
  });

  it("honours returnTo, forwarded to updateShotLighting's own redirect", async () => {
    const seqId = await insertSequence(ctx, projectId, { lighting: "Sequence's own lighting" });
    const shotId = await insertShot(ctx, seqId);

    const target = await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({
          projectId: String(projectId),
          sequenceId: String(seqId),
          shotId: String(shotId),
          returnTo: `/projects/${projectId}/sequences/${seqId}/shots/${shotId}/edit`,
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${seqId}/shots/${shotId}/edit?shotLightingSaved=1`
    );
  });

  it("refuses without writing when there is nothing to copy — no sequence lighting, no environment", async () => {
    const seqId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, seqId, { lighting: "Kept" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(seqId), shotId: String(shotId) })
      )
    );

    expect(target).toContain(
      `shotLightingError=${encodeURIComponent(
        "This shot's sequence has no lighting — of its own or from an environment Asset — to copy."
      )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses without writing when the cast environment has no lighting value and the sequence has none either", async () => {
    const seqId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, { type: "environment", name: "Bare Alley" });
    await insertSequenceAsset(seqId, environmentId);
    const shotId = await insertShot(ctx, seqId, { lighting: "Kept" });
    const before = await readShot(ctx, shotId);

    await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(seqId), shotId: String(shotId) })
      )
    );

    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a shot that belongs to another sequence and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { lighting: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), shotId: String(shotId) })
      )
    );

    expect(target).toContain(
      `shotLightingError=${encodeURIComponent(
        "Shot not found or does not belong to this sequence."
      )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a sequence owned by another project and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { lighting: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      fillShotLightingFromSequence(
        form({ projectId: String(projectId), sequenceId: String(otherSequenceId), shotId: String(shotId) })
      )
    );

    expect(target).toContain(
      `shotLightingError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses an invalid identifier without writing", async () => {
    const target = await captureRedirect(() =>
      fillShotLightingFromSequence(form({ projectId: "abc", sequenceId: "1", shotId: "1" }))
    );

    expect(target).toContain(`shotLightingError=${encodeURIComponent("Invalid request.")}`);
  });
});
