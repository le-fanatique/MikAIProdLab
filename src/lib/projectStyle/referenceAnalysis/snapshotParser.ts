// ---------------------------------------------------------------------------
// snapshotParser.ts — Strict, bounded reference-snapshot parser
//
// Single source of truth for parsing frozen run-reference snapshots.
// Aligned on the exact contract from contracts.ts (REFERENCE_ANALYSIS_LIMITS)
// and the 5 keys persisted by the CORE.
//
// All 5 keys are REQUIRED (unknown keys rejected). Missing key → corrupt.
// Borne globale calculée pour le pire encodage JSON valide (6 chars/char
// pour les caractères de contrôle Unicode).
// ---------------------------------------------------------------------------

import { REFERENCE_ANALYSIS_LIMITS } from "./contracts";

// Worst-case JSON encoding: every char could be a \uXXXX escape (6 bytes).
// Plus 5 key names, braces, commas, brackets, quotes.
const MAX_JSON_OVERHEAD = 2_000;
const MAX_SNAPSHOT_LENGTH =
  (REFERENCE_ANALYSIS_LIMITS.maxLabelLength +
   REFERENCE_ANALYSIS_LIMITS.maxProvenanceLength +
   REFERENCE_ANALYSIS_LIMITS.maxLongTextLength * 2 +
   REFERENCE_ANALYSIS_LIMITS.maxDomainsPerReference * REFERENCE_ANALYSIS_LIMITS.maxDomainLength) * 6 +
  MAX_JSON_OVERHEAD;

const EXPECTED_KEYS = new Set(["label", "provenanceNotes", "whatInterestsMe", "whatToAvoid", "domains"]);

export type SnapshotParseResult =
  | { ok: true; label: string | null; domains: string[]; provenanceNotes: string | null; whatInterestsMe: string | null; whatToAvoid: string | null }
  | { ok: false; error: string };

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

/**
 * Parse a frozen reference snapshot string. Strict validation:
 * - bounded size (worst-case JSON encoding)
 * - valid JSON object
 * - exactly the 5 expected keys present (no unknown keys, no missing keys)
 * - label: string | null, ≤ maxLabelLength
 * - provenanceNotes: string | null, ≤ maxProvenanceLength
 * - whatInterestsMe: string | null, ≤ maxLongTextLength
 * - whatToAvoid: string | null, ≤ maxLongTextLength
 * - domains: string[] (required), ≤ maxDomainsPerReference items, each ≤ maxDomainLength
 * - malformed JSON, wrong types, oversize → corrupt with diagnostic
 */
export function parseReferenceSnapshot(json: string): SnapshotParseResult {
  if (json.length > MAX_SNAPSHOT_LENGTH) {
    return { ok: false, error: "Snapshot exceeds size limit" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Snapshot is not valid JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Snapshot is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  // Reject unknown keys
  for (const key of Object.keys(obj)) {
    if (!EXPECTED_KEYS.has(key)) {
      return { ok: false, error: `Snapshot has unexpected key '${key}'` };
    }
  }

  // All 5 keys must be present
  for (const key of EXPECTED_KEYS) {
    if (!(key in obj)) {
      return { ok: false, error: `Snapshot is missing required key '${key}'` };
    }
  }

  // label: nullable string, bounded
  if (!isNullableString(obj.label)) {
    return { ok: false, error: "Snapshot field 'label' must be string | null" };
  }
  if (obj.label !== null && obj.label.length > REFERENCE_ANALYSIS_LIMITS.maxLabelLength) {
    return { ok: false, error: `Snapshot field 'label' exceeds ${REFERENCE_ANALYSIS_LIMITS.maxLabelLength} characters` };
  }
  const label = obj.label;

  // provenanceNotes: nullable string, bounded
  if (!isNullableString(obj.provenanceNotes)) {
    return { ok: false, error: "Snapshot field 'provenanceNotes' must be string | null" };
  }
  if (obj.provenanceNotes !== null && obj.provenanceNotes.length > REFERENCE_ANALYSIS_LIMITS.maxProvenanceLength) {
    return { ok: false, error: `Snapshot field 'provenanceNotes' exceeds ${REFERENCE_ANALYSIS_LIMITS.maxProvenanceLength} characters` };
  }
  const provenanceNotes = obj.provenanceNotes;

  // whatInterestsMe: nullable string, bounded
  if (!isNullableString(obj.whatInterestsMe)) {
    return { ok: false, error: "Snapshot field 'whatInterestsMe' must be string | null" };
  }
  if (obj.whatInterestsMe !== null && obj.whatInterestsMe.length > REFERENCE_ANALYSIS_LIMITS.maxLongTextLength) {
    return { ok: false, error: `Snapshot field 'whatInterestsMe' exceeds ${REFERENCE_ANALYSIS_LIMITS.maxLongTextLength} characters` };
  }
  const whatInterestsMe = obj.whatInterestsMe;

  // whatToAvoid: nullable string, bounded
  if (!isNullableString(obj.whatToAvoid)) {
    return { ok: false, error: "Snapshot field 'whatToAvoid' must be string | null" };
  }
  if (obj.whatToAvoid !== null && obj.whatToAvoid.length > REFERENCE_ANALYSIS_LIMITS.maxLongTextLength) {
    return { ok: false, error: `Snapshot field 'whatToAvoid' exceeds ${REFERENCE_ANALYSIS_LIMITS.maxLongTextLength} characters` };
  }
  const whatToAvoid = obj.whatToAvoid;

  // domains: required string[], bounded
  if (!Array.isArray(obj.domains)) {
    return { ok: false, error: "Snapshot field 'domains' must be an array" };
  }
  if (obj.domains.length > REFERENCE_ANALYSIS_LIMITS.maxDomainsPerReference) {
    return { ok: false, error: `Snapshot field 'domains' exceeds ${REFERENCE_ANALYSIS_LIMITS.maxDomainsPerReference} items` };
  }
  for (let i = 0; i < obj.domains.length; i++) {
    if (typeof obj.domains[i] !== "string") {
      return { ok: false, error: `Snapshot field 'domains[${i}]' is not a string` };
    }
    if ((obj.domains[i] as string).length > REFERENCE_ANALYSIS_LIMITS.maxDomainLength) {
      return { ok: false, error: `Snapshot field 'domains[${i}]' exceeds ${REFERENCE_ANALYSIS_LIMITS.maxDomainLength} characters` };
    }
  }
  const domains: string[] = obj.domains as string[];

  return { ok: true, label, domains, provenanceNotes, whatInterestsMe, whatToAvoid };
}
