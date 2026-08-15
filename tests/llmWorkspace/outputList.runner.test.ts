import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.OUTPUT.LIST.1 (B7a) — proof for the runner's list branch
// (`parseOutput`'s `kind === "list"` path). No production list descriptor
// exists yet (that is B7b), so every test here is against one small
// synthetic descriptor, per the ticket's §2.2 boundary.
//
// Two kinds of proof:
//
//   1. §5's eight behavioural bullets, against the synthetic descriptor
//      alone: nominal order, code fence, missing/non-array key, empty
//      array, item filtering, `maxItems` truncation, `truncateTo`.
//
//   2. Equality against three of the four real flat-JSON parsers
//      (`sequenceShots.ts`, `assetExtraction.ts`, `sequenceGeneration.ts`),
//      called through their real, unmodified, public draft actions against a
//      seeded temp DB with a mocked `callLLMJson` — compared field-for-field
//      on the STRING fields the list output shape can carry (see
//      `types.ts`'s `output` field and `.agents/executor_report.md` §2 for
//      exactly which fields are excluded, and why).
//
//      `castingSuggestions.ts` is deliberately not included: its item
//      validity gate is on non-string fields (`targetType` enum, `targetId`
//      / `assetId` positive integers), which no string-only `item.validity`
//      rule can reproduce, and its output additionally depends on a
//      post-parse database lookup (existence filtering, `alreadyAssigned`,
//      name/label overrides) that no descriptor field-mapping can express.
//      See the report for the full account — this is a signalled format
//      gap, not a softened test.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;

function mockedLLM() {
  return callLLMJson as unknown as ReturnType<typeof vi.fn>;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "List-output test project");
  // Set once, up front, so every equality test below (assetExtraction's
  // "narrative content" gate, sequenceGeneration's "pitch or outline" gate)
  // is self-contained rather than incidentally depending on another test's
  // insert running first.
  const { eq } = await import("drizzle-orm");
  await ctx.db.update(ctx.schema.projects).set({ pitch: "A pitch for equality." }).where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

// ---------------------------------------------------------------------------
// Part 1 — the synthetic descriptor, exercising every declared rule in
// isolation. Anchored on `project` (the simplest anchor, matching
// `story.generate`'s precedent) with no declared variables — the point is
// the list branch of `parseOutput`, not context assembly.
// ---------------------------------------------------------------------------

function syntheticListDescriptor(overrides: Partial<Extract<OperationDescriptor["output"], { kind: "list" }>> = {}): OperationDescriptor {
  return {
    id: "test.syntheticList",
    name: "Synthetic list (test only)",
    anchor: { kind: "entity", entity: "project" },
    context: { variables: [] },
    expertise: { role: "tester", system: { blocks: [{ text: "System message." }], separator: "\n" }, knowledge: [] },
    template: { blocks: [{ text: "User message." }], separator: "\n" },
    intent: {},
    messages: {
      notConfigured: "LLM not configured.",
      chainNotFound: { project: "Project not found." },
    },
    output: {
      kind: "list",
      arrayKey: "items",
      item: {
        fields: [
          { field: "title", jsonKey: "title" },
          { field: "note", jsonKey: "note", truncateTo: 5 },
        ],
        validity: { fields: ["title"], require: "all" },
      },
      errors: {
        unparsable: "Unparsable response.",
        notArray: "No items array.",
        empty: "No valid items.",
      },
      ...overrides,
    },
    commit: [],
    executor: "inProcess",
  };
}

describe("runner list branch — synthetic descriptor (LLMW.OUTPUT.LIST.1, B7a)", () => {
  it("1. a nominal response yields items in order, fields mapped by jsonKey", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "First", note: "a" }, { title: "Second", note: "b" }] })
    );
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        { title: "First", note: "a" },
        { title: "Second", note: "b" },
      ],
    });
  });

  it("2. a code fence around the response changes nothing", async () => {
    mockedLLM().mockResolvedValueOnce(
      "```json\n" + JSON.stringify({ items: [{ title: "Fenced", note: "" }] }) + "\n```"
    );
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "Fenced", note: "" }] });
  });

  it("3. an unparsable response gives errors.unparsable", async () => {
    mockedLLM().mockResolvedValueOnce("not json at all {{{");
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "Unparsable response." });
  });

  it("4. arrayKey absent gives errors.notArray", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ somethingElse: [] }));
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "No items array." });
  });

  it("5. arrayKey present but not an array gives errors.notArray — same message as absent", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: { title: "Not an array" } }));
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "No items array." });
  });

  it("6. an empty array gives errors.empty — declared behaviour, matching all four real parsers (they throw, not silently succeed with zero items)", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [] }));
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "No valid items." });
  });

  it("7. an item invalid ← item.validity is filtered, not refused — matching all four real parsers' `.filter(...)`", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({
        items: [{ title: "", note: "dropped — no title" }, { title: "Kept", note: "kept" }],
      })
    );
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "Kept", note: "kept" }] });
  });

  it("7b. every item invalid gives errors.empty — the whole response is refused, matching all four real parsers", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ note: "no title at all" }] }));
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "No valid items." });
  });

  it("8. maxItems silently truncates the filtered array — matching assetExtraction (20) / castingSuggestions (60), neither of which refuses on overflow", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }] })
    );
    const result = await runOperation(syntheticListDescriptor({ maxItems: 2 }), { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        { title: "A", note: "" },
        { title: "B", note: "" },
      ],
    });
  });

  it("9. truncateTo is applied per field, exactly like the object branch's own truncateTo", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "Kept", note: "way too long" }] }));
    const result = await runOperation(syntheticListDescriptor(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "Kept", note: "way t" }] });
  });
});

// ---------------------------------------------------------------------------
// Part 2 — equality against the real parsers, called through their real
// public draft actions (the parse functions themselves are not exported, so
// this reaches them the same way `story.generate.runner.test.ts` etc. reach
// their oracle — through the action, not a private function reference).
// ---------------------------------------------------------------------------

describe("equality — sequenceShots.ts (generateShotsFromSequenceDraft) vs. the list branch, string fields only", () => {
  it("same raw model response, same string fields — duration_seconds is excluded (numeric, unrepresentable — see report)", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "Equality sequence" });

    const rawShots = [
      {
        title: "Establishing shot",
        shot_code: "SH010",
        description: "Wide view of the harbor.",
        duration_seconds: 4,
        continuity_in: "Calm morning.",
        action_pitch: "Boats depart.",
        camera_pitch: "Slow push in.",
        framing: "Wide",
        camera_movement: "Dolly",
        continuity_out: "Sun rises.",
        shot_prompt: "cinematic wide shot of a harbor at dawn",
      },
      { title: "" /* invalid — filtered by both */ },
    ];

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ shots: rawShots }));
    const { generateShotsFromSequenceDraft } = await import("@/actions/llm/sequenceShots");
    const actionResult = await generateShotsFromSequenceDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId), shotCount: "1" })
    );
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) throw new Error("unreachable");

    const descriptor = syntheticListDescriptor({
      arrayKey: "shots",
      item: {
        fields: [
          { field: "title", jsonKey: "title" },
          { field: "shot_code", jsonKey: "shot_code" },
          { field: "description", jsonKey: "description" },
          { field: "continuity_in", jsonKey: "continuity_in" },
          { field: "action_pitch", jsonKey: "action_pitch" },
          { field: "camera_pitch", jsonKey: "camera_pitch" },
          { field: "framing", jsonKey: "framing" },
          { field: "camera_movement", jsonKey: "camera_movement" },
          { field: "continuity_out", jsonKey: "continuity_out" },
          { field: "shot_prompt", jsonKey: "shot_prompt" },
        ],
        validity: { fields: ["title"], require: "all" },
      },
    }).output;

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ shots: rawShots }));
    const runnerResult = await runOperation({ ...syntheticListDescriptor(), output: descriptor }, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "list") throw new Error("unreachable");

    const actionStringFields = actionResult.shots.map((s) => ({
      title: s.title,
      shot_code: s.shot_code ?? "",
      description: s.description ?? "",
      continuity_in: s.continuity_in ?? "",
      action_pitch: s.action_pitch ?? "",
      camera_pitch: s.camera_pitch ?? "",
      framing: s.framing ?? "",
      camera_movement: s.camera_movement ?? "",
      continuity_out: s.continuity_out ?? "",
      shot_prompt: s.shot_prompt ?? "",
    }));

    expect(runnerResult.items).toEqual(actionStringFields);
  });
});

describe("equality — assetExtraction.ts (generateAssetCandidatesDraft) vs. the list branch, string fields only", () => {
  it("same raw model response, same string fields — assetType/sourceLevel excluded (enum-with-default, unrepresentable — see report)", async () => {
    const rawAssets = [
      {
        name: "Harbor Master",
        assetType: "character",
        description: "Grizzled dockworker.",
        notes: "Recurring extra.",
        sourceLevel: "outline",
        sourceExcerpt: "the harbor master waves the boats in",
        duplicateWarning: null,
      },
      { assetType: "prop" /* invalid — no name, filtered by both */ },
    ];

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ assets: rawAssets }));
    const { generateAssetCandidatesDraft } = await import("@/actions/llm/assetExtraction");
    const actionResult = await generateAssetCandidatesDraft(
      form({ projectId: String(projectId), includeCharacters: "true" })
    );
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) throw new Error("unreachable");

    const descriptor = syntheticListDescriptor({
      arrayKey: "assets",
      item: {
        fields: [
          { field: "name", jsonKey: "name" },
          { field: "description", jsonKey: "description" },
          { field: "notes", jsonKey: "notes" },
          { field: "sourceExcerpt", jsonKey: "sourceExcerpt" },
          { field: "duplicateWarning", jsonKey: "duplicateWarning" },
        ],
        validity: { fields: ["name"], require: "all" },
      },
      maxItems: 20,
    }).output;

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ assets: rawAssets }));
    const runnerResult = await runOperation({ ...syntheticListDescriptor(), output: descriptor }, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "list") throw new Error("unreachable");

    const actionStringFields = actionResult.assets.map((a) => ({
      name: a.name,
      description: a.description ?? "",
      notes: a.notes ?? "",
      sourceExcerpt: a.sourceExcerpt ?? "",
      duplicateWarning: a.duplicateWarning ?? "",
    }));

    expect(runnerResult.items).toEqual(actionStringFields);
  });
});

describe("equality — sequenceGeneration.ts (generateSequencesFromOutlineDraft) vs. the list branch, string fields only", () => {
  it("same raw model response, same string fields — order_index excluded (numeric, index-fallback, post-parse sort — see report)", async () => {
    // order_index already ascending and matching array order, so the real
    // action's post-parse `.sort(order_index)` is a no-op here — the sort
    // itself is not proven by this test (see report).
    const rawSequences = [
      {
        title: "Arrival",
        summary: "The crew arrives.",
        description: "Establishes the setting.",
        narrative_purpose: "Setup",
        mood: "Hopeful",
        location_hint: "Harbor",
        order_index: 0,
      },
      { order_index: 1 /* invalid — no title, filtered by both */ },
    ];

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ sequences: rawSequences }));
    const { generateSequencesFromOutlineDraft } = await import("@/actions/llm/sequenceGeneration");
    const actionResult = await generateSequencesFromOutlineDraft(
      form({ projectId: String(projectId), targetCount: "1" })
    );
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) throw new Error("unreachable");

    const descriptor = syntheticListDescriptor({
      arrayKey: "sequences",
      item: {
        fields: [
          { field: "title", jsonKey: "title" },
          { field: "summary", jsonKey: "summary" },
          { field: "description", jsonKey: "description" },
          { field: "narrative_purpose", jsonKey: "narrative_purpose" },
          { field: "mood", jsonKey: "mood" },
          { field: "location_hint", jsonKey: "location_hint" },
        ],
        validity: { fields: ["title"], require: "all" },
      },
    }).output;

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ sequences: rawSequences }));
    const runnerResult = await runOperation({ ...syntheticListDescriptor(), output: descriptor }, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "list") throw new Error("unreachable");

    const actionStringFields = actionResult.sequences.map((s) => ({
      title: s.title,
      summary: s.summary ?? "",
      description: s.description ?? "",
      narrative_purpose: s.narrative_purpose ?? "",
      mood: s.mood ?? "",
      location_hint: s.location_hint ?? "",
    }));

    expect(runnerResult.items).toEqual(actionStringFields);
  });
});

// castingSuggestions.ts is intentionally not exercised here — see the file
// header and `.agents/executor_report.md` §2/§3 for why no synthetic list
// descriptor can honestly stand in for it.
