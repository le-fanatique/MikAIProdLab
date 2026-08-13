// ---------------------------------------------------------------------------
// descriptors/outline.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1)
//
// Descriptor for `outline.generate`, matching `generateOutlineDraft`
// (`src/actions/llm/outlineGeneration.ts`) and its builder
// (`src/lib/prompts/outline-from-story.ts`, `buildOutlineFromStoryPrompt`).
//
// `generateOutlineDraft(formData)` takes no free-text director input and no
// assist mode, but it does read an optional `targetSections` (integer,
// 2-20) from the form — a bounded runtime parameter, neither free text nor
// a named mode. This is the exact gap the 2026-08-13 amendment closed:
// `intent` is now a composable object (`freeText?` / `mode?` /
// `parameters?`), so `targetSections` is declared as an `intent.parameters`
// entry, typed `"integer"`, bounded `min: 2, max: 20`. No `default` is set:
// the action has no hardcoded default value — an omitted `targetSections`
// makes the builder choose a natural section count instead of a fixed one,
// which is a behavioural fallback, not a default *value* this field could
// state.
//
// `expertise.systemPrompt` is NOT copied verbatim from the builder: unlike
// `story.generate`, `buildOutlineFromStoryPrompt`'s system message
// interpolates `sectionInstruction`, which depends on `targetSections` at
// call time — so there is no single static string that is "the" system
// prompt. The text below describes the fixed part of that system prompt
// (format rules, output schema); reproducing it byte-for-byte against a
// given `targetSections` value is B2's concern (`LLMW.RUNNER.1`), which
// this ticket's proof does not require — §11.2 requires the *resolved
// context* to match, not the assembled prompt.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const outlineGenerateDescriptor: OperationDescriptor = {
  id: "outline.generate",
  name: "Generate Outline",

  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [{ id: "PROJECT.IDENTITY", userAdjustable: false }],
  },

  expertise: {
    role: "productionSupervisor",
    systemPrompt: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).

OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`,
    knowledge: [],
  },

  intent: {
    parameters: [
      {
        id: "targetSections",
        type: "integer",
        label: "Target number of sections",
        min: 2,
        max: 20,
      },
    ],
  },

  output: { target: { entity: "project" }, fields: ["outline"] },

  commit: ["applyGeneratedOutline"],

  executor: "inProcess",
};
