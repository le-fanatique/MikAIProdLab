import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";
import { assetsFromProjectDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromProject";
import { buildAssetsFromProjectPrompt } from "@/lib/prompts/assets-from-project";

// ---------------------------------------------------------------------------
// Level-2 proof required by the ticket ("Validation attendue" §2): the real
// runner dispatch (`resolveOperationPrompt` / `runOperation`, `runner.ts`),
// through a real seeded database, not a hand-built dispatcher — same
// discipline as `shotsFromSequence.runner.test.ts` /
// `sequencesFromOutline.runner.test.ts`.
//
// Also carries the guard proof ("Validation attendue" §4): both
// `preconditions` entries, exercised through `runOperation`, including the
// half of the "No narrative content found" gate `fields: FieldRef[]` could
// not express before this ticket — no pitch/story/outline, but a Sequence
// present, must pass.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ assets: [] })),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));
});

afterAll(() => ctx.cleanup());

describe("assets.fromProject — runner prompt-equality proof", () => {
  it("matches buildAssetsFromProjectPrompt for a fully seeded project (sequences, shots, existing assets, includeShots true)", async () => {
    const projectId = await insertProject(ctx, "Neon Skyline");
    const { eq } = await import("drizzle-orm");
    await ctx.db
      .update(ctx.schema.projects)
      .set({
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
      })
      .where(eq(ctx.schema.projects.id, projectId));

    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
    });
    await insertShot(ctx, sequenceId, {
      title: "Wide establishing",
      description: "Neon skyline at dusk.",
      actionPitch: "The courier sprints.",
      continuityIn: "Calm street.",
      continuityOut: "Alley entered.",
    });
    await insertAsset(ctx, projectId, { name: "Kai the Courier", type: "character" });
    await insertAsset(ctx, projectId, { name: "Neon Alley", type: "environment" });

    const runnerResult = await resolveOperationPrompt(
      assetsFromProjectDescriptor,
      { projectId },
      { parameters: { includeShots: true, assetTypes: ["character", "environment", "prop"] } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expected = buildAssetsFromProjectPrompt({
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
      },
      sequences: [
        {
          title: "Rooftop chase",
          summary: "The courier is chased across the rooftops.",
          description: "A tense pursuit at night.",
          narrativePurpose: "Escalates the central conflict.",
          mood: "Tense, kinetic",
          locationHint: "Rain-soaked rooftops, neon skyline",
        },
      ],
      shots: [
        {
          title: "Wide establishing",
          description: "Neon skyline at dusk.",
          actionPitch: "The courier sprints.",
          continuityIn: "Calm street.",
          continuityOut: "Alley entered.",
        },
      ],
      existingAssets: [
        { name: "Kai the Courier", type: "character" },
        { name: "Neon Alley", type: "environment" },
      ],
      includeShots: true,
      assetTypes: ["character", "environment", "prop"],
    });

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("no parameters supplied: falls back to the declared defaults (includeShots: false, assetTypes: character/environment/prop) — matches buildAssetsFromProjectPrompt with those same defaults", async () => {
    const projectId = await insertProject(ctx, "Bare Skyline");
    const { eq } = await import("drizzle-orm");
    await ctx.db.update(ctx.schema.projects).set({ pitch: "A pitch." }).where(eq(ctx.schema.projects.id, projectId));
    await insertSequence(ctx, projectId, { title: "Only sequence" });

    const runnerResult = await resolveOperationPrompt(assetsFromProjectDescriptor, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expected = buildAssetsFromProjectPrompt({
      project: { name: "Bare Skyline", pitch: "A pitch.", story: null, outline: null },
      sequences: [
        {
          title: "Only sequence",
          summary: null,
          description: null,
          narrativePurpose: null,
          mood: null,
          locationHint: null,
        },
      ],
      shots: [],
      existingAssets: [],
      includeShots: false,
      assetTypes: ["character", "environment", "prop"],
    });

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });
});

describe("assets.fromProject — preconditions proof", () => {
  it("no asset type selected (empty multiEnum) is refused before the LLM call, with the exact precondition message", async () => {
    const projectId = await insertProject(ctx, "Guard project");
    const { eq } = await import("drizzle-orm");
    await ctx.db.update(ctx.schema.projects).set({ pitch: "A pitch." }).where(eq(ctx.schema.projects.id, projectId));

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: [] } });
    expect(result).toEqual({ ok: false, error: "Select at least one asset type." });
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });

  it("no pitch, no story, no outline, no sequences at all is refused with the exact precondition message", async () => {
    const projectId = await insertProject(ctx, "Empty project");

    const result = await runOperation(assetsFromProjectDescriptor, { projectId });
    expect(result).toEqual({
      ok: false,
      error: "No narrative content found. Add a pitch, story, outline, or sequences first.",
    });
  });

  it("no pitch, no story, no outline, but a Sequence exists: passes — the half of the gate 'fields' could not express before this ticket", async () => {
    const projectId = await insertProject(ctx, "Sequence-only project");
    await insertSequence(ctx, projectId, { title: "The only narrative source" });

    const result = await resolveOperationPrompt(assetsFromProjectDescriptor, { projectId });
    expect(result.ok).toBe(true);
  });
});
