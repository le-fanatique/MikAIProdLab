// ---------------------------------------------------------------------------
// descriptors/lookTestSubjectActionFromStory.ts — LOOK.FROMSTORY.LLM.1
//
// `lookTest.subjectActionFromStory` — replaces the "From Story" preset of
// the Look Development Bench (`LookDevelopmentBench.tsx`), which used to
// call `deriveFromStoryText` (`src/lib/lookDevelopment/lookDevelopmentPresets.ts`):
// a deterministic function that only ever SELECTED and CUT existing text
// (the pitch truncated to 20 words for `subject`, the first verb-bearing
// clause of the description/story truncated to 20 words for `action`) and
// never read the outline at all. This operation REWRITES instead: it reads
// the Project's `story` field directly and its outline sections
// (`PROJECT.OUTLINE_SECTIONS`) — per the ticket's own instruction, "le field
// story directement et les outline" — and asks the model for a representative
// subject and a single-shot action, in its own words, never a copy of the
// pitch or the project name.
//
// Impact UC1/UC2/UC3 (§4 of `docs/LLM_WORKSPACE_PRODUCT_VISION.md`): none of
// the three is touched. This operation fills two form fields the author
// edits before launching a Look Test — it produces no Shot, no Asset, and no
// generation prompt.
//
// `commit: []` — a first in this repository. The operation writes nothing:
// its output fills `subject`/`action` on the Bench's local state, and it is
// `createLookTestAction` (unchanged, out of this ticket's scope) that writes
// when the author launches the test — exactly as today. Verified against
// both consumers before choosing this shape:
//   - `templateStorage.ts`'s validator only checks `Array.isArray(d.commit)`
//     and then iterates it — an empty array passes both, and the `for`
//     loop over an empty array is a no-op;
//   - `benchRun.ts`'s `commitBenchProposal` (`descriptor.commit.length !== 1`
//     -> `{kind: "unsupported"}`) is never reached: this operation is never
//     routed through the generic bench Approve flow (`ProposalPanel` +
//     `commitBenchProposal`) the way every `commit.length === 1` descriptor
//     is. The Bench calls `runWorkspaceOperation` directly and copies the
//     returned `values` onto its own `subject`/`action` state — the same
//     "run, then the caller decides what to do with the result" shape
//     `LookDevelopmentBench.tsx` already uses for `deriveFromStoryText` and
//     `randomizeNeutralSubjectAndAction`, neither of which was ever an
//     "Approve"-style commit either.
//
// `intent: {}` — no director's note in this ticket. While writing the
// system prompt, no gap was found that a freeText consigne would close: the
// operation already reads the whole story and outline, and "propose a
// representative subject and a single-shot action" needs no further steering
// for a bench field-filler. Not added.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

// ~25 words per field (the ticket's own budget), enforced by rewriting in
// the system prompt — this bound is the safety net, not the primary
// control ("Dis-le dans le prompt, et borne aussi `output` — les deux, parce
// que le prompt oriente et la borne garantit"). Average English word length
// is close to 5 letters plus a separator (~5.7 chars/word); 25 words is
// ~142 chars. 220 leaves margin for a slightly longer sentence without
// admitting a second sentence's worth of text.
const LOOK_TEST_FIELD_TRUNCATE = 220;

export const lookTestSubjectActionFromStoryDescriptor: OperationDescriptor = {
  id: "lookTest.subjectActionFromStory",
  name: "Generate Subject & Action from Story",

  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.OUTLINE_SECTIONS", userAdjustable: false },
    ],
  },

  expertise: {
    role: "lookTestSubjectActionSupervisor",
    system: {
      blocks: [
        {
          text: "You are a visual development supervisor, choosing what to test-render on a film or animation project's Look Development bench: a single representative subject and one single-shot action — never a summary of the plot.",
        },
        {
          text: `Rules:
- Use only the provided story and outline as your source of truth. Do not invent facts not present in the input.
- "subject" must be representative of this project's world — a character, creature, object, or setting element a viewer would recognize as belonging to this story. Rewrite it in your own words: never copy the pitch or the project name verbatim.
- "action" must be playable in a single shot — a concrete moment drawn from the story, never a plot synopsis and never simply the first sentence that happens to contain a verb.
- Each field is about 25 words, written as one sentence, produced by rewriting — never a truncation of the source text.
- This is a render test, not a retelling of the story: write "subject" and "action" so both are visible and legible in a single rendered image or clip.
- Never name a visual style, an artist, or a brand — style comes from the Project Style, and mixing it in here would bias the test.
- Write in English.`,
        },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "subject": "<a representative subject of this project's world, rewritten in your own words, ~25 words>", "action": "<one action playable in a single shot, ~25 words>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "lookTest.storyLines" },
      { variable: "PROJECT.OUTLINE_SECTIONS", render: "lookTest.outlineLines" },
      { text: "\nPropose a Subject and an Action for a Look Development test of this project." },
    ],
    separator: "\n",
  },

  intent: {},

  // No adapter validates a raw id for this operation — it is called only
  // from the Bench (`runWorkspaceOperation`), never through a `FormData`
  // Server Action, so there is no verbatim source text to carry for
  // `invalidRequest` — the same "an absent message is honest, an invented
  // one is not" rule `narrativePrompt.compose` and `style.adjustDirected`
  // already follow.
  messages: {
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // "un projet sans story ni outline n'a rien à donner" — refuses before the
  // model is called, naming what to fill. `PROJECT.OUTLINE_SECTIONS` resolves
  // to an array (`OutlineSection[]`), the one resolved shape a `variable`
  // precondition ref already knows how to read as "non-empty"
  // (`assetsFromProject.ts`'s own `{variable: "PROJECT.SEQUENCES"}` entry is
  // the precedent) — checked here rather than the raw `outline` text field,
  // because the parsed sections are exactly what the template block above
  // renders: a Project whose `outline` text exists but parses into zero "## "
  // sections has nothing this operation can actually read either.
  preconditions: [
    {
      refs: [{ anchorField: "story" }, { variable: "PROJECT.OUTLINE_SECTIONS" }],
      require: "any",
      message: "Add a story or an outline to this project before generating a subject and action from it.",
    },
  ],

  output: {
    kind: "object",
    target: { entity: "project" },
    fields: [
      { type: "string", field: "subject", jsonKey: "subject", truncateTo: LOOK_TEST_FIELD_TRUNCATE },
      { type: "string", field: "action", jsonKey: "action", truncateTo: LOOK_TEST_FIELD_TRUNCATE },
    ],
    // Both fields are required: a subject with no action (or the reverse) is
    // not a usable Look Test field pair, unlike `assetBible.generate`'s
    // `"any"` (three independent fields, any subset useful on its own).
    require: "all",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned an incomplete subject/action pair. Try again.",
    },
  },

  // See this module's own header note: writes nothing. `subject`/`action`
  // land on the Bench's local state, and `createLookTestAction` (unchanged)
  // is what eventually persists them, when the author launches the test.
  commit: [],

  executor: "inProcess",
};
