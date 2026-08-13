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
// carried on each of those four mode entries via
// `requiresNonEmpty: "shotPrompt"`, naming the field on this operation's
// anchor entity (`shot`) — mirroring `sequencePrompt.assist`'s
// `requiresNonEmpty: "sequencePrompt"` exactly, one entity kind over.
//
// Context: the action reads `project.{name, pitch, story}` (a
// `PROJECT.IDENTITY` subset — no `description`, no `outline`),
// `sequence.{title, summary, description, mood, locationHint}`
// (`SEQ.CONTEXT`, all five fields), `shot.{title, shotCode, description,
// actionPitch, cameraPitch, framing, cameraMovement, durationSeconds}`
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
      { mode: true, render: "shotPrompt.closingLine" },
    ],
    separator: "\n",
  },

  intent: {
    mode: {
      modes: [
        { id: "generate" },
        { id: "enhance", requiresNonEmpty: "shotPrompt" },
        { id: "rewrite", requiresNonEmpty: "shotPrompt" },
        { id: "shorten", requiresNonEmpty: "shotPrompt" },
        { id: "expand", requiresNonEmpty: "shotPrompt" },
      ],
      defaultMode: "generate",
    },
  },

  output: { target: { entity: "shot" }, fields: ["shotPrompt"] },

  commit: ["updateShotPrompt"],

  executor: "inProcess",
};
