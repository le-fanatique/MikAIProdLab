// ---------------------------------------------------------------------------
// descriptors/styleAdjustDirected.ts — STYLE.LLM.ADJUST.CORE.1
//
// `style.adjustDirected` — ticket 3 of "L'assistant de Project Style"
// (2026-08-23). The author writes, in plain language, what they want
// changed in the Project's artistic direction while looking at the Working
// Draft ("the render leans too photoreal, I want something more painted,
// with visible textures, and stop giving me blue skies") — and the assistant
// proposes atomic rules to approve one by one, never a rewrite of the
// pillars. Decided by the author 2026-08-23: atomic rules first, because
// that is the gesture the app already taught them — the Candidate Rules of
// Reference Analysis (`src/lib/projectStyle/referenceAnalysis/`).
//
// No oracle exists for this prompt (§ of the ticket: "le prompt est écrit,
// pas repris") — modelled on `asset.retakeDirected` (B10) for the anchor +
// freeText shape, and on `assets.fromProject` (B7f) for the `kind: "list"`
// output shape. `RuleFields` (`src/actions/projectStyle.ts:459-467`) is the
// write-side contract this output must satisfy; its two enums
// (`StylePillar`, `StyleRuleStrength`, `src/lib/projectStyle/styleSnapshot.ts:12-13`)
// are declared here as literals, not imported — a descriptor stays pure
// data and never imports from an action module, exactly as
// `assetsFromProject.ts`'s own header explains (lines 44-47) for
// `ASSET_TYPE_VALUES`.
//
// Impact UC1/UC2/UC3 (§4 of the product vision):
//   - UC1, UC2: not touched.
//   - UC3 (adjust a design): the interaction shape is the same one step up —
//     the author judges a result, says so in plain language, and reviews a
//     proposal before approving. This ticket touches neither
//     `asset.retakeDirected` nor its variable, and does not constrain UC3.
//   - §5 (ingredients, jars, recipes): the output is a rule, not a compiled
//     prompt. It lands in the Working Draft, itself an ingredient — never a
//     jar: nothing generated here is frozen, and the style compiler
//     (`compileStyleSnapshot.ts`) remains the only thing that produces style
//     text. No staleness machinery is introduced, and none belongs here.
//
// `context.variables` reads exactly `PROJECT.IDENTITY` (name only — see
// `renderStyleAdjustProjectLines`'s own comment for why pitch/story are
// deliberately left out) and `PROJECT.STYLE.DRAFT` — never `PROJECT.STYLE`
// (the published version is not what this operation adjusts) and no Shot or
// Asset collection (out of this ticket's scope).
//
// A Project with no Working Draft yet is not an error: `PROJECT.STYLE.DRAFT`
// resolves to `{ mode: "none" }` and `renderProjectStyleDraftLines` renders
// an explicit "No Working Draft exists yet" line rather than refusing — the
// assistant can perfectly well propose the first rules of an empty draft,
// since `addRuleAction` already knows how to create one
// (`src/lib/llmWorkspace/actions/registry.ts`). No `preconditions` entry
// exists here for that reason.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

// `StylePillar` (`styleSnapshot.ts:12`) — declared as a literal, not
// imported, per this module's own header note above.
const STYLE_PILLAR_VALUES = ["world", "visual"] as const;

// `StyleRuleStrength` (`styleSnapshot.ts:13`).
const STYLE_RULE_STRENGTH_VALUES = ["Required", "Preferred", "Avoid"] as const;

// Bound on `section` / `category` / `applicability` / `provenanceNotes` —
// in the spirit of `REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength`
// (`src/lib/projectStyle/referenceAnalysis/contracts.ts:50`), the closest
// neighbour: the same four-field shape, on the same `RuleFields` contract,
// proposing the same kind of atomic rule. 300 characters is a label, not a
// paragraph, for each of these four.
const STYLE_ADJUST_RULE_FIELD_TRUNCATE = 300;

// Bound on `instruction` itself — shorter than the field bound above on
// purpose: the system prompt tells the model an instruction is "a short,
// applicable, checkable-on-an-image directive", not a field label. 300
// characters is generous for a sentence and still refuses a paraphrase of
// the whole director's note.
const STYLE_ADJUST_INSTRUCTION_TRUNCATE = 300;

export const styleAdjustDirectedDescriptor: OperationDescriptor = {
  id: "style.adjustDirected",
  name: "Adjust Project Style (Directed)",

  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.STYLE.DRAFT", userAdjustable: false },
    ],
  },

  expertise: {
    role: "styleAdjustSupervisor",
    system: {
      blocks: [
        {
          text: "You are an art director for a film or animation production, helping the team adjust the Project's Working Draft of its artistic direction.",
        },
        {
          text: `Rules:
- Use only the provided context. Do not invent facts not present in the input.`,
        },
        // Same defect-1 correction as `asset.retakeDirected`'s own
        // `directorRuleLine`: this rule only makes sense when a note exists
        // in the prompt, so it disappears entirely with an empty one.
        { freeText: true, render: "styleAdjust.directorRuleLine" },
        {
          text: `- A rule is a short, atomic instruction, applicable and checkable against a rendered image — never a paraphrase of the director's note, and never a summary of the whole Working Draft.
- Every rule must belong to exactly one pillar: "world" for lore, setting and content facts; "visual" for rendering, medium, palette and camera-independent look.
- Express a negative constraint through "strength": "Avoid" — never by writing a negation inside the instruction text itself (write "textured brushwork", not "not photorealistic").
- Propose only what the director's note asks for. Do not restate or rewrite rules already present in the Working Draft.
- Write in English.`,
        },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{
  "rules": [
    {
      "instruction": "string — short, atomic, checkable-on-an-image directive",
      "pillar": "world | visual",
      "section": "string or null — the Working Draft section this rule belongs under, if any",
      "category": "string or null — a short label grouping this rule with similar ones",
      "strength": "Required | Preferred | Avoid",
      "applicability": "string or null — when/where this rule applies, if not everywhere",
      "provenanceNotes": "string or null — why this rule follows from the director's note"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "styleAdjust.projectLines" },
      // Reuses `styleAdjust.draftLines`, already registered against
      // `PROJECT.STYLE.DRAFT` by STYLE.LLM.VARS.1 ahead of this consumer —
      // see this module's own header note.
      { variable: "PROJECT.STYLE.DRAFT", render: "styleAdjust.draftLines" },
      { freeText: true, render: "styleAdjust.directorNoteLine" },
      // Neutral on purpose, same trap `asset.retakeDirected`'s own closing
      // line avoids (§4 point 4 of that ticket): never refers to the
      // freeText block's presence, since that block disappears entirely
      // when the note is blank.
      { text: "\nPropose atomic style rules to add to the Working Draft above." },
    ],
    separator: "\n",
  },

  intent: {
    // The whole request is one free-text consigne — no mode, no parameter,
    // matching `asset.retakeDirected` / `shot.retakeDirected`'s own shape.
    freeText: { label: "Director's note" },
  },

  // No adapter/action validates a raw id for this operation — it lives at
  // the bench only, same "an absent message is honest, an invented one is
  // not" rule `shot.lightingDirected` already follows for `invalidRequest`.
  messages: {
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // Deliberately no `preconditions`: a Project with no Working Draft yet is
  // a normal state for this operation, not a refusal — see this module's
  // own header note.

  output: {
    kind: "list",
    arrayKey: "rules",
    item: {
      fields: [
        { type: "string", field: "instruction", jsonKey: "instruction", truncateTo: STYLE_ADJUST_INSTRUCTION_TRUNCATE },
        // Default "visual": a director's-note style adjustment is
        // overwhelmingly about rendering (medium, texture, palette — the
        // ticket's own example: "more painted, visible textures, no blue
        // skies") rather than lore/setting facts, so when the model's JSON
        // omits or misspells `pillar`, "visual" is the safer fallback for
        // this operation's typical case.
        { type: "enum", field: "pillar", jsonKey: "pillar", values: [...STYLE_PILLAR_VALUES], default: "visual" },
        { type: "string", field: "section", jsonKey: "section", truncateTo: STYLE_ADJUST_RULE_FIELD_TRUNCATE },
        { type: "string", field: "category", jsonKey: "category", truncateTo: STYLE_ADJUST_RULE_FIELD_TRUNCATE },
        // Default "Preferred": the middle ground between "Required" (too
        // strict a fallback for a value the model failed to set) and
        // "Avoid" (reserved for the negative constraints the system prompt
        // already tells the model to mark explicitly) — a missing/invalid
        // strength most often means the model proposed an ordinary positive
        // adjustment and simply dropped the field.
        {
          type: "enum",
          field: "strength",
          jsonKey: "strength",
          values: [...STYLE_RULE_STRENGTH_VALUES],
          default: "Preferred",
        },
        { type: "string", field: "applicability", jsonKey: "applicability", truncateTo: STYLE_ADJUST_RULE_FIELD_TRUNCATE },
        {
          type: "string",
          field: "provenanceNotes",
          jsonKey: "provenanceNotes",
          truncateTo: STYLE_ADJUST_RULE_FIELD_TRUNCATE,
        },
      ],
      // `instruction` is `RuleFields`'s only required member
      // (`src/actions/projectStyle.ts:475-483`) — the sole gate here too.
      validity: { fields: ["instruction"], require: "all" },
    },
    // A director's note names one or two things to change; each typically
    // decomposes into a handful of atomic rules (the ticket's own example
    // yields three: painterly medium, visible textures, no blue skies). 8
    // is not invented — it is `REFERENCE_ANALYSIS_LIMITS.maxCandidateRules`
    // (`src/lib/projectStyle/referenceAnalysis/contracts.ts:48`), the exact
    // ceiling the app already ships for the same "propose atomic rules to
    // approve one by one" gesture this ticket reuses.
    maxItems: 8,
    // `addRuleAction` (`src/actions/projectStyle.ts`) has no batch entry
    // point yet — a caller re-parses this per selected rule, same
    // convention as every other list operation's `selection.formDataKey`
    // (`shotsJson` / `sequencesJson` / `selectedJson`); the N sequential
    // calls per approval are ticket 3b's (`.UI.1`) concern, out of this
    // ticket's scope.
    selection: { formDataKey: "rulesJson" },
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      notArray: "The model did not return a rules array. Try again.",
      empty: "The model returned no valid rules. Try again.",
    },
  },

  commit: ["addRuleAction"],

  // A rule added here lives in the Working Draft and affects no generation until the author publishes a new Style version.
  commitAdvisory:
    "A rule added here lives in the Working Draft and affects no generation until the author publishes a new Style version.",

  executor: "inProcess",
};
