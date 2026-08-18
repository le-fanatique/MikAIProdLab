import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertAsset } from "../actions/helpers/fixtures";
import { sequenceLightingDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/sequenceLightingDirected";

// ---------------------------------------------------------------------------
// LLMW.LIGHTING.DIRECTED.1 (B16c) — runtime proof for
// `sequence.lightingDirected` against a real (temp) database. Same boundary
// as `shotLightingDirected.runner.test.ts`: `resolveOperationPrompt` only,
// no LLM call. The proof that matters most here (§ "Validation attendue",
// second point): a Sequence whose own field is blank but whose distribution
// carries an environment Asset with a lighting value resolves through the
// real `SEQ.LIGHTING` precedence rule (not a stand-in), and the value that
// reaches the resolved prompt is the inherited one, marked as inherited.
//
// No precondition-refusal case here — the descriptor's own header comment
// explains why none is declared for `SEQ.LIGHTING`'s three-way `source`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;

let projectId: number;

async function insertSequenceAsset(sequenceId: number, assetId: number): Promise<void> {
  await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));

  projectId = await insertProject(ctx, "Sequence lighting directed project");
});

afterAll(() => ctx.cleanup());

describe("sequence.lightingDirected — runner proof", () => {
  it("source \"own\": the resolved prompt carries the Sequence's own value and the director's note", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Own lighting sequence",
      lighting: "Overcast, flat daylight.",
    });

    const result = await resolveOperationPrompt(
      sequenceLightingDirectedDescriptor,
      { projectId, sequenceId },
      { freeText: "Push it warmer for the rooftop scene." }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Current lighting (set directly on this Sequence): Overcast, flat daylight.");
    expect(result.prompt.user).toContain("Director's note: Push it warmer for the rooftop scene.");
  });

  it("source \"environment\": an empty own field with an environment Asset's real lighting resolves to the INHERITED value, marked as such — through the real SEQ.LIGHTING precedence rule, not a stand-in", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "Inherited lighting sequence" });
    const environmentId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Server room",
      lighting: "Cold blue monitor glow, hard shadows.",
    });
    await insertSequenceAsset(sequenceId, environmentId);

    const result = await resolveOperationPrompt(
      sequenceLightingDirectedDescriptor,
      { projectId, sequenceId },
      { freeText: "At the start he is in shadow; by the end the screens light him." }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("this Sequence has none of its own — inherited from its environment Asset(s)");
    expect(result.prompt.user).toContain("Server room: Cold blue monitor glow, hard shadows.");
    expect(result.prompt.user).toContain(
      "Director's note: At the start he is in shadow; by the end the screens light him."
    );
    expect(result.prompt.user).not.toContain("set directly on this Sequence");
  });

  it("source \"none\": with neither an own value nor an environment Asset, the resolved prompt still assembles and states plainly that nothing is recorded — no precondition refuses this run", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "No lighting anywhere" });

    const result = await resolveOperationPrompt(sequenceLightingDirectedDescriptor, { projectId, sequenceId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain(
      "Current lighting: (none recorded — neither this Sequence nor any of its environment Assets has a lighting description)"
    );
  });

  it("refuses on a Sequence that does not exist, with the same chain message every other Sequence-anchored descriptor uses", async () => {
    const result = await resolveOperationPrompt(sequenceLightingDirectedDescriptor, {
      projectId,
      sequenceId: 999999,
    });
    expect(result).toEqual({ ok: false, error: "Sequence not found." });
  });
});
