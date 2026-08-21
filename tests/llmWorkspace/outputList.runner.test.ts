import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.OUTPUT.LIST.1 (B7a) — proof for the runner's list branch
// (`parseOutput`'s `kind === "list"` path). No production list descriptor
// exists yet (that is B7c), so every test here is against one small
// synthetic descriptor, per the ticket's §2.2 boundary.
//
// LLMW.OUTPUT.LIST.2 (B7b) extends this proof to the six format extensions
// (numeric item fields, a second JSON-key fallback, an enum-with-default
// field, an index-seeded numeric default, a whole-list sort, and a required
// `selection` destination) and, critically, widens the three real-parser
// equalities below from string-only to **every** field each source struct
// carries — the point B7a signalled without being able to close.
//
// Two kinds of proof:
//
//   1. §5's behavioural bullets, against the synthetic descriptor alone:
//      nominal order, code fence, missing/non-array key, empty array, item
//      filtering, `maxItems` truncation, `truncateTo`, plus B7b's numeric,
//      enum, key-fallback and sort cases (§5.2).
//
//   2. Complete equality against three real descriptors
//      (`shots.fromSequence`, `assets.fromProject`, `sequences.fromOutline`),
//      called through `runWorkspaceOperation` against a seeded temp DB with a
//      mocked `callLLMJson` — compared field-for-field, against a
//      hand-built synthetic descriptor sharing the same `field`/`jsonKey`
//      declarations (so the synthetic side's raw `runOperation` output is
//      already keyed exactly like `runWorkspaceOperation`'s own translation
//      of the real descriptor, LLMW.UNIFY.LIST.1). Before LLMW.UNIFY.PANEL.3,
//      this equality ran through each operation's now-deleted adapter
//      instead; the adapters are gone, and the generic action is the only
//      caller left to prove against.
//
//      `castingSuggestions.ts` is deliberately not included: its item
//      validity gate is on non-string fields (`targetType` enum, `targetId`
//      / `assetId` positive integers) checked for database existence, which
//      no field-presence `item.validity` rule can reproduce, and its output
//      additionally depends on a post-parse database lookup (existence
//      filtering, `alreadyAssigned`, name/label overrides) that no
//      descriptor field-mapping can express. See the report for the full
//      account — this is a signalled format gap, not a softened test.
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
          { type: "string", field: "title", jsonKey: "title" },
          { type: "string", field: "note", jsonKey: "note", truncateTo: 5 },
        ],
        validity: { fields: ["title"], require: "all" },
      },
      selection: { formDataKey: "itemsJson" },
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
// Part 1b — LLMW.OUTPUT.LIST.2 (B7b): the six format extensions, each
// against a purpose-built variant of the synthetic descriptor (§5.2).
// ---------------------------------------------------------------------------

function withNumberField(
  fieldOverrides: Partial<{ exclusiveMin: number; max: number; fallback: "omit" | "index" }> = {}
): OperationDescriptor {
  return syntheticListDescriptor({
    item: {
      fields: [
        { type: "string", field: "title", jsonKey: "title" },
        {
          type: "number",
          field: "duration",
          jsonKey: "duration_seconds",
          fallback: "omit",
          ...fieldOverrides,
        },
      ],
      validity: { fields: ["title"], require: "all" },
    },
  });
}

describe("runner list branch — numeric item fields (B7b, §3.3)", () => {
  it("a valid number in range is affected as a number, not a string", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", duration_seconds: 4 }] }));
    const result = await runOperation(withNumberField({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", duration: 4 }] });
  });

  it("an absent number with fallback: \"omit\" omits the key entirely — not \"\" nor 0", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A" }] }));
    const result = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A" }] });
  });

  it("a numeric-looking string is invalid — no coercion", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", duration_seconds: "12" }] }));
    const result = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A" }] });
  });

  // NaN is not reachable through JSON: `JSON.stringify({ d: NaN })` produces
  // `{"d":null}`, so a test built that way would only exercise the `null`
  // branch and never touch `Number.isFinite`. It is not tested here for that
  // reason. `Number.isFinite` still earns its place in the guard because of
  // `Infinity`, which *is* reachable — `JSON.parse('{"d":1e999}').d` is
  // `Infinity` — and is exercised below via a literal JSON string rather
  // than `JSON.stringify`, since `JSON.stringify({ d: Infinity })` would
  // collapse to `{"d":null}` just like the `NaN` case.
  it("a JSON literal that parses to Infinity is invalid", async () => {
    mockedLLM().mockResolvedValueOnce('{"items":[{"title":"A","duration_seconds":1e999}]}');
    const infResult = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(infResult).toEqual({ ok: true, kind: "list", items: [{ title: "A" }] });
  });

  // Only this test makes `Number.isFinite` observable. The `Infinity` test
  // above declares `max: 120`, and `Infinity <= 120` is false — so that test
  // would still PASS with the `Number.isFinite` guard removed from
  // `readNumberField`, the value being rejected by the upper bound instead
  // (verified by mutation: removing the guard fails only this test, not the
  // one above). This descriptor
  // has neither `exclusiveMin` nor `max`, and `fallback: "index"` — the exact
  // shape of `order_index` (`sequenceGeneration.ts:60-63`, the one field in
  // production that reads this way, unbounded). With no bound to reject it,
  // only `Number.isFinite` stands between `Infinity` and the affected value.
  it("an Infinity value on a bound-less, fallback: \"index\" field (order_index's own shape) falls back to the item's index, not Infinity", async () => {
    mockedLLM().mockResolvedValueOnce('{"items":[{"title":"A","duration_seconds":1e999}]}');
    const result = await runOperation(withNumberField({ fallback: "index" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", duration: 0 }] });
  });

  it("a null number (absent value serialized as null) omits the key", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", duration_seconds: null }] }));
    const nullResult = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(nullResult).toEqual({ ok: true, kind: "list", items: [{ title: "A" }] });
  });

  it("0 with exclusiveMin: 0 is refused — the lower bound is strict", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", duration_seconds: 0 }] }));
    const result = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A" }] });
  });

  it("120 with max: 120 is accepted — the upper bound is inclusive", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", duration_seconds: 120 }] }));
    const result = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", duration: 120 }] });
  });

  it("121 with max: 120 is refused", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", duration_seconds: 121 }] }));
    const result = await runOperation(withNumberField({ exclusiveMin: 0, max: 120, fallback: "omit" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A" }] });
  });

  it("fallback: \"index\" seeds the item's position in the raw array, not the filtered one — a first invalid item still gives the second item index 1", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({ items: [{ /* no title — filtered */ duration_seconds: 999 }, { title: "Second" }] })
    );
    const result = await runOperation(withNumberField({ fallback: "index" }), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "Second", duration: 1 }] });
  });
});

function withFallbackKeyField(): OperationDescriptor {
  return syntheticListDescriptor({
    item: {
      fields: [
        { type: "string", field: "title", jsonKey: "title" },
        { type: "string", field: "value", jsonKey: "value", jsonKeyFallback: "value_fallback" },
      ],
      validity: { fields: ["title"], require: "all" },
    },
  });
}

describe("runner list branch — jsonKeyFallback (B7b, §3.1)", () => {
  it("the primary key wins when present", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", value: "primary", value_fallback: "fallback" }] }));
    const result = await runOperation(withFallbackKeyField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", value: "primary" }] });
  });

  it("the fallback key is used when the primary is absent", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", value_fallback: "fallback" }] }));
    const result = await runOperation(withFallbackKeyField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", value: "fallback" }] });
  });

  it("an empty string on the primary key still wins over the fallback — \"??\" semantics, not \"||\"", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", value: "", value_fallback: "fallback" }] }));
    const result = await runOperation(withFallbackKeyField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", value: "" }] });
  });

  it("both keys absent yields the empty string", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A" }] }));
    const result = await runOperation(withFallbackKeyField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", value: "" }] });
  });
});

function withEnumField(): OperationDescriptor {
  return syntheticListDescriptor({
    item: {
      fields: [
        { type: "string", field: "title", jsonKey: "title" },
        { type: "enum", field: "level", jsonKey: "level", values: ["low", "medium", "high"], default: "medium" },
      ],
      validity: { fields: ["title"], require: "all" },
    },
  });
}

describe("runner list branch — enum item fields with a default (B7b, §3.4)", () => {
  it("a valid enum value is affected as-is", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", level: "high" }] }));
    const result = await runOperation(withEnumField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", level: "high" }] });
  });

  it("an unknown value falls back to the default", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", level: "extreme" }] }));
    const result = await runOperation(withEnumField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", level: "medium" }] });
  });

  it("a non-string value falls back to the default", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", level: 7 }] }));
    const result = await runOperation(withEnumField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", level: "medium" }] });
  });

  it("a valid value surrounded by whitespace falls back to the default — no trim, matching normalizeAssetType's identity comparison", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "A", level: " high " }] }));
    const result = await runOperation(withEnumField(), { projectId });
    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "A", level: "medium" }] });
  });
});

function withSort(maxItems?: number): OperationDescriptor {
  return syntheticListDescriptor({
    item: {
      fields: [
        { type: "string", field: "title", jsonKey: "title" },
        { type: "number", field: "order", jsonKey: "order_index", fallback: "index" },
      ],
      validity: { fields: ["title"], require: "all" },
    },
    sort: { field: "order", direction: "asc" },
    ...(maxItems != null ? { maxItems } : {}),
  });
}

describe("runner list branch — sort (B7b, §3.6)", () => {
  it("a disordered response is sorted ascending on the declared field", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "C", order_index: 2 }, { title: "A", order_index: 0 }, { title: "B", order_index: 1 }] })
    );
    const result = await runOperation(withSort(), { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        { title: "A", order: 0 },
        { title: "B", order: 1 },
        { title: "C", order: 2 },
      ],
    });
  });

  it("sort is stable on equal keys — original relative order preserved", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "First-at-1", order_index: 1 }, { title: "A", order_index: 0 }, { title: "Second-at-1", order_index: 1 }] })
    );
    const result = await runOperation(withSort(), { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        { title: "A", order: 0 },
        { title: "First-at-1", order: 1 },
        { title: "Second-at-1", order: 1 },
      ],
    });
  });

  it("sort is applied before maxItems — a list of 5 with maxItems: 2 yields the two smallest, not the two first received", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({
        items: [
          { title: "E", order_index: 4 },
          { title: "D", order_index: 3 },
          { title: "A", order_index: 0 },
          { title: "C", order_index: 2 },
          { title: "B", order_index: 1 },
        ],
      })
    );
    const result = await runOperation(withSort(2), { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        { title: "A", order: 0 },
        { title: "B", order: 1 },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Part 2 — complete equality against the real parsers, called through their
// real public draft actions (the parse functions themselves are not
// exported, so this reaches them the same way `story.generate.runner.test.ts`
// etc. reach their oracle — through the action, not a private function
// reference).
//
// LLMW.OUTPUT.LIST.2 (B7b) closes what B7a could not: every field of the
// three representable structs is now declared and compared, not just the
// string ones. Two normalizations remain legitimate and are called out
// where they apply — the empty-string vs. `null` normalization B7a already
// carried, and a new `undefined` vs. `null` normalization for an omitted
// numeric field. Every other divergence would be a defect.
// ---------------------------------------------------------------------------

describe("equality — shots.fromSequence via runWorkspaceOperation vs. the list branch, ALL fields (B7b, LLMW.UNIFY.PANEL.3)", () => {
  it("same raw model response, every field, in the model's own JSON keys", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "Equality sequence" });

    // B19d: the real descriptor's camera fields are `shot_size` /
    // `camera_position` / `camera_movement` / `movement_speed` /
    // `camera_subject` — `camera_subject`/`framing` are gone. The synthetic
    // descriptor's own `item.fields` below is kept an exact mirror of
    // `shotsFromSequenceDescriptor.output.item.fields`
    // (`descriptors/shotsFromSequence.ts`), which is this test's whole
    // point — a mismatch here would silently stop proving anything.
    const rawShots = [
      {
        title: "Establishing shot",
        shot_code: "SH010",
        description: "Wide view of the harbor.",
        duration_seconds: 4,
        continuity_in: "Calm morning.",
        action_pitch: "Boats depart.",
        shot_size: "WS",
        camera_position: "low_angle",
        camera_movement: "dolly_in",
        movement_speed: "slow",
        camera_subject: "Slow push in on the departing boats.",
        camera_lens: "",
        continuity_out: "Sun rises.",
        shot_prompt: "cinematic wide shot of a harbor at dawn",
      },
      {
        title: "Out of range duration",
        duration_seconds: 999, // > 120 → omitted on both sides
      },
      { title: "" /* invalid — filtered by both */ },
    ];

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ shots: rawShots }));
    const { runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction");
    const workspaceResult = await runWorkspaceOperation({
      descriptorId: "shots.fromSequence",
      ids: { projectId, sequenceId },
      intent: { parameters: { targetCount: 2 } },
    });
    expect(workspaceResult.ok).toBe(true);
    if (!workspaceResult.ok || workspaceResult.kind !== "list") throw new Error("unreachable");

    const descriptor = syntheticListDescriptor({
      arrayKey: "shots",
      item: {
        fields: [
          { type: "string", field: "title", jsonKey: "title" },
          { type: "string", field: "shot_code", jsonKey: "shot_code" },
          { type: "string", field: "description", jsonKey: "description" },
          { type: "number", field: "duration_seconds", jsonKey: "duration_seconds", exclusiveMin: 0, max: 120, fallback: "omit" },
          { type: "string", field: "continuity_in", jsonKey: "continuity_in" },
          { type: "string", field: "action_pitch", jsonKey: "action_pitch" },
          { type: "string", field: "shot_size", jsonKey: "shot_size" },
          { type: "string", field: "camera_position", jsonKey: "camera_position" },
          { type: "string", field: "camera_movement", jsonKey: "camera_movement" },
          { type: "string", field: "movement_speed", jsonKey: "movement_speed" },
          { type: "string", field: "camera_subject", jsonKey: "camera_subject" },
          { type: "string", field: "camera_lens", jsonKey: "camera_lens" },
          { type: "string", field: "continuity_out", jsonKey: "continuity_out" },
          { type: "string", field: "shot_prompt", jsonKey: "shot_prompt" },
        ],
        validity: { fields: ["title"], require: "all" },
      },
    }).output;

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ shots: rawShots }));
    const runnerResult = await runOperation({ ...syntheticListDescriptor(), output: descriptor }, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "list") throw new Error("unreachable");

    expect(workspaceResult.items).toEqual(runnerResult.items);
  });
});

describe("equality — assets.fromProject via runWorkspaceOperation vs. the list branch, ALL fields (B7b, LLMW.UNIFY.PANEL.3)", () => {
  it("same raw model response, every field, including assetType/sourceLevel enum defaults and dual-key string fallbacks", async () => {
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
      {
        // snake_case fallback keys, proving jsonKeyFallback is exercised on
        // the string fields too, not only the two enums.
        name: "Second Mate",
        asset_type: "character",
        source_level: "shot",
        source_excerpt: "second mate excerpt",
        duplicate_warning: "possible duplicate",
      },
      {
        name: "Unrecognised type asset",
        assetType: "spaceship", // not in VALID_ASSET_TYPES → default "other" on both sides
        sourceLevel: "nowhere", // not a recognised level → default "outline" on both sides
      },
      { assetType: "prop" /* invalid — no name, filtered by both */ },
    ];

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ assets: rawAssets }));
    const { runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction");
    // `"other"` is requested alongside `"character"` since
    // LLMW.ASSETS.TYPEFILTER.1 (S2): the third candidate's unrecognised
    // "spaceship" normalizes to the `"other"` enum default, and the
    // descriptor's own `postResponse` drops a candidate whose type was not
    // requested. This test exists to prove *field parsing* — enum defaults
    // and dual-key fallbacks — against a synthetic descriptor that declares
    // no postResponse, so both types are requested to keep the two sides
    // comparable. S2's own filtering is proven in
    // `assetsFromProject.postResponse.test.ts`, not weakened here.
    const workspaceResult = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      intent: { parameters: { includeShots: false, assetTypes: ["character", "other"] } },
    });
    expect(workspaceResult.ok).toBe(true);
    if (!workspaceResult.ok || workspaceResult.kind !== "list") throw new Error("unreachable");

    const descriptor = syntheticListDescriptor({
      arrayKey: "assets",
      item: {
        fields: [
          { type: "string", field: "name", jsonKey: "name" },
          {
            type: "enum",
            field: "assetType",
            jsonKey: "assetType",
            jsonKeyFallback: "asset_type",
            values: ["character", "environment", "prop", "vehicle", "crowd", "other"],
            default: "other",
          },
          { type: "string", field: "description", jsonKey: "description" },
          { type: "string", field: "notes", jsonKey: "notes" },
          {
            type: "enum",
            field: "sourceLevel",
            jsonKey: "sourceLevel",
            jsonKeyFallback: "source_level",
            values: ["outline", "sequence", "shot", "story"],
            default: "outline",
          },
          { type: "string", field: "sourceExcerpt", jsonKey: "sourceExcerpt", jsonKeyFallback: "source_excerpt" },
          { type: "string", field: "duplicateWarning", jsonKey: "duplicateWarning", jsonKeyFallback: "duplicate_warning" },
        ],
        validity: { fields: ["name"], require: "all" },
      },
      maxItems: 20,
    }).output;

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ assets: rawAssets }));
    const runnerResult = await runOperation({ ...syntheticListDescriptor(), output: descriptor }, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "list") throw new Error("unreachable");

    expect(workspaceResult.items).toEqual(runnerResult.items);
  });
});

describe("equality — sequences.fromOutline via runWorkspaceOperation vs. the list branch, ALL fields (B7b, LLMW.UNIFY.PANEL.3)", () => {
  it("same raw model response, every field, including order_index's index fallback and the post-parse sort", async () => {
    // Deliberately out of order and with one item missing order_index
    // entirely, so both the index-fallback (§3.3) and the sort (§3.6) are
    // actually exercised, not vacuously true.
    const rawSequences = [
      {
        title: "Departure",
        summary: "The crew departs.",
        description: "Closes the setting.",
        narrative_purpose: "Resolution",
        mood: "Bittersweet",
        location_hint: "Open sea",
        order_index: 5,
      },
      { title: "" /* invalid — filtered by both, still consumes fallback index 1 */ },
      {
        title: "Arrival",
        summary: "The crew arrives.",
        description: "Establishes the setting.",
        narrative_purpose: "Setup",
        mood: "Hopeful",
        location_hint: "Harbor",
        // order_index omitted entirely → both sides fall back to this raw
        // item's own array index, 2.
      },
    ];

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ sequences: rawSequences }));
    const { runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction");
    const workspaceResult = await runWorkspaceOperation({
      descriptorId: "sequences.fromOutline",
      ids: { projectId },
      intent: { parameters: { targetCount: 2 } },
    });
    expect(workspaceResult.ok).toBe(true);
    if (!workspaceResult.ok || workspaceResult.kind !== "list") throw new Error("unreachable");

    const descriptor = syntheticListDescriptor({
      arrayKey: "sequences",
      item: {
        fields: [
          { type: "string", field: "title", jsonKey: "title" },
          { type: "string", field: "summary", jsonKey: "summary" },
          { type: "string", field: "description", jsonKey: "description" },
          { type: "string", field: "narrative_purpose", jsonKey: "narrative_purpose" },
          { type: "string", field: "mood", jsonKey: "mood" },
          { type: "string", field: "location_hint", jsonKey: "location_hint" },
          { type: "number", field: "order_index", jsonKey: "order_index", fallback: "index" },
        ],
        validity: { fields: ["title"], require: "all" },
      },
      sort: { field: "order_index", direction: "asc" },
    }).output;

    mockedLLM().mockResolvedValueOnce(JSON.stringify({ sequences: rawSequences }));
    const runnerResult = await runOperation({ ...syntheticListDescriptor(), output: descriptor }, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "list") throw new Error("unreachable");

    expect(workspaceResult.items).toEqual(runnerResult.items);
  });
});

// castingSuggestions.ts is intentionally not exercised here — see the file
// header and `.agents/executor_report.md` §2/§3 for why no synthetic list
// descriptor can honestly stand in for it.
