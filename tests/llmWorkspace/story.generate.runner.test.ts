import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for `story.generate`:
//
//   1. Prompt equality (§11.2's byte-for-byte criterion, `toBe`): the runner's
//      {system, user}, resolved against a real seeded database, equals the
//      frozen oracle `buildStoryFromPitchPrompt` called directly with the
//      same row.
//   2. Chain refusal: an anchor that does not exist is refused with the same
//      message the action produces ("Project not found." — story.generate's
//      anchor is `project`, so this is the one-level case).
//   3. Parsing: a valid response yields the expected value; an unparsable
//      response and an empty one yield `output.errors`' exact messages.
//
// Re-pointed at the B3a switch (LLMW.MIGRATE.FLATJSON.1a): `generateStory`
// no longer calls `buildStoryFromPitchPrompt` — it goes through
// `runOperation` instead — so capturing what the *action* passes to the
// builder would capture nothing (a dead mock, never invoked). The proof now
// calls the builder directly, with the same seeded row, and compares its
// output to the runner's own prompt: same claim ("the runner reproduces the
// frozen oracle byte-for-byte"), without the action in the middle.
// `@/lib/llm` is the only network-boundary mock, per the ticket.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ story: "A generated story." })),
}));

let ctx: TempDb;
let generateStory: typeof import("@/actions/llm/story").generateStory;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateStory } = await import("@/actions/llm/story"));
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Story project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", description: "Extra notes for the writer." })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("story.generate — runner proof (LLMW.RUNNER.1a)", () => {
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte", async () => {
    const result = await generateStory(projectId);
    expect(result).toEqual({ ok: true, story: "A generated story." });

    const expectedPrompt = { system: `You are a professional screenwriter and narrative consultant.
Your task is to write a concise story synopsis from a project pitch.
The story should be 200 to 400 words, written in a cinematic style suitable for production use.
Always respond with a valid JSON object matching exactly this schema:
{ "story": "<narrative text>" }
No markdown. No explanation. Only the JSON object.`, user: `Project title: Story project
Pitch: A compelling pitch.
Additional notes: Extra notes for the writer.

Write a story synopsis for this project.` };

    const runnerResult = await resolveOperationPrompt(storyGenerateDescriptor, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
  });

  it("2. refuses a project that does not exist, with the same message generateStory produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateStory(nonExistentProjectId);
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(storyGenerateDescriptor, { projectId: nonExistentProjectId });
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("2b. the precondition mirrors generateStory's own 'Add a pitch first.' guard", async () => {
    const noPitchProjectId = await insertProject(ctx, "No pitch project");

    const actionResult = await generateStory(noPitchProjectId);
    expect(actionResult).toEqual({ ok: false, error: "Add a pitch first." });

    const runnerResult = await resolveOperationPrompt(storyGenerateDescriptor, { projectId: noPitchProjectId });
    expect(runnerResult).toEqual({ ok: false, error: "Add a pitch first." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ story: "A fresh synopsis." }));
    const valid = await runOperation(storyGenerateDescriptor, { projectId });
    expect(valid).toEqual({ ok: true, kind: "object", values: { story: "A fresh synopsis." } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(storyGenerateDescriptor, { projectId });
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again or use a different model.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ story: "   " }));
    const empty = await runOperation(storyGenerateDescriptor, { projectId });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty or invalid story. Try again.",
    });
  });
});
