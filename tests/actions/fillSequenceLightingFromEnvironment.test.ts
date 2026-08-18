import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, insertSequence, readSequence } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// fillSequenceLightingFromEnvironment — LLMW.LIGHTING.SURFACE.1 (B15b), the
// "Fill from environment" button's write side. Never a parallel write path:
// it computes the text via `computeSequenceLightingFill` and delegates the
// actual write to `updateSequenceLighting` (B15a) as a plain FormData
// `lighting` value — so ownership, the blank-becomes-null rule and the
// redirect shape are inherited, not reimplemented.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let fillSequenceLightingFromEnvironment: typeof import("@/actions/sequences").fillSequenceLightingFromEnvironment;
let projectId: number;
let otherProjectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function insertSequenceAsset(sequenceId: number, assetId: number): Promise<void> {
  await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ fillSequenceLightingFromEnvironment } = await import("@/actions/sequences"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("fillSequenceLightingFromEnvironment — writes through updateSequenceLighting", () => {
  it("writes the concatenated environment lighting and touches no other column", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      lighting: "Already typed by hand",
      sequencePrompt: "Untouched prompt",
    });
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Cold neon, blue-heavy",
    });
    await insertSequenceAsset(sequenceId, environmentId);
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(
        form({ projectId: String(projectId), sequenceId: String(sequenceId) })
      )
    );

    const after = await readSequence(ctx, sequenceId);
    expect(target).toBe(`/projects/${projectId}/sequences/${sequenceId}?sequenceLightingSaved=1`);
    expect(after.lighting).toBe("Rooftop: Cold neon, blue-heavy");
    expect(after.sequencePrompt).toBe("Untouched prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
  });

  it("concatenates several environments in name order", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
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
    await insertSequenceAsset(sequenceId, zeta);
    await insertSequenceAsset(sequenceId, alpha);

    await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(
        form({ projectId: String(projectId), sequenceId: String(sequenceId) })
      )
    );

    expect((await readSequence(ctx, sequenceId)).lighting).toBe(
      "Alpha Bay: Moonlight, cool\n\nZeta Station: Fluorescent, flat"
    );
  });

  it("honours returnTo, forwarded to updateSequenceLighting's own redirect", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Alley",
      lighting: "Sodium streetlight, orange",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    const target = await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          returnTo: `/projects/${projectId}/sequences/${sequenceId}/edit`,
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/edit?sequenceLightingSaved=1`
    );
  });

  it("refuses without writing when there is nothing to copy — no environment cast", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Kept" });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(
        form({ projectId: String(projectId), sequenceId: String(sequenceId) })
      )
    );

    expect(target).toContain(
      `sequenceLightingError=${encodeURIComponent(
        "This sequence has no environment Asset with a Lighting value to copy."
      )}`
    );
    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses without writing when the cast environment has no lighting value", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Kept" });
    const environmentId = await insertAsset(ctx, projectId, { type: "environment", name: "Bare Alley" });
    await insertSequenceAsset(sequenceId, environmentId);
    const before = await readSequence(ctx, sequenceId);

    await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(
        form({ projectId: String(projectId), sequenceId: String(sequenceId) })
      )
    );

    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses a sequence owned by another project and writes nothing", async () => {
    const sequenceId = await insertSequence(ctx, otherProjectId, { lighting: "Protected" });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(
        form({ projectId: String(projectId), sequenceId: String(sequenceId) })
      )
    );

    expect(target).toContain(
      `sequenceLightingError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses an invalid identifier without writing", async () => {
    const target = await captureRedirect(() =>
      fillSequenceLightingFromEnvironment(form({ projectId: "abc", sequenceId: "1" }))
    );

    expect(target).toContain(`sequenceLightingError=${encodeURIComponent("Invalid request.")}`);
  });
});
