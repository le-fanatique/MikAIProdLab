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
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

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
    systemPrompt: `You are an expert at writing visual and narrative direction prompts for film sequences.`,
    knowledge: [],
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
