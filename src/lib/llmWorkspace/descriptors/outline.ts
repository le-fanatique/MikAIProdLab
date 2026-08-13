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
// `expertise.system` interpolates `sectionInstruction` in the *middle* of
// its rules, exactly the case §4.1 correction 4 names
// `buildOutlineFromStoryPrompt` for. Modelled as three blocks: the fixed
// rules up to (not including) the section-count bullet, a `{parameter,
// render}` block for `targetSections` producing that one bullet line, and
// the fixed OUTPUT RULES tail — joined by a single `"\n"` separator
// throughout. The parameter block's own text carries the leading `"\n"`
// that reopens the blank line before `OUTPUT RULES:`, the same
// leading-newline device `story.generate`'s closing line uses.
//
// `template` (user message): one `{variable, render}` block for
// `PROJECT.IDENTITY`'s `name`/`pitch`/`story` (a subset — no `description`,
// no `outline`, matching `generateOutlineDraft`'s call) plus the static
// closing instruction. LLMW.DESCRIPTOR.RENDER.1 (B1c).
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

/**
 * `targetSections`'s render form (§4.1 correction 4's parameter block).
 * Not a `VariableId`, so it lives beside this descriptor rather than in
 * `variables/registry.ts` — `targetSections` is an `intent.parameters`
 * entry, not a context variable.
 */
export function renderOutlineTargetSectionsBullet(targetSections: number | null | undefined): string {
  const sectionInstruction =
    targetSections != null
      ? `Write exactly ${targetSections} sections.`
      : "Choose a natural number of sections based on the story structure (typically 4 to 8).";
  return `- ${sectionInstruction}`;
}

export const outlineGenerateDescriptor: OperationDescriptor = {
  id: "outline.generate",
  name: "Generate Outline",

  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [{ id: "PROJECT.IDENTITY", userAdjustable: false }],
  },

  expertise: {
    role: "productionSupervisor",
    system: {
      blocks: [
        {
          text: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).`,
        },
        { parameter: "targetSections", render: "outline.sectionInstructionBullet" },
        {
          text: `
OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "outline.projectContextLines" },
      { text: "\nWrite a Project Outline for this project. Each section should clearly define its narrative role and production context." },
    ],
    separator: "\n",
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
