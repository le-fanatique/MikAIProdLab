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

const ASSET_DESCRIPTION_SYSTEM_PROMPT = `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the visual/production description for a specific asset.
Use only the provided context. Do not invent story facts not present in the input.
description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
If the asset already has a description, improve and complete it — do not discard useful existing content.
Do not write narrative role, usage context or design constraints — that belongs to Notes, which is not requested here.
Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>" }
No markdown. No explanation. Only the JSON object.`;

export const assetDescriptionGenerateDescriptor: OperationDescriptor = {
  id: "assetDescription.generate",
  name: "Generate Asset Description",

  anchor: { kind: "entity", entity: "asset" },

  context: { variables: ASSET_DESCRIPTION_CONTEXT_VARIABLES },

  expertise: {
    role: "assetSupervisor",
    systemPrompt: ASSET_DESCRIPTION_SYSTEM_PROMPT,
    knowledge: [],
  },

  intent: {},

  output: { target: { entity: "asset" }, fields: ["description"] },

  commit: ["updateAssetDescriptionFieldInline"],

  executor: "inProcess",
};
