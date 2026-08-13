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
    systemPrompt: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Write a clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.
Do not include labels, headers, explanations, bullet points, or markdown.`,
    knowledge: [],
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
