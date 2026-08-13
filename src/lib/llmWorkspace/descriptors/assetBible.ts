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
// `expertise.system` now interpolates the conditional style rule via a
// `{variable: "PROJECT.STYLE", render}` block instead of the paraphrase
// B1b-2 shipped — LLMW.DESCRIPTOR.RENDER.1 (B1c) closes that gap the same
// way it closed `assetDescription.generate`'s: mechanically, proven by
// `tests/llmWorkspace/assetBible.generate.render.test.ts` rather than by
// inspection.
//
// `template` mirrors `buildAssetBibleFromContextPrompt`'s own line groups —
// distinct from the Asset-description family's `buildContextLines` (no
// shared function): `ASSET.CORE`'s Bible-specific render form (no leading
// `"\n"`, "Description:"/"Notes:" labels, always-present "(none)"
// fallback), `ASSET.BIBLE`'s existing-values block, and `PROJECT.STYLE`'s
// three-segment (World + Visual + Rules) block.
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
    system: {
      blocks: [
        {
          text: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the "Asset Bible" — three short, factual guidance fields used to keep this asset visually and behaviorally consistent across AI-assisted image and video generation.

Rules:
- Use only the provided Description and Notes as your source of truth. Do not invent story facts, events, or canon not present in the input.
- If an existing Asset Bible value is provided, treat it as context to improve or complete — never discard useful existing content without reason, and never contradict it without a clear basis in Description/Notes.
- visual_identity: defining silhouette, colors, materials, proportions, distinguishing visual traits. Max 3 concise sentences. Write in English.
- usage_rules: how this asset should behave, be framed, or be used consistently across shots (performance, camera, staging constraints). Max 3 concise sentences. Write in English.
- forbidden_variations: colors, props, poses, or traits that must never appear on this asset, to preserve consistency. Max 3 concise sentences. Write in English.`,
        },
        { variable: "PROJECT.STYLE", render: "assetBible.finalRuleLine" },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "visual_identity": "<defining silhouette, colors, materials, proportions>", "usage_rules": "<how this asset should behave or be framed/used across shots>", "forbidden_variations": "<colors, props, poses or traits that must never appear>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "ASSET.CORE", render: "assetBible.coreLines" },
      { variable: "ASSET.BIBLE", render: "assetBible.existingBibleLines" },
      { variable: "PROJECT.STYLE", render: "assetBible.styleBlock" },
      { variable: "ASSET.CORE", render: "assetBible.closingLine" },
    ],
    separator: "\n",
  },

  intent: {},

  output: {
    target: { entity: "asset" },
    fields: ["visualIdentity", "usageRules", "forbiddenVariations"],
  },

  commit: ["updateAssetDetailsInline"],

  executor: "inProcess",
};
