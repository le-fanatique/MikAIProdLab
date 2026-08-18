import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// buildSequenceLightingFillText / computeSequenceLightingFill —
// LLMW.LIGHTING.SURFACE.1 (B15b). The "Fill from environment" button's own
// logic — what to copy, in what order, and when there is nothing to offer —
// lives here rather than in the page's JSX, per this ticket's own
// instruction that it must be provable where it lives.
//
// `buildSequenceLightingFillText` is pure (no database): proven directly
// against plain arrays. `computeSequenceLightingFill` is the thin
// `server-only` wrapper that runs the real query
// (`resolveSequenceEnvironmentAssets`, variables/registry.ts) — proven
// against a real database so the two agree.
// ---------------------------------------------------------------------------

describe("buildSequenceLightingFillText — pure logic", () => {
  let buildSequenceLightingFillText: typeof import("@/lib/llmWorkspace/sequenceLightingFill").buildSequenceLightingFillText;

  beforeAll(async () => {
    ({ buildSequenceLightingFillText } = await import("@/lib/llmWorkspace/sequenceLightingFill"));
  });

  it("returns null when there are no environments at all", () => {
    expect(buildSequenceLightingFillText([])).toBeNull();
  });

  it("returns null when every environment has no lighting", () => {
    expect(
      buildSequenceLightingFillText([
        { name: "Alley", lighting: null },
        { name: "Rooftop", lighting: "   " },
      ])
    ).toBeNull();
  });

  it("concatenates one environment with its name", () => {
    expect(
      buildSequenceLightingFillText([{ name: "Alley", lighting: "Sodium streetlight, orange" }])
    ).toBe("Alley: Sodium streetlight, orange");
  });

  it("concatenates several environments, in the given order, each with its own name — no election rule", () => {
    expect(
      buildSequenceLightingFillText([
        { name: "Alpha Bay", lighting: "Moonlight, cool" },
        { name: "Zeta Station", lighting: "Fluorescent, flat" },
      ])
    ).toBe("Alpha Bay: Moonlight, cool\n\nZeta Station: Fluorescent, flat");
  });

  it("skips an environment with no lighting but keeps the ones that have one", () => {
    expect(
      buildSequenceLightingFillText([
        { name: "Alpha Bay", lighting: "Moonlight, cool" },
        { name: "No Lighting Set", lighting: null },
        { name: "Zeta Station", lighting: "  " },
      ])
    ).toBe("Alpha Bay: Moonlight, cool");
  });
});

describe("computeSequenceLightingFill — against a real database", () => {
  let ctx: TempDb;
  let computeSequenceLightingFill: typeof import("@/lib/llmWorkspace/sequenceLightingFill").computeSequenceLightingFill;

  beforeAll(async () => {
    ctx = await setupTempDb();
    ({ computeSequenceLightingFill } = await import("@/lib/llmWorkspace/sequenceLightingFill"));
  });

  afterAll(() => ctx.cleanup());

  async function insertSequenceAsset(sequenceId: number, assetId: number): Promise<void> {
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });
  }

  it("returns null for a sequence with no environment Asset", async () => {
    const projectId = await insertProject(ctx, "fill — no environment");
    const sequenceId = await insertSequence(ctx, projectId);

    expect(await computeSequenceLightingFill(sequenceId)).toBeNull();
  });

  it("returns null when every cast environment has no lighting value", async () => {
    const projectId = await insertProject(ctx, "fill — blank environments");
    const sequenceId = await insertSequence(ctx, projectId);
    const environmentId = await insertAsset(ctx, projectId, { type: "environment", name: "Alley" });
    await insertSequenceAsset(sequenceId, environmentId);

    expect(await computeSequenceLightingFill(sequenceId)).toBeNull();
  });

  it("reads environment lighting unconditionally — even when the sequence's own field is already filled", async () => {
    const projectId = await insertProject(ctx, "fill — own field already filled");
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Already typed by hand" });
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Cold neon, blue-heavy",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    // This is the case resolveSeqLighting alone cannot serve: its own
    // precedence rule would short-circuit to { source: "own" } and never
    // reach the environment query at all.
    expect(await computeSequenceLightingFill(sequenceId)).toBe("Rooftop: Cold neon, blue-heavy");
  });

  it("concatenates several environments, assets.name ascending", async () => {
    const projectId = await insertProject(ctx, "fill — several environments");
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

    expect(await computeSequenceLightingFill(sequenceId)).toBe(
      "Alpha Bay: Moonlight, cool\n\nZeta Station: Fluorescent, flat"
    );
  });
});
