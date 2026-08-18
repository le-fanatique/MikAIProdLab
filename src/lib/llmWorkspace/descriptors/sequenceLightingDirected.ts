// ---------------------------------------------------------------------------
// descriptors/sequenceLightingDirected.ts — LLMW.LIGHTING.DIRECTED.1 (B16c),
// closing B16
//
// `sequence.lightingDirected` — §5.9's third way of filling the lighting
// field (`docs/LLM_WORKSPACE_PRODUCT_VISION.md`), at the Sequence level. Same
// mechanic as `shotLightingDirected.ts` (its own header explains the shape
// in full) — this file only records what differs: the anchor, the variable,
// the write action, and the `preconditions` gap explained below.
//
// Impact UC: none. Same as `shot.lightingDirected` — the mechanic is UC2's,
// applied to one field; no UC is touched, constrained, or brought closer.
//
// No adapter exists for this operation either — `messages.invalidRequest` is
// left undeclared for the same reason as `shot.lightingDirected`.
//
// `preconditions`: **deliberately none, and this is a real gap, not an
// oversight** — see `.agents/executor_report.md` for the full reasoning.
// `SEQ.LIGHTING` (B15a) resolves to a discriminated union carrying its own
// précédence rule (`SeqLightingData`, `variables/registry.ts`):
// `{ source: "own", lighting: string }` | `{ source: "environment",
// environments: [...] }` | `{ source: "none" }`. Neither closed
// `PreconditionRef` variant (`types.ts`) evaluates it correctly:
//   - `{ anchorField: "lighting" }` reads the flat "lighting" key
//     `mergeAnchorFields` folds in — present (and correctly non-empty) only
//     when `source === "own"`; a Sequence whose lighting is entirely
//     inherited from an environment Asset (`source === "environment"`,
//     genuinely the case this operation exists to adjust per §5.9's own
//     environment example) has NO "lighting" key at all in the merged map,
//     so this ref would wrongly refuse a run that has real data to adjust;
//   - `{ variable: "SEQ.LIGHTING" }` requires the resolved value to be an
//     array (`isVariableNonEmpty`, `runner.ts`) — `SEQ.LIGHTING` is never
//     array-shaped, so this ref does not merely evaluate wrong, it throws.
// The ticket's own instruction ("si aucune ne convient, dis-le dans ton
// rapport plutôt que d'en inventer une") is followed literally: no
// `preconditions` entry is declared. The practical consequence — a Sequence
// with `source: "none"` reaches the model — is contained instead at the
// render/system-prompt level: `renderSequenceLightingDirectedCurrentLine`
// states plainly that nothing is recorded, and the shared system rules tell
// the model to return the current value unchanged absent a note, which composes
// with an explicit "(none recorded ...)" current line to produce, at worst,
// that same placeholder text echoed back — caught by `output.errors.empty`
// only if the model instead answers with nothing, not guaranteed for the
// echoed-placeholder case. This is a known, reported limitation, not a
// silent one.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import {
  SEQUENCE_LIGHTING_DIRECTED_SYSTEM_INTRO,
  SEQUENCE_LIGHTING_DIRECTED_SYSTEM_RULES,
} from "../variables/registry";

export const sequenceLightingDirectedDescriptor: OperationDescriptor = {
  id: "sequence.lightingDirected",
  name: "Adjust Sequence Lighting (Directed)",

  anchor: { kind: "entity", entity: "sequence" },

  // `SEQ.LIGHTING` alone — the one ingredient §5.9 names ("reads the current
  // lighting value as one of its variables"), already carrying the
  // précédence rule this operation must respect, not re-derive.
  context: {
    variables: [{ id: "SEQ.LIGHTING", userAdjustable: false }],
  },

  expertise: {
    role: "sequenceLightingSupervisor",
    system: {
      blocks: [
        { text: SEQUENCE_LIGHTING_DIRECTED_SYSTEM_INTRO },
        { text: SEQUENCE_LIGHTING_DIRECTED_SYSTEM_RULES },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "SEQ.LIGHTING", render: "sequenceLightingDirected.currentLine" },
      { freeText: true, render: "sequenceLightingDirected.freeTextDirective" },
      { text: "\nWrite the updated lighting description for this Sequence." },
    ],
    separator: "\n",
  },

  intent: {
    freeText: { label: "Director's note" },
  },

  messages: {
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      sequence: "Sequence not found.",
    },
  },

  // Deliberately no `preconditions` entry — see the header comment above.

  output: {
    kind: "text",
    target: { entity: "sequence" },
    field: "lighting",
    errors: {
      empty: "The model returned an empty lighting description. Try again.",
    },
  },

  commit: ["updateSequenceLighting"],

  executor: "inProcess",
};
