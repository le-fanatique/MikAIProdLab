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
// `expertise.systemPrompt` is copied verbatim from
// `buildStoryFromPitchPrompt`'s `system` message, which is static (it does
// not interpolate any project field) — unlike `outline.generate`'s builder,
// see `descriptors/outline.ts`.
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
    systemPrompt: `You are a professional screenwriter and narrative consultant.
Your task is to write a concise story synopsis from a project pitch.
The story should be 200 to 400 words, written in a cinematic style suitable for production use.
Always respond with a valid JSON object matching exactly this schema:
{ "story": "<narrative text>" }
No markdown. No explanation. Only the JSON object.`,
    knowledge: [],
  },

  intent: {},

  output: { target: { entity: "project" }, fields: ["story"] },

  commit: ["applyGeneratedStory"],

  executor: "inProcess",
};
