// ---------------------------------------------------------------------------
// contracts.ts — STYLE.1.B.ANALYSIS.CORE
//
// Pure type and constant definitions for Reference Board multimodal
// analysis. No DB, no network, no filesystem, no side effects.
//
// Reuses the existing Style pillar/strength vocabulary
// (`src/lib/projectStyle/styleSnapshot.ts` + `validation.ts`) rather than
// redefining a second copy — a Candidate Rule here must remain
// interchangeable with a Research Candidate Rule and a manually authored
// rule.
// ---------------------------------------------------------------------------

import type { StylePillar, StyleRuleStrength } from "@/lib/projectStyle/styleSnapshot";
import type { LLMProvider } from "@/types/llm";

export const REFERENCE_ANALYSIS_CONTRACT_VERSION = 1 as const;

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const OBSERVATION_STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const CANDIDATE_RULE_STATUSES = ["proposed", "rejected", "approved"] as const;
export type CandidateRuleStatus = (typeof CANDIDATE_RULE_STATUSES)[number];

export const RUN_STATUSES = ["running", "completed", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Bounds for the whole domain. `maxReferenceFileBytes` intentionally matches
 * `MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES` (uploadReferenceImage.ts) — a file
 * larger than what the Reference Board itself ever accepts can never exist
 * as a real stored Reference, so re-declaring a separate (looser or
 * stricter) number here would only invite drift.
 */
export const REFERENCE_ANALYSIS_LIMITS = {
  minReferences: 1,
  maxReferences: 4,
  maxTotalRawBytes: 20 * 1024 * 1024,
  maxSummaryLength: 4_000,
  minObservationsPerReference: 1,
  maxObservationsPerReference: 6,
  maxObservationTextLength: 800,
  maxRationaleLength: 800,
  maxUncertaintyLength: 600,
  maxCandidateRules: 8,
  maxRuleInstructionLength: 2_000,
  maxRuleFieldLength: 300,
  maxDomainLength: 200,
  maxDomainsPerReference: 20,
  maxLabelLength: 500,
  maxProvenanceLength: 20_000,
  maxLongTextLength: 20_000,
  responseTimeoutMs: 90_000,
  maxResponseBytes: 256 * 1_024,
} as const;

// ---------------------------------------------------------------------------
// Opaque per-Run reference identifiers ("R1".."R4") — the prompt/output/DB
// use these, never the DB reference id, to identify one selected image.
// ---------------------------------------------------------------------------

export function referenceKeyForOrdinal(ordinal: number): string {
  return `R${ordinal + 1}`;
}

export function isValidReferenceKeyForCount(value: unknown, referenceCount: number): value is string {
  if (typeof value !== "string") return false;
  for (let i = 0; i < referenceCount; i++) {
    if (value === referenceKeyForOrdinal(i)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Confirmation profile — the provider/model pair the caller must explicitly
// confirm before any file read, DB write or network call.
// ---------------------------------------------------------------------------

export type ReferenceAnalysisProfile = {
  provider: LLMProvider;
  model: string;
  /** sha256("<provider>|<model>") — the value a caller round-trips as proof it saw and confirmed THIS exact pair. Never a secret; never includes the API key. */
  fingerprint: string;
  configurationError: string | null;
};

// ---------------------------------------------------------------------------
// Frozen per-Reference snapshot captured at acquisition time — never pixels
// or base64, only bounded non-sensitive metadata.
// ---------------------------------------------------------------------------

export type ReferenceSnapshotForRun = {
  referenceId: number;
  referenceKey: string;
  ordinal: number;
  label: string | null;
  provenanceNotes: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  domains: string[];
  imageSha256: string;
  mimeType: string;
  width: number;
  height: number;
};

export type RunInputSnapshot = {
  schemaVersion: 1;
  references: ReferenceSnapshotForRun[];
};

// ---------------------------------------------------------------------------
// Canonical, bounded Reference metadata — the ONE representation the
// initial snapshot, the prompt, the persisted `referenceSnapshot`/
// `inputSnapshot`, and every later re-verification (acquisition + D2
// finalization) all derive from. Never built twice independently: any two
// call sites that captured the same underlying row/domains at the same
// instant must produce byte-identical output here, which is exactly what
// makes an exact-equality comparison between "captured then" and "read now"
// a meaningful staleness check.
// ---------------------------------------------------------------------------

export type CanonicalReferenceMetadata = {
  label: string | null;
  provenanceNotes: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  /** Sorted (stable, locale-independent) and length-bounded — never insertion order, which is not a meaningful part of the canonical identity of a domain SET. */
  domains: string[];
};

/**
 * Builds the canonical metadata for one Reference from raw DB fields, or
 * returns `null` (fail closed — the caller must refuse the whole request,
 * never silently truncate a domain list) when the domain count exceeds
 * `maxDomainsPerReference`. Text fields are defensively bounded via
 * `.slice()` — normal rows are already within these bounds at write time
 * (`validationB.ts`), this only guards a legacy/manually-edited row from
 * ever producing an unbounded persisted snapshot or prompt.
 */
export function canonicalizeReferenceMetadata(raw: {
  label: string | null;
  provenanceNotes: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  domains: string[];
}): CanonicalReferenceMetadata | null {
  if (raw.domains.length > REFERENCE_ANALYSIS_LIMITS.maxDomainsPerReference) return null;
  const domains = raw.domains.map((d) => d.slice(0, REFERENCE_ANALYSIS_LIMITS.maxDomainLength)).sort();
  return {
    label: raw.label === null ? null : raw.label.slice(0, REFERENCE_ANALYSIS_LIMITS.maxLabelLength),
    provenanceNotes: raw.provenanceNotes === null ? null : raw.provenanceNotes.slice(0, REFERENCE_ANALYSIS_LIMITS.maxProvenanceLength),
    whatInterestsMe: raw.whatInterestsMe === null ? null : raw.whatInterestsMe.slice(0, REFERENCE_ANALYSIS_LIMITS.maxLongTextLength),
    whatToAvoid: raw.whatToAvoid === null ? null : raw.whatToAvoid.slice(0, REFERENCE_ANALYSIS_LIMITS.maxLongTextLength),
    domains,
  };
}

/** Exact structural equality between two canonical snapshots — used to detect ANY drift (a single changed character, a reordered/added/removed domain) between the snapshot captured before the provider call and a fresh read taken inside a later transaction. */
export function canonicalReferenceMetadataEqual(a: CanonicalReferenceMetadata, b: CanonicalReferenceMetadata): boolean {
  if (a.label !== b.label) return false;
  if (a.provenanceNotes !== b.provenanceNotes) return false;
  if (a.whatInterestsMe !== b.whatInterestsMe) return false;
  if (a.whatToAvoid !== b.whatToAvoid) return false;
  if (a.domains.length !== b.domains.length) return false;
  for (let i = 0; i < a.domains.length; i++) {
    if (a.domains[i] !== b.domains[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// LLM output contract (strict — the server never coerces a partial or
// malformed shape into something persistable).
// ---------------------------------------------------------------------------

export type AnalysisObservationOutput = {
  referenceKey: string;
  domain: string | null;
  observation: string;
  rationale: string | null;
  confidence: ConfidenceLevel;
  uncertainty: string | null;
};

export type AnalysisCandidateRuleOutput = {
  instruction: string;
  pillar: StylePillar | null;
  section: string | null;
  category: string | null;
  strength: StyleRuleStrength | null;
  applicability: string | null;
  rationale: string;
  confidence: ConfidenceLevel;
  uncertainty: string | null;
  referenceKeys: string[];
};

export type AnalysisOutput = {
  schemaVersion: 1;
  summary: string;
  observations: AnalysisObservationOutput[];
  candidateRules: AnalysisCandidateRuleOutput[];
};

// ---------------------------------------------------------------------------
// Server Action result shapes
// ---------------------------------------------------------------------------

export type RunReferenceAnalysisResult =
  | { ok: true; requiresConfirmation: true; provider: LLMProvider; model: string; fingerprint: string }
  | { ok: true; requiresConfirmation: false; runId: number; idempotent: boolean }
  | { ok: false; error: string };

export type ReferenceAnalysisMutationResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string };
