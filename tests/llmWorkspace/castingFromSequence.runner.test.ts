import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";
import { castingFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/castingFromSequence";
import { buildCastingFromSequencePrompt } from "@/lib/prompts/casting-from-sequence";

// ---------------------------------------------------------------------------
// Level-2 proof required by the ticket ("Validation attendue" §2): the real
// runner dispatch (`resolveOperationPrompt`), not a hand-built dispatcher —
// same discipline as `sequencesFromOutline.runner.test.ts`.
//
// Also carries the brick proof itself (§3): the `postResponse` form's own
// filter/enrich cases, exercised through the real `runOperation` pipeline
// (parse -> postResponse), with `callLLMJson` mocked so the model's own
// answer is controlled per test.
//
// Mutation check (§4, reported in `.agents/executor_report.md`): temporarily
// making `renderCastingFromSequenceFilterAndEnrich`
// (`src/lib/llmWorkspace/variables/registry.ts`) keep the model's own
// `assetName` instead of enriching it from `PROJECT.ASSET_LIBRARY` makes the
// "targetLabel / assetName / assetType come from local data" test below fail
// — it observes the model's fabricated name surviving instead of being
// overwritten.
// ---------------------------------------------------------------------------

let mockRaw = "";
vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => mockRaw),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
});

afterAll(() => ctx.cleanup());

async function makeProjectAndSequence(): Promise<{ projectId: number; sequenceId: number }> {
  const projectId = await insertProject(ctx, "Neon Skyline");
  const sequenceId = await insertSequence(ctx, projectId, {
    title: "Chase Sequence",
    summary: "The courier is pursued across rooftops.",
  });
  return { projectId, sequenceId };
}

describe("casting.fromSequence — runner prompt-equality proof", () => {
  it("includeSequenceLevel=false: matches buildCastingFromSequencePrompt", async () => {
    const { projectId, sequenceId } = await makeProjectAndSequence();
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot One", shotCode: "SH010", orderIndex: 0 });
    const assetId = await insertAsset(ctx, projectId, { name: "Kira", type: "character", orderIndex: 0 });

    const runnerResult = await resolveOperationPrompt(castingFromSequenceDescriptor, { projectId, sequenceId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const { eq } = await import("drizzle-orm");
    const [project] = await ctx.db.select().from(ctx.schema.projects).where(eq(ctx.schema.projects.id, projectId));
    const [sequence] = await ctx.db.select().from(ctx.schema.sequences).where(eq(ctx.schema.sequences.id, sequenceId));

    const expected = buildCastingFromSequencePrompt({
      project: { name: project.name, pitch: project.pitch, story: project.story, outline: project.outline },
      sequence: {
        id: sequence.id,
        title: sequence.title,
        summary: sequence.summary,
        description: sequence.description,
        narrativePurpose: sequence.narrativePurpose,
        mood: sequence.mood,
        locationHint: sequence.locationHint,
      },
      shots: [{ id: shotId, shotCode: "SH010", title: "Shot One", description: null, actionPitch: null, continuityIn: null, continuityOut: null }],
      assets: [{ id: assetId, name: "Kira", type: "character", description: null, notes: null }],
      existingShotCastings: [],
      existingSequenceCastings: [],
      includeSequenceLevel: false,
    });

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("includeSequenceLevel=true: matches buildCastingFromSequencePrompt", async () => {
    const { projectId, sequenceId } = await makeProjectAndSequence();
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot One", shotCode: "SH010", orderIndex: 0 });
    const assetId = await insertAsset(ctx, projectId, { name: "Kira", type: "character", orderIndex: 0 });

    const runnerResult = await resolveOperationPrompt(
      castingFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { includeSequenceLevel: true } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const { eq } = await import("drizzle-orm");
    const [project] = await ctx.db.select().from(ctx.schema.projects).where(eq(ctx.schema.projects.id, projectId));
    const [sequence] = await ctx.db.select().from(ctx.schema.sequences).where(eq(ctx.schema.sequences.id, sequenceId));

    const expected = buildCastingFromSequencePrompt({
      project: { name: project.name, pitch: project.pitch, story: project.story, outline: project.outline },
      sequence: {
        id: sequence.id,
        title: sequence.title,
        summary: sequence.summary,
        description: sequence.description,
        narrativePurpose: sequence.narrativePurpose,
        mood: sequence.mood,
        locationHint: sequence.locationHint,
      },
      shots: [{ id: shotId, shotCode: "SH010", title: "Shot One", description: null, actionPitch: null, continuityIn: null, continuityOut: null }],
      assets: [{ id: assetId, name: "Kira", type: "character", description: null, notes: null }],
      existingShotCastings: [],
      existingSequenceCastings: [],
      includeSequenceLevel: true,
    });

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });
});

describe("casting.fromSequence — postResponse brick proof (§3 of the ticket)", () => {
  async function makeFixture() {
    const projectId = await insertProject(ctx, "Neon Skyline");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Chase Sequence" });
    const otherSequenceId = await insertSequence(ctx, projectId, { title: "Other Sequence" });

    const shot1Id = await insertShot(ctx, sequenceId, { title: "Shot One", shotCode: "SH010", orderIndex: 0 });
    const shot2Id = await insertShot(ctx, sequenceId, { title: "Bare Shot", shotCode: null, orderIndex: 1 });
    const shotOtherId = await insertShot(ctx, otherSequenceId, { title: "Other Sequence's Shot", orderIndex: 0 });

    const assetAId = await insertAsset(ctx, projectId, { name: "Kira", type: "character", orderIndex: 0 });
    const assetBId = await insertAsset(ctx, projectId, { name: "Van", type: "vehicle", orderIndex: 1 });
    const assetCId = await insertAsset(ctx, projectId, { name: "Neon Sign", type: "prop", orderIndex: 2 });

    // Existing castings: shot1<-assetA (shot-level), sequence<-assetB (sequence-level).
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId: shot1Id, assetId: assetAId });
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId: assetBId });

    return { projectId, sequenceId, otherSequenceId, shot1Id, shot2Id, shotOtherId, assetAId, assetBId, assetCId };
  }

  it("an item whose assetId is not in the project's asset library is dropped", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        { targetType: "shot", targetId: f.shot1Id, targetLabel: "x", assetId: 999999, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
      ],
    });
    const result = await runOperation(castingFromSequenceDescriptor, { projectId: f.projectId, sequenceId: f.sequenceId });
    // The oracle itself never re-checks "empty" after its own existence
    // filtering (`generateCastingSuggestionsDraft` returns `{ok:true,
    // suggestions: []}` when every parsed item is filtered out,
    // `castingSuggestions.ts:231-273`) — the "empty" refusal only guards the
    // *parsed*, pre-filter array (`parseSuggestionsResult`,
    // `castingSuggestions.ts:102-104`), which the descriptor's own
    // `output.errors.empty` reproduces the same way, before `postResponse`
    // ever runs.
    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("a shot item targeting another sequence's shot is dropped", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        { targetType: "shot", targetId: f.shotOtherId, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "x", reason: null, confidence: "high" },
      ],
    });
    const result = await runOperation(castingFromSequenceDescriptor, { projectId: f.projectId, sequenceId: f.sequenceId });
    // The oracle itself never re-checks "empty" after its own existence
    // filtering (`generateCastingSuggestionsDraft` returns `{ok:true,
    // suggestions: []}` when every parsed item is filtered out,
    // `castingSuggestions.ts:231-273`) — the "empty" refusal only guards the
    // *parsed*, pre-filter array (`parseSuggestionsResult`,
    // `castingSuggestions.ts:102-104`), which the descriptor's own
    // `output.errors.empty` reproduces the same way, before `postResponse`
    // ever runs.
    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("a sequence item targeting another sequence is dropped", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        { targetType: "sequence", targetId: f.otherSequenceId, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "x", reason: null, confidence: "high" },
      ],
    });
    const result = await runOperation(castingFromSequenceDescriptor, { projectId: f.projectId, sequenceId: f.sequenceId }, { parameters: { includeSequenceLevel: true } });
    // The oracle itself never re-checks "empty" after its own existence
    // filtering (`generateCastingSuggestionsDraft` returns `{ok:true,
    // suggestions: []}` when every parsed item is filtered out,
    // `castingSuggestions.ts:231-273`) — the "empty" refusal only guards the
    // *parsed*, pre-filter array (`parseSuggestionsResult`,
    // `castingSuggestions.ts:102-104`), which the descriptor's own
    // `output.errors.empty` reproduces the same way, before `postResponse`
    // ever runs.
    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("an item whose targetType is neither shot nor sequence is dropped", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        { targetType: "banana", targetId: f.shot1Id, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "x", reason: null, confidence: "high" },
      ],
    });
    const result = await runOperation(castingFromSequenceDescriptor, { projectId: f.projectId, sequenceId: f.sequenceId });
    // The oracle itself never re-checks "empty" after its own existence
    // filtering (`generateCastingSuggestionsDraft` returns `{ok:true,
    // suggestions: []}` when every parsed item is filtered out,
    // `castingSuggestions.ts:231-273`) — the "empty" refusal only guards the
    // *parsed*, pre-filter array (`parseSuggestionsResult`,
    // `castingSuggestions.ts:102-104`), which the descriptor's own
    // `output.errors.empty` reproduces the same way, before `postResponse`
    // ever runs.
    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("an item missing targetId entirely is dropped", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        { targetType: "shot", targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "x", reason: null, confidence: "high" },
      ],
    });
    const result = await runOperation(castingFromSequenceDescriptor, { projectId: f.projectId, sequenceId: f.sequenceId });
    // The oracle itself never re-checks "empty" after its own existence
    // filtering (`generateCastingSuggestionsDraft` returns `{ok:true,
    // suggestions: []}` when every parsed item is filtered out,
    // `castingSuggestions.ts:231-273`) — the "empty" refusal only guards the
    // *parsed*, pre-filter array (`parseSuggestionsResult`,
    // `castingSuggestions.ts:102-104`), which the descriptor's own
    // `output.errors.empty` reproduces the same way, before `postResponse`
    // ever runs.
    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("alreadyAssigned is true on an existing shot-level pairing and an existing sequence-level pairing, false otherwise", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        { targetType: "shot", targetId: f.shot1Id, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "x", reason: null, confidence: "high" },
        { targetType: "shot", targetId: f.shot1Id, targetLabel: "x", assetId: f.assetCId, assetName: "x", assetType: "x", reason: null, confidence: "low" },
        { targetType: "sequence", targetId: f.sequenceId, targetLabel: "x", assetId: f.assetBId, assetName: "x", assetType: "x", reason: null, confidence: "medium" },
      ],
    });
    const result = await runOperation(
      castingFromSequenceDescriptor,
      { projectId: f.projectId, sequenceId: f.sequenceId },
      { parameters: { includeSequenceLevel: true } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(result.items.map((i) => i.alreadyAssigned)).toEqual([true, false, true]);
  });

  it("targetLabel, assetName and assetType come from local data — the model's own (false) values are replaced, never kept", async () => {
    const f = await makeFixture();
    mockRaw = JSON.stringify({
      suggestions: [
        {
          targetType: "shot",
          targetId: f.shot1Id,
          targetLabel: "MODEL-INVENTED LABEL",
          assetId: f.assetAId,
          assetName: "MODEL-INVENTED NAME",
          assetType: "prop", // real type is "character" — deliberately wrong
          reason: "A good fit.",
          confidence: "high",
        },
        {
          // No shotCode on shot2 — exercises the bare-title branch of the
          // enrichment, on the same model as the oracle's own dead fallback.
          targetType: "shot",
          targetId: f.shot2Id,
          targetLabel: "MODEL-INVENTED LABEL 2",
          assetId: f.assetAId,
          assetName: "MODEL-INVENTED NAME 2",
          assetType: "vehicle", // real type is "character" — deliberately wrong
          reason: null,
          confidence: "high",
        },
        {
          targetType: "sequence",
          targetId: f.sequenceId,
          targetLabel: "MODEL-INVENTED SEQUENCE LABEL",
          assetId: f.assetBId,
          assetName: "MODEL-INVENTED VAN NAME",
          assetType: "prop", // real type is "vehicle" — deliberately wrong
          reason: null,
          confidence: "medium",
        },
      ],
    });

    const result = await runOperation(
      castingFromSequenceDescriptor,
      { projectId: f.projectId, sequenceId: f.sequenceId },
      { parameters: { includeSequenceLevel: true } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");

    expect(result.items).toEqual([
      {
        targetType: "shot",
        targetId: f.shot1Id,
        targetLabel: "SH010 — Shot One",
        assetId: f.assetAId,
        assetName: "Kira",
        assetType: "character",
        reason: "A good fit.",
        confidence: "high",
        alreadyAssigned: true,
      },
      {
        targetType: "shot",
        targetId: f.shot2Id,
        targetLabel: "Bare Shot",
        assetId: f.assetAId,
        assetName: "Kira",
        assetType: "character",
        reason: "",
        confidence: "high",
        alreadyAssigned: false,
      },
      {
        targetType: "sequence",
        targetId: f.sequenceId,
        targetLabel: "Chase Sequence",
        assetId: f.assetBId,
        assetName: "Van",
        assetType: "vehicle",
        reason: "",
        confidence: "medium",
        alreadyAssigned: true,
      },
    ]);
  });
});
