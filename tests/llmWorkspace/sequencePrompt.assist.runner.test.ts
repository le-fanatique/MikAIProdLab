import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, readProject, readSequence } from "../actions/helpers/fixtures";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";
import { buildSequencePromptFromContextPrompt } from "@/lib/prompts/sequence-prompt-from-context";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for
// `sequencePrompt.assist` — same structure as `story.generate.runner.test.ts`
// (see that file's header, re-pointed at the B3a switch the same way: the
// oracle is called directly, not captured from an action call that no longer
// happens), plus the fourth obligation specific to this operation: a
// transform mode against an empty `sequencePrompt` is refused *before* the
// LLM call, with the exact `preconditions` message.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ sequence_prompt: "A generated sequence prompt." })),
}));

let ctx: TempDb;
let generateSequencePromptDraft: typeof import("@/actions/llm/sequencePrompt").generateSequencePromptDraft;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;
let sequenceId: number;
let otherProjectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateSequencePromptDraft } = await import("@/actions/llm/sequencePrompt"));
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Sequence project");
  otherProjectId = await insertProject(ctx, "A different project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));

  sequenceId = await insertSequence(ctx, projectId, {
    title: "Opening sequence",
    summary: "A short summary.",
    description: "A longer description.",
    mood: "Tense",
    locationHint: "Rooftop, dusk",
    sequencePrompt: "An existing sequence prompt.",
  });
});

afterAll(() => ctx.cleanup());

async function expectedPrompt(mode: "generate" | "enhance" | "rewrite" | "shorten" | "expand") {
  const [project, sequence] = await Promise.all([readProject(ctx, projectId), readSequence(ctx, sequenceId)]);
  return buildSequencePromptFromContextPrompt({
    assistMode: mode,
    projectName: project.name,
    projectPitch: project.pitch,
    projectStory: project.story,
    sequenceTitle: sequence.title,
    sequenceSummary: sequence.summary,
    sequenceDescription: sequence.description,
    sequenceMood: sequence.mood,
    sequenceLocationHint: sequence.locationHint,
    currentSequencePrompt: sequence.sequencePrompt,
  });
}

describe("sequencePrompt.assist — runner proof (LLMW.RUNNER.1a)", () => {
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte (enhance mode)", async () => {
    const result = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId), mode: "enhance" })
    );
    expect(result).toEqual({ ok: true, draft: "A generated sequence prompt." });

    const expected = await expectedPrompt("enhance");

    const runnerResult = await resolveOperationPrompt(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId },
      { mode: "enhance" }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("1b. matches for generate mode too (the branch that never reads SEQ.CURRENT_PROMPT)", async () => {
    const result = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId), mode: "generate" })
    );
    expect(result).toEqual({ ok: true, draft: "A generated sequence prompt." });

    const expected = await expectedPrompt("generate");

    const runnerResult = await resolveOperationPrompt(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId },
      { mode: "generate" }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("2. refuses a Sequence belonging to a different Project, with the same message generateSequencePromptDraft produces", async () => {
    const actionResult = await generateSequencePromptDraft(
      form({ projectId: String(otherProjectId), sequenceId: String(sequenceId), mode: "generate" })
    );
    expect(actionResult).toEqual({ ok: false, error: "Sequence not found." });

    const runnerResult = await resolveOperationPrompt(
      sequencePromptAssistDescriptor,
      { projectId: otherProjectId, sequenceId },
      { mode: "generate" }
    );
    expect(runnerResult).toEqual({ ok: false, error: "Sequence not found." });
  });

  it("2b. refuses a Project that does not exist, with the same message generateSequencePromptDraft produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateSequencePromptDraft(
      form({ projectId: String(nonExistentProjectId), sequenceId: String(sequenceId), mode: "generate" })
    );
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(
      sequencePromptAssistDescriptor,
      { projectId: nonExistentProjectId, sequenceId },
      { mode: "generate" }
    );
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ sequence_prompt: "A fresh prompt." }));
    const valid = await runOperation(sequencePromptAssistDescriptor, { projectId, sequenceId }, { mode: "generate" });
    expect(valid).toEqual({ ok: true, kind: "object", values: { sequencePrompt: "A fresh prompt." } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId },
      { mode: "generate" }
    );
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ sequence_prompt: "   " }));
    const empty = await runOperation(sequencePromptAssistDescriptor, { projectId, sequenceId }, { mode: "generate" });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty prompt. Try again.",
    });
  });

  it("4. a transform mode against an empty sequencePrompt is refused before the LLM call, with the exact precondition message", async () => {
    const emptySequenceId = await insertSequence(ctx, projectId, { sequencePrompt: null });

    const actionResult = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(emptySequenceId), mode: "enhance" })
    );
    expect(actionResult).toEqual({
      ok: false,
      error: "A Sequence Prompt is required for this assist mode.",
    });

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const runnerResult = await runOperation(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId: emptySequenceId },
      { mode: "enhance" }
    );
    expect(runnerResult).toEqual({
      ok: false,
      error: "A Sequence Prompt is required for this assist mode.",
    });
    // Refused before step 6 — the model is never called.
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });

  it("4b. generate mode has no such precondition, even against an empty sequencePrompt", async () => {
    const emptySequenceId = await insertSequence(ctx, projectId, { sequencePrompt: null, title: "Blank for generate" });

    const actionResult = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(emptySequenceId), mode: "generate" })
    );
    expect(actionResult.ok).toBe(true);

    const runnerResult = await resolveOperationPrompt(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId: emptySequenceId },
      { mode: "generate" }
    );
    expect(runnerResult.ok).toBe(true);
  });
});
