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

// `targetSections`'s render form (§4.1 correction 4's parameter block) is
// `renderOutlineTargetSectionsBullet`, in `variables/registry.ts`'s
// `PARAMETER_RENDER_FORMS` table — not here. A descriptor module exports no
// function: §3.1's correction (reported by B2a) requires every render form
// reachable from one registry, beside the resolvers, so the runner never
// imports an operation's module and a descriptor stays pure data (§4.2
// stores it as JSON).

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

  // Correction 6 (§4.1), read verbatim from `generateOutlineDraft`
  // (`src/actions/llm/outlineGeneration.ts`): `"Invalid request."` on a
  // malformed `projectId`, `"LLM provider not configured. Go to Settings to
  // configure Ollama."` — the same wording `generateStory` uses, both
  // written the same way in the same file family — and `"Project not
  // found."` for the single-level chain.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM provider not configured. Go to Settings to configure Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // Same precondition as `story.generate`, verbatim identical text —
  // `generateOutlineDraft` runs the exact same `!project.pitch?.trim()`
  // check with the exact same message, unconditionally. Single field, so
  // `require: "all"` and `require: "any"` are equivalent.
  preconditions: [{ fields: ["pitch"], require: "all", message: "Add a pitch first." }],

  // Correction 5 (§4.1), read verbatim from `parseOutlineResult`
  // (`src/actions/llm/outlineGeneration.ts`): one key, tolerant of extra
  // keys, non-empty after `.trim()`.
  output: {
    target: { entity: "project" },
    fields: [{ field: "outline", jsonKey: "outline" }],
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again or use a different model.",
      empty: "The model returned an empty or invalid outline. Try again.",
    },
  },

  commit: ["applyGeneratedOutline"],

  executor: "inProcess",
};
