// ---------------------------------------------------------------------------
// descriptors/castingFromSequence.ts — LLMW.DESCRIPTOR.CASTING.1 (B7h-b2)
//
// Descriptor for `casting.fromSequence`, matching
// `generateCastingSuggestionsDraft` (`src/actions/llm/castingSuggestions.ts`)
// and its builder (`src/lib/prompts/casting-from-sequence.ts`,
// `buildCastingFromSequencePrompt` — the oracle, left untouched, per the
// ticket's own "Hors scope").
//
// The fourth `kind: "list"` descriptor (LLMW.OUTPUT.LIST.1/2, B7a/B7b), and
// the first whose `output.item.fields` cannot fully express the oracle's own
// item-drop gate (`normalizeRawSuggestion`'s `targetType`/`targetId`/
// `assetId` validation, `castingSuggestions.ts:58-85`) — `item.validity`
// (frozen) only gates on non-empty *string* fields. That gate's equivalent is
// reproduced instead inside the `postResponse` form
// (`castingFromSequence.filterAndEnrich`, `variables/registry.ts`), the one
// pipeline stage the ticket names for exactly this filtering (§3).
//
// `context.variables` reads six variables: `PROJECT.IDENTITY` and
// `SEQ.IDENTITY` for the two anchors' own identity, `SEQ.CONTEXT` for the
// sequence's narrative fields, and the three LLMW.VAR.CASTING.1 (B7h-b1)
// variables — `SEQ.SHOT_TARGETS`, `PROJECT.ASSET_LIBRARY`,
// `SEQ.EXISTING_CASTINGS` — delivered ahead of this descriptor and now
// referenced for the first time. `SEQ.IDENTITY` is new to this ticket
// (§3bis): the sequence anchor's own `id`, which `buildCastingFromSequencePrompt`
// embeds in four places and no other variable projects — see
// `variables/registry.ts` for the full account of why.
//
// Registered in `DESCRIPTORS` (`descriptors/index.ts`); executable at the
// bench (the three prior list descriptors' own precedent) but not
// Approve-able there — `BenchRunPanel` is not wired for
// `applySelectedCastingSuggestions`, per the ticket's own "Hors scope".
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

const CASTING_ASSET_TYPE_VALUES = ["character", "environment", "prop", "vehicle", "crowd", "other"] as const;

export const castingFromSequenceDescriptor: OperationDescriptor = {
  id: "casting.fromSequence",
  name: "Suggest Castings from Sequence",

  // `generateCastingSuggestionsDraft` reads both `projectId` and
  // `sequenceId`, and verifies `sequence.projectId === projectId`
  // (`castingSuggestions.ts:114-139`) — exactly `loadAndVerifyChain`'s own
  // "sequence" anchor check.
  anchor: { kind: "entity", entity: "sequence" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SEQ.SHOT_TARGETS", userAdjustable: false },
      { id: "PROJECT.ASSET_LIBRARY", userAdjustable: false },
      { id: "SEQ.EXISTING_CASTINGS", userAdjustable: false },
    ],
  },

  expertise: {
    role: "castingFromSequenceDirector",
    system: {
      // One block: the whole system message is a single continuous template
      // literal in the oracle (no `parts` array unlike the user message) —
      // see `renderCastingFromSequenceSystemBody`'s own header note in
      // `variables/registry.ts` for why this stays one block even though its
      // *content* branches on `includeSequenceLevel`.
      blocks: [
        {
          variables: ["PROJECT.IDENTITY", "SEQ.IDENTITY"],
          parameters: ["includeSequenceLevel"],
          render: "castingFromSequence.systemBody",
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      // Block 1 — project background, always non-empty.
      { variable: "PROJECT.IDENTITY", render: "castingFromSequence.projectBackgroundLines" },
      // Block 2 — sequence context, always non-empty.
      { variables: ["SEQ.IDENTITY", "SEQ.CONTEXT"], render: "castingFromSequence.sequenceContextLines" },
      // Block 3 — asset library, always non-empty (prints its own header even
      // when the library is empty, matching the oracle).
      { variable: "PROJECT.ASSET_LIBRARY", render: "castingFromSequence.assetLibraryLines" },
      // Block 4 — shots, always non-empty, same shape as block 3.
      { variable: "SEQ.SHOT_TARGETS", render: "castingFromSequence.shotsLines" },
      // Block 5 — existing castings, empty (and dropped) when there are none.
      { variables: ["SEQ.IDENTITY", "SEQ.EXISTING_CASTINGS"], render: "castingFromSequence.existingCastingsBlock" },
      // Block 6 — closing instruction line, always non-empty.
      {
        variables: ["SEQ.IDENTITY"],
        parameters: ["includeSequenceLevel"],
        render: "castingFromSequence.closingInstructionLine",
      },
    ],
    // The oracle's own `parts.join("\n\n") + "\n\n" + targetInstruction...`
    // (`casting-from-sequence.ts:157-159`) — see `variables/registry.ts`'s
    // render forms' own header note for the algebraic argument that the
    // block list above, filtered of empties and joined by `"\n\n"`,
    // reproduces it byte-for-byte.
    separator: "\n\n",
  },

  intent: {
    // `includeSequenceLevel` (`castingSuggestions.ts:116`): `formData.get(...)
    // === "true"`, `false` on an absent key — reproduced verbatim as the
    // declared default. Label copied verbatim from the panel's own checkbox
    // text (`CastingSuggestionsPanel.tsx:146`: "Include sequence-level
    // suggestions").
    parameters: [
      { id: "includeSequenceLevel", type: "boolean", label: "Include sequence-level suggestions", default: false },
    ],
  },

  // Read verbatim from `generateCastingSuggestionsDraft`
  // (`castingSuggestions.ts`): `"Invalid request."` (line 122) on a malformed
  // `projectId`/`sequenceId`; `"LLM not configured. Go to Settings to set up
  // Ollama."` (line 127); `"Project not found."` (line 131); `"Sequence not
  // found."` (line 138) — the action checks project existence before
  // sequence existence/ownership, exactly `loadAndVerifyChain`'s own order.
  // No `invalidMode`: the action takes no assist mode.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", sequence: "Sequence not found." },
  },

  // Two guards, both read verbatim off `castingSuggestions.ts:153-161`: "No
  // shots in this sequence." and "No assets in the project library." Both
  // gate on a resolved variable's own array length (`{variable: ...}` refs,
  // `PreconditionRef`, §3 of `LLMW.DESCRIPTOR.ASSETS.1`) — the same shape
  // `assetsFromProject`'s own `PROJECT.SEQUENCES` precondition already uses.
  preconditions: [
    { refs: [{ variable: "SEQ.SHOT_TARGETS" }], require: "all", message: "No shots in this sequence. Add shots first." },
    {
      refs: [{ variable: "PROJECT.ASSET_LIBRARY" }],
      require: "all",
      message: "No assets in the project library. Extract or create assets first.",
    },
  ],

  // Reproduces `normalizeRawSuggestion` (`castingSuggestions.ts:58-85`) field
  // by field, in `RawSuggestion`'s own declaration order. `targetType` is
  // declared `"string"`, not `"enum"`: an `"enum"` field silently substitutes
  // its `default` for an unrecognised value, which would let a garbage
  // `targetType` survive as a fabricated "shot" or "sequence" casting — the
  // oracle drops the whole item instead. That drop is reproduced in the
  // `postResponse` form (`castingFromSequence.filterAndEnrich`), which is
  // also where `targetId`/`assetId`'s existence is checked — see that form's
  // own header comment in `variables/registry.ts`.
  output: {
    kind: "list",
    // `parseSuggestionsResult`'s own top-level key (`castingSuggestions.ts:95`).
    arrayKey: "suggestions",
    item: {
      fields: [
        { type: "string", field: "targetType", jsonKey: "targetType" },
        { type: "number", field: "targetId", jsonKey: "targetId", exclusiveMin: 0, fallback: "omit" },
        { type: "string", field: "targetLabel", jsonKey: "targetLabel", truncateTo: 200 },
        { type: "number", field: "assetId", jsonKey: "assetId", exclusiveMin: 0, fallback: "omit" },
        { type: "string", field: "assetName", jsonKey: "assetName", truncateTo: 200 },
        {
          type: "enum",
          field: "assetType",
          jsonKey: "assetType",
          values: [...CASTING_ASSET_TYPE_VALUES],
          default: "other",
        },
        { type: "string", field: "reason", jsonKey: "reason", truncateTo: 300 },
        { type: "enum", field: "confidence", jsonKey: "confidence", values: ["high", "medium", "low"], default: "medium" },
      ],
      // `normalizeRawSuggestion` drops an item only when `targetType` is
      // unrecognised, or `targetId`/`assetId` fails `num()`
      // (`castingSuggestions.ts:62-70`) — none of which `item.validity` can
      // fully express (§ above). `targetType` non-empty is the one part of
      // that gate a string-field validity rule *can* express, and is
      // declared here; the rest is the `postResponse` form's job.
      validity: { fields: ["targetType"], require: "all" },
    },
    // `parseSuggestionsResult`'s own `.slice(0, 60)` (`castingSuggestions.ts:105`),
    // applied — like every other list descriptor's `maxItems` — after the
    // empty-refusal and before `postResponse`, matching the oracle's own
    // order (truncate at parse time, existence-filter afterward).
    maxItems: 60,
    // `applySelectedCastingSuggestions` reads `selectedJson`
    // (`castingSuggestions.ts:289`).
    selection: { formDataKey: "selectedJson" },
    errors: {
      // `parseSuggestionsResult` (`castingSuggestions.ts:87-106`).
      unparsable: "The model returned an unexpected format. Try again.",
      notArray: "The model did not return a suggestions array. Try again.",
      empty: "The model returned no valid suggestions. Try again.",
    },
  },

  // LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §3 of the ticket. Reproduces
  // `generateCastingSuggestionsDraft`'s own filter/enrich pass
  // (`castingSuggestions.ts:231-271`) — see
  // `renderCastingFromSequenceFilterAndEnrich` (`variables/registry.ts`) for
  // the reproduction itself.
  postResponse: {
    form: "castingFromSequence.filterAndEnrich",
    variables: ["SEQ.SHOT_TARGETS", "PROJECT.ASSET_LIBRARY", "SEQ.EXISTING_CASTINGS", "SEQ.IDENTITY"],
  },

  // `applySelectedCastingSuggestions` (`src/actions/llm/castingSuggestions.ts:281-357`)
  // is already declared in `ACTION_REGISTRY` as an `"insert"` entry
  // (LLMW.ACTION.CASTING.1, B7h-a) — the write side this descriptor was
  // missing.
  commit: ["applySelectedCastingSuggestions"],

  executor: "inProcess",
};
