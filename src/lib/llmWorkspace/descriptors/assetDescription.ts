// ---------------------------------------------------------------------------
// descriptors/assetDescription.ts — LLMW.DESCRIPTOR.FORMAT.1b (B1b-2)
//
// Descriptor for `assetDescription.generate`, matching
// `generateAssetDescriptionOnlyDraft` (`src/actions/llm/assetDescription.ts`)
// and its builder (`src/lib/prompts/asset-description-from-context.ts`,
// `buildAssetDescriptionOnlyPrompt`).
//
// `generateAssetDescriptionOnlyDraft(formData)` reads only `projectId` /
// `assetId` — no free text, no assist mode, no runtime parameter, so
// `intent: {}` is the honest value.
//
// The action assembles its context through the shared
// `fetchAssetContextInput(project, assetId, style)`
// (`src/actions/llm/assetDescription.ts`), which reads:
//   - `project.{name, pitch, story, outline}` — `PROJECT.IDENTITY`;
//   - the Asset row's `{name, type, description, notes}` — `ASSET.CORE`;
//   - Sequences the Asset appears in, `limit(5)` — `ASSET.SEQ_APPEARANCES`;
//   - Shots the Asset appears in, `limit(10)` — `ASSET.SHOT_APPEARANCES`;
//   - the Asset's reference images, `limit(5)` — `ASSET.REFERENCES`;
//   - `resolveDescriptionStyleSegments(projectId)`, which reads only
//     `worldSegment` / `rulesSegment` of `PROJECT.STYLE` (never
//     `visualSegment` — that subset belongs to `assetBible.generate` only).
//
// This is the same `fetchAssetContextInput` call `assetNotes.generate` and
// `assetDescription.batch` go through — all three declare the identical
// six-variable context below, which is the point: one declaration replaces
// three hard-coded assemblies (see the ticket's closing note).
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const ASSET_DESCRIPTION_CONTEXT_VARIABLES: OperationDescriptor["context"]["variables"] = [
  { id: "PROJECT.IDENTITY", userAdjustable: false },
  { id: "ASSET.CORE", userAdjustable: false },
  { id: "ASSET.SEQ_APPEARANCES", userAdjustable: false },
  { id: "ASSET.SHOT_APPEARANCES", userAdjustable: false },
  { id: "ASSET.REFERENCES", userAdjustable: false },
  { id: "PROJECT.STYLE", userAdjustable: false },
];

// ---------------------------------------------------------------------------
// LLMW.DESCRIPTOR.RENDER.1 (B1c) — `expertise.system` and `template` in
// blocks, replacing the flat `ASSET_DESCRIPTION_SYSTEM_PROMPT` string above,
// which had drifted from `buildAssetDescriptionOnlyPrompt`'s real text (no
// "Rules:" header, flattened bullets, one missing clause, no conditional
// style rule — the defect the ticket names). The block decomposition below
// is mechanically correct by construction: each bullet is either static
// text or a named render form proven equal to the builder byte-for-byte by
// `tests/llmWorkspace/assetDescription.generate.render.test.ts`.
//
// `template` reuses the six render forms shared with `assetNotes.generate`
// and `assetDescription.batch` (`variables/registry.ts`, "Shared
// Asset-context render forms") — one declaration instead of three hard-coded
// assemblies, only the closing line and the system message differ per
// operation.
// ---------------------------------------------------------------------------

export const assetDescriptionGenerateDescriptor: OperationDescriptor = {
  id: "assetDescription.generate",
  name: "Generate Asset Description",

  anchor: { kind: "entity", entity: "asset" },

  context: { variables: ASSET_DESCRIPTION_CONTEXT_VARIABLES },

  expertise: {
    role: "assetSupervisor",
    system: {
      blocks: [
        {
          text: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the visual/production description for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- If the asset already has a description, improve and complete it — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.`,
        },
        { variable: "PROJECT.STYLE", render: "assetDescription.finalRuleLine" },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "assetContext.identityLines" },
      { variable: "ASSET.CORE", render: "assetContext.coreLines" },
      { variable: "ASSET.SEQ_APPEARANCES", render: "assetContext.seqAppearancesLines" },
      { variable: "ASSET.SHOT_APPEARANCES", render: "assetContext.shotAppearancesLines" },
      { variable: "ASSET.REFERENCES", render: "assetContext.referencesLine" },
      { variable: "PROJECT.STYLE", render: "assetContext.worldRulesBlock" },
      { variable: "ASSET.CORE", render: "assetDescription.closingLine" },
    ],
    separator: "\n",
  },

  intent: {},

  // Correction 6 (§4.1), read verbatim from `generateSingleField`
  // (`src/actions/llm/assetDescription.ts`, shared by both single-field
  // actions): `"Invalid request."`, `"LLM is not configured. Go to Settings
  // to set up Ollama."` (same wording as `assetBible.generate`, both in
  // asset-focused action files), and the two-level chain `"Project not
  // found."` / `"Asset not found."` (the latter thrown inside
  // `fetchAssetContextInput`). No `preconditions`: `generateSingleField`
  // runs no pre-call non-empty check. Not proven by a runner-level equality
  // test in this ticket — see `shotPrompt.ts`'s identical note.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", asset: "Asset not found." },
  },

  // Correction 5 (§4.1), read verbatim from `parseSingleFieldDraft`
  // (`src/actions/llm/assetDescription.ts`): strict — exactly one key
  // (`exactKeysOnly: true`, rejects a stray `notes_draft`), non-empty,
  // capped at `SINGLE_FIELD_DRAFT_MAX_LENGTH` (4000). Not proven by a
  // runner-level equality test in this ticket — see `shotPrompt.ts`'s
  // identical note.
  output: {
    kind: "object",
    target: { entity: "asset" },
    fields: [{ type: "string", field: "description", jsonKey: "description_draft", maxLength: 4000 }],
    require: "all",
    exactKeysOnly: true,
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty or invalid draft. Try again.",
    },
  },

  commit: ["updateAssetDescriptionFieldInline"],

  // LLMW.COMMIT.ADVISORY.1 (B10-f). This writes `description`, one of the
  // two fields `assetBible.generate` reads to keep the Asset Bible in sync
  // (`registry.ts:723-735`) — approving this leaves that bible stale.
  commitAdvisory: "The Asset Bible is written from Description and Notes — regenerate it to keep it in sync.",

  executor: "inProcess",
};
