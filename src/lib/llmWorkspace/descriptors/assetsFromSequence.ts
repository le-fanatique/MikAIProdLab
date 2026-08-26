// ---------------------------------------------------------------------------
// descriptors/assetsFromSequence.ts — ASSET.EXTRACT.SEQ.1
//
// Descriptor for `assets.fromSequence` — the sequence-anchored, incremental
// sibling of `assets.fromProject` (`descriptors/assetsFromProject.ts`), built
// because an extraction run on the Project scope had no way to see a
// decor the author actually needed: `SEQUENCES:` was truncated to 2000
// characters, and on his largest project that block is 5363 characters, the
// missing decor sitting at position 5293. §1 of the ticket.
//
// Two operations, not one with a flag (§4 of the ticket): the context differs
// in kind, not only in volume. `assets.fromProject` is wide and shotless —
// story, outline, every sequence — for the start of a project, before shot
// detail exists. `assets.fromSequence` is narrow, deep, and incremental: one
// Sequence, its own Shots, and the Project's existing assets, so the model
// proposes only what is missing. No `includeShots` here: this operation is
// always shot-scoped by its own anchor, never by a checkbox.
//
// Follows `assetsFromProjectDescriptor` for everything the anchor does not
// force apart: same extractible asset types, same `output` shape (the JSON
// schema is reused byte-for-byte, `ASSETS_FROM_PROJECT_JSON_SCHEMA`), same
// commit action (`createSelectedAssets`, which only ever needed a
// `projectId`). No truncation anywhere in this descriptor's own blocks — the
// volume is bounded by construction (one Sequence and its own Shots), not by
// a silent character slice.
//
// Unlike `assets.fromProject` (itself migrated from a pre-existing action,
// `generateAssetCandidatesDraft`), there is no prior action or builder this
// descriptor reproduces: it is new. Its wording is written directly, on the
// model of `assetsFromProject`'s own system message, rather than read
// verbatim off a source that does not exist.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

const ASSET_TYPE_VALUES = ["character", "environment", "prop", "vehicle", "crowd", "other"] as const;

export const assetsFromSequenceDescriptor: OperationDescriptor = {
  id: "assets.fromSequence",
  name: "Extract Assets from Sequence",

  anchor: { kind: "entity", entity: "sequence" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SEQ.SHOT_TARGETS", userAdjustable: false },
      { id: "PROJECT.ASSETS", userAdjustable: false },
    ],
  },

  expertise: {
    role: "assetsFromSequenceSupervisor",
    system: {
      blocks: [
        {
          variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT"],
          parameters: ["assetTypes"],
          render: "assetsFromSequence.systemBody",
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      // Block 1 — project background line(s): name, and pitch/short-story
      // when present. Reuses `assetsFromProject`'s own render form verbatim
      // — the anchor narrows the *sequence* context below, not the project
      // identity line, which is identical in both operations. Deliberately
      // NOT the full outline/story block `assetsFromProject` also renders:
      // this operation is meant to stay narrow (§4b of the ticket,
      // "étroite, profonde"), and a project's whole outline is exactly the
      // wide context the sequence-scoped operation exists to avoid.
      { variable: "PROJECT.IDENTITY", render: "assetsFromProject.backgroundLines" },
      // Block 2 — the anchored sequence's own narrative fields, always
      // non-empty (a Sequence always has a title).
      { variable: "SEQ.CONTEXT", render: "assetsFromSequence.sequenceBlock" },
      // Block 3 — the sequence's own shots, empty when it has none yet. Not
      // gated by a parameter, unlike `assetsFromProject`'s own removed shots
      // block: always shot-scoped by this descriptor's anchor.
      { variable: "SEQ.SHOT_TARGETS", render: "assetsFromSequence.shotsBlock" },
      // Block 4 — existing project assets, empty when the Project has none.
      // Reuses `assetsFromProject`'s own render form verbatim: same data
      // (`PROJECT.ASSETS`), same formatting — what changes with the anchor
      // is which Sequence's Shots sit above it, not how existing assets are
      // listed.
      { variable: "PROJECT.ASSETS", render: "assetsFromProject.existingAssetsBlock" },
      // Block 5 — always non-empty: the closing instruction line, restating
      // the incremental rule.
      { parameter: "assetTypes", render: "assetsFromSequence.finalInstructionLine" },
    ],
    separator: "\n\n",
  },

  intent: {
    parameters: [
      {
        id: "assetTypes",
        type: "multiEnum",
        label: "Asset types to extract",
        values: ASSET_TYPE_VALUES,
        default: ["character", "environment", "prop"],
      },
    ],
  },

  // No prior action to reproduce verbatim (this operation is new) — wording
  // matched to `assetsFromProject`'s / `shotsFromSequence`'s own refusal
  // messages for the same situations, for consistency across the workspace.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", sequence: "Sequence not found." },
  },

  preconditions: [
    { refs: [{ parameter: "assetTypes" }], require: "all", message: "Select at least one asset type." },
  ],

  // Identical shape to `assetsFromProjectDescriptor.output` — "même forme de
  // sortie", §4b of the ticket.
  output: {
    kind: "list",
    arrayKey: "assets",
    item: {
      fields: [
        { type: "string", field: "name", jsonKey: "name", truncateTo: 200 },
        { type: "enum", field: "assetType", jsonKey: "assetType", jsonKeyFallback: "asset_type", values: [...ASSET_TYPE_VALUES], default: "other" },
        { type: "string", field: "description", jsonKey: "description", truncateTo: 500 },
        { type: "string", field: "notes", jsonKey: "notes", truncateTo: 500 },
        { type: "enum", field: "sourceLevel", jsonKey: "sourceLevel", jsonKeyFallback: "source_level", values: ["outline", "sequence", "shot", "story"], default: "outline" },
        { type: "string", field: "sourceExcerpt", jsonKey: "sourceExcerpt", jsonKeyFallback: "source_excerpt", truncateTo: 200 },
        { type: "string", field: "duplicateWarning", jsonKey: "duplicateWarning", jsonKeyFallback: "duplicate_warning", truncateTo: 200 },
      ],
      validity: { fields: ["name"], require: "all" },
    },
    maxItems: 20,
    selection: { formDataKey: "selectedJson" },
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      notArray: "The model did not return an assets array. Try again.",
      empty: "The model returned no valid assets. Try again.",
    },
  },

  // Reuses `assetsFromProject`'s own postResponse form: type-filtering a
  // list of assets against a requested `assetTypes` set has nothing anchor-
  // specific about it.
  postResponse: {
    form: "assetsFromProject.filterByType",
    variables: [],
    parameters: ["assetTypes"],
  },

  // `createSelectedAssets` only ever reads `projectId` and `selectedJson`
  // (`src/actions/llm/assetExtraction.ts`) — no sequence-specific write, so
  // the same commit action serves both operations unchanged.
  commit: ["createSelectedAssets"],

  executor: "inProcess",
};
