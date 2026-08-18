import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SHOT.LIGHTING / ASSET.LIGHTING / SEQ.LIGHTING — LLMW.LIGHTING.1 (B15a),
// §5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md.
//
// SHOT.LIGHTING / ASSET.LIGHTING are proven on the model of
// shotNarrativePromptVariable.test.ts: a value present, a null value, a
// clean refusal on an entity that does not exist.
//
// SEQ.LIGHTING is proven on its five cases (the ticket's own list): own
// field filled (source "own", environment not read — proven by the returned
// value never reflecting the environment's own distinct lighting); own
// field empty with one environment (source "environment"); own field empty
// with several environments (all rendered, `assets.name` ascending); own
// field empty with no environment (source "none"); a sequence that does not
// exist (explicit throw). Plus the ticket's own extra case: a whitespace-only
// own field counts as empty and must not beat the environment.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveShotLighting: typeof import("@/lib/llmWorkspace/variables/registry").resolveShotLighting;
let resolveAssetLighting: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetLighting;
let resolveSeqLighting: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqLighting;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveShotLighting, resolveAssetLighting, resolveSeqLighting } = await import(
    "@/lib/llmWorkspace/variables/registry"
  ));
});

afterAll(() => ctx.cleanup());

async function insertSequenceAsset(sequenceId: number, assetId: number): Promise<void> {
  await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });
}

describe("resolveShotLighting — resolver contract", () => {
  it("returns the stored lighting when present", async () => {
    const projectId = await insertProject(ctx, "SHOT.LIGHTING project");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId, { lighting: "Backlit, hard shadows" });

    const result = await resolveShotLighting(shotId);
    expect(result).toEqual({ lighting: "Backlit, hard shadows" });
    expect(Object.keys(result).sort()).toEqual(["lighting"]);
  });

  it("returns null when the field is empty", async () => {
    const projectId = await insertProject(ctx, "SHOT.LIGHTING empty project");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);

    expect(await resolveShotLighting(shotId)).toEqual({ lighting: null });
  });

  it("refuses on a shot that does not exist", async () => {
    await expect(resolveShotLighting(999999)).rejects.toThrow("resolveShotLighting: shot 999999 not found.");
  });
});

describe("resolveAssetLighting — resolver contract", () => {
  it("returns the stored lighting when present", async () => {
    const projectId = await insertProject(ctx, "ASSET.LIGHTING project");
    const assetId = await insertAsset(ctx, projectId, { type: "environment", lighting: "Overcast, diffused" });

    const result = await resolveAssetLighting(assetId);
    expect(result).toEqual({ lighting: "Overcast, diffused" });
    expect(Object.keys(result).sort()).toEqual(["lighting"]);
  });

  it("returns null when the field is empty", async () => {
    const projectId = await insertProject(ctx, "ASSET.LIGHTING empty project");
    const assetId = await insertAsset(ctx, projectId);

    expect(await resolveAssetLighting(assetId)).toEqual({ lighting: null });
  });

  it("refuses on an asset that does not exist", async () => {
    await expect(resolveAssetLighting(999999)).rejects.toThrow("resolveAssetLighting: asset 999999 not found.");
  });
});

describe("resolveSeqLighting — the preséance rule (2026-08-18), five cases", () => {
  it("case 1: own field filled wins — the environment's distinct value is never reflected", async () => {
    const projectId = await insertProject(ctx, "SEQ.LIGHTING own project");
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Golden hour, warm rim light" });
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Cold neon, blue-heavy",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    const result = await resolveSeqLighting(sequenceId);
    expect(result).toEqual({ source: "own", lighting: "Golden hour, warm rim light" });
  });

  it("case 2: own field empty, one environment — source \"environment\"", async () => {
    const projectId = await insertProject(ctx, "SEQ.LIGHTING one environment project");
    const sequenceId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Alley",
      lighting: "Sodium streetlight, orange",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    const result = await resolveSeqLighting(sequenceId);
    expect(result).toEqual({
      source: "environment",
      environments: [{ name: "Alley", lighting: "Sodium streetlight, orange" }],
    });
  });

  it("case 3: own field empty, several environments — all rendered, assets.name ascending", async () => {
    const projectId = await insertProject(ctx, "SEQ.LIGHTING several environments project");
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
    // A non-environment asset attached to the same sequence must not appear.
    const prop = await insertAsset(ctx, projectId, { type: "prop", name: "Aardvark Prop", lighting: "Should not appear" });
    await insertSequenceAsset(sequenceId, zeta);
    await insertSequenceAsset(sequenceId, alpha);
    await insertSequenceAsset(sequenceId, prop);

    const result = await resolveSeqLighting(sequenceId);
    expect(result).toEqual({
      source: "environment",
      environments: [
        { name: "Alpha Bay", lighting: "Moonlight, cool" },
        { name: "Zeta Station", lighting: "Fluorescent, flat" },
      ],
    });
  });

  it("case 4: own field empty, no environment — source \"none\"", async () => {
    const projectId = await insertProject(ctx, "SEQ.LIGHTING no environment project");
    const sequenceId = await insertSequence(ctx, projectId);

    expect(await resolveSeqLighting(sequenceId)).toEqual({ source: "none" });
  });

  it("case 5: a sequence that does not exist refuses loudly", async () => {
    await expect(resolveSeqLighting(999999)).rejects.toThrow("resolveSeqLighting: sequence 999999 not found.");
  });

  it("a whitespace-only own field counts as empty and does not beat the environment", async () => {
    const projectId = await insertProject(ctx, "SEQ.LIGHTING blank project");
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "   " });
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Bridge",
      lighting: "Harsh noon sun",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    const result = await resolveSeqLighting(sequenceId);
    expect(result).toEqual({
      source: "environment",
      environments: [{ name: "Bridge", lighting: "Harsh noon sun" }],
    });
  });
});
