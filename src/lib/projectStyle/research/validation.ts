// ---------------------------------------------------------------------------
// validation.ts — STYLE.1.C.CORE
//
// Pure validators, URL/evidence normalization and bounds for Research.
// No DB, no network, no side effects. Deterministic — all tests pass
// without mocking.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type {
  ClaimConfidenceLevel,
  ClaimKind,
  ConfidenceLevel,
  NormalizedEvidence,
  SourceType,
  SourceTier,
  SynthesisCandidateRuleInput,
  SynthesisClaimInput,
  SynthesisOutput,
} from "./contracts";
import {
  CLAIM_CONFIDENCE_LEVELS,
  CLAIM_KINDS,
  CONFIDENCE_LEVELS,
  RESEARCH_LIMITS,
  SOURCE_TIERS,
  SOURCE_TYPES,
} from "./contracts";
import { normalizeDomain } from "@/lib/projectStyle/validationB";

const MAX_ID = 2_147_483_647;

/** A committed decision revision starts at 0 (never-decided) and only ever increments — unlike a draft/source revision, which starts at 1. */
export function isValidDecisionRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_ID;
}

/** Rejects an object with any key outside `allowed` — a forged/malformed provider response cannot smuggle unrecognized fields through silently. */
function hasOnlyAllowedKeys(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(obj).every((k) => (allowed as readonly string[]).includes(k));
}

/**
 * Validates and normalizes a raw Research Source-domain list: reuses
 * `validationB.ts`'s `normalizeDomain` (trim + collapse whitespace) per the
 * architecture's "Domain normalization reuses validationB.ts", then
 * lowercases for the case-insensitive stored/deduplicated form. Returns null
 * (reject, zero mutation) on any non-string entry, empty-after-trim entry,
 * duplicate (case-insensitive) or a count exceeding the limit — never a
 * silent `slice()` truncation.
 */
export function validateResearchDomains(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > RESEARCH_LIMITS.maxDomainsPerSource) return null;
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const trimmed = normalizeDomain(entry);
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) return null;
    seen.add(lower);
    normalized.push(lower);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// URL normalization (architecture §5)
// ---------------------------------------------------------------------------

export type UrlNormalizationResult =
  | { ok: true; normalized: string; host: string }
  | { ok: false; error: string };

export function normalizeResearchUrl(raw: string): UrlNormalizationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "URL is required." };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Malformed URL." };
  }

  // Only http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL must use http or https protocol." };
  }

  // Reject credentials
  if (parsed.username || parsed.password) {
    return { ok: false, error: "URL must not contain credentials." };
  }

  // WHATWG normalizes scheme and host case. Remove fragment.
  parsed.hash = "";

  // Remove default port
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  const normalized = parsed.toString();

  // Length check
  if (normalized.length > 2_048) {
    return { ok: false, error: "URL exceeds 2,048 characters." };
  }

  return { ok: true, normalized, host: parsed.hostname.toLowerCase() };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeUrlHash(normalizedUrl: string): string {
  return sha256Hex(normalizedUrl);
}

export function computeEvidenceHash(
  normalizedUrl: string,
  title: string,
  boundedExcerpt: string
): string {
  // Canonical tuple: url + title + excerpt, separated by NUL
  return sha256Hex(`${normalizedUrl}\0${title}\0${boundedExcerpt}`);
}

// ---------------------------------------------------------------------------
// Enum validators
// ---------------------------------------------------------------------------

export function isValidSourceType(v: unknown): v is SourceType {
  return SOURCE_TYPES.includes(v as SourceType);
}

export function isValidSourceTier(v: unknown): v is SourceTier {
  return SOURCE_TIERS.includes(v as SourceTier);
}

export function isValidConfidence(v: unknown): v is ConfidenceLevel {
  return CONFIDENCE_LEVELS.includes(v as ConfidenceLevel);
}

export function isValidClaimKind(v: unknown): v is ClaimKind {
  return CLAIM_KINDS.includes(v as ClaimKind);
}

export function isValidClaimConfidence(v: unknown): v is ClaimConfidenceLevel {
  return CLAIM_CONFIDENCE_LEVELS.includes(v as ClaimConfidenceLevel);
}

// ---------------------------------------------------------------------------
// Bounds validators
// ---------------------------------------------------------------------------

export function isBoundedText(
  value: unknown,
  maxLength: number
): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

export function isNullableBoundedText(
  value: unknown,
  maxLength: number
): value is string | null {
  if (value === null || value === undefined) return true;
  return typeof value === "string" && value.length <= maxLength;
}

// ---------------------------------------------------------------------------
// UUID validation (for requestKey)
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ---------------------------------------------------------------------------
// Search response parser (architecture §6, search request)
// ---------------------------------------------------------------------------

export type SearchAnnotation = {
  url: string;
  title: string;
  content: string;
};

export type ParsedSearchResult =
  | { ok: true; candidates: SearchAnnotation[] }
  | { ok: false; error: string };

/**
 * Parses url_citation annotations from an OpenRouter search response.
 * Only annotations with valid URL, non-empty title and non-empty content
 * are kept. At most 5 unique candidates. Deduplication by normalized URL.
 */
export function parseSearchAnnotations(
  annotations: unknown
): ParsedSearchResult {
  if (!Array.isArray(annotations)) {
    return { ok: false, error: "Annotations must be an array." };
  }

  const seen = new Set<string>();
  const candidates: SearchAnnotation[] = [];

  for (const ann of annotations) {
    if (candidates.length >= RESEARCH_LIMITS.maxCandidatesPerSearch) break;

    if (!ann || typeof ann !== "object") continue;
    const obj = ann as Record<string, unknown>;

    if (obj.type !== "url_citation") continue;

    const url = typeof obj.url === "string" ? obj.url : null;
    const title = typeof obj.title === "string" ? obj.title : null;
    const content = typeof obj.content === "string" ? obj.content : null;

    if (!url || !title || !content) continue;
    if (title.trim().length === 0 || content.trim().length === 0) continue;

    const norm = normalizeResearchUrl(url);
    if (!norm.ok) continue;

    const key = norm.normalized;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({ url: norm.normalized, title: title.trim(), content: content.trim() });
  }

  return { ok: true, candidates };
}

// ---------------------------------------------------------------------------
// Evidence builder — turns a raw search annotation into validated
// NormalizedEvidence for storage
// ---------------------------------------------------------------------------

export type EvidenceBuildResult =
  | { ok: true; evidence: NormalizedEvidence }
  | { ok: false; error: string };

export function buildNormalizedEvidence(
  url: string,
  title: string,
  excerpt: string,
  sourceType: SourceType,
  sourceTier: SourceTier,
  confidence: ConfidenceLevel,
  authorOrPublisher: string | null,
  relevanceSummary: string | null,
  usefulnessRationale: string | null,
  uncertainty: string | null
): EvidenceBuildResult {
  const norm = normalizeResearchUrl(url);
  if (!norm.ok) return { ok: false, error: norm.error };

  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) return { ok: false, error: "Title is required." };
  if (trimmedTitle.length > RESEARCH_LIMITS.maxTitleLength) {
    return { ok: false, error: `Title exceeds ${RESEARCH_LIMITS.maxTitleLength} characters.` };
  }

  const trimmedExcerpt = excerpt.trim();
  if (trimmedExcerpt.length === 0) return { ok: false, error: "Excerpt is required." };
  const boundedExcerpt = trimmedExcerpt.slice(0, RESEARCH_LIMITS.maxExcerptLength);

  if (!isValidSourceType(sourceType)) return { ok: false, error: "Invalid source type." };
  if (!isValidSourceTier(sourceTier)) return { ok: false, error: "Invalid source tier." };
  if (!isValidConfidence(confidence)) return { ok: false, error: "Invalid confidence level." };

  const trimmedAuthor = authorOrPublisher?.trim() || null;
  if (trimmedAuthor && trimmedAuthor.length > RESEARCH_LIMITS.maxAuthorPublisherLength) {
    return { ok: false, error: `Author/publisher exceeds ${RESEARCH_LIMITS.maxAuthorPublisherLength} characters.` };
  }

  const trimmedRelevance = relevanceSummary?.trim() || null;
  if (trimmedRelevance && trimmedRelevance.length > RESEARCH_LIMITS.maxRelevanceLength) {
    return { ok: false, error: `Relevance summary exceeds ${RESEARCH_LIMITS.maxRelevanceLength} characters.` };
  }

  const trimmedUsefulness = usefulnessRationale?.trim() || null;
  if (trimmedUsefulness && trimmedUsefulness.length > RESEARCH_LIMITS.maxUsefulnessLength) {
    return { ok: false, error: `Usefulness rationale exceeds ${RESEARCH_LIMITS.maxUsefulnessLength} characters.` };
  }

  const trimmedUncertainty = uncertainty?.trim() || null;
  if (trimmedUncertainty && trimmedUncertainty.length > RESEARCH_LIMITS.maxUncertaintyLength) {
    return { ok: false, error: `Uncertainty exceeds ${RESEARCH_LIMITS.maxUncertaintyLength} characters.` };
  }

  const urlHash = computeUrlHash(norm.normalized);
  const evidenceHash = computeEvidenceHash(norm.normalized, trimmedTitle, boundedExcerpt);

  return {
    ok: true,
    evidence: {
      normalizedUrl: norm.normalized,
      urlHash,
      evidenceHash,
      title: trimmedTitle,
      publisherHost: norm.host,
      authorOrPublisher: trimmedAuthor,
      sourceType,
      sourceTier,
      boundedExcerpt,
      relevanceSummary: trimmedRelevance,
      usefulnessRationale: trimmedUsefulness,
      confidence,
      uncertainty: trimmedUncertainty,
    },
  };
}

// ---------------------------------------------------------------------------
// Synthesis response parser (architecture §6, synthesis request)
// ---------------------------------------------------------------------------

export type SynthesisParseResult =
  | { ok: true; output: SynthesisOutput }
  | { ok: false; error: string };

export function parseSynthesisResponse(
  raw: string
): SynthesisParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON in synthesis response." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Synthesis response must be an object." };
  }

  const obj = parsed as Record<string, unknown>;

  if (!hasOnlyAllowedKeys(obj, ["schemaVersion", "summary", "claims", "candidateRules"])) {
    return { ok: false, error: "Synthesis response contains unknown fields." };
  }

  // schemaVersion
  if (obj.schemaVersion !== 1) {
    return { ok: false, error: "Unsupported schema version." };
  }

  // summary
  if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
    return { ok: false, error: "Summary is required." };
  }
  if (obj.summary.length > RESEARCH_LIMITS.maxSummaryLength) {
    return { ok: false, error: `Summary exceeds ${RESEARCH_LIMITS.maxSummaryLength} characters.` };
  }

  // claims
  if (!Array.isArray(obj.claims)) {
    return { ok: false, error: "Claims must be an array." };
  }

  if (obj.claims.length < RESEARCH_LIMITS.minClaims) {
    return { ok: false, error: `Synthesis must contain at least ${RESEARCH_LIMITS.minClaims} claim(s).` };
  }

  if (obj.claims.length > RESEARCH_LIMITS.maxClaims) {
    return { ok: false, error: `Synthesis exceeds ${RESEARCH_LIMITS.maxClaims} claims.` };
  }

  // candidateRules (may be 0)
  if (!Array.isArray(obj.candidateRules)) {
    return { ok: false, error: "candidateRules must be an array." };
  }

  if (obj.candidateRules.length > RESEARCH_LIMITS.maxCandidateRules) {
    return { ok: false, error: `Synthesis exceeds ${RESEARCH_LIMITS.maxCandidateRules} candidate rules.` };
  }

  const claims: SynthesisClaimInput[] = [];
  const seenClaimKeys = new Set<string>();
  for (let i = 0; i < obj.claims.length; i++) {
    const result = parseSynthesisClaim(obj.claims[i], i);
    if (!result.ok) return result;
    if (seenClaimKeys.has(result.claim.key)) {
      return { ok: false, error: `Claim ${i}: duplicate key "${result.claim.key}".` };
    }
    seenClaimKeys.add(result.claim.key);
    claims.push(result.claim);
  }

  const candidateRules: SynthesisCandidateRuleInput[] = [];
  for (let i = 0; i < obj.candidateRules.length; i++) {
    const result = parseSynthesisCandidateRule(obj.candidateRules[i], i);
    if (!result.ok) return result;
    candidateRules.push(result.rule);
  }

  return {
    ok: true,
    output: {
      schemaVersion: 1,
      summary: obj.summary.trim(),
      claims,
      candidateRules,
    },
  };
}

const CLAIM_ALLOWED_KEYS = ["key", "kind", "text", "confidence", "uncertainty", "sourceAliases"] as const;

function parseSynthesisClaim(
  raw: unknown,
  index: number
): { ok: true; claim: SynthesisClaimInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `Claim ${index}: must be an object.` };
  }
  const obj = raw as Record<string, unknown>;

  if (!hasOnlyAllowedKeys(obj, CLAIM_ALLOWED_KEYS)) {
    return { ok: false, error: `Claim ${index}: contains unknown fields.` };
  }
  if (typeof obj.key !== "string" || obj.key.trim().length === 0) {
    return { ok: false, error: `Claim ${index}: key is required.` };
  }
  if (obj.key.length > RESEARCH_LIMITS.maxClaimKeyLength) {
    return { ok: false, error: `Claim ${index}: key exceeds ${RESEARCH_LIMITS.maxClaimKeyLength} characters.` };
  }
  if (!isValidClaimKind(obj.kind)) {
    return { ok: false, error: `Claim ${index}: invalid kind.` };
  }
  if (typeof obj.text !== "string" || obj.text.trim().length === 0) {
    return { ok: false, error: `Claim ${index}: text is required.` };
  }
  if (obj.text.length > RESEARCH_LIMITS.maxClaimTextLength) {
    return { ok: false, error: `Claim ${index}: text exceeds ${RESEARCH_LIMITS.maxClaimTextLength} characters.` };
  }
  if (!isValidClaimConfidence(obj.confidence)) {
    return { ok: false, error: `Claim ${index}: invalid confidence.` };
  }
  if (obj.uncertainty !== null && obj.uncertainty !== undefined && typeof obj.uncertainty !== "string") {
    return { ok: false, error: `Claim ${index}: uncertainty must be null or string.` };
  }
  if (typeof obj.uncertainty === "string" && obj.uncertainty.length > RESEARCH_LIMITS.maxUncertaintyLength) {
    return { ok: false, error: `Claim ${index}: uncertainty exceeds ${RESEARCH_LIMITS.maxUncertaintyLength} characters.` };
  }
  if (!Array.isArray(obj.sourceAliases)) {
    return { ok: false, error: `Claim ${index}: sourceAliases must be an array.` };
  }
  if (obj.sourceAliases.length === 0) {
    return { ok: false, error: `Claim ${index}: must cite at least one source.` };
  }
  const seenAliases = new Set<string>();
  for (const alias of obj.sourceAliases) {
    if (typeof alias !== "string" || alias.trim().length === 0) {
      return { ok: false, error: `Claim ${index}: invalid source alias.` };
    }
    if (alias.length > RESEARCH_LIMITS.maxSourceAliasLength) {
      return { ok: false, error: `Claim ${index}: source alias exceeds ${RESEARCH_LIMITS.maxSourceAliasLength} characters.` };
    }
    const trimmedAlias = alias.trim();
    if (seenAliases.has(trimmedAlias)) {
      return { ok: false, error: `Claim ${index}: duplicate source alias "${trimmedAlias}".` };
    }
    seenAliases.add(trimmedAlias);
  }

  return {
    ok: true,
    claim: {
      key: obj.key.trim(),
      kind: obj.kind,
      text: obj.text.trim(),
      confidence: obj.confidence,
      uncertainty: obj.uncertainty ?? null,
      sourceAliases: obj.sourceAliases.map((a: string) => a.trim()),
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
  "sourceAliases",
] as const;

function parseSynthesisCandidateRule(
  raw: unknown,
  index: number
): { ok: true; rule: SynthesisCandidateRuleInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `Candidate rule ${index}: must be an object.` };
  }
  const obj = raw as Record<string, unknown>;

  if (!hasOnlyAllowedKeys(obj, CANDIDATE_RULE_ALLOWED_KEYS)) {
    return { ok: false, error: `Candidate rule ${index}: contains unknown fields.` };
  }

  if (typeof obj.instruction !== "string" || obj.instruction.trim().length === 0) {
    return { ok: false, error: `Candidate rule ${index}: instruction is required.` };
  }
  if (obj.instruction.length > RESEARCH_LIMITS.maxRuleInstructionLength) {
    return { ok: false, error: `Candidate rule ${index}: instruction exceeds ${RESEARCH_LIMITS.maxRuleInstructionLength} characters.` };
  }

  // pillar: null or "world" | "visual"
  const pillar = obj.pillar ?? null;
  if (pillar !== null && pillar !== "world" && pillar !== "visual") {
    return { ok: false, error: `Candidate rule ${index}: invalid pillar.` };
  }

  // section, category, applicability: null or string, bounded
  const section = obj.section ?? null;
  if (section !== null && typeof section !== "string") {
    return { ok: false, error: `Candidate rule ${index}: section must be null or string.` };
  }
  if (typeof section === "string" && section.length > RESEARCH_LIMITS.maxRuleFieldLength) {
    return { ok: false, error: `Candidate rule ${index}: section exceeds ${RESEARCH_LIMITS.maxRuleFieldLength} characters.` };
  }
  const category = obj.category ?? null;
  if (category !== null && typeof category !== "string") {
    return { ok: false, error: `Candidate rule ${index}: category must be null or string.` };
  }
  if (typeof category === "string" && category.length > RESEARCH_LIMITS.maxRuleFieldLength) {
    return { ok: false, error: `Candidate rule ${index}: category exceeds ${RESEARCH_LIMITS.maxRuleFieldLength} characters.` };
  }
  const applicability = obj.applicability ?? null;
  if (applicability !== null && typeof applicability !== "string") {
    return { ok: false, error: `Candidate rule ${index}: applicability must be null or string.` };
  }
  if (typeof applicability === "string" && applicability.length > RESEARCH_LIMITS.maxRuleFieldLength) {
    return { ok: false, error: `Candidate rule ${index}: applicability exceeds ${RESEARCH_LIMITS.maxRuleFieldLength} characters.` };
  }

  const strength = obj.strength ?? null;
  if (strength !== null && strength !== "Required" && strength !== "Preferred" && strength !== "Avoid") {
    return { ok: false, error: `Candidate rule ${index}: invalid strength.` };
  }

  if (typeof obj.rationale !== "string" || obj.rationale.trim().length === 0) {
    return { ok: false, error: `Candidate rule ${index}: rationale is required.` };
  }
  if (obj.rationale.length > RESEARCH_LIMITS.maxRationaleLength) {
    return { ok: false, error: `Candidate rule ${index}: rationale exceeds ${RESEARCH_LIMITS.maxRationaleLength} characters.` };
  }

  if (!isValidClaimConfidence(obj.confidence)) {
    return { ok: false, error: `Candidate rule ${index}: invalid confidence.` };
  }

  if (obj.uncertainty !== null && obj.uncertainty !== undefined && typeof obj.uncertainty !== "string") {
    return { ok: false, error: `Candidate rule ${index}: uncertainty must be null or string.` };
  }
  if (typeof obj.uncertainty === "string" && obj.uncertainty.length > RESEARCH_LIMITS.maxUncertaintyLength) {
    return { ok: false, error: `Candidate rule ${index}: uncertainty exceeds ${RESEARCH_LIMITS.maxUncertaintyLength} characters.` };
  }

  if (!Array.isArray(obj.sourceAliases)) {
    return { ok: false, error: `Candidate rule ${index}: sourceAliases must be an array.` };
  }
  if (obj.sourceAliases.length === 0) {
    return { ok: false, error: `Candidate rule ${index}: must cite at least one source.` };
  }
  const seenRuleAliases = new Set<string>();
  for (const alias of obj.sourceAliases) {
    if (typeof alias !== "string" || alias.trim().length === 0) {
      return { ok: false, error: `Candidate rule ${index}: invalid source alias.` };
    }
    if (alias.length > RESEARCH_LIMITS.maxSourceAliasLength) {
      return { ok: false, error: `Candidate rule ${index}: source alias exceeds ${RESEARCH_LIMITS.maxSourceAliasLength} characters.` };
    }
    const trimmedAlias = alias.trim();
    if (seenRuleAliases.has(trimmedAlias)) {
      return { ok: false, error: `Candidate rule ${index}: duplicate source alias "${trimmedAlias}".` };
    }
    seenRuleAliases.add(trimmedAlias);
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
      uncertainty: obj.uncertainty ?? null,
      sourceAliases: obj.sourceAliases.map((a: string) => a.trim()),
    },
  };
}

// ---------------------------------------------------------------------------
// Source alias validation for synthesis (all aliases must resolve to
// selected sources)
// ---------------------------------------------------------------------------

export function validateSynthesisSourceAliases(
  output: SynthesisOutput,
  validAliases: Set<string>
): string | null {
  for (let i = 0; i < output.claims.length; i++) {
    const claim = output.claims[i];
    for (const alias of claim.sourceAliases) {
      if (!validAliases.has(alias)) {
        return `Claim ${i} cites unknown source alias "${alias}".`;
      }
    }
  }
  for (let i = 0; i < output.candidateRules.length; i++) {
    const rule = output.candidateRules[i];
    for (const alias of rule.sourceAliases) {
      if (!validAliases.has(alias)) {
        return `Candidate rule ${i} cites unknown source alias "${alias}".`;
      }
    }
  }
  return null;
}