// ---------------------------------------------------------------------------
// contracts.ts — STYLE.1.C.CORE
//
// Pure type and constant definitions for the Research domain.
// No DB, no network, no side effects.
// ---------------------------------------------------------------------------

// --- Enums matching schema exactly ---

export const RESEARCH_LEASE_OPERATIONS = ["search", "synthesis"] as const;
export type ResearchLeaseOperation = (typeof RESEARCH_LEASE_OPERATIONS)[number];

export const SOURCE_TYPES = [
  "article",
  "interview",
  "review",
  "documentation",
  "portfolio",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TIERS = ["primary", "secondary", "unknown"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CLAIM_KINDS = [
  "shared_trait",
  "limited_observation",
  "disagreement",
  "uncertainty",
  "project_principle",
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ClaimConfidenceLevel = (typeof CLAIM_CONFIDENCE_LEVELS)[number];

export const CANDIDATE_STATES = ["pending_review", "saved", "dismissed"] as const;
export type CandidateState = (typeof CANDIDATE_STATES)[number];

export const SOURCE_STATUSES = ["active", "withdrawn"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const CANDIDATE_RULE_STATUSES = ["proposed", "rejected", "approved"] as const;
export type CandidateRuleStatus = (typeof CANDIDATE_RULE_STATUSES)[number];

// --- Limits from architecture §7 ---

export const RESEARCH_LIMITS = {
  maxCandidatesPerSearch: 5,
  maxQueryLength: 1_200,
  maxInfluenceContextSearch: 4_000,
  maxTitleLength: 300,
  maxAuthorPublisherLength: 300,
  maxExcerptLength: 1_200,
  maxRelevanceLength: 600,
  maxUsefulnessLength: 600,
  maxUncertaintyLength: 600,
  maxUserNotesLength: 2_000,
  maxDomainsPerSource: 8,
  minSourcesPerSynthesis: 2,
  maxSourcesPerSynthesis: 12,
  maxTotalEvidenceSynthesis: 14_400,
  maxInfluenceContextSynthesis: 6_000,
  minClaims: 1,
  maxClaims: 20,
  maxCandidateRules: 8,
  maxSearchResponseBytes: 64 * 1_024,
  maxSynthesisResponseBytes: 128 * 1_024,
  searchTimeoutMs: 45_000,
  synthesisTimeoutMs: 60_000,
  leaseExpiryMinutes: 10,
  // --- STYLE.1.C.CORE retake (P1 "exhaustive runtime validation") ---
  // Bounds for provider-supplied Synthesis text fields that had no limit at
  // all before the retake — a malformed/adversarial provider response could
  // otherwise persist unbounded text.
  maxSummaryLength: 4_000,
  maxClaimTextLength: 2_000,
  maxClaimKeyLength: 100,
  maxSourceAliasLength: 50,
  maxRuleInstructionLength: 2_000,
  maxRationaleLength: 2_000,
  maxRuleFieldLength: 300,
} as const;

export const RESEARCH_PROVIDER = "openrouter" as const;
export const RESEARCH_MODEL = "openai/gpt-4o-mini" as const;
export const RESEARCH_CONTRACT_VERSION = 1 as const;

// --- Normalized evidence fields shared by Candidate and Source ---

export type NormalizedEvidence = {
  normalizedUrl: string;
  urlHash: string;
  evidenceHash: string;
  title: string;
  publisherHost: string;
  authorOrPublisher: string | null;
  sourceType: SourceType;
  sourceTier: SourceTier;
  boundedExcerpt: string;
  relevanceSummary: string | null;
  usefulnessRationale: string | null;
  confidence: ConfidenceLevel;
  uncertainty: string | null;
};

// --- Synthesis output contract (what the provider must return) ---

export type SynthesisClaimInput = {
  key: string;
  kind: ClaimKind;
  text: string;
  confidence: ClaimConfidenceLevel;
  uncertainty: string | null;
  sourceAliases: string[];
};

export type SynthesisCandidateRuleInput = {
  instruction: string;
  pillar: "world" | "visual" | null;
  section: string | null;
  category: string | null;
  strength: "Required" | "Preferred" | "Avoid" | null;
  applicability: string | null;
  rationale: string;
  confidence: ClaimConfidenceLevel;
  uncertainty: string | null;
  sourceAliases: string[];
};

export type SynthesisOutput = {
  schemaVersion: number;
  summary: string;
  claims: SynthesisClaimInput[];
  candidateRules: SynthesisCandidateRuleInput[];
};