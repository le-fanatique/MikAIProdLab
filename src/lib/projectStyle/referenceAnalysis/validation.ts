// ---------------------------------------------------------------------------
// validation.ts — STYLE.1.B.ANALYSIS.CORE
//
// Pure validators and the strict LLM output parser for Reference Board
// multimodal analysis. No DB, no network, no filesystem, no side effects —
// every branch here is deterministic and testable without mocking anything.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import {
  CONFIDENCE_LEVELS,
  REFERENCE_ANALYSIS_LIMITS,
  isValidReferenceKeyForCount,
  referenceKeyForOrdinal,
  type AnalysisCandidateRuleOutput,
  type AnalysisObservationOutput,
  type AnalysisOutput,
  type ConfidenceLevel,
} from "./contracts";
import {
  isValidNullablePillar,
  isValidNullableStrength,
} from "@/lib/projectStyle/validation";
import type { LLMProvider } from "@/types/llm";

// Mirrors the 3-value whitelist behind `src/lib/settings.ts::isKnownLLMProvider`
// — deliberately NOT imported from there: `settings.ts` pulls in `@/db` at
// module scope, which would break this module's "pure, zero DB/fs/network
// import" contract. `LLMProvider` (the type) is still imported from
// `@/types/llm`, a pure type-only module.
const KNOWN_LLM_PROVIDERS: readonly LLMProvider[] = ["ollama", "openrouter", "openai-compatible"];

const MAX_ID = 2_147_483_647;

export function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID;
}

export function isValidRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_ID;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Validates a raw `referenceIds` payload: 1..4 unique positive ids, in the
 * exact order the caller wants them analyzed (ordering is meaningful — it
 * determines R1..Rn). Returns null (reject) on any duplicate, out-of-range
 * count, or non-id entry.
 */
export function validateReferenceIdSelection(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < REFERENCE_ANALYSIS_LIMITS.minReferences) return null;
  if (raw.length > REFERENCE_ANALYSIS_LIMITS.maxReferences) return null;
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const entry of raw) {
    if (!isValidId(entry) || seen.has(entry)) return null;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

export function isValidConfirmedProvider(value: unknown): value is LLMProvider {
  return typeof value === "string" && (KNOWN_LLM_PROVIDERS as readonly string[]).includes(value);
}

export function isValidConfirmedModel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

export function isValidConfidence(value: unknown): value is ConfidenceLevel {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(value as string);
}

export function isNullableBoundedText(value: unknown, maxLength: number): value is string | null {
  if (value === null || value === undefined) return true;
  return typeof value === "string" && value.length <= maxLength;
}

export function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

// ---------------------------------------------------------------------------
// Hashing — deterministic, no secrets ever hashed alongside content.
// ---------------------------------------------------------------------------

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeProfileFingerprint(provider: string, model: string): string {
  return sha256Hex(`${provider}|${model}`);
}

// ---------------------------------------------------------------------------
// Strict LLM output parser
// ---------------------------------------------------------------------------

/**
 * Extracts a JSON object from raw provider text. Tolerates being wrapped in
 * a single ```json fence, but ONLY when the fenced content itself is
 * nothing but one JSON object (no trailing prose, no multiple fences) —
 * never a loose regex scan for the first `{...}` substring, which could
 * silently accept trailing junk after a truncated/malformed response.
 */
function extractJsonObjectText(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "Empty response." };

  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  if (candidate.length === 0) return { ok: false, error: "Empty response." };
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return { ok: false, error: "Response is not a single JSON object." };
  }
  return { ok: true, text: candidate };
}

/**
 * Requires the object's key set to be EXACTLY `required` — same length,
 * every required key present. A key whose value happens to be `null` still
 * counts as present (JSON.parse never produces `undefined`), but a key
 * missing entirely is rejected outright rather than silently defaulted —
 * the previous `hasOnlyAllowedKeys` (extra-keys-only check) let a provider
 * response omit a required field and have `?? null` silently coerce that
 * absence into a valid value.
 */
function hasExactKeys(obj: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== required.length) return false;
  return required.every((k) => k in obj);
}

export type AnalysisParseResult =
  | { ok: true; output: AnalysisOutput }
  | { ok: false; error: string };

const TOP_ALLOWED_KEYS = ["schemaVersion", "summary", "observations", "candidateRules"] as const;

/**
 * Parses and fully validates one raw provider response against the strict
 * Reference Board analysis output contract. `referenceCount` bounds which
 * `R1..Rn` reference keys are legal to cite. Never returns a partial
 * result — any single violation anywhere in the payload rejects the whole
 * response.
 */
export function parseAnalysisOutput(raw: string, referenceCount: number): AnalysisParseResult {
  const extracted = extractJsonObjectText(raw);
  if (!extracted.ok) return extracted;

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.text);
  } catch {
    return { ok: false, error: "Invalid JSON in analysis response." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Analysis response must be a JSON object." };
  }
  const obj = parsed as Record<string, unknown>;
  if (!hasExactKeys(obj, TOP_ALLOWED_KEYS)) {
    return { ok: false, error: "Analysis response has missing or unknown top-level fields." };
  }

  if (obj.schemaVersion !== 1) {
    return { ok: false, error: "Unsupported schema version." };
  }

  if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
    return { ok: false, error: "Summary is required." };
  }
  if (obj.summary.length > REFERENCE_ANALYSIS_LIMITS.maxSummaryLength) {
    return { ok: false, error: `Summary exceeds ${REFERENCE_ANALYSIS_LIMITS.maxSummaryLength} characters.` };
  }

  if (!Array.isArray(obj.observations) || obj.observations.length === 0) {
    return { ok: false, error: "observations must be a non-empty array." };
  }
  const maxObservations = referenceCount * REFERENCE_ANALYSIS_LIMITS.maxObservationsPerReference;
  if (obj.observations.length > maxObservations) {
    return { ok: false, error: `Analysis exceeds ${maxObservations} observations.` };
  }

  if (!Array.isArray(obj.candidateRules)) {
    return { ok: false, error: "candidateRules must be an array." };
  }
  if (obj.candidateRules.length > REFERENCE_ANALYSIS_LIMITS.maxCandidateRules) {
    return { ok: false, error: `Analysis exceeds ${REFERENCE_ANALYSIS_LIMITS.maxCandidateRules} candidate rules.` };
  }

  const observations: AnalysisObservationOutput[] = [];
  for (let i = 0; i < obj.observations.length; i++) {
    const result = parseObservation(obj.observations[i], i, referenceCount);
    if (!result.ok) return result;
    observations.push(result.observation);
  }

  const candidateRules: AnalysisCandidateRuleOutput[] = [];
  for (let i = 0; i < obj.candidateRules.length; i++) {
    const result = parseCandidateRule(obj.candidateRules[i], i, referenceCount);
    if (!result.ok) return result;
    candidateRules.push(result.rule);
  }

  // Every selected R1..Rn must have received between
  // `minObservationsPerReference` and `maxObservationsPerReference`
  // observations — a structurally valid response that only ever analyzed
  // R1 out of a 4-image selection must be rejected, not silently accepted.
  const countByKey = new Map<string, number>();
  for (const obs of observations) {
    countByKey.set(obs.referenceKey, (countByKey.get(obs.referenceKey) ?? 0) + 1);
  }
  for (let i = 0; i < referenceCount; i++) {
    const key = referenceKeyForOrdinal(i);
    const count = countByKey.get(key) ?? 0;
    if (count < REFERENCE_ANALYSIS_LIMITS.minObservationsPerReference) {
      return { ok: false, error: `Reference "${key}" has no observation.` };
    }
    if (count > REFERENCE_ANALYSIS_LIMITS.maxObservationsPerReference) {
      return { ok: false, error: `Reference "${key}" exceeds ${REFERENCE_ANALYSIS_LIMITS.maxObservationsPerReference} observations.` };
    }
  }

  return {
    ok: true,
    output: {
      schemaVersion: 1,
      summary: obj.summary.trim(),
      observations,
      candidateRules,
    },
  };
}

const OBSERVATION_ALLOWED_KEYS = ["referenceKey", "domain", "observation", "rationale", "confidence", "uncertainty"] as const;

function parseObservation(
  raw: unknown,
  index: number,
  referenceCount: number
): { ok: true; observation: AnalysisObservationOutput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `Observation ${index}: must be an object.` };
  }
  const obj = raw as Record<string, unknown>;
  if (!hasExactKeys(obj, OBSERVATION_ALLOWED_KEYS)) {
    return { ok: false, error: `Observation ${index}: missing or unknown fields.` };
  }

  if (!isValidReferenceKeyForCount(obj.referenceKey, referenceCount)) {
    return { ok: false, error: `Observation ${index}: unknown or invalid referenceKey.` };
  }

  const domain = obj.domain;
  if (domain !== null && typeof domain !== "string") {
    return { ok: false, error: `Observation ${index}: domain must be null or string.` };
  }
  if (typeof domain === "string" && domain.length > REFERENCE_ANALYSIS_LIMITS.maxDomainLength) {
    return { ok: false, error: `Observation ${index}: domain exceeds ${REFERENCE_ANALYSIS_LIMITS.maxDomainLength} characters.` };
  }

  if (typeof obj.observation !== "string" || obj.observation.trim().length === 0) {
    return { ok: false, error: `Observation ${index}: observation text is required.` };
  }
  if (obj.observation.length > REFERENCE_ANALYSIS_LIMITS.maxObservationTextLength) {
    return { ok: false, error: `Observation ${index}: observation exceeds ${REFERENCE_ANALYSIS_LIMITS.maxObservationTextLength} characters.` };
  }

  const rationale = obj.rationale;
  if (rationale !== null && typeof rationale !== "string") {
    return { ok: false, error: `Observation ${index}: rationale must be null or string.` };
  }
  if (typeof rationale === "string" && rationale.length > REFERENCE_ANALYSIS_LIMITS.maxRationaleLength) {
    return { ok: false, error: `Observation ${index}: rationale exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRationaleLength} characters.` };
  }

  if (!isValidConfidence(obj.confidence)) {
    return { ok: false, error: `Observation ${index}: invalid confidence.` };
  }

  const uncertainty = obj.uncertainty;
  if (uncertainty !== null && typeof uncertainty !== "string") {
    return { ok: false, error: `Observation ${index}: uncertainty must be null or string.` };
  }
  if (typeof uncertainty === "string" && uncertainty.length > REFERENCE_ANALYSIS_LIMITS.maxUncertaintyLength) {
    return { ok: false, error: `Observation ${index}: uncertainty exceeds ${REFERENCE_ANALYSIS_LIMITS.maxUncertaintyLength} characters.` };
  }

  return {
    ok: true,
    observation: {
      referenceKey: obj.referenceKey as string,
      domain: typeof domain === "string" ? domain.trim() : null,
      observation: obj.observation.trim(),
      rationale: typeof rationale === "string" ? rationale.trim() : null,
      confidence: obj.confidence,
      uncertainty: typeof uncertainty === "string" ? uncertainty.trim() : null,
    },
  };
}

const CANDIDATE_RULE_ALLOWED_KEYS = [
  "instruction",
  "pillar",
  "section",
  "category",
  "strength",
  "applicability",
  "rationale",
  "confidence",
  "uncertainty",
  "referenceKeys",
] as const;

function parseCandidateRule(
  raw: unknown,
  index: number,
  referenceCount: number
): { ok: true; rule: AnalysisCandidateRuleOutput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `Candidate rule ${index}: must be an object.` };
  }
  const obj = raw as Record<string, unknown>;
  if (!hasExactKeys(obj, CANDIDATE_RULE_ALLOWED_KEYS)) {
    return { ok: false, error: `Candidate rule ${index}: missing or unknown fields.` };
  }

  if (typeof obj.instruction !== "string" || obj.instruction.trim().length === 0) {
    return { ok: false, error: `Candidate rule ${index}: instruction is required.` };
  }
  if (obj.instruction.length > REFERENCE_ANALYSIS_LIMITS.maxRuleInstructionLength) {
    return { ok: false, error: `Candidate rule ${index}: instruction exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRuleInstructionLength} characters.` };
  }

  const pillar = obj.pillar;
  if (!isValidNullablePillar(pillar)) {
    return { ok: false, error: `Candidate rule ${index}: invalid pillar.` };
  }

  const section = obj.section;
  if (section !== null && typeof section !== "string") {
    return { ok: false, error: `Candidate rule ${index}: section must be null or string.` };
  }
  if (typeof section === "string" && section.length > REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength) {
    return { ok: false, error: `Candidate rule ${index}: section exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength} characters.` };
  }

  const category = obj.category;
  if (category !== null && typeof category !== "string") {
    return { ok: false, error: `Candidate rule ${index}: category must be null or string.` };
  }
  if (typeof category === "string" && category.length > REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength) {
    return { ok: false, error: `Candidate rule ${index}: category exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength} characters.` };
  }

  const applicability = obj.applicability;
  if (applicability !== null && typeof applicability !== "string") {
    return { ok: false, error: `Candidate rule ${index}: applicability must be null or string.` };
  }
  if (typeof applicability === "string" && applicability.length > REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength) {
    return { ok: false, error: `Candidate rule ${index}: applicability exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength} characters.` };
  }

  const strength = obj.strength;
  if (!isValidNullableStrength(strength)) {
    return { ok: false, error: `Candidate rule ${index}: invalid strength.` };
  }

  if (typeof obj.rationale !== "string" || obj.rationale.trim().length === 0) {
    return { ok: false, error: `Candidate rule ${index}: rationale is required.` };
  }
  if (obj.rationale.length > REFERENCE_ANALYSIS_LIMITS.maxRationaleLength) {
    return { ok: false, error: `Candidate rule ${index}: rationale exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRationaleLength} characters.` };
  }

  if (!isValidConfidence(obj.confidence)) {
    return { ok: false, error: `Candidate rule ${index}: invalid confidence.` };
  }

  const uncertainty = obj.uncertainty;
  if (uncertainty !== null && typeof uncertainty !== "string") {
    return { ok: false, error: `Candidate rule ${index}: uncertainty must be null or string.` };
  }
  if (typeof uncertainty === "string" && uncertainty.length > REFERENCE_ANALYSIS_LIMITS.maxUncertaintyLength) {
    return { ok: false, error: `Candidate rule ${index}: uncertainty exceeds ${REFERENCE_ANALYSIS_LIMITS.maxUncertaintyLength} characters.` };
  }

  if (!Array.isArray(obj.referenceKeys) || obj.referenceKeys.length === 0) {
    return { ok: false, error: `Candidate rule ${index}: must cite at least one referenceKey.` };
  }
  const seenKeys = new Set<string>();
  for (const key of obj.referenceKeys) {
    if (!isValidReferenceKeyForCount(key, referenceCount)) {
      return { ok: false, error: `Candidate rule ${index}: cites an unknown or out-of-selection referenceKey.` };
    }
    if (seenKeys.has(key)) {
      return { ok: false, error: `Candidate rule ${index}: duplicate referenceKey "${key}".` };
    }
    seenKeys.add(key);
  }

  return {
    ok: true,
    rule: {
      instruction: obj.instruction.trim(),
      pillar,
      section: typeof section === "string" ? section.trim() : null,
      category: typeof category === "string" ? category.trim() : null,
      strength,
      applicability: typeof applicability === "string" ? applicability.trim() : null,
      rationale: obj.rationale.trim(),
      confidence: obj.confidence,
      uncertainty: typeof uncertainty === "string" ? uncertainty.trim() : null,
      referenceKeys: obj.referenceKeys as string[],
    },
  };
}

/**
 * Verifies every observation cites exactly one reference (guaranteed by
 * `parseObservation`'s single `referenceKey` field — this is a defense-in-
 * depth structural re-check a caller can run against an already-parsed
 * `AnalysisOutput`, e.g. after re-deriving `referenceCount` from a frozen
 * Run) and every candidate rule cites at least one selected reference.
 */
export function validateOutputCitations(output: AnalysisOutput, referenceCount: number): string | null {
  for (let i = 0; i < output.observations.length; i++) {
    const obs = output.observations[i];
    if (!isValidReferenceKeyForCount(obs.referenceKey, referenceCount)) {
      return `Observation ${i} cites an unknown referenceKey "${obs.referenceKey}".`;
    }
  }
  for (let i = 0; i < output.candidateRules.length; i++) {
    const rule = output.candidateRules[i];
    if (rule.referenceKeys.length === 0) {
      return `Candidate rule ${i} cites no referenceKey.`;
    }
    for (const key of rule.referenceKeys) {
      if (!isValidReferenceKeyForCount(key, referenceCount)) {
        return `Candidate rule ${i} cites an unknown referenceKey "${key}".`;
      }
    }
  }
  return null;
}
