import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// buildShotLightingFillText / computeShotLightingFill —
// LLMW.LIGHTING.SHOTFILL.1. The "Fill from sequence" button's own logic —
// what to copy, and when there is nothing to offer — lives here rather than
// in the page's JSX, per this ticket's own instruction that it must be
// provable where it lives.
//
// `buildShotLightingFillText` is pure (no database): proven directly against
// a plain `SeqLightingData` value. `computeShotLightingFill` is the thin
// `server-only` wrapper that runs the real query
// (`resolveSeqLighting`, variables/registry.ts) — proven against a real
// database so the two agree.
// ---------------------------------------------------------------------------

describe("buildShotLightingFillText — pure logic", () => {
  let buildShotLightingFillText: typeof import("@/lib/llmWorkspace/shotLightingFill").buildShotLightingFillText;

  beforeAll(async () => {
    ({ buildShotLightingFillText } = await import("@/lib/llmWorkspace/shotLightingFill"));
  });

  it("returns the sequence's own lighting, trimmed, when it is the effective source", () => {
    expect(
      buildShotLightingFillText({ source: "own", lighting: "  Golden hour, warm rim light  " })
    ).toBe("Golden hour, warm rim light");
  });

  it("returns null when there is nothing to offer (source: none)", () => {
    expect(buildShotLightingFillText({ source: "none" })).toBeNull();
  });

  it("returns null when the source is environment but none of them has a lighting value", () => {
    expect(
      buildShotLightingFillText({
        source: "environment",
        environments: [
          { name: "Alley", lighting: null },
          { name: "Rooftop", lighting: "   " },
        ],
      })
    ).toBeNull();
  });

  it("concatenates one environment with its name", () => {
    expect(
      buildShotLightingFillText({
        source: "environment",
        environments: [{ name: "Alley", lighting: "Sodium streetlight, orange" }],
      })
    ).toBe("Alley: Sodium streetlight, orange");
  });

  it("concatenates several environments, in the given order, each with its own name — no election rule", () => {
    expect(
      buildShotLightingFillText({
        source: "environment",
        environments: [
          { name: "Alpha Bay", lighting: "Moonlight, cool" },
          { name: "Zeta Station", lighting: "Fluorescent, flat" },
        ],
      })
    ).toBe("Alpha Bay: Moonlight, cool\n\nZeta Station: Fluorescent, flat");
  });

  it("skips an environment with no lighting but keeps the ones that have one", () => {
    expect(
      buildShotLightingFillText({
        source: "environment",
        environments: [
          { name: "Alpha Bay", lighting: "Moonlight, cool" },
          { name: "No Lighting Set", lighting: null },
          { name: "Zeta Station", lighting: "  " },
        ],
      })
    ).toBe("Alpha Bay: Moonlight, cool");
  });
});

describe("computeShotLightingFill — against a real database", () => {
  let ctx: TempDb;
  let computeShotLightingFill: typeof import("@/lib/llmWorkspace/shotLightingFill").computeShotLightingFill;

  beforeAll(async () => {
    ctx = await setupTempDb();
    ({ computeShotLightingFill } = await import("@/lib/llmWorkspace/shotLightingFill"));
  });

  afterAll(() => ctx.cleanup());

  async function insertSequenceAsset(sequenceId: number, assetId: number): Promise<void> {
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });
  }

  it("returns null for a sequence with no lighting of its own and no environment Asset", async () => {
    const projectId = await insertProject(ctx, "shot fill — nothing to offer");
    const sequenceId = await insertSequence(ctx, projectId);

    expect(await computeShotLightingFill(sequenceId)).toBeNull();
  });

  it("returns the sequence's own lighting when it is filled — the effective value wins over environment", async () => {
    const projectId = await insertProject(ctx, "shot fill — own lighting wins");
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Sequence's own lighting" });
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Cold neon, blue-heavy",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    expect(await computeShotLightingFill(sequenceId)).toBe("Sequence's own lighting");
  });

  it("falls back to environment lighting when the sequence's own field is blank", async () => {
    const projectId = await insertProject(ctx, "shot fill — environment fallback");
    const sequenceId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Cold neon, blue-heavy",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    expect(await computeShotLightingFill(sequenceId)).toBe("Rooftop: Cold neon, blue-heavy");
  });

  it("concatenates several environments, assets.name ascending, when there is no own lighting", async () => {
    const projectId = await insertProject(ctx, "shot fill — several environments");
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

    expect(await computeShotLightingFill(sequenceId)).toBe(
      "Alpha Bay: Moonlight, cool\n\nZeta Station: Fluorescent, flat"
    );
  });

  it("returns null when the sequence's own field is blank and its environment has no lighting value", async () => {
    const projectId = await insertProject(ctx, "shot fill — blank environment");
    const sequenceId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, { type: "environment", name: "Bare Alley" });
    await insertSequenceAsset(sequenceId, environmentId);

    expect(await computeShotLightingFill(sequenceId)).toBeNull();
  });
});
