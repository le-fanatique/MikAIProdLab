// ---------------------------------------------------------------------------
// descriptors/styleAdjustFromLookResult.ts — STYLE.LLM.LOOKFEEDBACK.CORE.1
//
// `style.adjustFromLookResult` — ticket 4a of "L'assistant de Project Style"
// (2026-08-23). Frère of `style.adjustDirected` (STYLE.LLM.ADJUST.CORE.1),
// never its copy: same anchored gesture — the director says what is wrong,
// in plain language, and the assistant proposes atomic rules to approve one
// by one — but ancré on a Look Test result instead of the Project's Working
// Draft in the abstract. "ça part trop vers le photoréalisme" in front of a
// real render, not a general note about the direction.
//
// **What is shared with `style.adjustDirected`, reused rather than copied:**
// the rule vocabulary (`StylePillar`, `StyleRuleStrength`), the truncation
// bounds, the same `kind: "list"` output schema (field-for-field identical),
// the same `commit: ["addRuleAction"]`, the same `commitAdvisory`. See
// `.agents/executor_report.md` for the measured duplication between the two
// files — reported, not factored: a descriptor is data, per the ticket.
//
// **What changes, and only this:**
//   - `anchor: { kind: "entity", entity: "lookResult" }` — not `project`;
//   - `context.variables`: `PROJECT.IDENTITY`, `PROJECT.STYLE.DRAFT`,
//     `LOOK.RESULT` — the Working Draft is still what gets adjusted, but the
//     new third variable is what grounds the feedback in a real render;
//   - the system prompt tells the model it is looking at the report of a
//     real render test: the style text that produced it is given, the
//     director's reaction is about what came out, and the proposed rules
//     must target the gap between the two — never a reformulation of the
//     brief.
//
// Impact UC1/UC2/UC3 (§4 of the product vision): none of the three touched —
// same as `style.adjustDirected`'s own header note. This ticket only widens
// the anchor format (`EntityKind` gains `"lookResult"`), it adds no Shot or
// Asset operation.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

// `StylePillar` (`src/lib/projectStyle/styleSnapshot.ts:12`) — declared as a
// literal, not imported, same discipline `styleAdjustDirected.ts`'s own
// header states for why a descriptor never imports from an action module.
const STYLE_PILLAR_VALUES = ["world", "visual"] as const;

// `StyleRuleStrength` (`styleSnapshot.ts:13`).
const STYLE_RULE_STRENGTH_VALUES = ["Required", "Preferred", "Avoid"] as const;

// Identical bounds to `style.adjustDirected`'s own — same `RuleFields`
// contract, same kind of atomic rule.
const STYLE_ADJUST_RULE_FIELD_TRUNCATE = 300;
const STYLE_ADJUST_INSTRUCTION_TRUNCATE = 300;

export const styleAdjustFromLookResultDescriptor: OperationDescriptor = {
  id: "style.adjustFromLookResult",
  name: "Adjust Project Style (From Look Test Result)",

  anchor: { kind: "entity", entity: "lookResult" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.STYLE.DRAFT", userAdjustable: false },
      { id: "LOOK.RESULT", userAdjustable: false },
    ],
  },

  expertise: {
    role: "styleAdjustSupervisor",
    system: {
      blocks: [
        {
          text: "You are an art director for a film or animation production, reviewing the report of a real render test against the Project's Working Draft of its artistic direction.",
        },
        {
          text: `Rules:
- Use only the provided context. Do not invent facts not present in the input.
- The style text below is what actually produced this result — not a hypothesis, not the current Working Draft in the abstract. Judge the gap between that text and the director's reaction to what it produced.`,
        },
        // Same defect-1 correction as `style.adjustDirected`'s own
        // `styleAdjust.directorRuleLine`: this rule only makes sense when a
        // note exists in the prompt, so it disappears entirely with an empty
        // one.
        { freeText: true, render: "styleAdjust.directorRuleLine" },
        {
          text: `- A rule is a short, atomic instruction, applicable and checkable against a rendered image — never a paraphrase of the director's note, and never a summary of the whole Working Draft.
- Every rule must belong to exactly one pillar: "world" for lore, setting and content facts; "visual" for rendering, medium, palette and camera-independent look.
- Express a negative constraint through "strength": "Avoid" — never by writing a negation inside the instruction text itself (write "textured brushwork", not "not photorealistic").
- Propose only what the director's note asks for, targeting the gap between the style text that produced this result and the director's reaction to it. Do not restate or rewrite rules already present in the Working Draft.
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
      // `PROJECT.STYLE.DRAFT` by STYLE.LLM.VARS.1 — the Working Draft is
      // still what this operation adjusts, unchanged from its sibling.
      { variable: "PROJECT.STYLE.DRAFT", render: "styleAdjust.draftLines" },
      { variable: "LOOK.RESULT", render: "lookFeedback.resultLines" },
      { freeText: true, render: "styleAdjust.directorNoteLine" },
      // Neutral on purpose, same trap `style.adjustDirected`'s own closing
      // line avoids: never refers to the freeText block's presence, since
      // that block disappears entirely when the note is blank.
      { text: "\nPropose atomic style rules to add to the Working Draft above, addressing the gap between the style text used and the director's reaction to this result." },
    ],
    separator: "\n",
  },

  intent: {
    // Same shape as `style.adjustDirected`: the whole request is one
    // free-text consigne — no mode, no parameter.
    freeText: { label: "Director's note" },
  },

  messages: {
    notConfigured: "LLM is not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      lookResult: "Look Test result not found.",
    },
  },

  // Deliberately no `preconditions`, same as `style.adjustDirected`: a
  // Project with no Working Draft yet is a normal state, not a refusal.

  output: {
    kind: "list",
    arrayKey: "rules",
    item: {
      fields: [
        { type: "string", field: "instruction", jsonKey: "instruction", truncateTo: STYLE_ADJUST_INSTRUCTION_TRUNCATE },
        { type: "enum", field: "pillar", jsonKey: "pillar", values: [...STYLE_PILLAR_VALUES], default: "visual" },
        { type: "string", field: "section", jsonKey: "section", truncateTo: STYLE_ADJUST_RULE_FIELD_TRUNCATE },
        { type: "string", field: "category", jsonKey: "category", truncateTo: STYLE_ADJUST_RULE_FIELD_TRUNCATE },
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
      // `instruction` is `RuleFields`'s only required member — the sole gate
      // here too, same as `style.adjustDirected`.
      validity: { fields: ["instruction"], require: "all" },
    },
    // Same ceiling as `style.adjustDirected`: `REFERENCE_ANALYSIS_LIMITS.maxCandidateRules`
    // (`src/lib/projectStyle/referenceAnalysis/contracts.ts:48`).
    maxItems: 8,
    // `addRuleAction` has no batch entry point yet — same convention as
    // `style.adjustDirected`'s own `rulesJson`.
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
