// ---------------------------------------------------------------------------
// descriptors/assetDescriptionBatch.ts — LLMW.DESCRIPTOR.FORMAT.1b (B1b-2)
//
// Descriptor for `assetDescription.batch`, matching
// `generateBatchAssetDescriptionDrafts`
// (`src/actions/llm/assetDescription.ts`) and its builder
// (`src/lib/prompts/asset-description-from-context.ts`,
// `buildAssetDescriptionFromContextPrompt` — the combined
// Description+Notes prompt, not either single-field one).
//
// `anchor.kind === "entitySet"` (§4.1 correction 3) because
// `generateBatchAssetDescriptionDrafts` anchors on a bounded set of Assets
// read from `assetIds`, refused beyond `BATCH_LIMIT` — never on one Asset.
// `maxSize` below is authored as the same value the action's own
// `BATCH_LIMIT` constant currently holds (10); `BATCH_LIMIT` itself is not
// exported by that action file, so this ticket does not import it — the
// proof test instead drives the real action past its own limit and reads
// the refusal count back out of the actual error message, rather than
// re-declaring a number here and trusting it stays in sync by hand.
//
// Same anchor context as `assetDescription.generate` / `assetNotes.generate`
// — one call to `fetchAssetContextInput` per Asset in the batch, no
// difference in *which* variables are read. `intent: {}`: the batch action
// takes no free text, no assist mode, no runtime parameter; it always
// produces both Description and Notes for every selected Asset.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { ASSET_DESCRIPTION_CONTEXT_VARIABLES } from "./assetDescription";

const ASSET_DESCRIPTION_BATCH_MAX_SIZE = 10;

// ---------------------------------------------------------------------------
// LLMW.DESCRIPTOR.RENDER.1 (B1c) — `expertise.system` and `template` in
// blocks, replacing the flat `ASSET_DESCRIPTION_BATCH_SYSTEM_PROMPT` string
// above, which had drifted from `buildAssetDescriptionFromContextPrompt`'s
// real text the same way `assetDescription.generate`'s did (no "Rules:"
// header, flattened bullets, no conditional style rule) — a second instance
// of the divergence the ticket names, found while decomposing this
// descriptor, not spotted by inspection beforehand.
// ---------------------------------------------------------------------------

export const assetDescriptionBatchDescriptor: OperationDescriptor = {
  id: "assetDescription.batch",
  name: "Generate Asset Descriptions (Batch)",

  anchor: { kind: "entitySet", entity: "asset", maxSize: ASSET_DESCRIPTION_BATCH_MAX_SIZE },

  context: { variables: ASSET_DESCRIPTION_CONTEXT_VARIABLES },

  expertise: {
    role: "assetSupervisor",
    system: {
      blocks: [
        {
          text: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the description and notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has a description or notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.`,
        },
        { variable: "PROJECT.STYLE", render: "assetDescriptionBatch.finalRuleLine" },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>", "notes_draft": "<narrative role, usage context, design constraints>" }
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
      { variable: "ASSET.CORE", render: "assetDescriptionBatch.closingLine" },
    ],
    separator: "\n",
  },

  intent: {},

  output: { target: { entity: "asset" }, fields: ["description", "notes"] },

  commit: ["applyBatchAssetDescriptionDraftsInline"],

  executor: "inProcess",
};
