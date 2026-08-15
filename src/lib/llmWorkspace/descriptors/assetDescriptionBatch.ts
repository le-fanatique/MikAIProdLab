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

  // Correction 6 (§4.1), read verbatim from `generateBatchAssetDescriptionDrafts`
  // (`src/actions/llm/assetDescription.ts`): `"Invalid request."` on a
  // malformed `projectId`, and `"LLM is not configured. Go to Settings to
  // set up Ollama."` (same wording as the other two Asset-context
  // operations). `messages.invalidRequest` is a partial fit here, not a full
  // one: the action also refuses with `"No assets selected."` and
  // `` `Select up to ${BATCH_LIMIT} assets at a time.` `` for the
  // `assetIds` list, neither representable by one `invalidRequest: string`
  // — the same `entitySet`-anchor topology gap already named in `output`'s
  // comment below (an array-wrapped batch this format was not built to
  // describe). `chainNotFound.project` is the one level this action checks
  // before entering its per-Asset loop; per-Asset "not found" errors are
  // collected into `BatchAssetDraftError[]`, a different mechanism entirely,
  // out of scope. Not proven by a runner-level equality test in this
  // ticket.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // Correction 5 (§4.1), read verbatim from `parseDraft`
  // (`src/actions/llm/assetDescription.ts`): two keys, both optional, at
  // least one non-empty (`require: "any"`) — unlike the strict single-field
  // parsers, this one applies no `exactKeysOnly` and no length cap. Not
  // proven by a runner-level equality test in this ticket — see
  // `shotPrompt.ts`'s identical note. Also unmigrated regardless of this
  // ticket's output correction: `generateBatchAssetDescriptionDrafts`
  // returns one `{descriptionDraft, notesDraft}` per Asset in the batch, an
  // array-wrapped list this `output.target` (single entity) cannot describe
  // — the batch action is one of §9's "4 return array-wrapped lists",
  // deferred until the proposal component gets a list mode (§10.1).
  output: {
    kind: "object",
    target: { entity: "asset" },
    fields: [
      { field: "description", jsonKey: "description_draft" },
      { field: "notes", jsonKey: "notes_draft" },
    ],
    require: "any",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty draft. Try again.",
    },
  },

  commit: ["applyBatchAssetDescriptionDraftsInline"],

  executor: "inProcess",
};
