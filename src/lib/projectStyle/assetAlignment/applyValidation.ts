// ---------------------------------------------------------------------------
// applyValidation.ts — STYLE.1.F.CORE (Retake Round 1)
//
// Pure, strict runtime parser for the public Apply Server Action's input.
// Codex Round 1 P1: `isValidFieldValues` only checked the five expected
// properties were bounded strings — it accepted extra keys and any
// prototype-bearing object, and the top-level input itself had no
// exact-shape guard at all (a malformed call could throw before ever
// reaching a structured error). This is now a real structural boundary,
// mirroring validateProposal.ts's rigor (same shared primitives —
// structuralPrimitives.ts) applied to Apply's own JSON-shaped input instead
// of the LLM's.
// ---------------------------------------------------------------------------

import {
  ASSET_ALIGNMENT_EDITABLE_FIELDS,
  MAX_ALIGNMENT_FIELD_LENGTH,
  type AssetAlignmentFieldValues,
  type AssetAlignmentOutcome,
} from "./contracts";
import { isWellFormedFingerprint } from "./fingerprint";
import { hasExactKeys, isBoundedString, isPlainObject } from "./structuralPrimitives";

export type ApplyAssetAlignmentInput = {
  projectId: number;
  assetId: number;
  expectedStyleVersionId: number;
  expectedStyleVersionNumber: number;
  baselineFingerprint: string;
  outcome: AssetAlignmentOutcome;
  fields: AssetAlignmentFieldValues;
};

export type ParseApplyAssetAlignmentInputResult = { ok: true; input: ApplyAssetAlignmentInput } | { ok: false; error: string };

const APPLY_INPUT_KEYS = [
  "projectId",
  "assetId",
  "expectedStyleVersionId",
  "expectedStyleVersionNumber",
  "baselineFingerprint",
  "outcome",
  "fields",
] as const;

const MAX_ID = 2_147_483_647;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID;
}

function parseFieldValuesCamelCase(value: unknown): AssetAlignmentFieldValues | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ASSET_ALIGNMENT_EDITABLE_FIELDS)) return null;

  const result = {} as AssetAlignmentFieldValues;
  for (const field of ASSET_ALIGNMENT_EDITABLE_FIELDS) {
    const raw = value[field];
    if (!isBoundedString(raw, MAX_ALIGNMENT_FIELD_LENGTH)) return null;
    result[field] = raw;
  }
  return result;
}

/**
 * Structural parse only — never throws, always a discriminated result.
 * Does not check ownership, Style version validity or Asset staleness
 * (that is the transactional job of applyAssetAlignmentAction's own
 * `assertStillCurrentSync`); this only proves the shape and bounds of what
 * crossed the Server Action boundary are exactly what Apply expects.
 */
export function parseApplyAssetAlignmentInput(value: unknown): ParseApplyAssetAlignmentInputResult {
  if (!isPlainObject(value)) return { ok: false, error: "Invalid request." };
  if (!hasExactKeys(value, APPLY_INPUT_KEYS)) return { ok: false, error: "Invalid request." };
  if (!isPositiveInt(value.projectId)) return { ok: false, error: "Invalid project id." };
  if (!isPositiveInt(value.assetId)) return { ok: false, error: "Invalid asset id." };
  if (!isPositiveInt(value.expectedStyleVersionId)) return { ok: false, error: "Invalid expected Style version." };
  if (!isPositiveInt(value.expectedStyleVersionNumber)) return { ok: false, error: "Invalid expected Style version." };
  if (!isWellFormedFingerprint(value.baselineFingerprint)) return { ok: false, error: "Invalid baseline fingerprint." };
  if (value.outcome !== "changes-proposed" && value.outcome !== "already-aligned") {
    return { ok: false, error: "Invalid alignment outcome." };
  }
  const fields = parseFieldValuesCamelCase(value.fields);
  if (!fields) return { ok: false, error: "Invalid field values." };

  return {
    ok: true,
    input: {
      projectId: value.projectId,
      assetId: value.assetId,
      expectedStyleVersionId: value.expectedStyleVersionId,
      expectedStyleVersionNumber: value.expectedStyleVersionNumber,
      baselineFingerprint: value.baselineFingerprint,
      outcome: value.outcome,
      fields,
    },
  };
}
