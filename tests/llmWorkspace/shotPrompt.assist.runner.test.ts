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
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b): `generateShotPromptDraft`
// no longer calls `buildShotPromptFromContextPrompt`, so a mocked capture of
// the action's own call would capture nothing. The comparison now calls the
// frozen oracle directly against the same seeded rows instead — no cast/
// reference rows are inserted by this fixture, so `castSummary` /
// `referenceSummary` are `[]` on both sides.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shot_prompt: "A generated shot prompt." })),
}));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;
let sequenceId: number;
let shotId: number;
let otherProjectId: number;
let otherSequenceId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
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
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte (enhance mode)", async () => {
    const result = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId, sequenceId, shotId },
      intent: { mode: "enhance" },
    });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(result).toEqual({ ok: true, kind: "object", values: { shotPrompt: "A generated shot prompt." } });

    const expected = { system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Enhance the existing visual prompt by adding detail: camera angle precision, lighting nuances, atmospheric quality, compositional elements. Preserve the original intent and action. Do not change the core subject or scene dramatically.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`, user: `Current prompt:
An existing shot prompt.

Shot context (background only):
Shot: The hero steps into frame.
Mood: Tense
Location: Rooftop, dusk

Transform the prompt as instructed.` };

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "enhance" }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("1b. matches for generate mode too (the branch that never reads SHOT.CURRENT_PROMPT)", async () => {
    const result = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId, sequenceId, shotId },
      intent: { mode: "generate" },
    });
    expect(result).toEqual({ ok: true, kind: "object", values: { shotPrompt: "A generated shot prompt." } });

    const expected = { system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Write a clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`, user: `Project: Shot Prompt project
Pitch: A compelling pitch.
Story: A previously generated story.
Sequence: Opening sequence
Sequence summary: A short summary.
Sequence description: A longer description.
Mood: Tense
Location: Rooftop, dusk
Shot: SH01 — Hero enters
Duration: 4s
Description: The hero steps into frame.
Action: Walks forward, looks up.
Camera intent: Slow push-in.
Framing: Medium shot
Camera movement: Dolly
Existing prompt draft: An existing shot prompt.

Write a visual generation prompt for this shot.` };

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("2. refuses a Shot belonging to a different Sequence chain, with the same message generateShotPromptDraft produces", async () => {
    const actionResult = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId: otherProjectId, sequenceId: otherSequenceId, shotId },
      intent: { mode: "generate" },
    });
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

    const actionResult = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId: nonExistentProjectId, sequenceId, shotId },
      intent: { mode: "generate" },
    });
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
    expect(valid).toEqual({ ok: true, kind: "object", values: { shotPrompt: "A fresh prompt." } });

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

    const actionResult = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId, sequenceId, shotId: emptyShotId },
      intent: { mode: "enhance" },
    });
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

    const actionResult = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId, sequenceId, shotId: emptyShotId },
      intent: { mode: "generate" },
    });
    expect(actionResult.ok).toBe(true);

    const runnerResult = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: emptyShotId },
      { mode: "generate" }
    );
    expect(runnerResult.ok).toBe(true);
  });

  it("5. an unrecognised mode is refused with the exact 'Invalid assist mode.' message, before the LLM call", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const actionResult = await runWorkspaceOperation({
      descriptorId: "shotPrompt.assist",
      ids: { projectId, sequenceId, shotId },
      intent: { mode: "not-a-real-mode" },
    });
    expect(actionResult).toEqual({ ok: false, error: "Invalid assist mode." });
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });
});
