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

  output: { target: { entity: "asset" }, fields: ["notes"] },

  commit: ["updateAssetDescriptionFieldInline"],

  executor: "inProcess",
};
