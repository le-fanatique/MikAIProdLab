// ---------------------------------------------------------------------------
// contracts.ts — STYLE.1.F.CORE
//
// Pure, DB/network-free types and bounds shared by every module in
// src/lib/projectStyle/assetAlignment/. This is the one place the five
// editable Asset fields and the strict LLM proposal shape are defined —
// the parser (validateProposal.ts), the prompt builder
// (src/lib/prompts/asset-alignment-from-context.ts) and the apply action
// (src/actions/assetAlignment.ts) all import from here instead of each
// re-declaring the field list or its bounds.
// ---------------------------------------------------------------------------

export const ASSET_ALIGNMENT_EDITABLE_FIELDS = [
  "description",
  "notes",
  "visualIdentity",
  "usageRules",
  "forbiddenVariations",
] as const;

export type AssetAlignmentEditableField = (typeof ASSET_ALIGNMENT_EDITABLE_FIELDS)[number];

export function isAssetAlignmentEditableField(value: unknown): value is AssetAlignmentEditableField {
  return typeof value === "string" && (ASSET_ALIGNMENT_EDITABLE_FIELDS as readonly string[]).includes(value);
}

/** The five editable fields' baseline/proposed values — never null, always a trimmed-or-empty string (matches how the fields already round-trip through updateAssetDetailsInline). */
export type AssetAlignmentFieldValues = Record<AssetAlignmentEditableField, string>;

// Bounds — deliberately smaller than the generic StyleSnapshot bounds
// (validateStyleSnapshot.ts), since these are short production-note fields,
// not long-form Style content.
export const MAX_ALIGNMENT_FIELD_LENGTH = 4_000;
export const MAX_ALIGNMENT_ASSESSMENT_LENGTH = 1_000;
export const MAX_ALIGNMENT_BASIS_LENGTH = 500;
export const MAX_ALIGNMENT_DESIGN_CHANGES = ASSET_ALIGNMENT_EDITABLE_FIELDS.length;
/** Project/Asset name bound for the alignment context — Codex Round 1 P1: every alignment-context text input must be deterministically bounded, not just the five editable fields. */
export const MAX_ALIGNMENT_NAME_LENGTH = 500;

export type AssetAlignmentDesignChange = {
  field: AssetAlignmentEditableField;
  /** The current design basis this change starts from — grounded in the baseline field value, not invented. */
  currentBasis: string;
  /** The proposed design decision — must be a substantive field-level design choice, never a rendering-vocabulary suffix (see validateProposal.ts). */
  proposedDecision: string;
  /** The specific Style content (World & Design Language, Visual Treatment or an approved rule) this change is grounded in. */
  styleBasis: string;
};

export type AssetAlignmentProposal =
  | {
      outcome: "changes-proposed";
      fields: AssetAlignmentFieldValues;
      assessment: string;
      designChanges: AssetAlignmentDesignChange[];
    }
  | {
      outcome: "already-aligned";
      fields: AssetAlignmentFieldValues;
      assessment: string;
    };

export type AssetAlignmentOutcome = AssetAlignmentProposal["outcome"];

// ---------------------------------------------------------------------------
// Baseline bound check — Codex Round 1 P1: the alignment context
// (alignmentContext.ts) must never truncate an Asset's current field value,
// because the LLM's "unchanged, keep as-is" echo and Apply's overwrite both
// round-trip through that same text. A field that does not fit the shared
// bound must refuse alignment BEFORE any LLM call, never be silently
// shortened for display and then overwritten in full by Apply. Project
// Story fields (pitch/story/outline) are read-only narrative context, never
// written back — those are still safely truncated by alignmentContext.ts.
// ---------------------------------------------------------------------------

/** True when every text input the alignment context/prompt will show the model already fits within its bound — refuse (never truncate) before any LLM call otherwise. */
export function isAssetAlignmentBaselineWithinBounds(input: {
  projectName: string;
  assetName: string;
  fields: AssetAlignmentFieldValues;
}): boolean {
  if (input.projectName.length > MAX_ALIGNMENT_NAME_LENGTH) return false;
  if (input.assetName.length > MAX_ALIGNMENT_NAME_LENGTH) return false;
  return ASSET_ALIGNMENT_EDITABLE_FIELDS.every((field) => input.fields[field].length <= MAX_ALIGNMENT_FIELD_LENGTH);
}
