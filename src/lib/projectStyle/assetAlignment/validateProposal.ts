// ---------------------------------------------------------------------------
// validateProposal.ts — STYLE.1.F.CORE
//
// Pure, bounded runtime parser for the raw LLM alignment proposal JSON.
// Mirrors validateStyleSnapshot.ts's conventions (exact key sets, exact
// enums, strict bounded types, no special prototype) applied to a new
// domain: the two-outcome AssetAlignmentProposal (contracts.ts).
//
// This is explicitly a STRUCTURAL boundary, not a semantic oracle: it
// proves "the response has the right shape, changed at least one field
// consistently with its own claimed design changes, and did not merely
// append decorative rendering vocabulary" — it cannot prove the change is
// actually a *good* design decision, or that the model told the truth about
// which Style content grounds it. The original space-postman fixture
// (assetAlignmentFixtures.ts) is the concrete acceptance/rejection boundary
// this module is tested against.
// ---------------------------------------------------------------------------

import {
  ASSET_ALIGNMENT_EDITABLE_FIELDS,
  MAX_ALIGNMENT_ASSESSMENT_LENGTH,
  MAX_ALIGNMENT_BASIS_LENGTH,
  MAX_ALIGNMENT_DESIGN_CHANGES,
  MAX_ALIGNMENT_FIELD_LENGTH,
  type AssetAlignmentDesignChange,
  type AssetAlignmentEditableField,
  type AssetAlignmentFieldValues,
  type AssetAlignmentProposal,
} from "./contracts";
import { hasExactKeys, isBoundedString, isNonEmptyBoundedString, isPlainObject } from "./structuralPrimitives";

export type ParseAssetAlignmentProposalResult = { ok: true; proposal: AssetAlignmentProposal } | { ok: false; error: string };

function extractJsonCodeFence(raw: string): string {
  const fence = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : raw.trim();
}

// ---------------------------------------------------------------------------
// The five editable fields — JSON uses snake_case (matching every other
// prompt builder's contract); this is the one place that maps them onto the
// camelCase AssetAlignmentEditableField enum.
// ---------------------------------------------------------------------------

const FIELD_JSON_KEYS = ["description", "notes", "visual_identity", "usage_rules", "forbidden_variations"] as const;
type FieldJsonKey = (typeof FIELD_JSON_KEYS)[number];

const FIELD_JSON_TO_EDITABLE: Record<FieldJsonKey, AssetAlignmentEditableField> = {
  description: "description",
  notes: "notes",
  visual_identity: "visualIdentity",
  usage_rules: "usageRules",
  forbidden_variations: "forbiddenVariations",
};

function isFieldJsonKey(value: unknown): value is FieldJsonKey {
  return typeof value === "string" && (FIELD_JSON_KEYS as readonly string[]).includes(value);
}

function parseFieldValues(value: unknown): AssetAlignmentFieldValues | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, FIELD_JSON_KEYS)) return null;

  const result = {} as AssetAlignmentFieldValues;
  for (const jsonKey of FIELD_JSON_KEYS) {
    const raw = value[jsonKey];
    if (!isBoundedString(raw, MAX_ALIGNMENT_FIELD_LENGTH)) return null;
    result[FIELD_JSON_TO_EDITABLE[jsonKey]] = raw;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Anti-suffix-only boundary — the original space-postman adversarial case:
// a response that changes nothing but appends purely decorative rendering
// vocabulary (cinematic, painterly, high-contrast, warm lighting, ...) with
// no field-level design decision must be rejected, not accepted as a real
// change.
// ---------------------------------------------------------------------------

const RENDERING_VOCAB_TOKENS = new Set([
  "cinematic", "painterly", "dramatic", "moody", "atmospheric", "evocative", "striking",
  "vivid", "stylized", "stylised", "aesthetic", "artistic", "beautiful", "stunning", "epic",
  "vibrant", "warm", "cool", "soft", "hard", "high", "low", "contrast", "highcontrast",
  "lighting", "light", "tone", "tones", "mood", "texture", "textured", "polished", "gritty",
  "sleek", "elegant", "rich", "bold", "subtle", "dynamic", "render", "rendered", "rendering",
  "visual", "visually", "glow", "glowing", "shadow", "shadows", "contrasty", "saturated",
]);

const CONNECTOR_TOKENS = new Set(["and", "with", "a", "an", "the", "in", "of", "to", "for", "style", "styled", "look", "feel"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,;:!?()"'`-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * True when `proposed` is exactly `baseline` (as a token prefix) with only
 * decorative rendering-vocabulary/connector tokens appended at the end —
 * the exact adversarial shape the ticket requires rejected: no field-level
 * design decision, just cinematic/painterly/high-contrast/warm-lighting
 * words tacked on. A genuine mid-text edit (proposed diverges from baseline
 * before its end) is never flagged by this check — only a pure append is.
 */
export function isSuffixOnlyRenderingChange(baseline: string, proposed: string): boolean {
  if (baseline === proposed) return false;
  const baseTokens = tokenize(baseline);
  const proposedTokens = tokenize(proposed);
  if (proposedTokens.length <= baseTokens.length) return false;
  for (let i = 0; i < baseTokens.length; i++) {
    if (proposedTokens[i] !== baseTokens[i]) return false;
  }
  const appended = proposedTokens.slice(baseTokens.length);
  return appended.length > 0 && appended.every((token) => RENDERING_VOCAB_TOKENS.has(token) || CONNECTOR_TOKENS.has(token));
}

// ---------------------------------------------------------------------------
// Design changes
// ---------------------------------------------------------------------------

const DESIGN_CHANGE_KEYS = ["field", "current_basis", "proposed_decision", "style_basis"] as const;

function parseDesignChange(value: unknown): AssetAlignmentDesignChange | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, DESIGN_CHANGE_KEYS)) return null;
  if (!isFieldJsonKey(value.field)) return null;
  if (!isNonEmptyBoundedString(value.current_basis, MAX_ALIGNMENT_BASIS_LENGTH)) return null;
  if (!isNonEmptyBoundedString(value.proposed_decision, MAX_ALIGNMENT_BASIS_LENGTH)) return null;
  if (!isNonEmptyBoundedString(value.style_basis, MAX_ALIGNMENT_BASIS_LENGTH)) return null;

  return {
    field: FIELD_JSON_TO_EDITABLE[value.field],
    currentBasis: value.current_basis,
    proposedDecision: value.proposed_decision,
    styleBasis: value.style_basis,
  };
}

// ---------------------------------------------------------------------------
// Top-level parse
// ---------------------------------------------------------------------------

const CHANGES_PROPOSED_KEYS = ["outcome", "fields", "assessment", "design_changes"] as const;
const ALREADY_ALIGNED_KEYS = ["outcome", "fields", "assessment"] as const;

/**
 * Structural parse only. `baseline` is the Asset's current five field
 * values (already normalized to "" for null/empty, never trimmed
 * differently than the prompt's own rendering) — required so this function
 * can enforce "already-aligned means byte-identical to baseline" and
 * "changes-proposed means at least one field genuinely differs, each
 * explained by exactly one consistent design change" without a second,
 * separate re-derivation of those rules by a caller.
 */
export function parseAssetAlignmentProposal(value: unknown, baseline: AssetAlignmentFieldValues): ParseAssetAlignmentProposalResult {
  if (!isPlainObject(value)) return { ok: false, error: "The model returned an unexpected format. Try again." };

  if (value.outcome !== "changes-proposed" && value.outcome !== "already-aligned") {
    return { ok: false, error: "The model returned an unrecognized outcome. Try again." };
  }

  if (value.outcome === "already-aligned") {
    if (!hasExactKeys(value, ALREADY_ALIGNED_KEYS)) {
      return { ok: false, error: "The model returned unexpected or missing fields for an already-aligned result." };
    }
    const fields = parseFieldValues(value.fields);
    if (!fields) return { ok: false, error: "The model returned invalid field values." };
    if (!isNonEmptyBoundedString(value.assessment, MAX_ALIGNMENT_ASSESSMENT_LENGTH)) {
      return { ok: false, error: "The model returned an invalid or empty assessment." };
    }

    for (const field of ASSET_ALIGNMENT_EDITABLE_FIELDS) {
      if (fields[field] !== baseline[field]) {
        return { ok: false, error: "The model claimed the Asset is already aligned but changed field values. Try again." };
      }
    }

    return { ok: true, proposal: { outcome: "already-aligned", fields, assessment: value.assessment } };
  }

  // outcome === "changes-proposed"
  if (!hasExactKeys(value, CHANGES_PROPOSED_KEYS)) {
    return { ok: false, error: "The model returned unexpected or missing fields for a changes-proposed result." };
  }
  const fields = parseFieldValues(value.fields);
  if (!fields) return { ok: false, error: "The model returned invalid field values." };
  if (!isNonEmptyBoundedString(value.assessment, MAX_ALIGNMENT_ASSESSMENT_LENGTH)) {
    return { ok: false, error: "The model returned an invalid or empty assessment." };
  }
  if (!Array.isArray(value.design_changes) || value.design_changes.length === 0) {
    return { ok: false, error: "The model returned no structured design changes." };
  }
  if (value.design_changes.length > MAX_ALIGNMENT_DESIGN_CHANGES) {
    return { ok: false, error: "The model returned too many structured design changes." };
  }

  const designChanges: AssetAlignmentDesignChange[] = [];
  const seenFields = new Set<AssetAlignmentEditableField>();
  for (const raw of value.design_changes) {
    const change = parseDesignChange(raw);
    if (!change) return { ok: false, error: "The model returned an invalid structured design change." };
    if (seenFields.has(change.field)) {
      return { ok: false, error: "The model returned more than one design change for the same field." };
    }
    seenFields.add(change.field);
    designChanges.push(change);
  }

  const changedFields = new Set<AssetAlignmentEditableField>(
    ASSET_ALIGNMENT_EDITABLE_FIELDS.filter((field) => fields[field] !== baseline[field])
  );
  if (changedFields.size === 0) {
    return { ok: false, error: "The model claimed changes but every field matches the current value. Try again." };
  }

  // Every changed field must have exactly one explaining design change, and
  // every design change must explain a field that actually changed —
  // rejects both "silent" field changes and "inconsistent-design-change"
  // entries that reference an unchanged field.
  for (const field of changedFields) {
    if (!seenFields.has(field)) {
      return { ok: false, error: "The model changed a field without a structured design change explaining it. Try again." };
    }
  }
  for (const field of seenFields) {
    if (!changedFields.has(field)) {
      return { ok: false, error: "The model returned a structured design change for a field it did not actually change." };
    }
  }

  for (const field of changedFields) {
    if (isSuffixOnlyRenderingChange(baseline[field], fields[field])) {
      return {
        ok: false,
        error: "The model's change is decorative rendering vocabulary appended to the existing text, not a field-level design decision. Try again.",
      };
    }
  }

  return { ok: true, proposal: { outcome: "changes-proposed", fields, assessment: value.assessment, designChanges } };
}

export function parseAssetAlignmentProposalFromJson(
  raw: string,
  baseline: AssetAlignmentFieldValues
): ParseAssetAlignmentProposalResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonCodeFence(raw));
  } catch {
    return { ok: false, error: "The model returned an unexpected format. Try again." };
  }
  return parseAssetAlignmentProposal(parsed, baseline);
}
