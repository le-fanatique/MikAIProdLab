// ---------------------------------------------------------------------------
// descriptors/shotPrompt.ts — LLMW.DESCRIPTOR.FORMAT.1b (B1b-2)
//
// Descriptor for `shotPrompt.assist`, matching `generateShotPromptDraft`
// (`src/actions/llm/shotPrompt.ts`) and its builder
// (`src/lib/prompts/shot-prompt-from-context.ts`,
// `buildShotPromptFromContextPrompt`) — the operation §4.1's original text
// names directly: "generateShotPromptDraft refuses with 'A Shot Prompt is
// required for this assist mode.'"
//
// `generateShotPromptDraft` takes an `assistMode`
// (`generate | enhance | rewrite | shorten | expand`), the same five modes
// as `sequencePrompt.assist`. Four of the five require `shot.shotPrompt` to
// be non-empty, checked *before* the LLM call:
//   `if (mode !== "generate" && !shot.shotPrompt?.trim())
//      return { ok: false, error: "A Shot Prompt is required for this assist mode." };`
// carried as a `preconditions` entry (§4.1, correction 6, migrated from
// `intent.mode.modes[].requiresNonEmpty` — see `descriptors/sequencePrompt.ts`'s
// header for why), restricted to those four modes, naming `shotPrompt` on
// this operation's anchor entity (`shot`) — mirroring
// `sequencePrompt.assist`'s equivalent precondition exactly, one entity kind
// over. Not proven by a runner-level equality test in this ticket — see
// `output`'s note below for the same scoping.
//
// Context: the action reads `project.{name, pitch, story}` (a
// `PROJECT.IDENTITY` subset — no `description`, no `outline`),
// `sequence.{title, summary, description, mood, locationHint}`
// (`SEQ.CONTEXT`, all five fields), `shot.{title, shotCode, description,
// actionPitch, cameraPitch, shotSize, cameraMovement, durationSeconds}`
// (`SHOT.CORE`, all eight fields), `shot.shotPrompt` (`SHOT.CURRENT_PROMPT`),
// the Shot's cast Assets ordered by name (`SHOT.CAST`), and the Shot's
// reference images ordered by `orderIndex` (`SHOT.REFERENCES`).
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { PROMPT_ASSIST_SYSTEM_INTRO_SHOT, SHOT_PROMPT_SYSTEM_TAIL } from "../variables/registry";

// ---------------------------------------------------------------------------
// LLMW.DESCRIPTOR.RENDER.1 (B1c), widened 2026-08-13 — `expertise.system`
// and `template` in blocks, mirroring `sequencePrompt.assist`'s
// mode-conditional decomposition one entity kind over (`shot` instead of
// `sequence`), with one further combination in the generate branch:
// `buildGenerateContextLines` (`src/lib/prompts/shot-prompt-from-context.ts`)
// pushes `PROJECT.IDENTITY`, `SEQ.CONTEXT`, `SHOT.CORE`, `SHOT.CAST`,
// `SHOT.REFERENCES` and `SHOT.CURRENT_PROMPT` into one flat array with no
// group boundary a block could split on — unlike the Asset-context family,
// whose groups are separated by a leading `"\n"` per group. Declared as one
// `{variables: [...], render}` block naming all six, and the transform
// branch's own two-variable pairing likewise — see `variables/registry.ts`,
// "`sequencePrompt.assist` / `shotPrompt.assist` render forms", for the full
// rationale. Proven by
// `tests/llmWorkspace/shotPrompt.assist.render.test.ts`.
// ---------------------------------------------------------------------------

export const shotPromptAssistDescriptor: OperationDescriptor = {
  id: "shotPrompt.assist",
  name: "Assist Shot Prompt",

  anchor: { kind: "entity", entity: "shot" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SHOT.CORE", userAdjustable: false },
      { id: "SHOT.CURRENT_PROMPT", userAdjustable: false },
      { id: "SHOT.CAST", userAdjustable: false },
      { id: "SHOT.REFERENCES", userAdjustable: false },
    ],
  },

  expertise: {
    role: "shotPromptWriter",
    system: {
      blocks: [
        { text: PROMPT_ASSIST_SYSTEM_INTRO_SHOT },
        { mode: true, render: "shotPrompt.generateSystemBody" },
        { mode: true, render: "shotPrompt.transformSystemBody" },
        { text: SHOT_PROMPT_SYSTEM_TAIL },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      {
        variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT", "SHOT.CORE", "SHOT.CAST", "SHOT.REFERENCES", "SHOT.CURRENT_PROMPT"],
        render: "shotPrompt.generateContextLines",
      },
      { variables: ["SHOT.CURRENT_PROMPT", "SHOT.CORE", "SEQ.CONTEXT"], render: "shotPrompt.transformBlock" },
      // LLMW.INTENT.FREETEXT.1 (B9a): the user's free-text director's note,
      // placed after every context block and before the mode-dependent
      // closing instruction — a directorial direction reads naturally once
      // the reader already has the shot's context, and just before the
      // instruction telling the model what to do with everything above.
      // Renders empty (and is dropped, §4.1 correction 4) when no consigne
      // is given, in every mode.
      { freeText: true, render: "shotPrompt.freeTextDirective" },
      { mode: true, render: "shotPrompt.closingLine" },
    ],
    separator: "\n",
  },

  intent: {
    // LLMW.INTENT.FREETEXT.1 (B9a): the first descriptor to declare
    // `intent.freeText` — see `.agents/executor_report.md` for why this
    // operation was chosen (§2 of the ticket).
    freeText: { label: "Director's note (optional)" },
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

  // Correction 6 (§4.1), read verbatim from `generateShotPromptDraft`
  // (`src/actions/llm/shotPrompt.ts`): `"Invalid request."`,
  // `"LLM not configured. Go to Settings to set up Ollama."` (identical
  // wording to `sequencePrompt.assist`), and the three-level chain
  // `"Project not found."` / `"Sequence not found."` / `"Shot not found."`.
  // Not proven by a runner-level equality test in this ticket — see
  // `output`'s note below for the same scoping.
  // `invalidMode: "Invalid assist mode."` added in B3b
  // (`LLMW.MIGRATE.FLATJSON.1b`): `generateShotPromptDraft`'s own
  // `isValidMode` gate (`src/actions/llm/shotPrompt.ts`) refuses an
  // unrecognised `mode` with this exact text before the switch, mirroring
  // `sequencePrompt.assist`'s already-declared `invalidMode` one entity kind
  // over. Omitting it here would silently fall back to `defaultMode`
  // instead — an observable behaviour change the switch must not make.
  messages: {
    invalidRequest: "Invalid request.",
    invalidMode: "Invalid assist mode.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      sequence: "Sequence not found.",
      shot: "Shot not found.",
    },
  },

  // `fields: [x]` -> `refs: [{anchorField: x}]` (LLMW.DESCRIPTOR.ASSETS.1,
  // B7f) — mechanical, no behaviour change.
  preconditions: [
    {
      refs: [{ anchorField: "shotPrompt" }],
      require: "all",
      modes: ["enhance", "rewrite", "shorten", "expand"],
      message: "A Shot Prompt is required for this assist mode.",
    },
  ],

  // Correction 5 (§4.1), read verbatim from `parseDraft`
  // (`src/actions/llm/shotPrompt.ts`): one key `shot_prompt`, tolerant of
  // extra keys, non-empty after `.trim()`. Not proven by a runner-level
  // equality test in this ticket (`LLMW.RUNNER.1a` scopes proof to
  // `story.generate`, `outline.generate`, `sequencePrompt.assist`) — updated
  // here only so `descriptors/index.ts`'s `satisfies
  // Record<string, OperationDescriptor>` still type-checks against the
  // corrected `output` shape.
  output: {
    kind: "object",
    target: { entity: "shot" },
    fields: [{ type: "string", field: "shotPrompt", jsonKey: "shot_prompt" }],
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an empty prompt. Try again.",
    },
  },

  commit: ["updateShotPrompt"],

  executor: "inProcess",
};
