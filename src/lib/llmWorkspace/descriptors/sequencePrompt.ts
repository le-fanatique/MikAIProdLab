// ---------------------------------------------------------------------------
// descriptors/sequencePrompt.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1)
//
// Descriptor for `sequencePrompt.assist`, matching
// `generateSequencePromptDraft` (`src/actions/llm/sequencePrompt.ts`) and
// its builder (`src/lib/prompts/sequence-prompt-from-context.ts`,
// `buildSequencePromptFromContextPrompt`).
//
// `generateSequencePromptDraft` takes an `assistMode`
// (`generate | enhance | rewrite | shorten | expand`) — the exact case
// `intent.mode` (§4.1, correction 2) exists for. Four of the five modes
// refuse when `sequence.sequencePrompt` is empty, *before* the LLM call
// ("A Sequence Prompt is required for this assist mode."); that
// precondition is carried on each of those four mode entries via
// `requiresNonEmpty: "sequencePrompt"`, naming the field on this
// operation's anchor entity (`sequence`), per `FieldRef`'s contract.
// `generate` has no such precondition. No `freeText` and no `parameters`:
// the action takes no director note and no numeric option.
//
// LLMW.DESCRIPTOR.RENDER.1 (B1c), widened 2026-08-13 after the ticket's own
// proof surfaced two shapes the original three `Block` variants could not
// declare honestly — `expertise.system` and `template` in blocks.
// `buildSequencePromptFromContextPrompt` branches entirely on `assistMode`:
// the generate branch and the four transform branches read different
// variables and produce structurally different text. Modelled with
// `{mode: true, render}` blocks that render empty outside their own mode,
// and the transform branch's "Current prompt + background context" text
// (built by direct, separator-less string concatenation, not by joining an
// array) as one `{variables: [...], render}` block declaring both
// `SEQ.CURRENT_PROMPT` and `SEQ.CONTEXT` — see `variables/registry.ts`,
// "`sequencePrompt.assist` / `shotPrompt.assist` render forms", for why that
// pairing cannot be split across two `{variable}` blocks without inserting a
// separator the builder never emits. Proven byte-for-byte by
// `tests/llmWorkspace/sequencePrompt.assist.render.test.ts`.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { PROMPT_ASSIST_SYSTEM_INTRO_SEQUENCE, SEQUENCE_PROMPT_SYSTEM_TAIL } from "../variables/registry";

export const sequencePromptAssistDescriptor: OperationDescriptor = {
  id: "sequencePrompt.assist",
  name: "Assist Sequence Prompt",

  anchor: { kind: "entity", entity: "sequence" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SEQ.CURRENT_PROMPT", userAdjustable: false },
    ],
  },

  expertise: {
    role: "sequencePromptWriter",
    system: {
      blocks: [
        { text: PROMPT_ASSIST_SYSTEM_INTRO_SEQUENCE },
        { mode: true, render: "sequencePrompt.generateSystemBody" },
        { mode: true, render: "sequencePrompt.transformSystemBody" },
        { text: SEQUENCE_PROMPT_SYSTEM_TAIL },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "sequencePrompt.generateProjectLines" },
      { variable: "SEQ.CONTEXT", render: "sequencePrompt.generateSequenceLines" },
      { variables: ["SEQ.CURRENT_PROMPT", "SEQ.CONTEXT"], render: "sequencePrompt.transformBlock" },
      { mode: true, render: "sequencePrompt.closingLine" },
    ],
    separator: "\n",
  },

  intent: {
    mode: {
      modes: [
        { id: "generate" },
        { id: "enhance", requiresNonEmpty: "sequencePrompt" },
        { id: "rewrite", requiresNonEmpty: "sequencePrompt" },
        { id: "shorten", requiresNonEmpty: "sequencePrompt" },
        { id: "expand", requiresNonEmpty: "sequencePrompt" },
      ],
      defaultMode: "generate",
    },
  },

  output: { target: { entity: "sequence" }, fields: ["sequencePrompt"] },

  commit: ["updateSequencePrompt"],

  executor: "inProcess",
};
