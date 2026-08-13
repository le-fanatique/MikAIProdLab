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

const ASSET_NOTES_SYSTEM_PROMPT = `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the notes for a specific asset.
Use only the provided context. Do not invent story facts not present in the input.
notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
If the asset already has notes, improve and complete them — do not discard useful existing content.
Do not write a visual/production description — that belongs to Description, which is not requested here.
Always respond with a valid JSON object matching exactly this schema:
{ "notes_draft": "<narrative role, usage context, design constraints>" }
No markdown. No explanation. Only the JSON object.`;

export const assetNotesGenerateDescriptor: OperationDescriptor = {
  id: "assetNotes.generate",
  name: "Generate Asset Notes",

  anchor: { kind: "entity", entity: "asset" },

  context: { variables: ASSET_DESCRIPTION_CONTEXT_VARIABLES },

  expertise: {
    role: "assetSupervisor",
    systemPrompt: ASSET_NOTES_SYSTEM_PROMPT,
    knowledge: [],
  },

  intent: {},

  output: { target: { entity: "asset" }, fields: ["notes"] },

  commit: ["updateAssetDescriptionFieldInline"],

  executor: "inProcess",
};
