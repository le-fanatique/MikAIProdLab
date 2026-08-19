import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.4 (B7h-m) — the same proof B7e, B7g-m and B7f-m already
// established for `sequenceShots.ts`, `sequenceGeneration.ts` and
// `assetExtraction.ts`, reproduced here for the last of the eight list-kind
// migrations, `castingSuggestions.ts`: the migrated
// `generateCastingSuggestionsDraft` (adapter over `runOperation`) must return
// output that is *indiscernible* from the pre-migration
// `parseSuggestionsResult` + `normalizeRawSuggestion` + filter/enrich chain
// (`git show 788ac5a:src/actions/llm/castingSuggestions.ts`, the HEAD this
// ticket started from), for the same raw model response — except for the one
// divergence the ticket names and arbitrates explicitly (A.5, its own
// `describe` block below). Not "it works" — equality, field by field,
// computed by hand against the old, un-exported logic.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const callLLMJson = vi.fn<(prompt: unknown, config: unknown) => Promise<string>>();
vi.mock("@/lib/llm", () => ({ callLLMJson: (...args: [unknown, unknown]) => callLLMJson(...args) }));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
});

afterAll(() => ctx.cleanup());

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function makeFixture() {
  const projectId = await insertProject(ctx, "Neon Skyline");
  const sequenceId = await insertSequence(ctx, projectId, { title: "Chase Sequence" });
  const otherSequenceId = await insertSequence(ctx, projectId, { title: "Other Sequence" });

  const shot1Id = await insertShot(ctx, sequenceId, { title: "Shot One", shotCode: "SH010", orderIndex: 0 });
  const shot2Id = await insertShot(ctx, sequenceId, { title: "Bare Shot", shotCode: null, orderIndex: 1 });
  const otherShotId = await insertShot(ctx, otherSequenceId, { title: "Other Sequence's Shot", orderIndex: 0 });

  const assetAId = await insertAsset(ctx, projectId, { name: "Kira", type: "character", orderIndex: 0 });
  const assetBId = await insertAsset(ctx, projectId, { name: "Van", type: "vehicle", orderIndex: 1 });
  const assetCId = await insertAsset(ctx, projectId, { name: "Neon Sign", type: "prop", orderIndex: 2 });

  // One existing shot-level casting only, so `alreadyAssigned` is exercised
  // both `true` (shot1<-assetA) and `false` (every other pairing below).
  await ctx.db.insert(ctx.schema.shotAssets).values({ shotId: shot1Id, assetId: assetAId });

  return { projectId, sequenceId, otherSequenceId, shot1Id, shot2Id, otherShotId, assetAId, assetBId, assetCId };
}

describe("generateCastingSuggestionsDraft — old/new equality on every field-level behaviour (LLMW.MIGRATE.LIST.4, B7h-m)", () => {
  it("returns output indiscernible from the pre-migration chain, for a response exercising every filter and fill-back at once", async () => {
    const f = await makeFixture();

    const rawModelResponse = JSON.stringify({
      suggestions: [
        // Item 0 — a valid shot casting, with `reason`, and a model-invented
        // targetLabel/assetName/assetType — all three enriched from local
        // data on both sides, never trusted from the model. Also the
        // "already assigned" case (shot1<-assetA already exists in base).
        {
          targetType: "shot",
          targetId: f.shot1Id,
          targetLabel: "MODEL-INVENTED LABEL",
          assetId: f.assetAId,
          assetName: "MODEL-INVENTED NAME",
          assetType: "prop", // real type is "character" — deliberately wrong
          reason: "A good fit for this shot.",
          confidence: "high",
        },
        // Item 1 — a valid shot casting, `reason` entirely absent -> `null`
        // on both sides. Targets the shot with no `shotCode`, exercising the
        // bare-title branch of the enrichment. Not already assigned.
        {
          targetType: "shot",
          targetId: f.shot2Id,
          targetLabel: "x",
          assetId: f.assetBId,
          assetName: "x",
          assetType: "prop", // real type is "vehicle" — deliberately wrong
          confidence: "medium",
        },
        // Item 2 — `assetId` does not exist in the project's asset library:
        // dropped on both sides.
        {
          targetType: "shot",
          targetId: f.shot1Id,
          targetLabel: "x",
          assetId: 999999,
          assetName: "x",
          assetType: "prop",
          reason: null,
          confidence: "high",
        },
        // Item 3 — a shot item targeting another sequence's shot: dropped on
        // both sides.
        {
          targetType: "shot",
          targetId: f.otherShotId,
          targetLabel: "x",
          assetId: f.assetAId,
          assetName: "x",
          assetType: "prop",
          reason: null,
          confidence: "high",
        },
        // Item 4 — an unrecognised `targetType`: dropped on both sides (old
        // chain in `normalizeRawSuggestion`, new chain in the `postResponse`
        // form — see the adapter's own header comment for why the gate moved
        // without moving the observable outcome, for this item in
        // isolation).
        {
          targetType: "banana",
          targetId: f.shot1Id,
          targetLabel: "x",
          assetId: f.assetAId,
          assetName: "x",
          assetType: "prop",
          reason: null,
          confidence: "high",
        },
        // Item 5 — `reason` longer than 300 characters: truncated to the
        // same 300-character offset on both sides. Not already assigned
        // (shot1<-assetC does not exist).
        {
          targetType: "shot",
          targetId: f.shot1Id,
          targetLabel: "x",
          assetId: f.assetCId,
          assetName: "x",
          assetType: "prop",
          reason: "R".repeat(350),
          confidence: "low",
        },
      ],
    });

    // Computed by hand from the old, un-exported `normalizeRawSuggestion` +
    // `parseSuggestionsResult` + the filter/enrich loop
    // (`git show 788ac5a:src/actions/llm/castingSuggestions.ts`, lines
    // 58-105, 219-271), applied to `rawModelResponse` above.
    const expectedSuggestions = [
      {
        targetType: "shot",
        targetId: f.shot1Id,
        targetLabel: "SH010 — Shot One", // enriched: shotCode present
        assetId: f.assetAId,
        assetName: "Kira", // enriched, model's "MODEL-INVENTED NAME" discarded
        assetType: "character", // enriched, model's "prop" discarded
        reason: "A good fit for this shot.",
        confidence: "high",
        alreadyAssigned: true, // shot1<-assetA exists in base
      },
      {
        targetType: "shot",
        targetId: f.shot2Id,
        targetLabel: "Bare Shot", // enriched: no shotCode -> bare title
        assetId: f.assetBId,
        assetName: "Van",
        assetType: "vehicle",
        // LLMW.UNIFY.PANEL.4 — RAW shape now: the `"" -> null` fill-back moved
        // into the panel with the rest of the presentation, so it is no longer
        // proven here. Stated rather than quietly dropped.
        reason: "",
        confidence: "medium",
        alreadyAssigned: false,
      },
      // Item 2 (bad assetId) and item 3 (other sequence's shot) and item 4
      // (unrecognised targetType) do not appear at all.
      {
        targetType: "shot",
        targetId: f.shot1Id,
        targetLabel: "SH010 — Shot One",
        assetId: f.assetCId,
        assetName: "Neon Sign",
        assetType: "prop",
        reason: "R".repeat(300), // str(value, 300) -> sliced at the same offset
        confidence: "low",
        alreadyAssigned: false,
      },
    ];

    callLLMJson.mockResolvedValueOnce(rawModelResponse);
    const result = await runWorkspaceOperation({
      descriptorId: "casting.fromSequence",
      ids: { projectId: f.projectId, sequenceId: f.sequenceId },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    if (!result.ok || result.kind !== "list") throw new Error("expected a list result");
    expect(result.items).toEqual(expectedSuggestions);
  });

  // Isolated from the array above on purpose: mixing an unrecognised
  // `targetType` item (dropped via the `postResponse` form, *after* the
  // runner's own `maxItems` truncation) with a >60-item response would
  // change *which* items the two chains keep at the truncation boundary —
  // the old chain drops such an item in `normalizeRawSuggestion`, before its
  // own `.slice(0, 60)`; the runner's `item.validity` only requires
  // `targetType` to be a *non-empty* string (not a recognised one, per the
  // descriptor's own comment on why `targetType` is `"string"`, not
  // `"enum"`), so that item still occupies a slot pre-truncation on the new
  // side. Combined with >60 items, that shifts the truncation boundary by
  // one item between the two chains — a real edge case, but a different one
  // from A.5, and not one this ticket's own bullet list anticipates
  // combining with the unrecognised-`targetType` case. Kept apart here so
  // this file does not assert a false equality.
  it("truncates to 60 items identically, in the raw array's own order, for a uniformly valid response", async () => {
    const f = await makeFixture();

    const rawItems = Array.from({ length: 65 }, (_, i) => ({
      targetType: "shot",
      targetId: f.shot1Id,
      targetLabel: "x",
      assetId: f.assetAId,
      assetName: "x",
      assetType: "prop",
      reason: `Item ${i}`,
      confidence: "high",
    }));

    const expectedSuggestions = rawItems.slice(0, 60).map((raw) => ({
      targetType: "shot",
      targetId: f.shot1Id,
      targetLabel: "SH010 — Shot One",
      assetId: f.assetAId,
      assetName: "Kira",
      assetType: "character",
      reason: raw.reason,
      confidence: "high",
      alreadyAssigned: true,
    }));

    callLLMJson.mockResolvedValueOnce(JSON.stringify({ suggestions: rawItems }));
    const result = await runWorkspaceOperation({
      descriptorId: "casting.fromSequence",
      ids: { projectId: f.projectId, sequenceId: f.sequenceId },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    if (result.kind !== "list") throw new Error("expected a list result");
    expect(result.items).toEqual(expectedSuggestions);
    expect(result.items.length).toBe(60);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    const f = await makeFixture();
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await runWorkspaceOperation({
      descriptorId: "casting.fromSequence",
      ids: { projectId: f.projectId, sequenceId: f.sequenceId },
    });
    expect(result).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });
  });

  it("reproduces the exact 'notArray' message when the suggestions key is absent", async () => {
    const f = await makeFixture();
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await runWorkspaceOperation({
      descriptorId: "casting.fromSequence",
      ids: { projectId: f.projectId, sequenceId: f.sequenceId },
    });
    expect(result).toEqual({
      ok: false,
      error: "The model did not return a suggestions array. Try again.",
    });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no recognised targetType)", async () => {
    const f = await makeFixture();
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ suggestions: [{ targetType: "" }] }));

    const result = await runWorkspaceOperation({
      descriptorId: "casting.fromSequence",
      ids: { projectId: f.projectId, sequenceId: f.sequenceId },
    });
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid suggestions. Try again.",
    });
  });

  // Kept here, not in the A.5 divergence `describe` below (LLMW.MIGRATE.LIST.4-R1,
  // arbitrated 2026-08-17): this is a case where the two chains *agree*, not
  // one where they diverge. Both items below have a recognised `targetType`
  // and a well-formed `targetId`/`assetId` — a positive integer — that simply
  // does not exist. On the old chain (`git show
  // 788ac5a:src/actions/llm/castingSuggestions.ts`), `num()` (lines 41-44)
  // only checks "integer and > 0", so both items survive
  // `normalizeRawSuggestion` and `parseSuggestionsResult`'s own empty-refusal
  // (lines 99-104) never fires; the later existence-filter loop
  // (lines 232-237, pre-migration) then drops both, and the old chain itself
  // returns `{ ok: true, suggestions: [] }` for this exact input — the same
  // thing the migrated adapter returns. This is precisely the "far more
  // common case of well-formed but hallucinated ids" the adapter's own header
  // comment cites as the reason the `empty` message is not folded onto a
  // post-filter empty array.
  it("an item with a recognised targetType and a well-formed but non-existent id agrees with the old chain -> { ok: true, suggestions: [] }, not the 'empty' message", async () => {
    const f = await makeFixture();
    callLLMJson.mockResolvedValueOnce(
      JSON.stringify({
        suggestions: [
          { targetType: "shot", targetId: f.shot1Id, targetLabel: "x", assetId: 999999, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
          { targetType: "sequence", targetId: 999999, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
        ],
      })
    );

    const result = await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: f.projectId, sequenceId: f.sequenceId }, intent: { parameters: { includeSequenceLevel: true } } });

    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });
});

describe("generateCastingSuggestionsDraft — the two preconditions, verbatim, without a model call (LLMW.MIGRATE.LIST.4, B7h-m)", () => {
  it("no shots in the sequence -> the exact precondition message, no model call", async () => {
    const projectId = await insertProject(ctx, "Empty of shots");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Shotless sequence" });
    await insertAsset(ctx, projectId, { name: "Asset", type: "character" });
    callLLMJson.mockClear();

    const result = await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: projectId, sequenceId: sequenceId } });

    expect(result).toEqual({ ok: false, error: "No shots in this sequence. Add shots first." });
    expect(callLLMJson).not.toHaveBeenCalled();
  });

  it("no assets in the project library -> the exact precondition message, no model call", async () => {
    const projectId = await insertProject(ctx, "Empty of assets");
    const sequenceId = await insertSequence(ctx, projectId, { title: "A sequence" });
    await insertShot(ctx, sequenceId, { title: "A shot" });
    callLLMJson.mockClear();

    const result = await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: projectId, sequenceId: sequenceId } });

    expect(result).toEqual({
      ok: false,
      error: "No assets in the project library. Extract or create assets first.",
    });
    expect(callLLMJson).not.toHaveBeenCalled();
  });
});

describe("generateCastingSuggestionsDraft — includeSequenceLevel (LLMW.MIGRATE.LIST.4, B7h-m)", () => {
  it("true vs false: the rendered prompt differs, and a sequence-level item is retained only when its targetId is the current sequence", async () => {
    const f = await makeFixture();

    callLLMJson.mockClear();
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ suggestions: [] }));
    await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: f.projectId, sequenceId: f.sequenceId }, intent: { parameters: { includeSequenceLevel: false } } });
    const [promptFalse] = callLLMJson.mock.calls[0] as [{ system: string; user: string }, unknown];
    expect(promptFalse.system).not.toContain("Sequence-level casting");

    callLLMJson.mockClear();
    callLLMJson.mockResolvedValueOnce(
      JSON.stringify({
        suggestions: [
          // Retained: targetId is the current sequence.
          {
            targetType: "sequence",
            targetId: f.sequenceId,
            targetLabel: "x",
            assetId: f.assetBId,
            assetName: "x",
            assetType: "prop",
            reason: null,
            confidence: "high",
          },
          // Dropped: targetId is a different sequence.
          {
            targetType: "sequence",
            targetId: f.otherSequenceId,
            targetLabel: "x",
            assetId: f.assetBId,
            assetName: "x",
            assetType: "prop",
            reason: null,
            confidence: "high",
          },
        ],
      })
    );
    const result = await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: f.projectId, sequenceId: f.sequenceId }, intent: { parameters: { includeSequenceLevel: true } } });
    const [promptTrue] = callLLMJson.mock.calls[0] as [{ system: string; user: string }, unknown];
    expect(promptTrue.system).toContain("Sequence-level casting");

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(result.items).toEqual([
      {
        targetType: "sequence",
        targetId: f.sequenceId,
        targetLabel: "Chase Sequence",
        assetId: f.assetBId,
        assetName: "Van",
        assetType: "vehicle",
        // RAW shape (LLMW.UNIFY.PANEL.4): the `"" -> null` fill-back is the
        // panel's job now, so it is no longer proven here.
        reason: "",
        confidence: "high",
        alreadyAssigned: false,
      },
    ]);
  });
});

describe("generateCastingSuggestionsDraft — the declared divergence (A.5, arbitrated 2026-08-17, corrected LLMW.MIGRATE.LIST.4-R1)", () => {
  // Two families of input where the two chains genuinely disagree, per the
  // R1 correction to A.5: not "a hallucinated but well-formed id" (that case
  // agrees — see the `describe` above), but an item that satisfies the
  // runner's own item gate, `output.item.validity: { fields: ["targetType"],
  // require: "all" }` (`castingFromSequenceDescriptor`, non-empty string
  // only), while the old `normalizeRawSuggestion` rejected it outright —
  // `targetType` not recognised, or an id that fails `num()` (not a positive
  // integer, existing or not). Both families cross the runner's own
  // `output.errors.empty` refusal on the *parsed* array (which the old
  // chain's equivalent refusal never sees, because the item was already gone
  // upstream) and are only dropped afterwards, by the `postResponse` form —
  // producing `{ ok: true, suggestions: [] }` on the migrated side where the
  // old chain threw the `empty` message.

  it("family A — every item has an unrecognised targetType -> { ok: true, suggestions: [] }, where the old chain threw the 'empty' message", async () => {
    // `"banana"` is a non-empty string, so `item.validity` passes and the
    // parsed array is non-empty: the runner's own empty-refusal does not
    // fire. Only the `postResponse` form later drops both items for lacking
    // a recognised `targetType`, after that refusal has already passed.
    //
    // The old chain (`git show 788ac5a:src/actions/llm/castingSuggestions.ts`)
    // disagrees: `normalizeRawSuggestion` rejects an unrecognised
    // `targetType` at line 63-64, before the array is even built, so both
    // items never reach it — `.map(normalizeRawSuggestion).filter(...)`
    // (lines 99-101) yields `normalized.length === 0`, and
    // `parseSuggestionsResult` throws "The model returned no valid
    // suggestions. Try again." (lines 102-104).
    const f = await makeFixture();
    callLLMJson.mockResolvedValueOnce(
      JSON.stringify({
        suggestions: [
          { targetType: "banana", targetId: f.shot1Id, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
          { targetType: "banana", targetId: f.shot2Id, targetLabel: "x", assetId: f.assetBId, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
        ],
      })
    );

    const result = await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: f.projectId, sequenceId: f.sequenceId }, intent: { parameters: { includeSequenceLevel: true } } });

    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("family B — every item has a recognised targetType but an id that is not a positive integer -> { ok: true, suggestions: [] }, where the old chain threw the 'empty' message", async () => {
    // `targetType` is recognised on both items, so `item.validity` and the
    // empty-refusal both pass on the parsed array. `targetId`/`assetId` are
    // `fallback: "omit"` with `exclusiveMin: 0`
    // (`descriptors/castingFromSequence.ts`), so `0` and `-5` fail
    // `readNumberField`'s own range check and the key is simply absent, not
    // `0`/`-5` (`runner.ts`, `readNumberField`) — the item survives the
    // empty-refusal with a missing id, and only the later `postResponse`
    // form (which requires both ids present, `variables/registry.ts:936-940`)
    // drops it.
    //
    // The old chain disagrees: `num()` (`git show
    // 788ac5a:src/actions/llm/castingSuggestions.ts`, lines 41-44) returns
    // `null` for `0` and for `-5` alike (not a strictly positive integer),
    // so `normalizeRawSuggestion` rejects the first item at its `targetId`
    // check (line 67) and the second at its `assetId` check (line 70) —
    // neither item reaches the returned array, `normalized.length === 0`
    // after `.map(normalizeRawSuggestion).filter(...)` (lines 99-101), and
    // `parseSuggestionsResult` throws "The model returned no valid
    // suggestions. Try again." (lines 102-104).
    const f = await makeFixture();
    callLLMJson.mockResolvedValueOnce(
      JSON.stringify({
        suggestions: [
          { targetType: "shot", targetId: 0, targetLabel: "x", assetId: f.assetAId, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
          { targetType: "shot", targetId: f.shot1Id, targetLabel: "x", assetId: -5, assetName: "x", assetType: "prop", reason: null, confidence: "high" },
        ],
      })
    );

    const result = await runWorkspaceOperation({ descriptorId: "casting.fromSequence", ids: { projectId: f.projectId, sequenceId: f.sequenceId }, intent: { parameters: { includeSequenceLevel: true } } });

    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });
});
