// ---------------------------------------------------------------------------
// descriptors/assetBible.ts — LLMW.DESCRIPTOR.FORMAT.1b (B1b-2)
//
// Descriptor for `assetBible.generate`, matching `generateAssetBibleDraft`
// (`src/actions/llm/assetBible.ts`) and its builder
// (`src/lib/prompts/asset-bible-from-context.ts`,
// `buildAssetBibleFromContextPrompt`).
//
// `generateAssetBibleDraft(formData)` reads only `projectId` / `assetId` —
// no free text, no assist mode, no runtime parameter, so `intent: {}` is the
// honest value, matching `story.generate`.
//
// The action assembles its builder argument from two sources:
//   - `resolveAssetBibleContext(projectId, assetId)` — Asset name/type plus
//     description/notes (`ASSET.CORE`) and the existing Bible fields
//     (`ASSET.BIBLE`);
//   - `resolveAssetStyleContext(projectId)`, collapsed to `{worldSegment:
//     "", visualSegment: "", rulesSegment: ""}` when Style is `"none"` —
//     exactly `PROJECT.STYLE`'s own resolver shape.
//
// `expertise.systemPrompt` is NOT copied verbatim: like `outline.generate`'s
// builder, `buildAssetBibleFromContextPrompt`'s system message interpolates
// a `styleRule` fragment that depends on whether Style is active at call
// time, so no single static string is "the" system prompt. The text below
// paraphrases the fixed format rules; byte-for-byte reproduction against a
// resolved Style is B2's concern — this ticket's proof is the *resolved
// context*, not the assembled prompt (per §11.2 and the B1b-1 precedent).
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const assetBibleGenerateDescriptor: OperationDescriptor = {
  id: "assetBible.generate",
  name: "Generate Asset Bible",

  anchor: { kind: "entity", entity: "asset" },

  context: {
    variables: [
      { id: "ASSET.CORE", userAdjustable: false },
      { id: "ASSET.BIBLE", userAdjustable: false },
      { id: "PROJECT.STYLE", userAdjustable: false },
    ],
  },

  expertise: {
    role: "assetSupervisor",
    systemPrompt: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the "Asset Bible" — three short, factual guidance fields used to keep this asset visually and behaviorally consistent across AI-assisted image and video generation.
Use only the provided Description and Notes as your source of truth. Do not invent story facts, events, or canon not present in the input.
visual_identity: defining silhouette, colors, materials, proportions, distinguishing visual traits. Max 3 concise sentences. Write in English.
usage_rules: how this asset should behave, be framed, or be used consistently across shots. Max 3 concise sentences. Write in English.
forbidden_variations: colors, props, poses, or traits that must never appear on this asset. Max 3 concise sentences. Write in English.
Always respond with a valid JSON object matching exactly this schema:
{ "visual_identity": "<...>", "usage_rules": "<...>", "forbidden_variations": "<...>" }
No markdown. No explanation. Only the JSON object.`,
    knowledge: [],
  },

  intent: {},

  output: {
    target: { entity: "asset" },
    fields: ["visualIdentity", "usageRules", "forbiddenVariations"],
  },

  commit: ["updateAssetDetailsInline"],

  executor: "inProcess",
};
