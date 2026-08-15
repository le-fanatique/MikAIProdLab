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
// precondition is carried as a `preconditions` entry (§4.1, correction 6),
// restricted to those four modes via `modes`, naming `sequencePrompt` on
// this operation's anchor entity (`sequence`), per `FieldRef`'s contract.
// `generate` has no such precondition. No `freeText` and no `parameters`:
// the action takes no director note and no numeric option.
//
// Migrated off `intent.mode.modes[].requiresNonEmpty` (correction 6,
// reported by this ticket): that shape carried no message, so the runner
// could not raise "A Sequence Prompt is required for this assist mode."
// without hard-coding it.
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
        { id: "enhance" },
        { id: "rewrite" },
        { id: "shorten" },
        { id: "expand" },
      ],
      defaultMode: "generate",
    },
  },

  // Correction 6 (§4.1), read verbatim from `generateSequencePromptDraft`
  // (`src/actions/llm/sequencePrompt.ts`): `"Invalid request."` on a
  // malformed `projectId`/`sequenceId`, `"LLM not configured. Go to
  // Settings to set up Ollama."` — **different wording** from
  // `story.generate` / `outline.generate`'s "LLM provider not configured.
  // Go to Settings to configure Ollama." (the exact divergence that forced
  // this correction — reported as-is, not harmonized), the two-level chain:
  // `"Project not found."` then `"Sequence not found."` (the
  // `sequence.projectId !== projectId` ownership check), and `invalidMode`
  // (second round): `"Invalid assist mode."`, from
  // `isValidMode(rawMode)`'s refusal — a real pre-call path on every
  // mode-driven operation, populated here per the supervisor's instruction.
  messages: {
    invalidRequest: "Invalid request.",
    invalidMode: "Invalid assist mode.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", sequence: "Sequence not found." },
  },

  // The four transform modes' precondition, migrated off
  // `intent.mode.modes[].requiresNonEmpty` (see the header note above) —
  // message read verbatim from `generateSequencePromptDraft`'s
  // `if (mode !== "generate" && !sequence.sequencePrompt?.trim())` guard.
  preconditions: [
    {
      fields: ["sequencePrompt"],
      require: "all",
      modes: ["enhance", "rewrite", "shorten", "expand"],
      message: "A Sequence Prompt is required for this assist mode.",
    },
  ],

  // Correction 5 (§4.1), read verbatim from `parseDraft`
  // (`src/actions/llm/sequencePrompt.ts`): one key `sequence_prompt`,
  // tolerant of extra keys, non-empty after `.trim()`.
  output: {
    kind: "object",
    target: { entity: "sequence" },
    fields: [{ field: "sequencePrompt", jsonKey: "sequence_prompt" }],
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty prompt. Try again.",
    },
  },

  commit: ["updateSequencePrompt"],

  executor: "inProcess",
};
