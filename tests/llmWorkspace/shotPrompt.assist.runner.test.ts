import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { shotPromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/shotPrompt";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for `shotPrompt.assist`
// — the jumeau of `sequencePrompt.assist`, same four obligations, same
// structure as `sequencePrompt.assist.runner.test.ts` (see that file's
// header), one entity kind deeper (project -> sequence -> shot instead of
// project -> sequence) and its own precondition entry restricted to the four
// transform modes.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shot_prompt: "A generated shot prompt." })),
}));

let capturedPrompt: { system: string; user: string } | undefined;
vi.mock("@/lib/prompts/shot-prompt-from-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prompts/shot-prompt-from-context")>();
  return {
    buildShotPromptFromContextPrompt: (ctx: Parameters<typeof actual.buildShotPromptFromContextPrompt>[0]) => {
      capturedPrompt = actual.buildShotPromptFromContextPrompt(ctx);
      return capturedPrompt;
    },
  };
});

let ctx: TempDb;
let generateShotPromptDraft: typeof import("@/actions/llm/shotPrompt").generateShotPromptDraft;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;
let sequenceId: number;
let shotId: number;
let otherProjectId: number;
let otherSequenceId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateShotPromptDraft } = await import("@/actions/llm/shotPrompt"));
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Shot Prompt project");
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
  });
  otherSequenceId = await insertSequence(ctx, otherProjectId, { title: "Unrelated sequence" });

  shotId = await insertShot(ctx, sequenceId, {
    title: "Hero enters",
    shotCode: "SH01",
    description: "The hero steps into frame.",
    actionPitch: "Walks forward, looks up.",
    cameraPitch: "Slow push-in.",
    framing: "Medium shot",
    cameraMovement: "Dolly",
    durationSeconds: 4,
    shotPrompt: "An existing shot prompt.",
  });
});

afterAll(() => ctx.cleanup());

describe("shotPrompt.assist — runner proof (LLMW.RUNNER.1b)", () => {
  it("1. the runner's {system, user} equals what generateShotPromptDraft passes to its builder, byte-for-byte (enhance mode)", async () => {
    const result = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(shotId),
        mode: "enhance",
      })
    );
    expect(result).toEqual({ ok: true, draft: "A generated shot prompt." });
    expect(capturedPrompt).toBeDefined();

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "enhance" }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(capturedPrompt!.system);
    expect(runnerResult.prompt.user).toBe(capturedPrompt!.user);
  });

  it("1b. matches for generate mode too (the branch that never reads SHOT.CURRENT_PROMPT)", async () => {
    const result = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(shotId),
        mode: "generate",
      })
    );
    expect(result).toEqual({ ok: true, draft: "A generated shot prompt." });
    expect(capturedPrompt).toBeDefined();

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(capturedPrompt!.system);
    expect(runnerResult.prompt.user).toBe(capturedPrompt!.user);
  });

  it("2. refuses a Shot belonging to a different Sequence chain, with the same message generateShotPromptDraft produces", async () => {
    const actionResult = await generateShotPromptDraft(
      form({
        projectId: String(otherProjectId),
        sequenceId: String(otherSequenceId),
        shotId: String(shotId),
        mode: "generate",
      })
    );
    expect(actionResult).toEqual({ ok: false, error: "Shot not found." });

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId: otherProjectId, sequenceId: otherSequenceId, shotId },
      { mode: "generate" }
    );
    expect(runnerResult).toEqual({ ok: false, error: "Shot not found." });
  });

  it("2b. refuses a Project that does not exist, with the same message generateShotPromptDraft produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateShotPromptDraft(
      form({
        projectId: String(nonExistentProjectId),
        sequenceId: String(sequenceId),
        shotId: String(shotId),
        mode: "generate",
      })
    );
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId: nonExistentProjectId, sequenceId, shotId },
      { mode: "generate" }
    );
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ shot_prompt: "A fresh prompt." }));
    const valid = await runOperation(shotPromptAssistDescriptor, { projectId, sequenceId, shotId }, { mode: "generate" });
    expect(valid).toEqual({ ok: true, values: { shotPrompt: "A fresh prompt." } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ shot_prompt: "   " }));
    const empty = await runOperation(shotPromptAssistDescriptor, { projectId, sequenceId, shotId }, { mode: "generate" });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty prompt. Try again.",
    });
  });

  it("4. a transform mode against an empty shotPrompt is refused before the LLM call, with the exact precondition message", async () => {
    const emptyShotId = await insertShot(ctx, sequenceId, { shotPrompt: null });

    const actionResult = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(emptyShotId),
        mode: "enhance",
      })
    );
    expect(actionResult).toEqual({
      ok: false,
      error: "A Shot Prompt is required for this assist mode.",
    });

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const runnerResult = await runOperation(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: emptyShotId },
      { mode: "enhance" }
    );
    expect(runnerResult).toEqual({
      ok: false,
      error: "A Shot Prompt is required for this assist mode.",
    });
    // Refused before step 6 — the model is never called.
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });

  it("4b. generate mode has no such precondition, even against an empty shotPrompt", async () => {
    const emptyShotId = await insertShot(ctx, sequenceId, { shotPrompt: null, title: "Blank for generate" });

    const actionResult = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(emptyShotId),
        mode: "generate",
      })
    );
    expect(actionResult.ok).toBe(true);

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: emptyShotId },
      { mode: "generate" }
    );
    expect(runnerResult.ok).toBe(true);
  });
});
