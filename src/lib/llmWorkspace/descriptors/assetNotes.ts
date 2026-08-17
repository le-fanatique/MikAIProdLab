// ---------------------------------------------------------------------------
// descriptors/assetNotes.ts — LLMW.DESCRIPTOR.FORMAT.1b (B1b-2)
//
// Descriptor for `assetNotes.generate`, matching
// `generateAssetNotesOnlyDraft` (`src/actions/llm/assetDescription.ts`) and
// its builder (`src/lib/prompts/asset-description-from-context.ts`,
// `buildAssetNotesOnlyPrompt`).
//
// Same anchor, same `fetchAssetContextInput` call, same six-variable context
// as `assetDescription.generate` — imported from that module rather than
// retyped, which is the proof the ticket asks for: the three Asset
// operations sharing `fetchAssetContextInput` declare the identical
// variable set. Only `expertise.systemPrompt`, `output.fields` and `commit`
// differ, matching `buildAssetNotesOnlyPrompt`'s own divergence from
// `buildAssetDescriptionOnlyPrompt` (Notes instead of Description).
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { ASSET_DESCRIPTION_CONTEXT_VARIABLES } from "./assetDescription";

// ---------------------------------------------------------------------------
// LLMW.DESCRIPTOR.RENDER.1 (B1c) — `expertise.system` and `template` in
// blocks, mirroring `assetDescription.generate`'s decomposition exactly one
// field over (Notes instead of Description). Same six shared render forms
// for `template`; `expertise.system` swaps in the Notes-specific fixed text
// and `assetNotes.finalRuleLine`.
// ---------------------------------------------------------------------------

export const assetNotesGenerateDescriptor: OperationDescriptor = {
  id: "assetNotes.generate",
  name: "Generate Asset Notes",

  anchor: { kind: "entity", entity: "asset" },

  context: { variables: ASSET_DESCRIPTION_CONTEXT_VARIABLES },

  expertise: {
    role: "assetSupervisor",
    system: {
      blocks: [
        {
          text: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.`,
        },
        { variable: "PROJECT.STYLE", render: "assetNotes.finalRuleLine" },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "notes_draft": "<narrative role, usage context, design constraints>" }
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
      { variable: "ASSET.CORE", render: "assetNotes.closingLine" },
    ],
    separator: "\n",
  },

  intent: {},

  // Correction 6 (§4.1) — identical to `assetDescription.generate`'s, same
  // shared `generateSingleField`. See that descriptor's comment for the
  // full rationale, not repeated here.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", asset: "Asset not found." },
  },

  // Correction 5 (§4.1), read verbatim from `parseSingleFieldDraft`
  // (`src/actions/llm/assetDescription.ts`): strict — exactly one key
  // (`exactKeysOnly: true`, rejects a stray `description_draft`), non-empty,
  // capped at `SINGLE_FIELD_DRAFT_MAX_LENGTH` (4000). Not proven by a
  // runner-level equality test in this ticket — see `shotPrompt.ts`'s
  // identical note.
  output: {
    kind: "object",
    target: { entity: "asset" },
    fields: [{ type: "string", field: "notes", jsonKey: "notes_draft", maxLength: 4000 }],
    require: "all",
    exactKeysOnly: true,
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty or invalid draft. Try again.",
    },
  },

  commit: ["updateAssetDescriptionFieldInline"],

  // LLMW.COMMIT.ADVISORY.1 (B10-f). This writes `notes`, one of the two
  // fields `assetBible.generate` reads to keep the Asset Bible in sync
  // (`registry.ts:723-735`) — approving this leaves that bible stale.
  commitAdvisory: "The Asset Bible is written from Description and Notes — regenerate it to keep it in sync.",

  executor: "inProcess",
};
