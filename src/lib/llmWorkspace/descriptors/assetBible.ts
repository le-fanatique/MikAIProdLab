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
import { MAX_ASSET_BIBLE_FIELD_LENGTH } from "@/lib/prompts/assetBibleDraft";

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

  // Correction 6 (§4.1), read verbatim from `generateAssetBibleDraft`
  // (`src/actions/llm/assetBible.ts`) and `resolveAssetBibleContext`
  // (`src/lib/prompts/assetBibleContext.ts`): `"Invalid request."`,
  // `"LLM is not configured. Go to Settings to set up Ollama."` — a third
  // wording, distinct from both `story.generate`'s and
  // `sequencePrompt.assist`'s — and the two-level chain `"Project not
  // found."` / `"Asset not found."`. Not proven by a runner-level equality
  // test in this ticket — see `shotPrompt.ts`'s identical note.
  //
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", asset: "Asset not found." },
  },

  // `resolveAssetBibleContext` (`src/lib/prompts/assetBibleContext.ts`)
  // refuses with "Add a Description or Notes to this asset before
  // generating an Asset Bible draft." only when *both* `description` and
  // `notes` are empty — an "at least one of two fields" gate. B2b widened
  // `preconditions` from a single `field: FieldRef` to `fields: FieldRef[]`
  // plus `require: "all" | "any"` specifically to express this: two
  // single-field entries would each wrongly refuse whenever *their own*
  // field alone is empty, which is not the real rule (a non-empty
  // `description` with empty `notes` must not be refused).
  preconditions: [
    {
      fields: ["description", "notes"],
      require: "any",
      message: "Add a Description or Notes to this asset before generating an Asset Bible draft.",
    },
  ],

  // Correction 5 (§4.1), read verbatim from `parseAssetBibleDraft`
  // (`src/lib/prompts/assetBibleDraft.ts`): three keys, all optional, at
  // least one non-empty (`require: "any"`). `maxLength` is deliberately
  // omitted here: `parseAssetBibleDraft` silently truncates
  // (`.slice(0, MAX_ASSET_BIBLE_FIELD_LENGTH)`) rather than rejecting an
  // oversized value the way the strict single-field asset parsers do
  // (`description.ts` / `assetNotes.ts`, which reject above 4000) — the
  // `maxLength` field's contract (§4.1) is a rejection bound, distinct from
  // `truncateTo`'s silent-cut one. B3b (LLMW.MIGRATE.FLATJSON.1b) first
  // reproduced this truncation in the adapter; moved here, onto the
  // descriptor itself, so a stored descriptor (§4.2) stays complete and the
  // runner performs it generically (`runner.ts`'s `parseOutput`) rather than
  // an operation-specific branch. Not proven by a runner-level equality test
  // in this ticket — see `shotPrompt.ts`'s identical note.
  output: {
    target: { entity: "asset" },
    fields: [
      { field: "visualIdentity", jsonKey: "visual_identity", truncateTo: MAX_ASSET_BIBLE_FIELD_LENGTH },
      { field: "usageRules", jsonKey: "usage_rules", truncateTo: MAX_ASSET_BIBLE_FIELD_LENGTH },
      { field: "forbiddenVariations", jsonKey: "forbidden_variations", truncateTo: MAX_ASSET_BIBLE_FIELD_LENGTH },
    ],
    require: "any",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty draft. Try again.",
    },
  },

  commit: ["updateAssetDetailsInline"],

  executor: "inProcess",
};
