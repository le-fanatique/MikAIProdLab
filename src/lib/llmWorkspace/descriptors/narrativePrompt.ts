// ---------------------------------------------------------------------------
// descriptors/narrativePrompt.ts — LLMW.NARRATIVE.1 (B12b-2)
//
// `narrativePrompt.compose` — the "grosse marmite" the author names in §5.3
// of `docs/LLM_WORKSPACE_PRODUCT_VISION.md`: it mixes the same six
// ingredients the same way every time, and hands back something "more
// narratively sexy" than the raw fields. It links the two halves the two
// previous tickets shipped: B12a's jar (`shots.narrative_prompt`,
// `updateShotNarrativePrompt`, `SHOT.NARRATIVE_PROMPT`) and B12b-1's text
// engine (`callLLMText`, `output.kind: "text"`).
//
// Impact UC: none. Neither UC1, UC2 nor UC3 is touched or constrained — this
// adds a jar they may consume later, it replaces none of them.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { NARRATIVE_PROMPT_SYSTEM_INTRO, NARRATIVE_PROMPT_SYSTEM_RULES } from "../variables/registry";

export const narrativePromptComposeDescriptor: OperationDescriptor = {
  id: "narrativePrompt.compose",
  name: "Compose Narrative Prompt",

  anchor: { kind: "entity", entity: "shot" },

  // The six ingredients of `shotPrompt.assist` (`descriptors/shotPrompt.ts`,
  // lines 62-68), and not one more — same anchor entity, same raw material,
  // nothing invented.
  //
  // `SHOT.NARRATIVE_PROMPT` is deliberately NOT declared here. It is this
  // operation's own output (B12a's jar) — reading it back as an ingredient
  // would make every run drift from whatever the previous run happened to
  // produce, instead of always starting fresh from the same six ingredients.
  // A later ticket may be tempted to "fix" this omission by adding it; that
  // would not be a fix, it would break the one property that makes this the
  // "grosse marmite" §5.3 describes ("toujours de la meme maniere").
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
    role: "narrativePromptComposer",
    system: {
      blocks: [{ text: NARRATIVE_PROMPT_SYSTEM_INTRO }, { text: NARRATIVE_PROMPT_SYSTEM_RULES }],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      {
        variables: [
          "PROJECT.IDENTITY",
          "SEQ.CONTEXT",
          "SHOT.CORE",
          "SHOT.CURRENT_PROMPT",
          "SHOT.CAST",
          "SHOT.REFERENCES",
        ],
        render: "narrativePrompt.contextLines",
      },
      { text: "\nWrite a single narrative prompt for this shot." },
    ],
    separator: "\n",
  },

  // §5.3 of the product vision: the marmite mixes the same ingredients the
  // same way every time — no `intent.mode`, no `intent.parameters`.
  // Deliberately no `intent.freeText` either: the director's note is E1's
  // and B16's own subject, and declaring it here would pre-empt their
  // design. No `preconditions` either — a plan with no `shotPrompt` yet is
  // still composable, unlike four of `shotPrompt.assist`'s five modes.
  intent: {},

  // No adapter exists for this operation (§ "Ce que tu ne fais pas" of the
  // ticket) — it lives at the bench only, so there is no verbatim source
  // text to carry for `invalidRequest`, on the same "an absent message is
  // honest, an invented one is not" rule `types.ts` already documents.
  messages: {
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      sequence: "Sequence not found.",
      shot: "Shot not found.",
    },
  },

  output: {
    kind: "text",
    target: { entity: "shot" },
    // Names the field the bench's Approve form posts under — the
    // consumer B12b-1 declared `output.field` without (`types.ts`), and the
    // one `updateShotNarrativePrompt` reads via `formData.get("narrativePrompt")`
    // (`src/actions/shots.ts`).
    field: "narrativePrompt",
    errors: {
      empty: "The model returned an empty narrative prompt. Try again.",
    },
  },

  commit: ["updateShotNarrativePrompt"],

  executor: "inProcess",
};
