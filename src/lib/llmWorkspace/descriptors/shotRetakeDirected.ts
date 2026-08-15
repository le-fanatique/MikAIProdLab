// ---------------------------------------------------------------------------
// descriptors/shotRetakeDirected.ts — LLMW.UC2.RETAKE.1 (B9b)
//
// `shot.retakeDirected` — the descriptor that delivers UC2 (§4 of
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md`): "j aime pas ce shot, le cadrage ne
// me va pas, et l action non plus, je voudrais montrer plus d'empatie avec le
// personnage, donc propose moi une autre action et un autre cadrage."
//
// Unlike the eight existing descriptors, this one has no flat-JSON action to
// migrate from — there is no `src/actions/llm/shotRetake.ts` predating this
// ticket, no builder to reproduce byte-for-byte. Every block below is
// authored for this ticket (§3 of the ticket: "the prompt is written, not
// transcribed"). No equality oracle exists; the proof is unit-level assembly
// plus a human-readable resolved prompt in `.agents/executor_report.md`.
//
// §0bis (the user's 2026-08-15 arbitrage): the write side is
// `updateShotNarrativeContext` (`src/actions/shots.ts:132`) — description,
// actionPitch, cameraPitch only. `framing`/`cameraMovement` are read nowhere
// here and never written. `updateShot` is not used.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { SHOT_RETAKE_SYSTEM_INTRO } from "../variables/registry";

export const shotRetakeDirectedDescriptor: OperationDescriptor = {
  id: "shot.retakeDirected",
  name: "Retake Shot (Directed)",

  anchor: { kind: "entity", entity: "shot" },

  // Five variables, each justified against UC2's own text (§4 of the vision
  // doc: "the Shot's own fields, the context of all other Shots, the
  // Sequence, and where useful the story") — see
  // `.agents/executor_report.md` for the per-variable rationale.
  context: {
    variables: [
      { id: "SHOT.CORE", userAdjustable: false },
      { id: "SHOT.CAST", userAdjustable: false },
      { id: "SEQ.SHOTS", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "PROJECT.IDENTITY", userAdjustable: false },
    ],
  },

  expertise: {
    role: "shotRetakeSupervisor",
    system: {
      blocks: [
        { text: SHOT_RETAKE_SYSTEM_INTRO },
        {
          text: `Rules:
- Fill in every field the director's direction below actually concerns. If the direction asks for a new action and a new camera approach, both action_pitch and camera_pitch must carry new values — do not stop at one when the direction names several.
- Leave a field empty only when the direction says nothing about it. An empty string means "unchanged", not "skip this one" — it is not a shortcut for a field the direction does address.
- Do not repeat the current value in a field you are leaving unchanged; return an empty string for it instead.
- Stay grounded in the Shot's own context and the director's direction below — do not invent new characters, locations, or story facts.
- camera_pitch is prose describing the intended camera approach (angle, movement, framing intent) — not the technical Framing/Camera Movement fields, which this operation never touches.
- Write in English.`,
        },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "description": "<updated shot description, or empty string if the direction does not concern this field>", "action_pitch": "<updated action pitch, or empty string if the direction does not concern this field>", "camera_pitch": "<updated camera pitch, or empty string if the direction does not concern this field>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "SHOT.CORE", render: "shotRetake.coreLines" },
      { variable: "SHOT.CAST", render: "shotRetake.castLines" },
      { variables: ["SEQ.SHOTS", "SHOT.CORE"], render: "shotRetake.otherShotsLines" },
      { variable: "SEQ.CONTEXT", render: "shotRetake.sequenceLines" },
      { variable: "PROJECT.IDENTITY", render: "shotRetake.projectLines" },
      { freeText: true, render: "shotRetake.freeTextDirective" },
      // Neutral on purpose (supervisor review, post-B9b): the previous
      // wording said "per the director's direction above", but the
      // `freeText` block right above it disappears entirely when the
      // consigne is blank (§4.1 of B9a's ticket, the format's own
      // contract) — a blank retake produced a closing instruction
      // pointing at a directive that was not in the prompt at all. This
      // block never refers to the freeText block's presence: when a
      // consigne exists, its own "Director's direction: ..." line already
      // imposes it, so the closing line does not need to point at it.
      { text: "\nPropose an updated description, action pitch and/or camera pitch for this shot." },
    ],
    separator: "\n",
  },

  intent: {
    // §0's UC2 quote: "propose moi une autre action et un autre cadrage" is
    // the whole request — one free-text consigne, no mode, no parameter.
    freeText: { label: "Director's note" },
  },

  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      sequence: "Sequence not found.",
      shot: "Shot not found.",
    },
  },

  output: {
    kind: "object",
    target: { entity: "shot" },
    fields: [
      { field: "description", jsonKey: "description" },
      { field: "actionPitch", jsonKey: "action_pitch" },
      { field: "cameraPitch", jsonKey: "camera_pitch" },
    ],
    // §4.3 of the ticket: the model may legitimately leave a field empty —
    // the retake only has to touch what the director actually complained
    // about. `require: "any"` is the piège this ticket's commit adapter
    // (`actions/proposalCommit.ts`, `buildShotRetakeCommitArgs`) exists to
    // handle correctly: an empty field here must be preserved from the
    // existing row, never written as blank.
    require: "any",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned no changes. Try again with more direction.",
    },
  },

  commit: ["updateShotNarrativeContext"],

  executor: "inProcess",
};
