// ---------------------------------------------------------------------------
// descriptors/sequencesFromOutline.ts — LLMW.POSTRESPONSE.1 (B7g)
//
// Descriptor for `sequences.fromOutline`, matching
// `generateSequencesFromOutlineDraft` (`src/actions/llm/sequenceGeneration.ts`)
// and its builder (`src/lib/prompts/sequences-from-outline.ts`,
// `buildSequencesFromOutlinePrompt` — the oracle, left untouched), on the
// model of `shotsFromSequence.ts` (LLMW.DESCRIPTOR.LIST.1, B7c).
//
// The builder has two mutually-exclusive system/template paths, gated on
// `project.outline`'s presence, exactly like `shots.fromSequence`'s gate on
// `sequence.sequencePrompt`. Path A's system body additionally needs a
// three-way count instruction (`targetCount` provided / `sectionCount`
// known from the parsed outline / neither), so its two path-body blocks use
// the `{variables, parameters, render}` shape (LLMW.BLOCK.VARPARAM.1,
// B7c-n4) to read `PROJECT.IDENTITY` (the outline-presence gate),
// `PROJECT.OUTLINE_SECTIONS` (for `sectionCount`) and `targetCount`
// together. The two template-path blocks need no parameter — `targetCount`
// never appears in the user message on either path — so they stay on the
// plain `{variables, render}` shape instead. The trailing JSON-schema block
// is identical on both paths and carries no interpolation (unlike
// `shots.fromSequence`'s own count-bearing schema), so it is a plain static
// `{text}` block rather than a render form.
//
// This is the second `kind: "list"` descriptor and the first to declare
// `postResponse` (LLMW.POSTRESPONSE.1): `generateSequencesFromOutlineDraft`'s
// deterministic override — pinning `title`/`summary` back onto the parsed
// outline sections when `targetCount` is absent and the counts line up
// (`sequenceGeneration.ts:148-158`) — has no other place in the pipeline
// (`output` only parses the model's JSON; it does not transform the result
// afterward). See `variables/registry.ts`'s
// `renderSequencesFromOutlinePinTitlesToSections` for the reproduction and
// `PROJECT.OUTLINE_SECTIONS`'s resolver for the shared parsing.
//
// Registered in `DESCRIPTORS` (`descriptors/index.ts`); executable at the
// bench (`shots.fromSequence`'s own precedent) but not Approve-able there —
// `BenchRunPanel` only wires `createGeneratedShots` — per the ticket, out of
// scope to change here.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

const JSON_SCHEMA_TAIL = `
Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`;

export const sequencesFromOutlineDescriptor: OperationDescriptor = {
  id: "sequences.fromOutline",
  name: "Generate Sequences from Outline",

  // `generateSequencesFromOutlineDraft` reads only `projectId`
  // (`sequenceGeneration.ts:104-106`) — no deeper chain to verify.
  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.OUTLINE_SECTIONS", userAdjustable: false },
    ],
  },

  expertise: {
    role: "sequencesFromOutlineWriter",
    system: {
      blocks: [
        // Exactly one of these two is ever non-empty — gated on
        // `project.outline`'s presence (`sequences-from-outline.ts:37`).
        { variables: ["PROJECT.IDENTITY", "PROJECT.OUTLINE_SECTIONS"], parameters: ["targetCount"], render: "sequencesFromOutline.systemPathABody" },
        { variables: ["PROJECT.IDENTITY"], parameters: ["targetCount"], render: "sequencesFromOutline.systemPathBBody" },
        // `JSON_SCHEMA` (`sequences-from-outline.ts:18-32`) — identical on
        // both paths, no interpolation, own leading `"\n"` reopening the
        // blank line the block separator alone cannot produce (§4.1
        // correction 4's device, as `shots.fromSequence`'s own JSON-schema
        // tail and `outline.ts`'s tail block both use).
        { text: JSON_SCHEMA_TAIL },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      // Exactly one of these two is ever non-empty — same gate as the
      // system blocks above. Neither needs `targetCount`
      // (`sequences-from-outline.ts:34-112`'s user-message halves never
      // interpolate it), so both stay on the plain `{variables, render}`
      // shape.
      { variables: ["PROJECT.IDENTITY", "PROJECT.OUTLINE_SECTIONS"], render: "sequencesFromOutline.templatePathA" },
      { variables: ["PROJECT.IDENTITY"], render: "sequencesFromOutline.templatePathB" },
    ],
    separator: "\n",
  },

  intent: {
    // `targetCount` (`sequenceGeneration.ts:109-111`):
    // `Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 20 ? rawCount : null`
    // — bound 1-20, omitted (not defaulted) on absence or on any
    // out-of-bound value: `normalizeIntentParameters` (B7e-n) already omits
    // an invalid value when no `default` is declared, exactly matching this
    // action's own `null`-on-absence behaviour.
    parameters: [
      {
        id: "targetCount",
        type: "integer",
        label: "Target number of sequences",
        min: 1,
        max: 20,
      },
    ],
  },

  // Read verbatim from `generateSequencesFromOutlineDraft`
  // (`sequenceGeneration.ts`): `"Invalid request."` (line 106) on a
  // malformed `projectId`; `"LLM provider not configured. Go to Settings to
  // configure Ollama."` (line 117) — deliberately different wording from
  // `shots.fromSequence`'s `"LLM not configured. Go to Settings to set up
  // Ollama."`, recopied as-is, not uniformed; `"Project not found."` (line
  // 123). No `invalidMode`: the action takes no assist mode.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM provider not configured. Go to Settings to configure Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // `!project.outline?.trim() && !project.pitch?.trim()` (`sequenceGeneration.ts:126-128`)
  // refuses only when BOTH fields are empty — "at least one of two", the
  // same `require: "any"` shape `assetBible.generate`'s precedent already
  // uses for `description`/`notes` (§4.1 of `types.ts`).
  preconditions: [{ fields: ["outline", "pitch"], require: "any", message: "Add a project pitch or outline first." }],

  // Reproduces `normalizeSequence` (`sequenceGeneration.ts:54-74`) field by
  // field, in its own declaration order (matching `GeneratedSequence`,
  // `src/types/llm.ts`). Every string field's bound is `str()`'s own
  // `maxLen` (`sequenceGeneration.ts:48-52`: trim, empty -> omitted, else
  // truncate). `order_index` is the one numeric field: accepted when it is a
  // finite number (no bound), otherwise falls back to the item's own
  // position in the raw array (`fallbackIndex`,
  // `sequenceGeneration.ts:60-63,87-89`) — `fallback: "index"`, matching
  // `sequenceGeneration.ts`'s own behaviour, unlike `sequenceShots.ts`'s
  // `duration_seconds`, which omits instead.
  output: {
    kind: "list",
    // `parseSequencesResult`'s own top-level key (`sequenceGeneration.ts:83`).
    arrayKey: "sequences",
    item: {
      fields: [
        { type: "string", field: "title", jsonKey: "title", truncateTo: 200 },
        { type: "string", field: "summary", jsonKey: "summary", truncateTo: 500 },
        { type: "string", field: "description", jsonKey: "description", truncateTo: 1000 },
        { type: "string", field: "narrativePurpose", jsonKey: "narrative_purpose", truncateTo: 300 },
        { type: "string", field: "mood", jsonKey: "mood", truncateTo: 100 },
        { type: "string", field: "locationHint", jsonKey: "location_hint", truncateTo: 300 },
        { type: "number", field: "orderIndex", jsonKey: "order_index", fallback: "index" },
      ],
      // `normalizeSequence` returns `null` (item dropped) only when `title`
      // is missing (`sequenceGeneration.ts:57-58`) — the sole gate.
      validity: { fields: ["title"], require: "all" },
    },
    // No `maxItems`: `parseSequencesResult` (`sequenceGeneration.ts:76-94`)
    // never slices the filtered array.
    sort: { field: "orderIndex", direction: "asc" },
    // `createGeneratedSequences` reads `sequencesJson` (`sequenceGeneration.ts:173`).
    selection: { formDataKey: "sequencesJson" },
    errors: {
      // `parseSequencesResult` (`sequenceGeneration.ts:76-94`).
      unparsable: "The model returned an unexpected format. Try again or use a different model.",
      notArray: "The model did not return a sequences array. Try again.",
      empty: "The model returned no valid sequences. Try again.",
    },
  },

  // LLMW.POSTRESPONSE.1 (B7g). Reproduces the deterministic override
  // (`sequenceGeneration.ts:148-158`) verbatim — see
  // `renderSequencesFromOutlinePinTitlesToSections`
  // (`variables/registry.ts`) for the reproduction itself.
  postResponse: {
    form: "sequencesFromOutline.pinTitlesToSections",
    variables: ["PROJECT.OUTLINE_SECTIONS"],
    parameters: ["targetCount"],
  },

  // `createGeneratedSequences` (`src/actions/llm/sequenceGeneration.ts:168-242`)
  // is already declared in `ACTION_REGISTRY` as an `"insert"` entry
  // (LLMW.ACTION.INSERT.1, B7c-w) — the write side this descriptor was
  // missing.
  commit: ["createGeneratedSequences"],

  executor: "inProcess",
};
