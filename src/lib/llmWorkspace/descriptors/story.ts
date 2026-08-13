// ---------------------------------------------------------------------------
// descriptors/story.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1)
//
// Descriptor for `story.generate`, matching `generateStory`
// (`src/actions/llm/story.ts`) and its builder
// (`src/lib/prompts/story-from-pitch.ts`, `buildStoryFromPitchPrompt`).
//
// `generateStory(projectId)` takes no free-text director input, no assist
// mode, and no runtime parameter — it always regenerates the story from the
// Project's pitch, name and description. Per the 2026-08-13 amendment,
// `intent` is a composable object, not a tagged union; an empty object
// (`{}`) is the honest value here — the user steers nothing.
//
// `expertise.system` is copied verbatim from
// `buildStoryFromPitchPrompt`'s `system` message, which is static (it does
// not interpolate any project field) — unlike `outline.generate`'s builder,
// see `descriptors/outline.ts`. Kept as one `{text}` block since nothing in
// it varies by input.
//
// `template` (the user message) is one `{variable, render}` block:
// `PROJECT.IDENTITY`'s `"story.contextLines"` render form
// (`variables/registry.ts`) reproduces the builder's three context lines
// verbatim (fixed placeholders on a missing pitch/description, never
// dropped lines), and the closing instruction is static text.
// LLMW.DESCRIPTOR.RENDER.1 (B1c).
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const storyGenerateDescriptor: OperationDescriptor = {
  id: "story.generate",
  name: "Generate Story",

  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [{ id: "PROJECT.IDENTITY", userAdjustable: false }],
  },

  expertise: {
    role: "screenwriter",
    system: {
      blocks: [
        {
          text: `You are a professional screenwriter and narrative consultant.
Your task is to write a concise story synopsis from a project pitch.
The story should be 200 to 400 words, written in a cinematic style suitable for production use.
Always respond with a valid JSON object matching exactly this schema:
{ "story": "<narrative text>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "story.contextLines" },
      { text: "\nWrite a story synopsis for this project." },
    ],
    separator: "\n",
  },

  intent: {},

  // Correction 6 (§4.1), second round. `generateStory(projectId: number)`
  // takes a typed positional argument, not `FormData` — it never runs an
  // "Invalid request." check the way `outline.generate` /
  // `sequencePrompt.assist` do, so `invalidRequest` is left undeclared
  // rather than borrowed from a sibling: an absent message is honest, an
  // invented (or copied) one is not. The runner treats an undeclared
  // `invalidRequest` by letting the id flow through to the chain check,
  // which produces `chainNotFound.project` for a missing/malformed
  // `projectId` — the same outcome `generateStory` itself produces (its
  // `db.select()` simply finds no row).
  messages: {
    notConfigured: "LLM provider not configured. Go to Settings to configure Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // `generateStory` refuses with "Add a pitch first." on an empty
  // `project.pitch`, verbatim, unconditionally (no `intent.mode` on this
  // operation, so no `modes` restriction). Single field, so `require: "all"`
  // and `require: "any"` are equivalent — `"all"` chosen per B2b's migration
  // note in `types.ts`.
  preconditions: [{ fields: ["pitch"], require: "all", message: "Add a pitch first." }],

  // Correction 5 (§4.1), read verbatim from `parseStoryResult`
  // (`src/actions/llm/story.ts`): one key, tolerant of extra keys (no
  // `exactKeysOnly`), non-empty after `.trim()`.
  output: {
    target: { entity: "project" },
    fields: [{ field: "story", jsonKey: "story" }],
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again or use a different model.",
      empty: "The model returned an empty or invalid story. Try again.",
    },
  },

  commit: ["applyGeneratedStory"],

  executor: "inProcess",
};
