// ---------------------------------------------------------------------------
// descriptors/shotLightingDirected.ts — LLMW.LIGHTING.DIRECTED.1 (B16c),
// closing B16
//
// `shot.lightingDirected` — §5.9's third way of filling the lighting field
// (`docs/LLM_WORKSPACE_PRODUCT_VISION.md`), at the Shot level: "by
// director's note ... not a regeneration, an *adjustment of what is already
// there*." Mechanically the same shape UC2's directed retake already
// delivered (`shot.retakeDirected`, B9b) — `intent.freeText` over an
// operation that reads the current value as one of its own variables — but
// narrowed to the one field this operation touches. §5.9 says it directly:
// "No new primitive."
//
// Impact UC: none. Neither UC1, UC2 nor UC3 is touched, constrained, or
// brought closer — but the mechanic is exactly UC2's, applied to one field.
//
// No adapter exists for this operation — it lives at the bench only, so
// there is no verbatim source text to carry for `invalidRequest`, the same
// "an absent message is honest, an invented one is not" rule
// `narrativePrompt.compose` / `lighting.fromImage` already follow.
//
// `preconditions`: `{ anchorField: "lighting" }` is the one `PreconditionRef`
// variant the runner can evaluate correctly here — `SHOT.LIGHTING` resolves
// to a plain `{ lighting: string | null }` (`variables/registry.ts`), which
// `mergeAnchorFields` folds into the anchor-field map unconditionally, so
// `isAnchorFieldNonEmpty("lighting")` reads exactly the field being adjusted.
// The `variable` variant does not apply: it requires an array-shaped
// resolved value (`isVariableNonEmpty`, `runner.ts`), and `SHOT.LIGHTING`
// never resolves to one — using it would throw at runtime, not merely
// evaluate incorrectly. See `sequenceLightingDirected.ts`'s own header for
// why its sibling variable, `SEQ.LIGHTING`, has no correct `PreconditionRef`
// form at all.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { SHOT_LIGHTING_DIRECTED_SYSTEM_INTRO, SHOT_LIGHTING_DIRECTED_SYSTEM_RULES } from "../variables/registry";

export const shotLightingDirectedDescriptor: OperationDescriptor = {
  id: "shot.lightingDirected",
  name: "Adjust Shot Lighting (Directed)",

  anchor: { kind: "entity", entity: "shot" },

  // The one ingredient §5.9 names: "an operation that reads the current
  // lighting value as one of its variables." No more — this is an
  // adjustment of one field, not a retake of the whole Shot.
  context: {
    variables: [{ id: "SHOT.LIGHTING", userAdjustable: false }],
  },

  expertise: {
    role: "shotLightingSupervisor",
    system: {
      blocks: [{ text: SHOT_LIGHTING_DIRECTED_SYSTEM_INTRO }, { text: SHOT_LIGHTING_DIRECTED_SYSTEM_RULES }],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "SHOT.LIGHTING", render: "shotLightingDirected.currentLine" },
      { freeText: true, render: "shotLightingDirected.freeTextDirective" },
      { text: "\nWrite the updated lighting description for this Shot." },
    ],
    separator: "\n",
  },

  intent: {
    // §5.9's whole request is one free-text consigne, on `shot.retakeDirected`'s
    // own model — no mode, no parameter.
    freeText: { label: "Director's note" },
  },

  messages: {
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      sequence: "Sequence not found.",
      shot: "Shot not found.",
    },
  },

  // "Sans éclairage courant, il n'y a rien à ajuster" (the ticket's own
  // words) — see the header comment for why `anchorField: "lighting"` is the
  // one correctly-evaluable form.
  preconditions: [
    {
      refs: [{ anchorField: "lighting" }],
      require: "all",
      message: "This Shot has no lighting yet — there is nothing to adjust.",
    },
  ],

  output: {
    kind: "text",
    target: { entity: "shot" },
    field: "lighting",
    errors: {
      empty: "The model returned an empty lighting description. Try again.",
    },
  },

  commit: ["updateShotLighting"],

  executor: "inProcess",
};
