"use server";

// ---------------------------------------------------------------------------
// research.ts — STYLE.1.C.CORE (retake — Codex REVISE round 1)
//
// Server Actions for the Research domain of one Creative Influence.
// All mutations use synchronous better-sqlite3 transactions matching the
// established pattern in projectStyle.ts / projectStyleInfluences.ts.
//
// Retake fixes applied here (see .agents/codex_review.md round 1):
//   - every lease read/delete/verify is scoped by influenceId + operation +
//     token, never a blind "first lease of this influence" read/delete;
//   - Synthesis commit rechecks the EXACT source revision captured before
//     the provider call, not just status; the exact bounded canonical
//     prompt sent to the provider is persisted and hashed;
//   - the read model is confined to the owned Influence's own rows only
//     (a prior version leaked ALL Claims in the database) and now returns
//     every provenance join STYLE.1.C.UI needs;
//   - draft-rule insertion uses the real shared
//     `insertApprovedRuleIntoDraft` helper (also used by addRuleAction),
//     never a second local copy;
//   - every Server Action validates ids/revisions/enums/bounded text at
//     runtime before any DB/network operation.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projects,
  projectStyleInfluences,
  projectStyleResearchLeases,
  projectStyleResearchRuns,
  projectStyleResearchSources,
  projectStyleResearchCandidates,
  projectStyleResearchSourceDomains,
  projectStyleResearchSyntheses,
  projectStyleResearchSynthesisSources,
  projectStyleResearchClaims,
  projectStyleResearchClaimSources,
  projectStyleResearchCandidateRules,
  projectStyleResearchCandidateRuleSources,
  projectStyleDrafts,
  type ProjectStyleDraft,
  type ProjectStyleResearchRun,
  type ProjectStyleResearchCandidate,
  type ProjectStyleResearchSource,
  type ProjectStyleResearchSourceDomain,
  type ProjectStyleResearchSynthesis,
  type ProjectStyleResearchSynthesisSource,
  type ProjectStyleResearchClaim,
  type ProjectStyleResearchClaimSource,
  type ProjectStyleResearchCandidateRule,
  type ProjectStyleResearchCandidateRuleSource,
} from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  RESEARCH_CONTRACT_VERSION,
  RESEARCH_LIMITS,
  type ResearchLeaseOperation,
} from "@/lib/projectStyle/research/contracts";
import {
  isValidConfidence,
  isValidSourceType,
  isValidSourceTier,
  isValidUuid,
  isValidDecisionRevision,
  validateResearchDomains,
  sha256Hex,
} from "@/lib/projectStyle/research/validation";
import { isValidId, isValidRevision } from "@/lib/projectStyle/validation";
import { isValidNullablePillar, isValidNullableStrength } from "@/lib/projectStyle/validation";
import {
  searchResearch,
  synthesizeResearch,
  getResearchRuntimeInfo,
  getResearchEffectiveProfile,
  describeResearchProviderError,
  type SynthesisSource,
  type ResearchRuntimeInfo,
} from "@/lib/projectStyle/research/provider";
import { insertApprovedRuleIntoDraft } from "@/lib/projectStyle/insertDraftRule";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Shared types and helpers
// ---------------------------------------------------------------------------

type OwnershipResult = { ok: true } | { ok: false; error: string };

async function assertProjectAndInfluence(
  projectId: unknown,
  influenceId: unknown
): Promise<OwnershipResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(influenceId)) return { ok: false, error: "Invalid influence id." };
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };
  const [influence] = await db
    .select()
    .from(projectStyleInfluences)
    .where(eq(projectStyleInfluences.id, influenceId));
  if (!influence || influence.projectId !== projectId) return { ok: false, error: "Influence not found." };
  return { ok: true };
}

function generateLeaseToken(): string {
  return randomBytes(32).toString("hex");
}

function leaseExpiry(): string {
  return new Date(Date.now() + RESEARCH_LIMITS.leaseExpiryMinutes * 60_000).toISOString();
}

function now(): string {
  return new Date().toISOString();
}

function isValidOptionalBoundedText(value: unknown, maxLength: number): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && value.length <= maxLength;
}

type MutationResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Lease helpers — every read/verify/delete is scoped by
// influenceId + operation (+ token where applicable). Never a blind
// "first/any lease of this influence" query: Search and Synthesis leases
// coexist per the schema's own `unique(influenceId, operation)` constraint,
// and a late response whose token no longer matches the live row must be a
// guaranteed no-op, never a cross-operation or cross-request deletion.
// ---------------------------------------------------------------------------

type LeaseAcquireResult = { kind: "ok"; token: string } | { kind: "conflict" };

function acquireLease(influenceId: number, operation: ResearchLeaseOperation, timestamp: string): LeaseAcquireResult {
  const token = generateLeaseToken();
  const outcome = db.transaction((tx) => {
    const [existing] = tx
      .select()
      .from(projectStyleResearchLeases)
      .where(
        and(eq(projectStyleResearchLeases.influenceId, influenceId), eq(projectStyleResearchLeases.operation, operation))
      )
      .all() as Array<typeof projectStyleResearchLeases.$inferSelect>;

    if (existing && existing.expiresAt > timestamp) {
      return { kind: "conflict" as const };
    }

    if (existing) {
      tx.update(projectStyleResearchLeases)
        .set({ token, expiresAt: leaseExpiry(), createdAt: timestamp })
        .where(eq(projectStyleResearchLeases.id, existing.id))
        .run();
    } else {
      tx.insert(projectStyleResearchLeases)
        .values({ influenceId, operation, token, expiresAt: leaseExpiry(), createdAt: timestamp })
        .run();
    }
    return { kind: "ok" as const };
  });

  if (outcome.kind === "conflict") return { kind: "conflict" };
  return { kind: "ok", token };
}

/** Deletes the lease ONLY if it still matches influenceId + operation + token exactly — a late/expired/replaced lease is never touched. Used on provider-call failure, outside any transaction (a single DELETE is already atomic). */
function releaseOwnedLease(influenceId: number, operation: ResearchLeaseOperation, token: string): void {
  db.delete(projectStyleResearchLeases)
    .where(
      and(
        eq(projectStyleResearchLeases.influenceId, influenceId),
        eq(projectStyleResearchLeases.operation, operation),
        eq(projectStyleResearchLeases.token, token)
      )
    )
    .run();
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Verifies the exact owned, unexpired lease still exists inside `tx` and consumes (deletes) it. Returns false — leaving the lease row untouched — if the token no longer matches or has expired, so the caller can refuse without silently deleting someone else's lease. */
function verifyAndConsumeLease(tx: Tx, influenceId: number, operation: ResearchLeaseOperation, token: string, timestamp: string): boolean {
  const [lease] = tx
    .select()
    .from(projectStyleResearchLeases)
    .where(
      and(
        eq(projectStyleResearchLeases.influenceId, influenceId),
        eq(projectStyleResearchLeases.operation, operation),
        eq(projectStyleResearchLeases.token, token)
      )
    )
    .all() as Array<typeof projectStyleResearchLeases.$inferSelect>;

  if (!lease || lease.expiresAt < timestamp) return false;

  tx.delete(projectStyleResearchLeases).where(eq(projectStyleResearchLeases.id, lease.id)).run();
  return true;
}

// ---------------------------------------------------------------------------
// Read model — all Research records for one owned Influence, fully confined
// to Project -> Influence ownership, including every provenance join.
// ---------------------------------------------------------------------------

// STYLE.1.C.CORE retake round 2 — every array below is the FULL durable row
// shape (`$inferSelect`), not a hand-picked subset. The round-1 read model
// omitted fields `STYLE.1.C.UI` genuinely needs (author/publisher, tier,
// relevance/usefulness assessments, uncertainty, every Candidate Rule
// editable/original field, timestamps...) — under-projecting here would
// have forced a CORE change once the UI is built, exactly what this ticket
// must avoid. Nothing sensitive lives in these tables (no raw provider
// body, prompt, header or key is ever persisted — see provider.ts), so a
// full-row projection introduces no secret exposure.
export type ResearchReadModel = {
  runs: ProjectStyleResearchRun[];
  candidates: ProjectStyleResearchCandidate[];
  sources: ProjectStyleResearchSource[];
  sourceDomains: ProjectStyleResearchSourceDomain[];
  syntheses: ProjectStyleResearchSynthesis[];
  synthesisSources: ProjectStyleResearchSynthesisSource[];
  claims: ProjectStyleResearchClaim[];
  claimSources: ProjectStyleResearchClaimSource[];
  candidateRules: ProjectStyleResearchCandidateRule[];
  candidateRuleSources: ProjectStyleResearchCandidateRuleSource[];
  /** Secret-free effective Research runtime descriptor (STYLE.1.C.SEARCH.FIX1)
   * — the single server-owned source of truth the UI reads to show the
   * actual effective provider/model and any blocking configuration error. */
  runtime: ResearchRuntimeInfo;
};

export async function getResearchReadModel(
  projectId: unknown,
  influenceId: unknown
): Promise<ResearchReadModel | { ok: false; error: string }> {
  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return ownership;
  const scopedInfluenceId = influenceId as number;

  const runs = await db
    .select()
    .from(projectStyleResearchRuns)
    .where(eq(projectStyleResearchRuns.influenceId, scopedInfluenceId))
    .orderBy(desc(projectStyleResearchRuns.runNumber));

  const candidates = await db
    .select()
    .from(projectStyleResearchCandidates)
    .where(eq(projectStyleResearchCandidates.influenceId, scopedInfluenceId))
    .orderBy(desc(projectStyleResearchCandidates.createdAt));

  const sources = await db
    .select()
    .from(projectStyleResearchSources)
    .where(eq(projectStyleResearchSources.influenceId, scopedInfluenceId))
    .orderBy(desc(projectStyleResearchSources.createdAt));

  const sourceIds = sources.map((s) => s.id);
  const sourceDomains =
    sourceIds.length > 0
      ? await db
          .select()
          .from(projectStyleResearchSourceDomains)
          .where(inArray(projectStyleResearchSourceDomains.sourceId, sourceIds))
      : [];

  const syntheses = await db
    .select()
    .from(projectStyleResearchSyntheses)
    .where(eq(projectStyleResearchSyntheses.influenceId, scopedInfluenceId))
    .orderBy(desc(projectStyleResearchSyntheses.versionNumber));

  const synthesisIds = syntheses.map((s) => s.id);
  const synthesisSources =
    synthesisIds.length > 0
      ? await db
          .select()
          .from(projectStyleResearchSynthesisSources)
          .where(inArray(projectStyleResearchSynthesisSources.synthesisId, synthesisIds))
      : [];

  // STYLE.1.C.CORE retake — previously unfiltered (leaked every Claim in
  // the database). Confined to this Influence's own Syntheses only.
  const claims =
    synthesisIds.length > 0
      ? await db
          .select()
          .from(projectStyleResearchClaims)
          .where(inArray(projectStyleResearchClaims.synthesisId, synthesisIds))
          .orderBy(desc(projectStyleResearchClaims.createdAt))
      : [];

  const claimIds = claims.map((c) => c.id);
  const claimSources =
    claimIds.length > 0
      ? await db
          .select()
          .from(projectStyleResearchClaimSources)
          .where(inArray(projectStyleResearchClaimSources.claimId, claimIds))
      : [];

  const candidateRules = await db
    .select()
    .from(projectStyleResearchCandidateRules)
    .where(eq(projectStyleResearchCandidateRules.influenceId, scopedInfluenceId))
    .orderBy(desc(projectStyleResearchCandidateRules.createdAt));

  const candidateRuleIds = candidateRules.map((r) => r.id);
  const candidateRuleSources =
    candidateRuleIds.length > 0
      ? await db
          .select()
          .from(projectStyleResearchCandidateRuleSources)
          .where(inArray(projectStyleResearchCandidateRuleSources.candidateRuleId, candidateRuleIds))
      : [];

  const runtime = await getResearchRuntimeInfo();

  return {
    runs,
    candidates,
    sources,
    sourceDomains,
    syntheses,
    synthesisSources,
    claims,
    claimSources,
    candidateRules,
    candidateRuleSources,
    runtime,
  };
}

// ---------------------------------------------------------------------------
// researchInfluenceAction — Stage 1: web search
// ---------------------------------------------------------------------------

export async function researchInfluenceAction(input: {
  projectId: number;
  influenceId: number;
  requestKey: string;
  query: string;
}): Promise<MutationResult> {
  const { projectId, influenceId, requestKey, query } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidUuid(requestKey)) return { ok: false, error: "Invalid request key." };
  if (typeof query !== "string" || query.trim().length === 0) return { ok: false, error: "Query is required." };
  if (query.length > RESEARCH_LIMITS.maxQueryLength) return { ok: false, error: `Query exceeds ${RESEARCH_LIMITS.maxQueryLength} characters.` };

  const timestamp = now();

  // Check idempotency — return existing Run for same request key
  const existingRun = await db
    .select()
    .from(projectStyleResearchRuns)
    .where(eq(projectStyleResearchRuns.influenceId, influenceId))
    .all();
  const idempotent = existingRun.find((r) => r.requestKey === requestKey);
  if (idempotent) {
    return { ok: true, runId: idempotent.id, idempotent: true };
  }

  // Independently resolve and enforce the effective Research runtime
  // contract server-side (never trust client-forged state) — refused
  // BEFORE any lease acquisition, network access or persistence
  // (STYLE.1.C.SEARCH.FIX1 §3/§5). `getResearchEffectiveProfile` resolves
  // provider, model AND key from ONE atomic Settings read (retake round 1,
  // P1 finding #1) — captured once here so the exact provider/model/key
  // used for the network call below is also what gets persisted, even if
  // Settings changes while the request is in flight.
  const profile = await getResearchEffectiveProfile();
  if (profile.configurationError) {
    return { ok: false, error: profile.configurationError };
  }
  const effectiveProvider = profile.effectiveProvider;
  const effectiveModel = profile.model;
  const effectiveApiKey = profile.apiKey;

  // Acquire search lease — scoped to (influenceId, "search") only; a
  // concurrent/active Synthesis lease for the same Influence is untouched.
  const leaseOutcome = acquireLease(influenceId, "search", timestamp);
  if (leaseOutcome.kind === "conflict") {
    return { ok: false, error: "A search is already in progress for this influence." };
  }
  const leaseToken = leaseOutcome.token;

  // Build influence context
  const [influence] = await db
    .select()
    .from(projectStyleInfluences)
    .where(eq(projectStyleInfluences.id, influenceId))
    .all() as Array<typeof projectStyleInfluences.$inferSelect>;

  const influenceContext = [
    influence.subjectName,
    influence.roleOrDiscipline,
    influence.whatInterestsMe,
  ]
    .filter(Boolean)
    .join(" — ");

  // Call provider outside transaction
  const searchResult = await searchResearch(query.trim(), influenceContext, effectiveModel, effectiveApiKey);

  if (!searchResult.ok) {
    releaseOwnedLease(influenceId, "search", leaseToken);
    return { ok: false, error: describeResearchProviderError("search", searchResult.error) };
  }

  // Commit Run + Candidates in one transaction, verify the exact owned lease
  const commitOutcome = db.transaction((tx) => {
    if (!verifyAndConsumeLease(tx, influenceId, "search", leaseToken, now())) {
      return { kind: "lease-lost" as const };
    }

    // Allocate run number
    const maxRun = tx
      .select({ maxNum: sql<number>`COALESCE(MAX(${projectStyleResearchRuns.runNumber}), 0)` })
      .from(projectStyleResearchRuns)
      .where(eq(projectStyleResearchRuns.influenceId, influenceId))
      .all() as Array<{ maxNum: number }>;
    const runNumber = (maxRun[0]?.maxNum ?? 0) + 1;

    const insertedRun = tx
      .insert(projectStyleResearchRuns)
      .values({
        projectId,
        influenceId,
        runNumber,
        requestKey,
        query: query.trim().slice(0, RESEARCH_LIMITS.maxQueryLength),
        provider: effectiveProvider,
        model: effectiveModel,
        contractVersion: RESEARCH_CONTRACT_VERSION,
        maxResults: RESEARCH_LIMITS.maxCandidatesPerSearch,
        maxToolCalls: 1,
        createdAt: timestamp,
      })
      .run();
    const runId = Number(insertedRun.lastInsertRowid);

    // Insert candidates
    for (let i = 0; i < searchResult.candidates.length; i++) {
      const c = searchResult.candidates[i];
      tx.insert(projectStyleResearchCandidates)
        .values({
          projectId,
          influenceId,
          runId,
          ordinal: i,
          normalizedUrl: c.normalizedUrl,
          urlHash: c.urlHash,
          evidenceHash: c.evidenceHash,
          title: c.title,
          publisherHost: c.publisherHost,
          authorOrPublisher: c.authorOrPublisher,
          sourceType: c.sourceType,
          sourceTier: c.sourceTier,
          boundedExcerpt: c.boundedExcerpt,
          relevanceSummary: c.relevanceSummary,
          usefulnessRationale: c.usefulnessRationale,
          confidence: c.confidence,
          uncertainty: c.uncertainty,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
    }

    return { kind: "ok" as const, runId, candidateCount: searchResult.candidates.length };
  });

  if (commitOutcome.kind === "lease-lost") {
    return { ok: false, error: "Search lease expired or was taken by another request." };
  }

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, runId: commitOutcome.runId, candidateCount: commitOutcome.candidateCount };
}

// ---------------------------------------------------------------------------
// saveResearchCandidateAction — Save a pending_review candidate
// ---------------------------------------------------------------------------

export async function saveResearchCandidateAction(input: {
  projectId: number;
  influenceId: number;
  candidateId: number;
  expectedDecisionRevision: number;
  sourceType?: string;
  sourceTier?: string;
  confidence?: string;
  authorOrPublisher?: string | null;
  relevanceSummary?: string | null;
  usefulnessRationale?: string | null;
  uncertainty?: string | null;
  userNotes?: string | null;
  domains?: string[];
}): Promise<MutationResult> {
  const { projectId, influenceId, candidateId, expectedDecisionRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(candidateId)) return { ok: false, error: "Invalid candidate id." };
  if (!isValidDecisionRevision(expectedDecisionRevision)) return { ok: false, error: "Invalid expected decision revision." };
  if (!isValidOptionalBoundedText(input.authorOrPublisher, RESEARCH_LIMITS.maxAuthorPublisherLength)) {
    return { ok: false, error: `Author/publisher exceeds ${RESEARCH_LIMITS.maxAuthorPublisherLength} characters.` };
  }
  if (!isValidOptionalBoundedText(input.relevanceSummary, RESEARCH_LIMITS.maxRelevanceLength)) {
    return { ok: false, error: `Relevance summary exceeds ${RESEARCH_LIMITS.maxRelevanceLength} characters.` };
  }
  if (!isValidOptionalBoundedText(input.usefulnessRationale, RESEARCH_LIMITS.maxUsefulnessLength)) {
    return { ok: false, error: `Usefulness rationale exceeds ${RESEARCH_LIMITS.maxUsefulnessLength} characters.` };
  }
  if (!isValidOptionalBoundedText(input.uncertainty, RESEARCH_LIMITS.maxUncertaintyLength)) {
    return { ok: false, error: `Uncertainty exceeds ${RESEARCH_LIMITS.maxUncertaintyLength} characters.` };
  }
  if (!isValidOptionalBoundedText(input.userNotes, RESEARCH_LIMITS.maxUserNotesLength)) {
    return { ok: false, error: `User notes exceed ${RESEARCH_LIMITS.maxUserNotesLength} characters.` };
  }
  const domains = validateResearchDomains(input.domains);
  if (domains === null) {
    return { ok: false, error: `Invalid, duplicate, or too many domains (max ${RESEARCH_LIMITS.maxDomainsPerSource}).` };
  }

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    // Fetch candidate
    const [candidate] = tx
      .select()
      .from(projectStyleResearchCandidates)
      .where(eq(projectStyleResearchCandidates.id, candidateId))
      .all() as Array<typeof projectStyleResearchCandidates.$inferSelect>;

    if (!candidate || candidate.influenceId !== influenceId || candidate.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (candidate.state !== "pending_review") {
      return { kind: "already-decided" as const };
    }
    if (candidate.decisionRevision !== expectedDecisionRevision) {
      return { kind: "stale" as const, currentRevision: candidate.decisionRevision };
    }

    const sourceType = input.sourceType ?? candidate.sourceType;
    const sourceTier = input.sourceTier ?? candidate.sourceTier;
    const confidence = input.confidence ?? candidate.confidence;

    if (!isValidSourceType(sourceType)) return { kind: "invalid" as const, error: "Invalid source type." };
    if (!isValidSourceTier(sourceTier)) return { kind: "invalid" as const, error: "Invalid source tier." };
    if (!isValidConfidence(confidence)) return { kind: "invalid" as const, error: "Invalid confidence." };

    // Create or reuse Source
    const existingSource = tx
      .select()
      .from(projectStyleResearchSources)
      .where(eq(projectStyleResearchSources.influenceId, influenceId))
      .all() as Array<typeof projectStyleResearchSources.$inferSelect>;

    let sourceId: number;
    const match = existingSource.find(
      (s) => s.urlHash === candidate.urlHash && s.evidenceHash === candidate.evidenceHash
    );

    if (match) {
      sourceId = match.id;
      // Replace domains if supplied (already validated/normalized/bounded above)
      if (input.domains !== undefined) {
        tx.delete(projectStyleResearchSourceDomains)
          .where(eq(projectStyleResearchSourceDomains.sourceId, sourceId))
          .run();
        for (const domain of domains) {
          tx.insert(projectStyleResearchSourceDomains)
            .values({ sourceId, domain, createdAt: timestamp })
            .run();
        }
      }
    } else {
      const inserted = tx
        .insert(projectStyleResearchSources)
        .values({
          projectId,
          influenceId,
          normalizedUrl: candidate.normalizedUrl,
          urlHash: candidate.urlHash,
          evidenceHash: candidate.evidenceHash,
          title: candidate.title,
          publisherHost: candidate.publisherHost,
          authorOrPublisher: input.authorOrPublisher ?? candidate.authorOrPublisher,
          sourceType,
          sourceTier,
          boundedExcerpt: candidate.boundedExcerpt,
          relevanceSummary: input.relevanceSummary ?? candidate.relevanceSummary,
          usefulnessRationale: input.usefulnessRationale ?? candidate.usefulnessRationale,
          confidence,
          uncertainty: input.uncertainty ?? candidate.uncertainty,
          userNotes: input.userNotes ?? null,
          status: "active",
          revision: 1,
          savedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      sourceId = Number(inserted.lastInsertRowid);

      for (const domain of domains) {
        tx.insert(projectStyleResearchSourceDomains)
          .values({ sourceId, domain, createdAt: timestamp })
          .run();
      }
    }

    // Transition candidate to saved
    tx.update(projectStyleResearchCandidates)
      .set({
        state: "saved",
        decisionRevision: candidate.decisionRevision + 1,
        savedSourceId: sourceId,
        decidedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleResearchCandidates.id, candidateId))
      .run();

    return { kind: "ok" as const, sourceId };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Candidate not found." };
  if (outcome.kind === "already-decided") return { ok: false, error: "Candidate already decided." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale decision revision (current: ${outcome.currentRevision}).` };
  if (outcome.kind === "invalid") return { ok: false, error: outcome.error };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, sourceId: outcome.sourceId };
}

// ---------------------------------------------------------------------------
// dismissResearchCandidateAction — Dismiss a pending_review candidate
// ---------------------------------------------------------------------------

export async function dismissResearchCandidateAction(input: {
  projectId: number;
  influenceId: number;
  candidateId: number;
  expectedDecisionRevision: number;
}): Promise<MutationResult> {
  const { projectId, influenceId, candidateId, expectedDecisionRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(candidateId)) return { ok: false, error: "Invalid candidate id." };
  if (!isValidDecisionRevision(expectedDecisionRevision)) return { ok: false, error: "Invalid expected decision revision." };

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    const [candidate] = tx
      .select()
      .from(projectStyleResearchCandidates)
      .where(eq(projectStyleResearchCandidates.id, candidateId))
      .all() as Array<typeof projectStyleResearchCandidates.$inferSelect>;

    if (!candidate || candidate.influenceId !== influenceId || candidate.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (candidate.state !== "pending_review") {
      return { kind: "already-decided" as const };
    }
    if (candidate.decisionRevision !== expectedDecisionRevision) {
      return { kind: "stale" as const };
    }

    tx.update(projectStyleResearchCandidates)
      .set({
        state: "dismissed",
        decisionRevision: candidate.decisionRevision + 1,
        decidedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleResearchCandidates.id, candidateId))
      .run();

    return { kind: "ok" as const };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Candidate not found." };
  if (outcome.kind === "already-decided") return { ok: false, error: "Candidate already decided." };
  if (outcome.kind === "stale") return { ok: false, error: "Stale decision revision." };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// updateResearchSourceAction — Update mutable source metadata
// ---------------------------------------------------------------------------

// STYLE.1.C.CORE retake round 2 — the architecture (§ "Persistent source
// record") declares provider evidence fields immutable: "Only user notes,
// status and revision are mutable." `sourceType`/`sourceTier`/`confidence`
// are the reviewer's initial assessment, editable ONLY at
// `saveResearchCandidateAction` time (before the Source even exists);
// once saved, this action may edit `userNotes` only. Withdrawal (`status`)
// has its own dedicated action. A forged request naming
// `sourceType`/`sourceTier`/`confidence` here is silently ignored — those
// keys are simply never read below.
export async function updateResearchSourceAction(input: {
  projectId: number;
  influenceId: number;
  sourceId: number;
  expectedRevision: number;
  userNotes?: string | null;
}): Promise<MutationResult> {
  const { projectId, influenceId, sourceId, expectedRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(sourceId)) return { ok: false, error: "Invalid source id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (!isValidOptionalBoundedText(input.userNotes, RESEARCH_LIMITS.maxUserNotesLength)) {
    return { ok: false, error: `User notes exceed ${RESEARCH_LIMITS.maxUserNotesLength} characters.` };
  }

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    const [source] = tx
      .select()
      .from(projectStyleResearchSources)
      .where(eq(projectStyleResearchSources.id, sourceId))
      .all() as Array<typeof projectStyleResearchSources.$inferSelect>;

    if (!source || source.influenceId !== influenceId || source.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (source.revision !== expectedRevision) {
      return { kind: "stale" as const, currentRevision: source.revision };
    }

    const updates: Record<string, unknown> = { updatedAt: timestamp, revision: source.revision + 1 };

    if (input.userNotes !== undefined) {
      updates.userNotes = input.userNotes?.trim() || null;
    }

    tx.update(projectStyleResearchSources)
      .set(updates)
      .where(eq(projectStyleResearchSources.id, sourceId))
      .run();

    return { kind: "ok" as const, revision: source.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Source not found." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale revision (current: ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

// ---------------------------------------------------------------------------
// withdrawResearchSourceAction — Withdraw an active source
// ---------------------------------------------------------------------------

export async function withdrawResearchSourceAction(input: {
  projectId: number;
  influenceId: number;
  sourceId: number;
  expectedRevision: number;
}): Promise<MutationResult> {
  const { projectId, influenceId, sourceId, expectedRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(sourceId)) return { ok: false, error: "Invalid source id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    const [source] = tx
      .select()
      .from(projectStyleResearchSources)
      .where(eq(projectStyleResearchSources.id, sourceId))
      .all() as Array<typeof projectStyleResearchSources.$inferSelect>;

    if (!source || source.influenceId !== influenceId || source.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (source.status !== "active") {
      return { kind: "already-withdrawn" as const };
    }
    if (source.revision !== expectedRevision) {
      return { kind: "stale" as const, currentRevision: source.revision };
    }

    tx.update(projectStyleResearchSources)
      .set({
        status: "withdrawn",
        withdrawnAt: timestamp,
        revision: source.revision + 1,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleResearchSources.id, sourceId))
      .run();

    return { kind: "ok" as const, revision: source.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Source not found." };
  if (outcome.kind === "already-withdrawn") return { ok: false, error: "Source already withdrawn." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale revision (current: ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

// ---------------------------------------------------------------------------
// synthesizeInfluenceResearchAction — Stage 2: synthesis from saved sources
// ---------------------------------------------------------------------------

export async function synthesizeInfluenceResearchAction(input: {
  projectId: number;
  influenceId: number;
  requestKey: string;
  sourceIds: number[];
}): Promise<MutationResult> {
  const { projectId, influenceId, requestKey, sourceIds } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidUuid(requestKey)) return { ok: false, error: "Invalid request key." };
  if (!Array.isArray(sourceIds) || sourceIds.length < RESEARCH_LIMITS.minSourcesPerSynthesis) {
    return { ok: false, error: `Need at least ${RESEARCH_LIMITS.minSourcesPerSynthesis} sources.` };
  }
  if (sourceIds.length > RESEARCH_LIMITS.maxSourcesPerSynthesis) {
    return { ok: false, error: `Exceeds ${RESEARCH_LIMITS.maxSourcesPerSynthesis} sources.` };
  }
  if (!sourceIds.every(isValidId)) {
    return { ok: false, error: "Invalid source id in selection." };
  }

  const timestamp = now();

  // Idempotency check
  const existingSyntheses = await db
    .select()
    .from(projectStyleResearchSyntheses)
    .where(eq(projectStyleResearchSyntheses.influenceId, influenceId))
    .all();
  const idempotent = existingSyntheses.find((s) => s.requestKey === requestKey);
  if (idempotent) {
    return { ok: true, synthesisId: idempotent.id, idempotent: true };
  }

  // Independently resolve and enforce the effective Research runtime
  // contract server-side — refused BEFORE any lease acquisition, network
  // access or persistence (STYLE.1.C.SEARCH.FIX1 §3/§5). Both Research
  // operations (Search and Synthesis) resolve through this same
  // single-read effective provider/model/key profile (retake round 1, P1
  // finding #1).
  const profile = await getResearchEffectiveProfile();
  if (profile.configurationError) {
    return { ok: false, error: profile.configurationError };
  }
  const effectiveProvider = profile.effectiveProvider;
  const effectiveModel = profile.model;
  const effectiveApiKey = profile.apiKey;

  // Validate and collect sources
  const uniqueSourceIds = [...new Set(sourceIds)];
  if (uniqueSourceIds.length !== sourceIds.length) {
    return { ok: false, error: "Duplicate source ids." };
  }

  const allSources = await db
    .select()
    .from(projectStyleResearchSources)
    .where(eq(projectStyleResearchSources.influenceId, influenceId))
    .all() as Array<typeof projectStyleResearchSources.$inferSelect>;

  const selectedSources: SynthesisSource[] = [];
  for (const sid of uniqueSourceIds) {
    const src = allSources.find((s) => s.id === sid);
    if (!src || src.influenceId !== influenceId || src.projectId !== projectId) {
      return { ok: false, error: `Source ${sid} not found.` };
    }
    if (src.status !== "active") {
      return { ok: false, error: `Source ${sid} is not active.` };
    }
    selectedSources.push({
      sourceId: src.id,
      revision: src.revision,
      title: src.title,
      boundedExcerpt: src.boundedExcerpt,
      normalizedUrl: src.normalizedUrl,
    });
  }

  // Acquire synthesis lease — scoped to (influenceId, "synthesis") only; a
  // concurrent/active Search lease for the same Influence is untouched.
  const leaseOutcome = acquireLease(influenceId, "synthesis", timestamp);
  if (leaseOutcome.kind === "conflict") {
    return { ok: false, error: "A synthesis is already in progress for this influence." };
  }
  const leaseToken = leaseOutcome.token;

  // Build context and call provider
  const [influence] = await db
    .select()
    .from(projectStyleInfluences)
    .where(eq(projectStyleInfluences.id, influenceId))
    .all() as Array<typeof projectStyleInfluences.$inferSelect>;

  const influenceContext = [
    influence.subjectName,
    influence.roleOrDiscipline,
    influence.whatInterestsMe,
  ]
    .filter(Boolean)
    .join(" — ");

  const synthResult = await synthesizeResearch(influenceContext, selectedSources, effectiveModel, effectiveApiKey);

  if (!synthResult.ok) {
    releaseOwnedLease(influenceId, "synthesis", leaseToken);
    return { ok: false, error: describeResearchProviderError("synthesis", synthResult.error) };
  }

  const output = synthResult.output;
  // The EXACT bounded canonical prompt actually sent to the provider —
  // persisted verbatim (never reconstructed) and hashed below.
  const canonicalInput = synthResult.canonicalInput;
  const promptHash = sha256Hex(canonicalInput);

  // Commit synthesis in one transaction
  const commitOutcome = db.transaction((tx) => {
    if (!verifyAndConsumeLease(tx, influenceId, "synthesis", leaseToken, now())) {
      return { kind: "lease-lost" as const };
    }

    // Re-check ownership, activity AND exact revision of every selected
    // Source — a Source edited/withdrawn during the (potentially long)
    // provider call must atomically abort the whole Synthesis, never be
    // silently presented as still matching the revision that was read.
    for (const captured of selectedSources) {
      const [src] = tx
        .select()
        .from(projectStyleResearchSources)
        .where(eq(projectStyleResearchSources.id, captured.sourceId))
        .all() as Array<typeof projectStyleResearchSources.$inferSelect>;
      if (
        !src ||
        src.influenceId !== influenceId ||
        src.projectId !== projectId ||
        src.status !== "active" ||
        src.revision !== captured.revision
      ) {
        return { kind: "source-changed" as const, sourceId: captured.sourceId };
      }
    }

    // Allocate version number
    const maxVersion = tx
      .select({ maxNum: sql<number>`COALESCE(MAX(${projectStyleResearchSyntheses.versionNumber}), 0)` })
      .from(projectStyleResearchSyntheses)
      .where(eq(projectStyleResearchSyntheses.influenceId, influenceId))
      .all() as Array<{ maxNum: number }>;
    const versionNumber = (maxVersion[0]?.maxNum ?? 0) + 1;

    // Input snapshot — architecture §4: "containing only selected source
    // ids, revisions and the exact bounded text sent to the provider".
    const inputSnapshot = JSON.stringify({
      sources: selectedSources.map((s) => ({ sourceId: s.sourceId, revision: s.revision })),
      canonicalInput,
    });

    const insertedSynthesis = tx
      .insert(projectStyleResearchSyntheses)
      .values({
        projectId,
        influenceId,
        versionNumber,
        requestKey,
        provider: effectiveProvider,
        model: effectiveModel,
        contractVersion: RESEARCH_CONTRACT_VERSION,
        inputSnapshot,
        summary: output.summary,
        promptHash,
        createdAt: timestamp,
      })
      .run();
    const synthesisId = Number(insertedSynthesis.lastInsertRowid);

    // Insert synthesis-source joins
    for (const src of selectedSources) {
      tx.insert(projectStyleResearchSynthesisSources)
        .values({
          synthesisId,
          sourceId: src.sourceId,
          sourceRevision: src.revision,
          createdAt: timestamp,
        })
        .run();
    }

    const aliasToSourceId = new Map(selectedSources.map((s) => [`source-${s.sourceId}`, s.sourceId]));

    // Insert claims
    for (let i = 0; i < output.claims.length; i++) {
      const claim = output.claims[i];
      const insertedClaim = tx
        .insert(projectStyleResearchClaims)
        .values({
          synthesisId,
          claimKey: claim.key,
          kind: claim.kind,
          text: claim.text,
          confidence: claim.confidence,
          uncertainty: claim.uncertainty,
          orderIndex: i,
          createdAt: timestamp,
        })
        .run();
      const claimId = Number(insertedClaim.lastInsertRowid);

      for (const alias of claim.sourceAliases) {
        const sourceIdFromAlias = aliasToSourceId.get(alias);
        if (sourceIdFromAlias === undefined) return { kind: "alias-mismatch" as const, alias };
        tx.insert(projectStyleResearchClaimSources)
          .values({ claimId, sourceId: sourceIdFromAlias, createdAt: timestamp })
          .run();
      }
    }

    // Insert candidate rules
    for (let i = 0; i < output.candidateRules.length; i++) {
      const rule = output.candidateRules[i];
      const insertedRule = tx
        .insert(projectStyleResearchCandidateRules)
        .values({
          projectId,
          influenceId,
          synthesisId,
          orderIndex: i,
          status: "proposed",
          revision: 1,
          originalInstruction: rule.instruction,
          originalPillar: rule.pillar,
          originalSection: rule.section,
          originalCategory: rule.category,
          originalStrength: rule.strength,
          originalApplicability: rule.applicability,
          instruction: rule.instruction,
          pillar: rule.pillar,
          section: rule.section,
          category: rule.category,
          strength: rule.strength,
          applicability: rule.applicability,
          rationale: rule.rationale,
          confidence: rule.confidence,
          uncertainty: rule.uncertainty,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      const ruleId = Number(insertedRule.lastInsertRowid);

      for (const alias of rule.sourceAliases) {
        const sourceIdFromAlias = aliasToSourceId.get(alias);
        if (sourceIdFromAlias === undefined) return { kind: "alias-mismatch" as const, alias };
        tx.insert(projectStyleResearchCandidateRuleSources)
          .values({ candidateRuleId: ruleId, sourceId: sourceIdFromAlias, createdAt: timestamp })
          .run();
      }
    }

    return { kind: "ok" as const, synthesisId, claimCount: output.claims.length, ruleCount: output.candidateRules.length };
  });

  if (commitOutcome.kind === "lease-lost") {
    return { ok: false, error: "Synthesis lease expired or was taken by another request." };
  }
  if (commitOutcome.kind === "source-changed") {
    return { ok: false, error: `Source ${commitOutcome.sourceId} changed during synthesis.` };
  }
  if (commitOutcome.kind === "alias-mismatch") {
    return { ok: false, error: `Synthesis cited an unknown source alias "${commitOutcome.alias}".` };
  }

  revalidatePath(`/projects/${projectId}/style`);
  return {
    ok: true,
    synthesisId: commitOutcome.synthesisId,
    claimCount: commitOutcome.claimCount,
    ruleCount: commitOutcome.ruleCount,
  };
}

// ---------------------------------------------------------------------------
// updateResearchCandidateRuleAction — Edit a proposed candidate rule
// ---------------------------------------------------------------------------

export async function updateResearchCandidateRuleAction(input: {
  projectId: number;
  influenceId: number;
  candidateRuleId: number;
  expectedRevision: number;
  instruction: string;
  pillar?: "world" | "visual" | null;
  section?: string | null;
  category?: string | null;
  strength?: "Required" | "Preferred" | "Avoid" | null;
  applicability?: string | null;
}): Promise<MutationResult> {
  const { projectId, influenceId, candidateRuleId, expectedRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(candidateRuleId)) return { ok: false, error: "Invalid candidate rule id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (typeof input.instruction !== "string" || input.instruction.trim().length === 0) {
    return { ok: false, error: "Instruction is required." };
  }
  if (input.instruction.length > RESEARCH_LIMITS.maxRuleInstructionLength) {
    return { ok: false, error: `Instruction exceeds ${RESEARCH_LIMITS.maxRuleInstructionLength} characters.` };
  }
  if (input.pillar !== undefined && !isValidNullablePillar(input.pillar)) {
    return { ok: false, error: "Invalid pillar." };
  }
  if (input.strength !== undefined && !isValidNullableStrength(input.strength)) {
    return { ok: false, error: "Invalid strength." };
  }
  if (!isValidOptionalBoundedText(input.section, RESEARCH_LIMITS.maxRuleFieldLength)) {
    return { ok: false, error: `Section exceeds ${RESEARCH_LIMITS.maxRuleFieldLength} characters.` };
  }
  if (!isValidOptionalBoundedText(input.category, RESEARCH_LIMITS.maxRuleFieldLength)) {
    return { ok: false, error: `Category exceeds ${RESEARCH_LIMITS.maxRuleFieldLength} characters.` };
  }
  if (!isValidOptionalBoundedText(input.applicability, RESEARCH_LIMITS.maxRuleFieldLength)) {
    return { ok: false, error: `Applicability exceeds ${RESEARCH_LIMITS.maxRuleFieldLength} characters.` };
  }

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    const [rule] = tx
      .select()
      .from(projectStyleResearchCandidateRules)
      .where(eq(projectStyleResearchCandidateRules.id, candidateRuleId))
      .all() as Array<typeof projectStyleResearchCandidateRules.$inferSelect>;

    if (!rule || rule.influenceId !== influenceId || rule.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (rule.status !== "proposed") {
      return { kind: "immutable" as const };
    }
    if (rule.revision !== expectedRevision) {
      return { kind: "stale" as const, currentRevision: rule.revision };
    }

    tx.update(projectStyleResearchCandidateRules)
      .set({
        instruction: input.instruction.trim(),
        pillar: input.pillar ?? null,
        section: input.section?.trim() ?? null,
        category: input.category?.trim() ?? null,
        strength: input.strength ?? null,
        applicability: input.applicability?.trim() ?? null,
        revision: rule.revision + 1,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleResearchCandidateRules.id, candidateRuleId))
      .run();

    return { kind: "ok" as const, revision: rule.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Candidate rule not found." };
  if (outcome.kind === "immutable") return { ok: false, error: "Only proposed candidate rules can be edited." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale revision (current: ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

// ---------------------------------------------------------------------------
// rejectResearchCandidateRuleAction — Reject a proposed candidate rule
// ---------------------------------------------------------------------------

export async function rejectResearchCandidateRuleAction(input: {
  projectId: number;
  influenceId: number;
  candidateRuleId: number;
  expectedRevision: number;
}): Promise<MutationResult> {
  const { projectId, influenceId, candidateRuleId, expectedRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(candidateRuleId)) return { ok: false, error: "Invalid candidate rule id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    const [rule] = tx
      .select()
      .from(projectStyleResearchCandidateRules)
      .where(eq(projectStyleResearchCandidateRules.id, candidateRuleId))
      .all() as Array<typeof projectStyleResearchCandidateRules.$inferSelect>;

    if (!rule || rule.influenceId !== influenceId || rule.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (rule.status !== "proposed") {
      return { kind: "immutable" as const };
    }
    if (rule.revision !== expectedRevision) {
      return { kind: "stale" as const };
    }

    tx.update(projectStyleResearchCandidateRules)
      .set({
        status: "rejected",
        rejectedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleResearchCandidateRules.id, candidateRuleId))
      .run();

    return { kind: "ok" as const };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Candidate rule not found." };
  if (outcome.kind === "immutable") return { ok: false, error: "Only proposed candidate rules can be rejected." };
  if (outcome.kind === "stale") return { ok: false, error: "Stale revision." };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// approveResearchCandidateRuleAction — Atomic approval into Working Draft
// ---------------------------------------------------------------------------

export async function approveResearchCandidateRuleAction(input: {
  projectId: number;
  influenceId: number;
  candidateRuleId: number;
  expectedCandidateRevision: number;
  expectedDraftRevision: number;
}): Promise<MutationResult> {
  const { projectId, influenceId, candidateRuleId, expectedCandidateRevision, expectedDraftRevision } = input;

  const ownership = await assertProjectAndInfluence(projectId, influenceId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(candidateRuleId)) return { ok: false, error: "Invalid candidate rule id." };
  if (!isValidRevision(expectedCandidateRevision)) return { ok: false, error: "Invalid expected candidate rule revision." };
  if (!isValidRevision(expectedDraftRevision)) return { ok: false, error: "Invalid expected draft revision." };

  const timestamp = now();

  const outcome = db.transaction((tx) => {
    // 1. Read candidate rule
    const [rule] = tx
      .select()
      .from(projectStyleResearchCandidateRules)
      .where(eq(projectStyleResearchCandidateRules.id, candidateRuleId))
      .all() as Array<typeof projectStyleResearchCandidateRules.$inferSelect>;

    if (!rule || rule.influenceId !== influenceId || rule.projectId !== projectId) {
      return { kind: "not-found" as const };
    }
    if (rule.status !== "proposed") {
      return { kind: "immutable" as const };
    }
    if (rule.revision !== expectedCandidateRevision) {
      return { kind: "stale-candidate" as const };
    }

    // 2. Re-check active linked sources
    const ruleSources = tx
      .select()
      .from(projectStyleResearchCandidateRuleSources)
      .where(eq(projectStyleResearchCandidateRuleSources.candidateRuleId, candidateRuleId))
      .all() as Array<typeof projectStyleResearchCandidateRuleSources.$inferSelect>;

    if (ruleSources.length === 0) {
      return { kind: "no-sources" as const };
    }

    for (const rs of ruleSources) {
      const [src] = tx
        .select()
        .from(projectStyleResearchSources)
        .where(eq(projectStyleResearchSources.id, rs.sourceId))
        .all() as Array<typeof projectStyleResearchSources.$inferSelect>;
      if (!src || src.status !== "active") {
        return { kind: "source-inactive" as const, sourceId: rs.sourceId };
      }
    }

    // 3. Require an existing Working Draft at the exact expected revision —
    // approval NEVER creates a draft (architecture §8).
    const [draft] = tx
      .select()
      .from(projectStyleDrafts)
      .where(eq(projectStyleDrafts.projectId, projectId))
      .all() as Array<ProjectStyleDraft>;

    if (!draft) return { kind: "no-draft" as const };
    if (draft.revision !== expectedDraftRevision) {
      return { kind: "stale-draft" as const, currentRevision: draft.revision };
    }

    // 4. Insert draft rule using the REAL shared helper (also used by
    // addRuleAction) — never a second, independently-maintained copy.
    const provenanceNotes = JSON.stringify({
      influenceId,
      synthesisId: rule.synthesisId,
      candidateRuleId: rule.id,
      sourceIds: ruleSources.map((rs) => rs.sourceId),
    });

    const insertResult = insertApprovedRuleIntoDraft(
      tx,
      draft,
      {
        instruction: rule.instruction,
        pillar: rule.pillar,
        section: rule.section,
        category: rule.category,
        strength: rule.strength,
        applicability: rule.applicability,
        provenanceNotes,
      },
      timestamp
    );

    // 5. Mark candidate rule approved with snapshot
    const approvedSnapshot = JSON.stringify({
      instruction: rule.instruction,
      pillar: rule.pillar,
      section: rule.section,
      category: rule.category,
      strength: rule.strength,
      applicability: rule.applicability,
    });

    tx.update(projectStyleResearchCandidateRules)
      .set({
        status: "approved",
        approvedDraftRuleId: insertResult.ruleId,
        approvedSnapshot,
        approvedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleResearchCandidateRules.id, candidateRuleId))
      .run();

    return {
      kind: "ok" as const,
      draftRuleId: insertResult.ruleId,
      draftRevision: insertResult.newRevision,
    };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Candidate rule not found." };
  if (outcome.kind === "immutable") return { ok: false, error: "Only proposed candidate rules can be approved." };
  if (outcome.kind === "stale-candidate") return { ok: false, error: "Stale candidate rule revision." };
  if (outcome.kind === "no-sources") return { ok: false, error: "Candidate rule has no linked sources." };
  if (outcome.kind === "source-inactive") return { ok: false, error: `Source ${outcome.sourceId} is not active.` };
  if (outcome.kind === "no-draft") return { ok: false, error: "No Working Draft exists. Create one before approving rules." };
  if (outcome.kind === "stale-draft") return { ok: false, error: `Draft was changed elsewhere (current revision ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, draftRuleId: outcome.draftRuleId, draftRevision: outcome.draftRevision };
}
