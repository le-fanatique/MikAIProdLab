// ---------------------------------------------------------------------------
// descriptors/assetPromptCard.ts — ASSET.PROMPTCARD.2
//
// `asset.promptCard` — the assist that proposes the Prompt Card
// (`docs/SHOT_PROMPT_SD25_AUDIT.md` §9, adjustment #4): the approved,
// engine-facing translation of the Asset Bible, 3 to 5 anchors, verbatim at
// composition (`storyboardShot.ts:161`, ASSET.PROMPTCARD.1). Same jar life
// cycle as `narrativePrompt`: an assist proposes, the author approves, it is
// stored, and composition never sees a model again.
//
// `asset.retakeDirected` (B10) and `lighting.fromImage` (B16b) are the two
// closest neighbours (§3 of the ticket) — this descriptor follows their
// shape rather than inventing one: `asset` anchor, `intent.freeText`
// optional exactly like `asset.retakeDirected`'s "Director's note",
// `output.kind: "object"` (one JSON field, like `asset.retakeDirected`,
// not `"text"` like `lighting.fromImage` — this operation asks for a
// specific short field, not a prose description of pixels).
//
// Unlike `asset.retakeDirected`, the free-text note here is not the whole
// point of the operation (a retake without direction is a random
// regeneration; a Prompt Card without a note is just the Bible's own
// translation) — so `intent.freeText` is genuinely optional input, never a
// precondition for running the operation. `AssetPromptCardPanel`'s own
// trigger reflects this: it is enabled whenever the LLM is configured, note
// or no note.
//
// Context: `ASSET.CORE` (Name, Type, Description) and `ASSET.BIBLE`
// (Visual Identity, Forbidden Variations) — exactly the five ingredients
// §3 of the ticket names, no more. Both variables already exist
// (`variables/registry.ts`); only their render forms are new
// (`assetPromptCard.coreLines`, `assetPromptCard.bibleLines`), narrower than
// the ones `assetDescription.generate`/`asset.retakeDirected` already use,
// because Notes and Usage Rules are not part of what this operation reads.
//
// The four rules of §3 of the ticket are written into the system prompt
// verbatim as its core instruction, not left to the model's own judgment:
// (1) three to five anchors, one short sentence or list, never a paragraph;
// (2) the invariant, never a state — the trap named by the ticket itself,
// Azelle's own Bible carrying "Her posture shifts from a heavy, exhausted
// slouch to a rigid, focused stance", which is a shot's action, not the
// character's identity; (3) absorb what Forbidden Variations defends at the
// negative into a positive statement, and never name the forbidden thing
// (`docs/SHOT_PROMPT_SD25_AUDIT.md` §9's own worked example: "scuffed,
// utilitarian, heavily worn" covers three prohibitions without ever saying
// "bright", "clean" or "warm"); (4) observable, physical traits, never a
// mood/genre label such as "gritty" or "lived-in" (the same rule
// `sd25-pe`'s skill holds for Assets). Written to hold on a prop or an
// environment as much as on a character — no wording below is
// character-specific.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const assetPromptCardDescriptor: OperationDescriptor = {
  id: "asset.promptCard",
  name: "Propose Prompt Card",

  anchor: { kind: "entity", entity: "asset" },

  context: {
    variables: [
      { id: "ASSET.CORE", userAdjustable: false },
      { id: "ASSET.BIBLE", userAdjustable: false },
    ],
  },

  expertise: {
    role: "assetPromptCardAssistant",
    system: {
      blocks: [
        {
          text: `You are a prompt engineer preparing a short, engine-facing visual description of a production asset — a character, a prop, or an environment — for use inside an AI image or video generation prompt.

Rules:
- Use only the provided context. Do not invent visual details not present in the input.
- Write 3 to 5 anchors: physical traits distinctive enough to recognize this asset. One short sentence, or a short comma-separated list. Never a paragraph — the whole card must read in a few seconds.
- Describe only the invariant: what stays true about this asset in every shot it appears in. Never a pose, an action, an emotion, or a state that changes from one moment to the next — if the source text describes a shift or a change (e.g. "posture shifts from a slouch to a rigid stance"), that belongs to a shot's own action, not to this card, and must be left out entirely.
- Never name a Forbidden Variation, not even to deny it — naming the forbidden thing puts it back in the prompt. State its positive opposite instead: describe what the asset IS, never what it is NOT.
- Use observable, physical traits — material, texture, shape, color, wear, build — never a mood word or a genre label ("gritty", "lived-in", "survivalist", "epic") that names an impression rather than something a camera could actually see.
- Write in English.`,
        },
        { freeText: true, render: "assetPromptCard.directorRuleLine" },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "promptCard": "<3 to 5 anchors, one short sentence or a short list>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "ASSET.CORE", render: "assetPromptCard.coreLines" },
      { variable: "ASSET.BIBLE", render: "assetPromptCard.bibleLines" },
      { freeText: true, render: "assetPromptCard.freeTextDirective" },
      { text: "\nPropose a Prompt Card for this Asset." },
    ],
    separator: "\n",
  },

  intent: {
    // Optional — see the header. Not required to run the operation, unlike
    // `asset.retakeDirected`'s own freeText, which IS the operation.
    freeText: { label: "Director's note" },
  },

  // Copied verbatim from `assetRetakeDirected`/`assetDescription.generate`
  // (both asset-anchored, no adapter to transcribe from) — the same
  // discipline ASSET.PROMPTCARD.2's own neighbours followed.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", asset: "Asset not found." },
  },

  output: {
    kind: "object",
    target: { entity: "asset" },
    // `maxLength: 4000` — the same generic ceiling every asset text field
    // this workspace writes uses (`assetDescription.generate`,
    // `asset.retakeDirected`); the card's own brevity is enforced by the
    // consigne above, not by this bound, which exists only as a hard safety
    // ceiling against a runaway response.
    fields: [{ type: "string", field: "promptCard", jsonKey: "promptCard", maxLength: 4000 }],
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty or invalid draft. Try again.",
    },
  },

  commit: ["updateAssetPromptCardInline"],

  executor: "inProcess",
};
