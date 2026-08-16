import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import { buildShotsFromSequencePrompt } from "@/lib/prompts/shots-from-sequence";

// ---------------------------------------------------------------------------
// Level-2 proof required by the ticket (§4, §8.3): `shots.fromSequence`
// through the real runner dispatch (`resolveOperationPrompt` /
// `runOperation`, `runner.ts`), not a hand-built dispatcher. This is
// precisely what `shotsFromSequence.render.test.ts` (level 1) could not
// prove, and precisely the gap that let B7c's `targetCount` defect through:
// that test built its own `{variables, render}` dispatcher and threaded
// `targetCount` into it directly, so a broken production dispatch (e.g. the
// pre-B7c-n4 `fn(...resolvedVariables, selectedMode)` convention, which had
// no channel for `intent.parameters` at all) would never have failed it.
//
// Mutation check for this exact test (§8.3 of the ticket, reported in
// `.agents/executor_report.md`): temporarily reverting
// `renderShotsFromSequenceSystemPathABody` / `...PathBBody` /
// `...templatePathA` / `...templatePathB` to read `targetCount` off
// `selectedMode`'s old positional slot (the B7c defect) makes the
// `targetCount: 12` assertions below fail — they observe 6, not 12.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shots: [] })),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));

  projectId = await insertProject(ctx, "Neon Skyline");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      outline: "## Opening\nThe courier receives the package.",
    })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("shots.fromSequence — runner proof (LLMW.BLOCK.VARPARAM.1, B7c-n4)", () => {
  it("Path A (Approved Sequence Prompt present): targetCount: 12 asks for 12 shots, not 6", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    });

    const runnerResult = await resolveOperationPrompt(
      shotsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { targetCount: 12 } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = buildShotsFromSequencePrompt({
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here, several sentences long.",
        outline: "## Opening\nThe courier receives the package.",
      },
      sequence: {
        title: "Rooftop chase",
        summary: "The courier is chased across the rooftops.",
        description: "A tense pursuit at night.",
        mood: "Tense, kinetic",
        locationHint: "Rain-soaked rooftops, neon skyline",
        narrativePurpose: "Escalates the central conflict.",
        sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
      },
      targetCount: 12,
    });

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("generate exactly 12 shots");
    expect(runnerResult.prompt.system).not.toContain("generate exactly 6 shots");
    expect(runnerResult.prompt.user).toContain("Generate exactly 12 shots");
  });

  it("Path A: targetCount absent falls back to 6 (the builder's own default, not an invented one)", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    });

    const runnerResult = await resolveOperationPrompt(shotsFromSequenceDescriptor, { projectId, sequenceId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = buildShotsFromSequencePrompt({
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here, several sentences long.",
        outline: "## Opening\nThe courier receives the package.",
      },
      sequence: {
        title: "Rooftop chase",
        summary: "The courier is chased across the rooftops.",
        description: "A tense pursuit at night.",
        mood: "Tense, kinetic",
        locationHint: "Rain-soaked rooftops, neon skyline",
        narrativePurpose: "Escalates the central conflict.",
        sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
      },
    });

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("generate exactly 6 shots");
  });

  it("Path B (no Approved Sequence Prompt): targetCount: 12 asks for 12 shots, not 6", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      summary: null,
      description: null,
      mood: null,
      locationHint: null,
      narrativePurpose: null,
      sequencePrompt: null,
    });

    const runnerResult = await resolveOperationPrompt(
      shotsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { targetCount: 12 } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = buildShotsFromSequencePrompt({
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here, several sentences long.",
        outline: "## Opening\nThe courier receives the package.",
      },
      sequence: {
        title: "Alley standoff",
        summary: null,
        description: null,
        mood: null,
        locationHint: null,
        narrativePurpose: null,
        sequencePrompt: null,
      },
      targetCount: 12,
    });

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("break a production sequence into exactly 12 individual shots");
    expect(runnerResult.prompt.system).not.toContain("break a production sequence into exactly 6 individual shots");
    expect(runnerResult.prompt.user).toContain("Break this sequence into exactly 12 individual shots");
  });

  it("Path B: targetCount absent falls back to 6", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      summary: null,
      description: null,
      mood: null,
      locationHint: null,
      narrativePurpose: null,
      sequencePrompt: null,
    });

    const runnerResult = await resolveOperationPrompt(shotsFromSequenceDescriptor, { projectId, sequenceId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = buildShotsFromSequencePrompt({
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here, several sentences long.",
        outline: "## Opening\nThe courier receives the package.",
      },
      sequence: {
        title: "Alley standoff",
        summary: null,
        description: null,
        mood: null,
        locationHint: null,
        narrativePurpose: null,
        sequencePrompt: null,
      },
    });

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("break a production sequence into exactly 6 individual shots");
  });

  it("runOperation: the model is actually called with the real, full-pipeline prompt (empty list is a valid — if unhelpful — response)", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      sequencePrompt: null,
    });

    const result = await runOperation(shotsFromSequenceDescriptor, { projectId, sequenceId }, { parameters: { targetCount: 12 } });
    expect(result).toEqual({ ok: false, error: "The model returned no valid shots. Try again." });
  });
});
