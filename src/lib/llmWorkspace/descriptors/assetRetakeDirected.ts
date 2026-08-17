// ---------------------------------------------------------------------------
// descriptors/assetRetakeDirected.ts — LLMW.UC3.ASSET_RETAKE.1 (B10)
//
// `asset.retakeDirected` — the descriptor that delivers UC3 (§4 of
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md`): the user judges a character
// design and asks for an adjustment in plain language ("this female
// character reads too masculine — soften the silhouette and the jawline").
//
// Same situation as `shot.retakeDirected` (B9b, the model for this file):
// no flat-JSON action to migrate from, no builder to reproduce
// byte-for-byte. Every block below is authored for this ticket (§3 of the
// ticket: "the prompt is written, not transcribed"). No equality oracle
// exists; the proof is unit-level assembly plus the human-readable resolved
// prompt in `.agents/executor_report.md`.
//
// Decided by the user 2026-08-17 (§0 of the ticket): the sole output is
// `description` (`src/db/schema/assets.ts:13-16`, the field that is
// literally used as the asset image generation prompt). `visualIdentity`,
// `usageRules`, `forbiddenVariations` — the Asset Bible — are input context
// only, never written by this operation. Consequence: `updateAssetDescriptionFieldInline`
// writes exactly one column, so unlike `shot.retakeDirected` there is no
// preservation trap here and none is introduced.
//
// §2 of the ticket: `ASSET.SHOT_APPEARANCES` gets its own render form here
// (`assetRetake.shotAppearancesLines`, `variables/registry.ts`) projecting
// only Description and Action Pitch plus a Shot identifier — never
// `cameraPitch` — rather than reusing `assetContext.shotAppearancesLines`,
// which projects five fields including it. This is the point §4 UC3 exists
// to prove: the variable library can project a chosen field subset across a
// relation, not just repeat one fixed shape.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const assetRetakeDirectedDescriptor: OperationDescriptor = {
  id: "asset.retakeDirected",
  name: "Retake Asset Description (Directed)",

  anchor: { kind: "entity", entity: "asset" },

  // Three variables, each justified against UC3's own text (§4 of the vision
  // doc: "the Asset's visual identity, plus the Shots where the character
  // appears, and from those Shots only Description and Action Pitch"):
  // ASSET.CORE for the Asset's own current description (what is being
  // revised), ASSET.BIBLE for the visual identity the new description must
  // stay consistent with, ASSET.SHOT_APPEARANCES for the Shots the
  // character is already shown in.
  context: {
    variables: [
      { id: "ASSET.CORE", userAdjustable: false },
      { id: "ASSET.BIBLE", userAdjustable: false },
      { id: "ASSET.SHOT_APPEARANCES", userAdjustable: false },
    ],
  },

  expertise: {
    role: "assetRetakeSupervisor",
    system: {
      blocks: [
        {
          text: "You are an art director and character designer for a film or animation production, helping the team retake a character or asset design.",
        },
        {
          text: `Rules:
- Use only the provided context. Do not invent story facts not present in the input.`,
        },
        // Corrective manche B10, defect 1: this rule only makes sense when a
        // direction actually exists in the prompt — with an empty note it
        // used to order the model to respond to a "direction below" that
        // was not there. `{freeText, render}` disappears with the note, the
        // same fix `shot.retakeDirected` already applied to its `template`'s
        // closing line (§4.1 correction 4). With a note, this block's own
        // text plus the surrounding "\n" separator reproduces the previous
        // unconditional line exactly, so the `system` with a note is
        // unchanged.
        { freeText: true, render: "assetRetake.directorRuleLine" },
        {
          text: `- The description you write must be a complete, self-contained visual and production description of the asset — suitable on its own as an AI image generation prompt. It is not a diff, not a comment on what changed, not an explanation of the adjustment.
- Carry forward everything about the current design that the direction does not ask you to change.
- Stay consistent with the Asset Bible and with what the Shots already show of this asset, unless the direction explicitly asks to depart from them.
- Write in English.`,
        },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "description": "<complete, self-contained visual and production description>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "ASSET.CORE", render: "assetContext.coreLines" },
      { variable: "ASSET.BIBLE", render: "assetRetake.bibleLines" },
      { variable: "ASSET.SHOT_APPEARANCES", render: "assetRetake.shotAppearancesLines" },
      { freeText: true, render: "assetRetake.freeTextDirective" },
      // Neutral on purpose (the piège B9b's supervisor review caught, §4
      // point 4 of the ticket): this block never refers to the freeText
      // block's presence, since that block disappears entirely when the
      // note is blank. When a note exists, its own "Director's direction:
      // ..." line already imposes it.
      { text: "\nPropose an updated description for this Asset." },
    ],
    separator: "\n",
  },

  intent: {
    // §4 UC3's whole request is one free-text consigne — no mode, no
    // parameter, matching `shot.retakeDirected`'s own `intent` shape.
    freeText: { label: "Director's note" },
  },

  // Copied verbatim from `assetDescription.generate` / `assetNotes.generate`
  // (§1 of the ticket: "les copier depuis un descripteur asset existant
  // plutôt que d'en inventer") — both anchor on `asset` and share this exact
  // wording.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", asset: "Asset not found." },
  },

  output: {
    kind: "object",
    target: { entity: "asset" },
    // `maxLength: 4000` read verbatim off `assetDescription.generate`'s own
    // `description` field (`descriptors/assetDescription.ts`) — the same
    // bound `SINGLE_FIELD_DRAFT_MAX_LENGTH` that
    // `updateAssetDescriptionFieldInline`'s only other production caller
    // already respects for this column.
    fields: [{ type: "string", field: "description", jsonKey: "description", maxLength: 4000 }],
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty or invalid draft. Try again.",
    },
  },

  commit: ["updateAssetDescriptionFieldInline"],

  // LLMW.COMMIT.ADVISORY.1 (B10-f). This writes `description`, one of the
  // two fields `assetBible.generate` reads to keep the Asset Bible in sync
  // (`registry.ts:723-735`) — approving this leaves that bible stale.
  commitAdvisory: "The Asset Bible is written from Description and Notes — regenerate it to keep it in sync.",

  executor: "inProcess",
};
