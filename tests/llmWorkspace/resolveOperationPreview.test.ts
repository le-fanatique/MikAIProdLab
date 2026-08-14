import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// Proof required by `LLMW.BENCH.READ.1` (B6b) §9 for `resolveOperationPreview`:
//
//   (i)   the returned `prompt` is identical, byte-for-byte, to
//         `resolveOperationPrompt`'s for the same inputs, when an LLM *is*
//         configured;
//   (ii)  `variables` carries every declared variable, in
//         `descriptor.context.variables`'s own order;
//   (iii) with no LLM configured, the preview still succeeds while
//         `resolveOperationPrompt` keeps refusing with
//         `messages.notConfigured` — the one observable difference §5a of
//         the ticket authorizes.
//
// A fourth case proves §7's last failure path (a variable resolver that
// throws must not escape `resolveOperationPreview` as an unhandled
// exception): a synthetic descriptor, local to this file, anchored on
// `project` but declaring `SEQ.CONTEXT` — a variable whose resolver needs
// `sequenceId`, which a project anchor never supplies. `runner.ts`'s own
// `anchorIdForVariable` throws synchronously in that case
// (`no id available for variable SEQ.CONTEXT`), reproducing the same shape
// of failure as a resolver throwing on a row not found, without needing to
// corrupt the seeded database mid-test.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let eq: typeof import("drizzle-orm").eq;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let resolveOperationPreview: typeof import("@/lib/llmWorkspace/runner").resolveOperationPreview;
let projectId: number;
let sequenceId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  ({ eq } = await import("drizzle-orm"));
  ({ resolveOperationPrompt, resolveOperationPreview } = await import("@/lib/llmWorkspace/runner"));

  projectId = await insertProject(ctx, "Bench preview project");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));

  sequenceId = await insertSequence(ctx, projectId, {
    title: "Opening sequence",
    summary: "A short summary.",
    sequencePrompt: "An existing sequence prompt.",
  });
});

afterAll(() => ctx.cleanup());

afterEach(async () => {
  // Each test that needs an LLM configured inserts the row itself and this
  // clears it back out, so "(iii) no LLM configured" always starts from a
  // clean, known state regardless of test order.
  await ctx.db.delete(ctx.schema.appSettings).where(eq(ctx.schema.appSettings.key, "llm_ollama_model"));
});

describe("resolveOperationPreview — LLMW.BENCH.READ.1 (B6b)", () => {
  it("(i) with an LLM configured, the preview's prompt equals resolveOperationPrompt's, byte-for-byte", async () => {
    await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

    const ids = { projectId, sequenceId };
    const intent = { mode: "generate" };

    const promptResult = await resolveOperationPrompt(sequencePromptAssistDescriptor, ids, intent);
    expect(promptResult.ok).toBe(true);
    if (!promptResult.ok) throw new Error("unreachable");

    const previewResult = await resolveOperationPreview(sequencePromptAssistDescriptor, ids, intent);
    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) throw new Error("unreachable");

    expect(previewResult.prompt.system).toBe(promptResult.prompt.system);
    expect(previewResult.prompt.user).toBe(promptResult.prompt.user);
  });

  it("(ii) variables carries every declared variable, in descriptor.context.variables's own order", async () => {
    await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

    const previewResult = await resolveOperationPreview(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId },
      { mode: "generate" }
    );
    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) throw new Error("unreachable");

    expect(previewResult.variables.map((v) => v.id)).toEqual([
      "PROJECT.IDENTITY",
      "SEQ.CONTEXT",
      "SEQ.CURRENT_PROMPT",
    ]);
    for (const v of previewResult.variables) {
      expect(v.data).not.toBeUndefined();
    }
  });

  it("(iii) without an LLM configured, the preview succeeds while resolveOperationPrompt keeps refusing with messages.notConfigured", async () => {
    const ids = { projectId, sequenceId };
    const intent = { mode: "generate" };

    const promptResult = await resolveOperationPrompt(sequencePromptAssistDescriptor, ids, intent);
    expect(promptResult).toEqual({
      ok: false,
      error: sequencePromptAssistDescriptor.messages.notConfigured,
    });

    const previewResult = await resolveOperationPreview(sequencePromptAssistDescriptor, ids, intent);
    expect(previewResult.ok).toBe(true);
  });

  it("§7 — a variable resolver that throws is caught, not propagated, and turns into an ok:false result", async () => {
    const mismatchedDescriptor: OperationDescriptor = {
      ...sequencePromptAssistDescriptor,
      id: "test.mismatchedAnchor",
      anchor: { kind: "entity", entity: "project" },
      context: { variables: [{ id: "SEQ.CONTEXT", userAdjustable: false }] },
      preconditions: undefined,
    };

    const result = await resolveOperationPreview(mismatchedDescriptor, { projectId });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/no id available for variable SEQ\.CONTEXT/);
  });
});
