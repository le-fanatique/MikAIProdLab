import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { shotLightingDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotLightingDirected";

// ---------------------------------------------------------------------------
// LLMW.LIGHTING.DIRECTED.1 (B16c) — runtime proof for `shot.lightingDirected`
// against a real (temp) database: the two things "Validation attendue" names
// that a unit-level render test alone cannot prove —
//   1. the precondition actually refuses, with its exact message, before the
//      resolved prompt is even built, when the Shot has no lighting;
//   2. `resolveOperationPrompt` against a real seeded Shot really does carry
//      both the current lighting value and the director's note in the same
//      resolved user prompt (the render test proves the render *forms* do
//      this in isolation; this proves the runner actually wires them that
//      way end to end).
// No LLM call is exercised here — `resolveOperationPrompt` stops before
// step 6, the same boundary `assetBible.generate.runner.test.ts`'s own
// obligation 1 uses.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;

let projectId: number;
let sequenceId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));

  projectId = await insertProject(ctx, "Shot lighting directed project");
  sequenceId = await insertSequence(ctx, projectId, { title: "Server room sequence" });
});

afterAll(() => ctx.cleanup());

describe("shot.lightingDirected — runner proof", () => {
  it("refuses, with the precondition's exact message, when the Shot has no lighting recorded", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "No lighting yet" });

    const result = await resolveOperationPrompt(shotLightingDirectedDescriptor, { projectId, sequenceId, shotId });
    expect(result).toEqual({ ok: false, error: "This Shot has no lighting yet — there is nothing to adjust." });
  });

  it("a whitespace-only lighting field is treated as empty and refused, same as a null one", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Blank lighting", lighting: "   " });

    const result = await resolveOperationPrompt(shotLightingDirectedDescriptor, { projectId, sequenceId, shotId });
    expect(result).toEqual({ ok: false, error: "This Shot has no lighting yet — there is nothing to adjust." });
  });

  it("the resolved prompt carries BOTH the current lighting value and the director's note", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Screens shot",
      lighting: "Cold blue moonlight from camera left, hard shadows.",
    });

    const result = await resolveOperationPrompt(
      shotLightingDirectedDescriptor,
      { projectId, sequenceId, shotId },
      { freeText: "At the start he is in shadow; by the end the screens light him." }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain(
      "Current lighting: Cold blue moonlight from camera left, hard shadows."
    );
    expect(result.prompt.user).toContain(
      "Director's note: At the start he is in shadow; by the end the screens light him."
    );
  });

  it("refuses on a Shot that does not exist, with the same chain message every other Shot-anchored descriptor uses", async () => {
    const result = await resolveOperationPrompt(shotLightingDirectedDescriptor, {
      projectId,
      sequenceId,
      shotId: 999999,
    });
    expect(result).toEqual({ ok: false, error: "Shot not found." });
  });
});
