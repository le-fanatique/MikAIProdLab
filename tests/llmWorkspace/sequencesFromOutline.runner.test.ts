import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { sequencesFromOutlineDescriptor } from "@/lib/llmWorkspace/descriptors/sequencesFromOutline";
import { buildSequencesFromOutlinePrompt } from "@/lib/prompts/sequences-from-outline";

// ---------------------------------------------------------------------------
// Level-2 proof required by the ticket ("Validation attendue" §2): the real
// runner dispatch (`resolveOperationPrompt`), not a hand-built dispatcher —
// same discipline as `shotsFromSequence.runner.test.ts`.
//
// Also carries the brick proof itself ("Validation attendue" §3): the five
// scenarios the postResponse form must handle, exercised through the real
// `runOperation` pipeline (parse -> postResponse), with `callLLMJson`
// mocked so the model's own answer is controlled per test.
//
// Mutation check (§4, reported in `.agents/executor_report.md`): temporarily
// removing the `targetCount != null ||` guard from
// `renderSequencesFromOutlinePinTitlesToSections`
// (`src/lib/llmWorkspace/variables/registry.ts`) makes the "targetCount
// provided -> no overwrite" test below fail — it observes the section title
// overwriting the model's own title.
// ---------------------------------------------------------------------------

let mockRaw = "";
vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => mockRaw),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;

async function makeProject(fields: { pitch?: string | null; story?: string | null; outline?: string | null }): Promise<number> {
  const projectId = await insertProject(ctx, "Neon Skyline");
  const { eq } = await import("drizzle-orm");
  await ctx.db.update(ctx.schema.projects).set(fields).where(eq(ctx.schema.projects.id, projectId));
  return projectId;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
});

afterAll(() => ctx.cleanup());

/**
 * `parseListOutput` (`runner.ts`) always emits every declared string field,
 * present as `""` when the model did not supply it — `description`,
 * `narrativePurpose`, `mood`, `locationHint` are never omitted the way a
 * `type: "number", fallback: "omit"` field would be. The mock responses
 * below never set them, so every expected item carries this same fixed
 * "always empty" shape; declared once here rather than repeated five times.
 */
function emptyExtraFields(item: { title: string; summary: string; orderIndex: number }) {
  return { ...item, description: "", narrativePurpose: "", mood: "", locationHint: "" };
}

describe("sequences.fromOutline — runner prompt-equality proof", () => {
  it("Path A (outline present): matches buildSequencesFromOutlinePrompt", async () => {
    const projectId = await makeProject({
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here.",
      outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
    });

    const runnerResult = await resolveOperationPrompt(sequencesFromOutlineDescriptor, { projectId }, { parameters: { targetCount: 5 } });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expected = buildSequencesFromOutlinePrompt({
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here.",
      outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
      targetCount: 5,
      sectionCount: 2,
      outlineSections: [
        { title: "Opening", body: "The courier receives the package." },
        { title: "Chase", body: "A rooftop pursuit begins." },
      ],
    });

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("Path B (outline absent): matches buildSequencesFromOutlinePrompt", async () => {
    const projectId = await makeProject({
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here.",
      outline: null,
    });

    const runnerResult = await resolveOperationPrompt(sequencesFromOutlineDescriptor, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expected = buildSequencesFromOutlinePrompt({
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here.",
      outline: null,
    });

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });
});

describe("sequences.fromOutline — postResponse brick proof (LLMW.POSTRESPONSE.1, B7g)", () => {
  it("targetCount absent + N sections + N items -> title and summary overwritten by the sections", async () => {
    const projectId = await makeProject({
      pitch: "A pitch.",
      story: null,
      outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
    });
    mockRaw = JSON.stringify({
      sequences: [
        { title: "Model title A", summary: "Model summary A", order_index: 0 },
        { title: "Model title B", summary: "Model summary B", order_index: 1 },
      ],
    });

    const result = await runOperation(sequencesFromOutlineDescriptor, { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        emptyExtraFields({ title: "Opening", summary: "The courier receives the package.", orderIndex: 0 }),
        emptyExtraFields({ title: "Chase", summary: "A rooftop pursuit begins.", orderIndex: 1 }),
      ],
    });
  });

  it("targetCount provided -> no overwrite, even when lengths coincide", async () => {
    const projectId = await makeProject({
      pitch: "A pitch.",
      story: null,
      outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
    });
    mockRaw = JSON.stringify({
      sequences: [
        { title: "Model title A", summary: "Model summary A", order_index: 0 },
        { title: "Model title B", summary: "Model summary B", order_index: 1 },
      ],
    });

    const result = await runOperation(sequencesFromOutlineDescriptor, { projectId }, { parameters: { targetCount: 2 } });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        emptyExtraFields({ title: "Model title A", summary: "Model summary A", orderIndex: 0 }),
        emptyExtraFields({ title: "Model title B", summary: "Model summary B", orderIndex: 1 }),
      ],
    });
  });

  it("lengths differ -> no overwrite", async () => {
    const projectId = await makeProject({
      pitch: "A pitch.",
      story: null,
      outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.\n\n## Escape\nThey flee the scene.",
    });
    mockRaw = JSON.stringify({
      sequences: [
        { title: "Model title A", summary: "Model summary A", order_index: 0 },
        { title: "Model title B", summary: "Model summary B", order_index: 1 },
      ],
    });

    const result = await runOperation(sequencesFromOutlineDescriptor, { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        emptyExtraFields({ title: "Model title A", summary: "Model summary A", orderIndex: 0 }),
        emptyExtraFields({ title: "Model title B", summary: "Model summary B", orderIndex: 1 }),
      ],
    });
  });

  it("a section with an empty body keeps the model's own summary, but still gets its title pinned", async () => {
    const projectId = await makeProject({
      pitch: "A pitch.",
      story: null,
      outline: "## Opening\nThe courier receives the package.\n\n## Empty section\n",
    });
    mockRaw = JSON.stringify({
      sequences: [
        { title: "Model title A", summary: "Model summary A", order_index: 0 },
        { title: "Model title B", summary: "Model summary B", order_index: 1 },
      ],
    });

    const result = await runOperation(sequencesFromOutlineDescriptor, { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        emptyExtraFields({ title: "Opening", summary: "The courier receives the package.", orderIndex: 0 }),
        emptyExtraFields({ title: "Empty section", summary: "Model summary B", orderIndex: 1 }),
      ],
    });
  });

  it("no sections at all (outline absent) -> no overwrite", async () => {
    const projectId = await makeProject({ pitch: "A pitch.", story: null, outline: null });
    mockRaw = JSON.stringify({
      sequences: [{ title: "Model title A", summary: "Model summary A", order_index: 0 }],
    });

    const result = await runOperation(sequencesFromOutlineDescriptor, { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [emptyExtraFields({ title: "Model title A", summary: "Model summary A", orderIndex: 0 })],
    });
  });
});
