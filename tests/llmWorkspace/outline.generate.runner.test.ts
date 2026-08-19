import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for `outline.generate`
// — same structure as `story.generate.runner.test.ts`, see that file's header
// for the full rationale (re-pointed at the B3a switch: `generateOutlineDraft`
// no longer calls `buildOutlineFromStoryPrompt`, so the proof now calls it
// directly with the same seeded row instead of capturing the action's call).
// `targetSections` (an `intent.parameters` entry, not a context variable) is
// threaded through `resolveOperationPrompt`'s `intent` argument.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ outline: "## A section\nBody." })),
}));

let ctx: TempDb;
let generateOutlineDraft: typeof import("@/actions/llm/outlineGeneration").generateOutlineDraft;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateOutlineDraft } = await import("@/actions/llm/outlineGeneration"));
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Outline project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("outline.generate — runner proof (LLMW.RUNNER.1a)", () => {
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte", async () => {
    const result = await generateOutlineDraft(form({ projectId: String(projectId), targetSections: "6" }));
    expect(result).toEqual({ ok: true, outline: "## A section\nBody." });

    const expectedPrompt = { system: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).
- Write exactly 6 sections.

OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`, user: `Project title: Outline project
Pitch: A compelling pitch.
Story: A previously generated story.

Write a Project Outline for this project. Each section should clearly define its narrative role and production context.` };

    const runnerResult = await resolveOperationPrompt(
      outlineGenerateDescriptor,
      { projectId },
      { parameters: { targetSections: 6 } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
  });

  it("1b. matches without targetSections too (the mid-system parameter block's other branch)", async () => {
    const result = await generateOutlineDraft(form({ projectId: String(projectId) }));
    expect(result).toEqual({ ok: true, outline: "## A section\nBody." });

    const expectedPrompt = { system: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).
- Choose a natural number of sections based on the story structure (typically 4 to 8).

OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`, user: `Project title: Outline project
Pitch: A compelling pitch.
Story: A previously generated story.

Write a Project Outline for this project. Each section should clearly define its narrative role and production context.` };

    const runnerResult = await resolveOperationPrompt(outlineGenerateDescriptor, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
  });

  it("2. refuses a project that does not exist, with the same message generateOutlineDraft produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateOutlineDraft(form({ projectId: String(nonExistentProjectId) }));
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(outlineGenerateDescriptor, { projectId: nonExistentProjectId });
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, tolerant extra key, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ outline: "## Fresh\nBody." }));
    const valid = await runOperation(outlineGenerateDescriptor, { projectId });
    expect(valid).toEqual({ ok: true, kind: "object", values: { outline: "## Fresh\nBody." } });

    // outline.generate's parser is tolerant of a stray extra key.
    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ outline: "## Fresh\nBody.", extra_field: "ignored" }));
    const withExtraKey = await runOperation(outlineGenerateDescriptor, { projectId });
    expect(withExtraKey).toEqual({ ok: true, kind: "object", values: { outline: "## Fresh\nBody." } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(outlineGenerateDescriptor, { projectId });
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again or use a different model.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ outline: "" }));
    const empty = await runOperation(outlineGenerateDescriptor, { projectId });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty or invalid outline. Try again.",
    });
  });
});
