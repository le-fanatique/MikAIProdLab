"use server";

// ---------------------------------------------------------------------------
// projectStyleReferenceAnalysis.ts — STYLE.1.B.ANALYSIS.CORE (Round 1 REVISE)
//
// Server Actions for Reference Board multimodal analysis: acquisition
// (D1), finalization (D2), the read model (D3), and review/approval (E).
// Backend/schema/contract only — no UI. Every mutation validates ALL
// untrusted input before touching the DB, the filesystem or the network,
// and every transaction re-verifies ownership/approval/canonical snapshot
// immediately before writing (never trusting an earlier read across an
// await boundary). Every DB transaction is wrapped by `safeTransaction` so
// a SQLite failure always surfaces as a structured `{ ok:false, error }`
// result — this Server Action boundary never rejects with a raw exception.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projects,
  projectStyleReferenceImages,
  projectStyleReferenceDomains,
  projectStyleReferenceAnalysisRuns,
  projectStyleReferenceAnalysisRunReferences,
  projectStyleReferenceAnalysisObservations,
  projectStyleReferenceAnalysisCandidateRules,
  projectStyleReferenceAnalysisCandidateRuleReferences,
  projectStyleDrafts,
  type ProjectStyleReferenceImage,
  type ProjectStyleReferenceAnalysisRun,
  type ProjectStyleReferenceAnalysisRunReference,
  type ProjectStyleReferenceAnalysisObservation,
  type ProjectStyleReferenceAnalysisCandidateRule,
  type ProjectStyleReferenceAnalysisCandidateRuleReference,
  type ProjectStyleDraft,
} from "@/db/schema";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  REFERENCE_ANALYSIS_CONTRACT_VERSION,
  REFERENCE_ANALYSIS_LIMITS,
  referenceKeyForOrdinal,
  canonicalizeReferenceMetadata,
  canonicalReferenceMetadataEqual,
  type CanonicalReferenceMetadata,
  type ReferenceAnalysisMutationResult,
  type ReferenceSnapshotForRun,
  type RunInputSnapshot,
  type RunReferenceAnalysisResult,
} from "@/lib/projectStyle/referenceAnalysis/contracts";
import {
  isValidId,
  isValidRevision,
  isValidUuid,
  validateReferenceIdSelection,
  isValidConfirmedProvider,
  isValidConfirmedModel,
  sha256Hex,
  computeProfileFingerprint,
} from "@/lib/projectStyle/referenceAnalysis/validation";
import {
  isValidNullablePillar,
  isValidNullableStrength,
} from "@/lib/projectStyle/validation";
import { buildReferenceAnalysisPrompt } from "@/lib/projectStyle/referenceAnalysis/prompt";
import { parseAnalysisOutput, validateOutputCitations } from "@/lib/projectStyle/referenceAnalysis/validation";
import { prepareReferenceImagesForAnalysis } from "@/lib/projectStyle/referenceAnalysis/imageInputs";
import {
  getReferenceAnalysisProfile,
  getReferenceAnalysisEffectiveConfig,
  buildAnalysisChatMessages,
  callReferenceAnalysisProvider,
} from "@/lib/projectStyle/referenceAnalysis/provider";
import { insertApprovedRuleIntoDraft } from "@/lib/projectStyle/insertDraftRule";

function now(): string {
  return new Date().toISOString();
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function assertProjectExists(projectId: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// DB failure boundary (Round 2 REVISE) — a fixed, generic public message
// with NO interpolated diagnostic (path, value, raw SQLite text) ever
// reaches a caller. Internal classification (needed to distinguish "the
// requestKey was already taken" from every other failure) uses the exact
// SQLite error CODE (`SqliteError.code`, e.g. `SQLITE_CONSTRAINT_UNIQUE`),
// never the free-text message. The raw diagnostic is logged server-side
// with a fixed prefix plus only the code — never the message itself,
// which could otherwise contain a bound value.
//
// `guardAction` wraps every EXPORTED function's entire body: any exception
// anywhere in it (a `safeTransaction` catch that decided to rethrow, an
// un-transacted `await db.select(...)` read like `assertProjectExists`,
// the idempotency fast path, or the read model) is converted to the same
// structured shape — this Server Action boundary never rejects raw.
// ---------------------------------------------------------------------------

const GENERIC_DB_ERROR_MESSAGE = "A database error occurred while processing this request. Please try again.";

function sqliteErrorCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

function logSanitizedDbFailure(context: string, e: unknown): void {
  const code = sqliteErrorCode(e);
  console.error(`Reference analysis ${context} failed${code ? ` (${code})` : ""}.`);
}

function safeTransaction<T>(fn: (tx: Tx) => T): { ok: true; value: T } | { ok: false; error: string; sqliteCode: string | null } {
  try {
    return { ok: true, value: db.transaction(fn) };
  } catch (e) {
    logSanitizedDbFailure("transaction", e);
    return { ok: false, error: GENERIC_DB_ERROR_MESSAGE, sqliteCode: sqliteErrorCode(e) };
  }
}

/** Wraps one exported Server Action's entire body. `T` must always include the same `{ ok:false; error:string }` shape the business logic already returns on its own error paths — the `as T` cast only ever needs to match that one shared shape. */
async function guardAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    logSanitizedDbFailure("Server Action", e);
    return { ok: false, error: GENERIC_DB_ERROR_MESSAGE } as T;
  }
}

// ---------------------------------------------------------------------------
// Confirmation profile read model (server-owned, secret-free) — the UI's
// only source of truth for the provider/model badge and the confirmation
// gate.
// ---------------------------------------------------------------------------

export async function getReferenceAnalysisRuntimeProfile() {
  try {
    return await getReferenceAnalysisProfile();
  } catch (e) {
    logSanitizedDbFailure("profile read", e);
    return {
      provider: null,
      model: "",
      fingerprint: computeProfileFingerprint("", ""),
      configurationError: "Could not read the Language Model configuration. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Shared canonical-metadata re-read — used identically by the acquisition
// transaction and the finalization transaction so both re-verify staleness
// the exact same way. Returns `null` if the Reference no longer exists,
// no longer belongs to the Project, is no longer approved, or its domain
// count now exceeds the bound (fail closed — never a partial/best-effort
// comparison).
// ---------------------------------------------------------------------------

type ReferenceRecheckResult =
  | { kind: "ok"; row: ProjectStyleReferenceImage; canonical: CanonicalReferenceMetadata }
  | { kind: "not_found" }
  | { kind: "not_approved" }
  | { kind: "unbounded" };

function recheckReferenceInTx(tx: Tx, projectId: number, referenceId: number): ReferenceRecheckResult {
  const [row] = tx
    .select()
    .from(projectStyleReferenceImages)
    .where(eq(projectStyleReferenceImages.id, referenceId))
    .all() as ProjectStyleReferenceImage[];
  if (!row || row.projectId !== projectId) return { kind: "not_found" };
  if (!row.approvedForAnalysis) return { kind: "not_approved" };

  const domainRows = tx
    .select({ domain: projectStyleReferenceDomains.domain })
    .from(projectStyleReferenceDomains)
    .where(eq(projectStyleReferenceDomains.referenceId, referenceId))
    .all() as { domain: string }[];

  const canonical = canonicalizeReferenceMetadata({
    label: row.label,
    provenanceNotes: row.provenanceNotes,
    whatInterestsMe: row.whatInterestsMe,
    whatToAvoid: row.whatToAvoid,
    domains: domainRows.map((d) => d.domain),
  });
  if (!canonical) return { kind: "unbounded" };

  return { kind: "ok", row, canonical };
}

// ---------------------------------------------------------------------------
// requestKey identity binding (Round 2 P1 finding) — an existing Run found
// under `(projectId, requestKey)` is ONLY a valid idempotent replay if its
// provider, model, contractVersion AND its exact ordered Reference
// selection (from its own frozen Run References) match the CURRENT
// confirmed request. Reusing the same UUID with a different selection or
// after a Settings change must never silently return an unrelated Run as
// "success". Shared by both idempotent-return paths (the early fast path
// and the post-conflict path).
// ---------------------------------------------------------------------------

async function verifyIdempotentRunIdentity(
  existingRun: ProjectStyleReferenceAnalysisRun,
  expected: { referenceIds: number[]; provider: string; model: string; contractVersion: number }
): Promise<boolean> {
  if (existingRun.provider !== expected.provider) return false;
  if (existingRun.model !== expected.model) return false;
  if (existingRun.contractVersion !== expected.contractVersion) return false;

  const runRefs = await db
    .select({ referenceId: projectStyleReferenceAnalysisRunReferences.referenceId })
    .from(projectStyleReferenceAnalysisRunReferences)
    .where(eq(projectStyleReferenceAnalysisRunReferences.runId, existingRun.id))
    .orderBy(asc(projectStyleReferenceAnalysisRunReferences.ordinal));

  if (runRefs.length !== expected.referenceIds.length) return false;
  for (let i = 0; i < runRefs.length; i++) {
    if (runRefs[i].referenceId !== expected.referenceIds[i]) return false;
  }
  return true;
}

const REQUEST_KEY_REUSED_ERROR = "This request key was already used for a different analysis request.";

// ---------------------------------------------------------------------------
// D1/D2 — runReferenceAnalysisAction: acquire, call provider, finalize.
// ---------------------------------------------------------------------------

export async function runReferenceAnalysisAction(input: {
  projectId: number;
  referenceIds: unknown;
  requestKey: unknown;
  confirmedProvider?: unknown;
  confirmedModel?: unknown;
  confirmedFingerprint?: unknown;
}): Promise<RunReferenceAnalysisResult> {
  return guardAction(() => runReferenceAnalysisActionImpl(input));
}

async function runReferenceAnalysisActionImpl(input: {
  projectId: number;
  referenceIds: unknown;
  requestKey: unknown;
  confirmedProvider?: unknown;
  confirmedModel?: unknown;
  confirmedFingerprint?: unknown;
}): Promise<RunReferenceAnalysisResult> {
  // --- Pure validation only — no DB access of any kind yet. ---
  if (!isValidId(input.projectId)) return { ok: false, error: "Invalid project id." };
  const referenceIds = validateReferenceIdSelection(input.referenceIds);
  if (!referenceIds) {
    return { ok: false, error: `Select between ${REFERENCE_ANALYSIS_LIMITS.minReferences} and ${REFERENCE_ANALYSIS_LIMITS.maxReferences} references.` };
  }
  if (!isValidUuid(input.requestKey)) return { ok: false, error: "Invalid request key." };
  const requestKey = input.requestKey as string;

  // --- Confirmation gate — ONE Settings read (`app_settings`), zero
  // Project/Reference/Run DB access, zero file read, zero network call.
  // Round 1 P2 finding: Project ownership must never be looked up before
  // the caller has confirmed the exact live provider/model pair. ---
  const effective = await getReferenceAnalysisEffectiveConfig();
  const profile = effective.profile;
  if (profile.configurationError || !profile.provider || !effective.config) {
    return { ok: false, error: profile.configurationError ?? "No Language Model is configured." };
  }

  const hasConfirmationPayload =
    input.confirmedProvider !== undefined && input.confirmedModel !== undefined && input.confirmedFingerprint !== undefined;

  const confirmationMatches =
    hasConfirmationPayload &&
    isValidConfirmedProvider(input.confirmedProvider) &&
    isValidConfirmedModel(input.confirmedModel) &&
    typeof input.confirmedFingerprint === "string" &&
    input.confirmedProvider === profile.provider &&
    input.confirmedModel === profile.model &&
    input.confirmedFingerprint === profile.fingerprint;

  if (!confirmationMatches) {
    return {
      ok: true,
      requiresConfirmation: true,
      provider: profile.provider,
      model: profile.model,
      fingerprint: profile.fingerprint,
    };
  }

  // --- Only now does ownership/business data get touched. ---
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };

  // --- Idempotency fast path — an identical requestKey already has a Run.
  // Authoritative enforcement is the DB unique constraint hit in the
  // acquisition transaction below; this is just an early, cheap read that
  // avoids a redundant file-read/provider-call attempt in the common case. ---
  const [existingByKey] = await db
    .select()
    .from(projectStyleReferenceAnalysisRuns)
    .where(
      and(
        eq(projectStyleReferenceAnalysisRuns.projectId, input.projectId),
        eq(projectStyleReferenceAnalysisRuns.requestKey, requestKey)
      )
    );
  if (existingByKey) {
    // Round 2 P1 finding: the same requestKey UUID could have been reused
    // with a different Reference selection, or after Settings changed
    // provider/model — never return an unrelated Run as a successful
    // idempotent replay.
    const identityMatches = await verifyIdempotentRunIdentity(existingByKey, {
      referenceIds,
      provider: profile.provider,
      model: profile.model,
      contractVersion: REFERENCE_ANALYSIS_CONTRACT_VERSION,
    });
    if (!identityMatches) return { ok: false, error: REQUEST_KEY_REUSED_ERROR };
    return { ok: true, requiresConfirmation: false, runId: existingByKey.id, idempotent: true };
  }

  // --- Step 3 — snapshot DB read-only of References/domains, canonicalized. ---
  const referenceRows = await db
    .select()
    .from(projectStyleReferenceImages)
    .where(inArray(projectStyleReferenceImages.id, referenceIds));
  const byId = new Map(referenceRows.map((r) => [r.id, r]));

  const orderedRefs: ProjectStyleReferenceImage[] = [];
  for (const id of referenceIds) {
    const row = byId.get(id);
    if (!row || row.projectId !== input.projectId) return { ok: false, error: `Reference ${id} not found in this Project.` };
    if (!row.approvedForAnalysis) return { ok: false, error: `Reference ${id} is not approved for analysis.` };
    orderedRefs.push(row);
  }

  const domainRows = await db
    .select()
    .from(projectStyleReferenceDomains)
    .where(inArray(projectStyleReferenceDomains.referenceId, referenceIds));
  const domainsByRef = new Map<number, string[]>();
  for (const d of domainRows) {
    const list = domainsByRef.get(d.referenceId) ?? [];
    list.push(d.domain);
    domainsByRef.set(d.referenceId, list);
  }

  const canonicalByRef = new Map<number, CanonicalReferenceMetadata>();
  for (const ref of orderedRefs) {
    const canonical = canonicalizeReferenceMetadata({
      label: ref.label,
      provenanceNotes: ref.provenanceNotes,
      whatInterestsMe: ref.whatInterestsMe,
      whatToAvoid: ref.whatToAvoid,
      domains: domainsByRef.get(ref.id) ?? [],
    });
    if (!canonical) return { ok: false, error: `Reference ${ref.id} has too many analysis domains.` };
    canonicalByRef.set(ref.id, canonical);
  }

  // --- Step 4 — read and validate the real image bytes. ---
  const prepared = await prepareReferenceImagesForAnalysis(
    orderedRefs.map((r) => ({ referenceId: r.id, imagePath: r.imagePath }))
  );
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const preparedById = new Map(prepared.images.map((img) => [img.referenceId, img]));

  const referenceSnapshots: ReferenceSnapshotForRun[] = orderedRefs.map((ref, ordinal) => {
    const img = preparedById.get(ref.id)!;
    const canonical = canonicalByRef.get(ref.id)!;
    return {
      referenceId: ref.id,
      referenceKey: referenceKeyForOrdinal(ordinal),
      ordinal,
      label: canonical.label,
      provenanceNotes: canonical.provenanceNotes,
      whatInterestsMe: canonical.whatInterestsMe,
      whatToAvoid: canonical.whatToAvoid,
      domains: canonical.domains,
      imageSha256: img.imageSha256,
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
    };
  });

  const promptText = buildReferenceAnalysisPrompt(referenceSnapshots);
  const promptHash = sha256Hex(promptText);
  const inputSnapshot: RunInputSnapshot = { schemaVersion: 1, references: referenceSnapshots };
  // Computed exactly once — persisted at acquisition AND compared verbatim
  // against the Run's own stored value at finalization (Round 2 P1
  // finding). Never recomputed independently at either site.
  const inputSnapshotJson = JSON.stringify(inputSnapshot);

  // --- Step 5 — acquisition transaction: re-verify ownership, approval AND
  // the exact canonical metadata (label/provenance/what-interests-me/
  // what-to-avoid/domains) captured above, then insert exactly one Run
  // `running` + its Run References. The (projectId, requestKey) unique
  // constraint is the authoritative concurrency guard — a losing
  // concurrent call catches the constraint violation and returns the
  // winner's Run untouched. ---
  const acquireTimestamp = now();
  type AcquireOutcome =
    | { kind: "acquired"; runId: number }
    | { kind: "not_found"; id: number }
    | { kind: "not_approved"; id: number }
    | { kind: "snapshot_changed"; id: number }
    | { kind: "conflict" };

  const acquireAttempt = safeTransaction<AcquireOutcome>((tx) => {
    for (const ref of orderedRefs) {
      const recheck = recheckReferenceInTx(tx, input.projectId, ref.id);
      if (recheck.kind === "not_found") return { kind: "not_found", id: ref.id };
      if (recheck.kind === "not_approved") return { kind: "not_approved", id: ref.id };
      if (recheck.kind === "unbounded") return { kind: "snapshot_changed", id: ref.id };
      if (!canonicalReferenceMetadataEqual(recheck.canonical, canonicalByRef.get(ref.id)!)) {
        return { kind: "snapshot_changed", id: ref.id };
      }
    }

    const insertedRun = tx
      .insert(projectStyleReferenceAnalysisRuns)
      .values({
        projectId: input.projectId,
        requestKey,
        status: "running",
        provider: profile.provider as string,
        model: profile.model,
        contractVersion: REFERENCE_ANALYSIS_CONTRACT_VERSION,
        inputSnapshot: inputSnapshotJson,
        promptHash,
        createdAt: acquireTimestamp,
        updatedAt: acquireTimestamp,
      })
      .run();
    const runId = Number(insertedRun.lastInsertRowid);

    for (const snap of referenceSnapshots) {
      tx.insert(projectStyleReferenceAnalysisRunReferences)
        .values({
          runId,
          referenceId: snap.referenceId,
          ordinal: snap.ordinal,
          referenceKey: snap.referenceKey,
          referenceSnapshot: JSON.stringify({
            label: snap.label,
            provenanceNotes: snap.provenanceNotes,
            whatInterestsMe: snap.whatInterestsMe,
            whatToAvoid: snap.whatToAvoid,
            domains: snap.domains,
          }),
          imageSha256: snap.imageSha256,
          mimeType: snap.mimeType,
          width: snap.width,
          height: snap.height,
          createdAt: acquireTimestamp,
        })
        .run();
    }

    return { kind: "acquired", runId };
  });

  let acquireOutcome: AcquireOutcome;
  if (!acquireAttempt.ok) {
    // Classified by the exact SQLite error CODE, never by parsing the
    // (already-sanitized, generic) public message text (Round 2 P1
    // finding). Given this transaction's shape (a brand-new `runId`, so
    // its own child-table unique constraints can never collide), a
    // `SQLITE_CONSTRAINT_UNIQUE` here can only be the Run's own
    // `(projectId, requestKey)` index.
    if (acquireAttempt.sqliteCode === "SQLITE_CONSTRAINT_UNIQUE") {
      acquireOutcome = { kind: "conflict" };
    } else {
      return { ok: false, error: acquireAttempt.error };
    }
  } else {
    acquireOutcome = acquireAttempt.value;
  }

  if (acquireOutcome.kind === "not_found") return { ok: false, error: `Reference ${acquireOutcome.id} not found in this Project.` };
  if (acquireOutcome.kind === "not_approved") return { ok: false, error: `Reference ${acquireOutcome.id} is not approved for analysis.` };
  if (acquireOutcome.kind === "snapshot_changed") return { ok: false, error: `Reference ${acquireOutcome.id} changed just before the run started. Please retry.` };
  if (acquireOutcome.kind === "conflict") {
    const [existing] = await db
      .select()
      .from(projectStyleReferenceAnalysisRuns)
      .where(
        and(
          eq(projectStyleReferenceAnalysisRuns.projectId, input.projectId),
          eq(projectStyleReferenceAnalysisRuns.requestKey, requestKey)
        )
      );
    if (!existing) return { ok: false, error: "Analysis run conflict could not be resolved." };
    // Round 2 P1 finding — same identity check as the early fast path,
    // required here too since the losing side of a real race reaches this
    // branch WITHOUT ever going through the fast path above.
    const identityMatches = await verifyIdempotentRunIdentity(existing, {
      referenceIds,
      provider: profile.provider,
      model: profile.model,
      contractVersion: REFERENCE_ANALYSIS_CONTRACT_VERSION,
    });
    if (!identityMatches) return { ok: false, error: REQUEST_KEY_REUSED_ERROR };
    return { ok: true, requiresConfirmation: false, runId: existing.id, idempotent: true };
  }

  const runId = acquireOutcome.runId;

  // --- Step 6 — only the winner calls the provider. ---
  const messages = buildAnalysisChatMessages(promptText, prepared.images);
  const providerResult = await callReferenceAnalysisProvider(messages, effective.config);

  if (!providerResult.ok) {
    return { ok: false, error: await reportRunFailure(runId, providerResult.errorCode, providerResult.errorMessage) };
  }

  const parsed = parseAnalysisOutput(providerResult.text, orderedRefs.length);
  if (!parsed.ok) {
    return { ok: false, error: `The analysis output was invalid: ${await reportRunFailure(runId, "invalid_output", parsed.error)}` };
  }
  const citationError = validateOutputCitations(parsed.output, orderedRefs.length);
  if (citationError) {
    return { ok: false, error: `The analysis output was invalid: ${await reportRunFailure(runId, "invalid_output", citationError)}` };
  }

  // --- D2 — finalization: re-verify the Run itself is still `running`
  // (Round 1 P1 finding — a Run that turned `failed` while the provider
  // call was in flight must NEVER be resurrected to `completed`), re-verify
  // every selected Reference's ownership/approval/canonical snapshot one
  // more time (a provider call can take a long time), insert observations/
  // candidate rules/links, and mark the Run completed conditionally on it
  // still being `running` — all in one transaction. Zero partial writes on
  // any failure. ---
  const finalizeTimestamp = now();
  type FinalizeOutcome =
    | { kind: "ok" }
    | { kind: "not_running" }
    | { kind: "provenance_mismatch" }
    | { kind: "reference_changed"; id: number };

  const finalizeAttempt = safeTransaction<FinalizeOutcome>((tx) => {
    const [runRow] = tx
      .select()
      .from(projectStyleReferenceAnalysisRuns)
      .where(eq(projectStyleReferenceAnalysisRuns.id, runId))
      .all() as ProjectStyleReferenceAnalysisRun[];
    if (!runRow || runRow.projectId !== input.projectId || runRow.status !== "running") {
      return { kind: "not_running" };
    }

    // Round 2 P1 finding — the previous check only compared `id`,
    // `projectId` and `status`. A Run row altered/corrupted while the
    // provider call was in flight (provider/model/contractVersion/
    // inputSnapshot/promptHash) must never receive outputs that no longer
    // match its declared, frozen provenance.
    if (
      runRow.provider !== profile.provider ||
      runRow.model !== profile.model ||
      runRow.contractVersion !== REFERENCE_ANALYSIS_CONTRACT_VERSION ||
      runRow.inputSnapshot !== inputSnapshotJson ||
      runRow.promptHash !== promptHash
    ) {
      return { kind: "provenance_mismatch" };
    }

    for (const ref of orderedRefs) {
      const recheck = recheckReferenceInTx(tx, input.projectId, ref.id);
      if (recheck.kind !== "ok") return { kind: "reference_changed", id: ref.id };
      if (!canonicalReferenceMetadataEqual(recheck.canonical, canonicalByRef.get(ref.id)!)) {
        return { kind: "reference_changed", id: ref.id };
      }
    }

    const referenceKeyToId = new Map(referenceSnapshots.map((s) => [s.referenceKey, s.referenceId]));

    for (let i = 0; i < parsed.output.observations.length; i++) {
      const obs = parsed.output.observations[i];
      const referenceId = referenceKeyToId.get(obs.referenceKey);
      if (referenceId === undefined) {
        throw new Error(`Observation ${i} cites an unresolved referenceKey "${obs.referenceKey}".`);
      }
      tx.insert(projectStyleReferenceAnalysisObservations)
        .values({
          runId,
          referenceId,
          orderIndex: i,
          domain: obs.domain,
          originalObservation: obs.observation,
          observation: obs.observation,
          rationale: obs.rationale,
          confidence: obs.confidence,
          uncertainty: obs.uncertainty,
          status: "proposed",
          revision: 1,
          createdAt: finalizeTimestamp,
          updatedAt: finalizeTimestamp,
        })
        .run();
    }

    for (let i = 0; i < parsed.output.candidateRules.length; i++) {
      const rule = parsed.output.candidateRules[i];
      const insertedRule = tx
        .insert(projectStyleReferenceAnalysisCandidateRules)
        .values({
          projectId: input.projectId,
          runId,
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
          createdAt: finalizeTimestamp,
          updatedAt: finalizeTimestamp,
        })
        .run();
      const candidateRuleId = Number(insertedRule.lastInsertRowid);

      for (const key of rule.referenceKeys) {
        const referenceId = referenceKeyToId.get(key);
        if (referenceId === undefined) {
          throw new Error(`Candidate rule ${i} cites an unresolved referenceKey "${key}".`);
        }
        tx.insert(projectStyleReferenceAnalysisCandidateRuleReferences)
          .values({ candidateRuleId, referenceId, createdAt: finalizeTimestamp })
          .run();
      }
    }

    const updateResult = tx
      .update(projectStyleReferenceAnalysisRuns)
      .set({
        status: "completed",
        summary: parsed.output.summary,
        updatedAt: finalizeTimestamp,
        completedAt: finalizeTimestamp,
      })
      .where(and(eq(projectStyleReferenceAnalysisRuns.id, runId), eq(projectStyleReferenceAnalysisRuns.status, "running")))
      .run();
    if (updateResult.changes !== 1) {
      // The Run stopped being `running` between the read above and this
      // UPDATE, inside the SAME transaction — impossible under SQLite's
      // single-writer model unless this very transaction's own logic has a
      // bug, but the check is kept as a hard guarantee rather than trusting
      // the earlier read alone. Throwing rolls back every insert above.
      throw new Error("The analysis run was no longer running at commit time.");
    }

    return { kind: "ok" };
  });

  if (!finalizeAttempt.ok) {
    return { ok: false, error: `Failed to commit the analysis result: ${await reportRunFailure(runId, "commit_failed", finalizeAttempt.error)}` };
  }
  const finalizeOutcome = finalizeAttempt.value;

  if (finalizeOutcome.kind === "not_running") {
    // The Run already reached a terminal state (e.g. `failed`) before this
    // finalization attempt even started — per the state machine, it must
    // NEVER be rewritten. Nothing to insert, nothing to mark: this is a
    // late/duplicate finalization attempt on an already-terminal Run.
    return { ok: false, error: "This analysis run is no longer running; its result was not committed." };
  }
  if (finalizeOutcome.kind === "provenance_mismatch") {
    return { ok: false, error: await reportRunFailure(runId, "provenance_mismatch", "The analysis run's provenance no longer matches what was acquired.") };
  }
  if (finalizeOutcome.kind === "reference_changed") {
    return { ok: false, error: `Reference ${finalizeOutcome.id} changed or lost approval during analysis. ${await reportRunFailure(runId, "reference_changed", `Reference ${finalizeOutcome.id} changed or lost approval during analysis.`)}` };
  }

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, requiresConfirmation: false, runId, idempotent: false };
}

/**
 * Marks a Run `failed` ONLY if it is still `running` — a terminal Run
 * (`completed`/`failed`) is never rewritten.
 */
function markRunFailed(runId: number, errorCode: string, errorMessage: string): void {
  const timestamp = now();
  db.update(projectStyleReferenceAnalysisRuns)
    .set({ status: "failed", errorCode, errorMessage, updatedAt: timestamp, completedAt: timestamp })
    .where(and(eq(projectStyleReferenceAnalysisRuns.id, runId), eq(projectStyleReferenceAnalysisRuns.status, "running")))
    .run();
}

/**
 * Attempts to mark a Run `failed` and NEVER throws — a failure while
 * attempting this update is itself reported (both messages), rather than
 * escaping as an unhandled rejection (Round 1 P1 finding: the previous
 * version's `markRunFailed` could throw with no enclosing `catch` at any of
 * its call sites). Returns the exact user-facing message the caller should
 * surface.
 */
async function reportRunFailure(runId: number, errorCode: string, errorMessage: string): Promise<string> {
  try {
    markRunFailed(runId, errorCode, errorMessage);
    return errorMessage;
  } catch (e) {
    // Round 2 P1 finding — the raw exception message (which could contain a
    // path or bound value from a genuine SQLite failure) must never reach
    // the public string either; only a fixed, generic addendum does.
    logSanitizedDbFailure(`marking run ${runId} failed`, e);
    return `${errorMessage} Additionally, the failure could not be recorded. Please check this run's status manually.`;
  }
}

// ---------------------------------------------------------------------------
// D3 — read model, confined to the owned Project only. Every relation is
// derived exclusively from this Project's own Runs (never a denormalized
// `projectId` column trusted on its own), and every Reference id any row
// points at is cross-checked against this Project's own Reference Images —
// a corrupted/forged cross-Project row causes the WHOLE read model to
// refuse with a sanitized error rather than silently leaking or silently
// dropping rows (Round 1 P2 finding).
// ---------------------------------------------------------------------------

export type ReferenceAnalysisReadModel = {
  runs: ProjectStyleReferenceAnalysisRun[];
  runReferences: ProjectStyleReferenceAnalysisRunReference[];
  observations: ProjectStyleReferenceAnalysisObservation[];
  candidateRules: ProjectStyleReferenceAnalysisCandidateRule[];
  candidateRuleReferences: ProjectStyleReferenceAnalysisCandidateRuleReference[];
};

const INTEGRITY_ERROR = "Reference Analysis data integrity check failed.";

export async function getReferenceAnalysisState(
  projectId: unknown
): Promise<ReferenceAnalysisReadModel | { ok: false; error: string }> {
  return guardAction(() => getReferenceAnalysisStateImpl(projectId));
}

async function getReferenceAnalysisStateImpl(
  projectId: unknown
): Promise<ReferenceAnalysisReadModel | { ok: false; error: string }> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return ownership;
  const scopedProjectId = projectId as number;

  const runs = await db
    .select()
    .from(projectStyleReferenceAnalysisRuns)
    .where(eq(projectStyleReferenceAnalysisRuns.projectId, scopedProjectId))
    .orderBy(desc(projectStyleReferenceAnalysisRuns.createdAt));
  const runIds = runs.map((r) => r.id);

  const runReferences =
    runIds.length > 0
      ? await db
          .select()
          .from(projectStyleReferenceAnalysisRunReferences)
          .where(inArray(projectStyleReferenceAnalysisRunReferences.runId, runIds))
      : [];

  const observations =
    runIds.length > 0
      ? await db
          .select()
          .from(projectStyleReferenceAnalysisObservations)
          .where(inArray(projectStyleReferenceAnalysisObservations.runId, runIds))
      : [];

  // Derived EXCLUSIVELY from this Project's own owned Runs — never a
  // trusted-as-is `WHERE projectId = ...` on the Candidate Rules table
  // itself (a forged/corrupted row could carry a local `projectId` next to
  // a foreign `runId`).
  const candidateRules =
    runIds.length > 0
      ? await db
          .select()
          .from(projectStyleReferenceAnalysisCandidateRules)
          .where(inArray(projectStyleReferenceAnalysisCandidateRules.runId, runIds))
          .orderBy(desc(projectStyleReferenceAnalysisCandidateRules.createdAt))
      : [];
  for (const rule of candidateRules) {
    if (rule.projectId !== scopedProjectId) return { ok: false, error: INTEGRITY_ERROR };
  }

  // Reverse direction of the same corruption: a Candidate Rule row whose
  // denormalized `projectId` column claims THIS Project but whose `runId`
  // points at a Run owned by a DIFFERENT Project is invisible to the
  // `inArray(runId, runIds)` query above (it would never be selected) —
  // silently excluding it is not the same as detecting and refusing the
  // corruption. A separate, explicit column-based query catches exactly
  // this shape.
  const candidateRulesByProjectColumn = await db
    .select({ id: projectStyleReferenceAnalysisCandidateRules.id, runId: projectStyleReferenceAnalysisCandidateRules.runId })
    .from(projectStyleReferenceAnalysisCandidateRules)
    .where(eq(projectStyleReferenceAnalysisCandidateRules.projectId, scopedProjectId));
  const ownedRunIdSet = new Set(runIds);
  for (const r of candidateRulesByProjectColumn) {
    if (!ownedRunIdSet.has(r.runId)) return { ok: false, error: INTEGRITY_ERROR };
  }

  const candidateRuleIds = candidateRules.map((r) => r.id);

  const candidateRuleReferences =
    candidateRuleIds.length > 0
      ? await db
          .select()
          .from(projectStyleReferenceAnalysisCandidateRuleReferences)
          .where(inArray(projectStyleReferenceAnalysisCandidateRuleReferences.candidateRuleId, candidateRuleIds))
      : [];

  // Every Reference id any Run Reference / Observation / Candidate Rule
  // Reference points at must belong to THIS Project's own Reference Images
  // — a dangling or cross-Project id anywhere refuses the whole read model
  // (Round 2 P2 finding — Observations were previously omitted here).
  const referencedIds = new Set<number>();
  for (const rr of runReferences) referencedIds.add(rr.referenceId);
  for (const obs of observations) referencedIds.add(obs.referenceId);
  for (const crr of candidateRuleReferences) referencedIds.add(crr.referenceId);
  if (referencedIds.size > 0) {
    const validRefs = await db
      .select({ id: projectStyleReferenceImages.id })
      .from(projectStyleReferenceImages)
      .where(and(eq(projectStyleReferenceImages.projectId, scopedProjectId), inArray(projectStyleReferenceImages.id, [...referencedIds])));
    const validIds = new Set(validRefs.map((r) => r.id));
    if (validIds.size !== referencedIds.size) return { ok: false, error: INTEGRITY_ERROR };
  }

  // Round 2 P2 finding — Project membership alone is not enough: an
  // Observation or Candidate Rule Reference must point at a Reference that
  // is actually part of ITS OWN Run's frozen selection (from that Run's own
  // Run References), never merely "some other Reference in the same
  // Project". `runId -> Set<referenceId>` is derived exclusively from the
  // Run References already validated above.
  const runReferenceSetByRunId = new Map<number, Set<number>>();
  for (const rr of runReferences) {
    const set = runReferenceSetByRunId.get(rr.runId) ?? new Set<number>();
    set.add(rr.referenceId);
    runReferenceSetByRunId.set(rr.runId, set);
  }
  for (const obs of observations) {
    const allowed = runReferenceSetByRunId.get(obs.runId);
    if (!allowed || !allowed.has(obs.referenceId)) return { ok: false, error: INTEGRITY_ERROR };
  }
  const runIdByCandidateRuleId = new Map(candidateRules.map((r) => [r.id, r.runId]));
  for (const crr of candidateRuleReferences) {
    const ruleRunId = runIdByCandidateRuleId.get(crr.candidateRuleId);
    const allowed = ruleRunId !== undefined ? runReferenceSetByRunId.get(ruleRunId) : undefined;
    if (!allowed || !allowed.has(crr.referenceId)) return { ok: false, error: INTEGRITY_ERROR };
  }

  return { runs, runReferences, observations, candidateRules, candidateRuleReferences };
}

// ---------------------------------------------------------------------------
// E1 — Observations: edit fields / change status, revision-gated.
// ---------------------------------------------------------------------------

export async function updateReferenceAnalysisObservationAction(input: {
  projectId: number;
  observationId: number;
  expectedRevision: number;
  domain?: string | null;
  observation?: string;
  rationale?: string | null;
}): Promise<ReferenceAnalysisMutationResult> {
  return guardAction(() => updateReferenceAnalysisObservationActionImpl(input));
}

async function updateReferenceAnalysisObservationActionImpl(input: {
  projectId: number;
  observationId: number;
  expectedRevision: number;
  domain?: string | null;
  observation?: string;
  rationale?: string | null;
}): Promise<ReferenceAnalysisMutationResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.observationId)) return { ok: false, error: "Invalid observation id." };
  if (!isValidRevision(input.expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (input.domain !== undefined && input.domain !== null && (typeof input.domain !== "string" || input.domain.length > REFERENCE_ANALYSIS_LIMITS.maxDomainLength)) {
    return { ok: false, error: "Invalid domain." };
  }
  if (input.observation !== undefined && (typeof input.observation !== "string" || input.observation.trim().length === 0 || input.observation.length > REFERENCE_ANALYSIS_LIMITS.maxObservationTextLength)) {
    return { ok: false, error: "Invalid observation text." };
  }
  if (input.rationale !== undefined && input.rationale !== null && (typeof input.rationale !== "string" || input.rationale.length > REFERENCE_ANALYSIS_LIMITS.maxRationaleLength)) {
    return { ok: false, error: "Invalid rationale." };
  }

  const timestamp = now();
  const attempt = safeTransaction((tx) => {
    const [row] = tx
      .select()
      .from(projectStyleReferenceAnalysisObservations)
      .where(eq(projectStyleReferenceAnalysisObservations.id, input.observationId))
      .all() as ProjectStyleReferenceAnalysisObservation[];
    if (!row) return { kind: "not_found" as const };

    const [run] = tx
      .select({ projectId: projectStyleReferenceAnalysisRuns.projectId })
      .from(projectStyleReferenceAnalysisRuns)
      .where(eq(projectStyleReferenceAnalysisRuns.id, row.runId))
      .all() as { projectId: number }[];
    if (!run || run.projectId !== input.projectId) return { kind: "not_found" as const };

    if (row.revision !== input.expectedRevision) return { kind: "stale" as const, currentRevision: row.revision };

    tx.update(projectStyleReferenceAnalysisObservations)
      .set({
        domain: input.domain !== undefined ? input.domain?.trim() || null : row.domain,
        observation: input.observation !== undefined ? input.observation.trim() : row.observation,
        rationale: input.rationale !== undefined ? input.rationale?.trim() || null : row.rationale,
        revision: row.revision + 1,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleReferenceAnalysisObservations.id, input.observationId))
      .run();

    return { kind: "ok" as const, revision: row.revision + 1 };
  });
  if (!attempt.ok) return { ok: false, error: attempt.error };
  const outcome = attempt.value;

  if (outcome.kind === "not_found") return { ok: false, error: "Observation not found." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale revision (current: ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function setReferenceAnalysisObservationStatusAction(input: {
  projectId: number;
  observationId: number;
  expectedRevision: number;
  status: "proposed" | "accepted" | "rejected";
}): Promise<ReferenceAnalysisMutationResult> {
  return guardAction(() => setReferenceAnalysisObservationStatusActionImpl(input));
}

async function setReferenceAnalysisObservationStatusActionImpl(input: {
  projectId: number;
  observationId: number;
  expectedRevision: number;
  status: "proposed" | "accepted" | "rejected";
}): Promise<ReferenceAnalysisMutationResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.observationId)) return { ok: false, error: "Invalid observation id." };
  if (!isValidRevision(input.expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (input.status !== "proposed" && input.status !== "accepted" && input.status !== "rejected") {
    return { ok: false, error: "Invalid status." };
  }

  const timestamp = now();
  const attempt = safeTransaction((tx) => {
    const [row] = tx
      .select()
      .from(projectStyleReferenceAnalysisObservations)
      .where(eq(projectStyleReferenceAnalysisObservations.id, input.observationId))
      .all() as ProjectStyleReferenceAnalysisObservation[];
    if (!row) return { kind: "not_found" as const };

    const [run] = tx
      .select({ projectId: projectStyleReferenceAnalysisRuns.projectId })
      .from(projectStyleReferenceAnalysisRuns)
      .where(eq(projectStyleReferenceAnalysisRuns.id, row.runId))
      .all() as { projectId: number }[];
    if (!run || run.projectId !== input.projectId) return { kind: "not_found" as const };

    if (row.revision !== input.expectedRevision) return { kind: "stale" as const, currentRevision: row.revision };

    tx.update(projectStyleReferenceAnalysisObservations)
      .set({ status: input.status, revision: row.revision + 1, updatedAt: timestamp })
      .where(eq(projectStyleReferenceAnalysisObservations.id, input.observationId))
      .run();

    return { kind: "ok" as const, revision: row.revision + 1 };
  });
  if (!attempt.ok) return { ok: false, error: attempt.error };
  const outcome = attempt.value;

  if (outcome.kind === "not_found") return { ok: false, error: "Observation not found." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale revision (current: ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

// ---------------------------------------------------------------------------
// E2 — Candidate Rules: edit fields (proposed only) / reject (proposed only).
// ---------------------------------------------------------------------------

export async function updateReferenceAnalysisCandidateRuleAction(input: {
  projectId: number;
  candidateRuleId: number;
  expectedRevision: number;
  instruction: string;
  pillar?: "world" | "visual" | null;
  section?: string | null;
  category?: string | null;
  strength?: "Required" | "Preferred" | "Avoid" | null;
  applicability?: string | null;
}): Promise<ReferenceAnalysisMutationResult> {
  return guardAction(() => updateReferenceAnalysisCandidateRuleActionImpl(input));
}

async function updateReferenceAnalysisCandidateRuleActionImpl(input: {
  projectId: number;
  candidateRuleId: number;
  expectedRevision: number;
  instruction: string;
  pillar?: "world" | "visual" | null;
  section?: string | null;
  category?: string | null;
  strength?: "Required" | "Preferred" | "Avoid" | null;
  applicability?: string | null;
}): Promise<ReferenceAnalysisMutationResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.candidateRuleId)) return { ok: false, error: "Invalid candidate rule id." };
  if (!isValidRevision(input.expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (typeof input.instruction !== "string" || input.instruction.trim().length === 0) {
    return { ok: false, error: "Instruction is required." };
  }
  if (input.instruction.length > REFERENCE_ANALYSIS_LIMITS.maxRuleInstructionLength) {
    return { ok: false, error: `Instruction exceeds ${REFERENCE_ANALYSIS_LIMITS.maxRuleInstructionLength} characters.` };
  }
  if (input.pillar !== undefined && !isValidNullablePillar(input.pillar)) return { ok: false, error: "Invalid pillar." };
  if (input.strength !== undefined && !isValidNullableStrength(input.strength)) return { ok: false, error: "Invalid strength." };
  for (const [name, value] of [["section", input.section], ["category", input.category], ["applicability", input.applicability]] as const) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length > REFERENCE_ANALYSIS_LIMITS.maxRuleFieldLength)) {
      return { ok: false, error: `Invalid ${name}.` };
    }
  }

  const timestamp = now();
  const attempt = safeTransaction((tx) => {
    const [rule] = tx
      .select()
      .from(projectStyleReferenceAnalysisCandidateRules)
      .where(eq(projectStyleReferenceAnalysisCandidateRules.id, input.candidateRuleId))
      .all() as ProjectStyleReferenceAnalysisCandidateRule[];
    if (!rule || rule.projectId !== input.projectId) return { kind: "not_found" as const };
    if (rule.status !== "proposed") return { kind: "immutable" as const };
    if (rule.revision !== input.expectedRevision) return { kind: "stale" as const, currentRevision: rule.revision };

    tx.update(projectStyleReferenceAnalysisCandidateRules)
      .set({
        instruction: input.instruction.trim(),
        pillar: input.pillar ?? null,
        section: input.section?.trim() || null,
        category: input.category?.trim() || null,
        strength: input.strength ?? null,
        applicability: input.applicability?.trim() || null,
        revision: rule.revision + 1,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleReferenceAnalysisCandidateRules.id, input.candidateRuleId))
      .run();

    return { kind: "ok" as const, revision: rule.revision + 1 };
  });
  if (!attempt.ok) return { ok: false, error: attempt.error };
  const outcome = attempt.value;

  if (outcome.kind === "not_found") return { ok: false, error: "Candidate rule not found." };
  if (outcome.kind === "immutable") return { ok: false, error: "Only proposed candidate rules can be edited." };
  if (outcome.kind === "stale") return { ok: false, error: `Stale revision (current: ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function rejectReferenceAnalysisCandidateRuleAction(input: {
  projectId: number;
  candidateRuleId: number;
  expectedRevision: number;
}): Promise<ReferenceAnalysisMutationResult> {
  return guardAction(() => rejectReferenceAnalysisCandidateRuleActionImpl(input));
}

async function rejectReferenceAnalysisCandidateRuleActionImpl(input: {
  projectId: number;
  candidateRuleId: number;
  expectedRevision: number;
}): Promise<ReferenceAnalysisMutationResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.candidateRuleId)) return { ok: false, error: "Invalid candidate rule id." };
  if (!isValidRevision(input.expectedRevision)) return { ok: false, error: "Invalid expected revision." };

  const timestamp = now();
  const attempt = safeTransaction((tx) => {
    const [rule] = tx
      .select()
      .from(projectStyleReferenceAnalysisCandidateRules)
      .where(eq(projectStyleReferenceAnalysisCandidateRules.id, input.candidateRuleId))
      .all() as ProjectStyleReferenceAnalysisCandidateRule[];
    if (!rule || rule.projectId !== input.projectId) return { kind: "not_found" as const };
    if (rule.status !== "proposed") return { kind: "immutable" as const };
    if (rule.revision !== input.expectedRevision) return { kind: "stale" as const };

    tx.update(projectStyleReferenceAnalysisCandidateRules)
      .set({ status: "rejected", rejectedAt: timestamp, updatedAt: timestamp })
      .where(eq(projectStyleReferenceAnalysisCandidateRules.id, input.candidateRuleId))
      .run();

    return { kind: "ok" as const };
  });
  if (!attempt.ok) return { ok: false, error: attempt.error };
  const outcome = attempt.value;

  if (outcome.kind === "not_found") return { ok: false, error: "Candidate rule not found." };
  if (outcome.kind === "immutable") return { ok: false, error: "Only proposed candidate rules can be rejected." };
  if (outcome.kind === "stale") return { ok: false, error: "Stale revision." };

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// E3 — Explicit atomic approval into the existing Working Draft.
// ---------------------------------------------------------------------------

export async function approveReferenceAnalysisCandidateRuleAction(input: {
  projectId: number;
  candidateRuleId: number;
  expectedCandidateRevision: number;
  expectedDraftRevision: number;
}): Promise<ReferenceAnalysisMutationResult> {
  return guardAction(() => approveReferenceAnalysisCandidateRuleActionImpl(input));
}

async function approveReferenceAnalysisCandidateRuleActionImpl(input: {
  projectId: number;
  candidateRuleId: number;
  expectedCandidateRevision: number;
  expectedDraftRevision: number;
}): Promise<ReferenceAnalysisMutationResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.candidateRuleId)) return { ok: false, error: "Invalid candidate rule id." };
  if (!isValidRevision(input.expectedCandidateRevision)) return { ok: false, error: "Invalid expected candidate rule revision." };
  if (!isValidRevision(input.expectedDraftRevision)) return { ok: false, error: "Invalid expected draft revision." };

  const timestamp = now();
  const attempt = safeTransaction((tx) => {
    const [rule] = tx
      .select()
      .from(projectStyleReferenceAnalysisCandidateRules)
      .where(eq(projectStyleReferenceAnalysisCandidateRules.id, input.candidateRuleId))
      .all() as ProjectStyleReferenceAnalysisCandidateRule[];
    if (!rule || rule.projectId !== input.projectId) return { kind: "not_found" as const };
    if (rule.status !== "proposed") return { kind: "immutable" as const };
    if (rule.revision !== input.expectedCandidateRevision) return { kind: "stale_candidate" as const };

    const ruleReferences = tx
      .select()
      .from(projectStyleReferenceAnalysisCandidateRuleReferences)
      .where(eq(projectStyleReferenceAnalysisCandidateRuleReferences.candidateRuleId, input.candidateRuleId))
      .all() as ProjectStyleReferenceAnalysisCandidateRuleReference[];
    if (ruleReferences.length === 0) return { kind: "no_sources" as const };

    // Re-verify every source Reference still exists in this Project — an
    // analysis Candidate Rule's sources are Reference Board images, not
    // Research Sources, so there is no separate "active/withdrawn" status
    // to re-check here; existence + ownership is the full contract.
    for (const rs of ruleReferences) {
      const [ref] = tx
        .select({ id: projectStyleReferenceImages.id, projectId: projectStyleReferenceImages.projectId })
        .from(projectStyleReferenceImages)
        .where(eq(projectStyleReferenceImages.id, rs.referenceId))
        .all() as { id: number; projectId: number }[];
      if (!ref || ref.projectId !== input.projectId) {
        return { kind: "source_missing" as const, referenceId: rs.referenceId };
      }
    }

    const [draft] = tx
      .select()
      .from(projectStyleDrafts)
      .where(eq(projectStyleDrafts.projectId, input.projectId))
      .all() as ProjectStyleDraft[];
    if (!draft) return { kind: "no_draft" as const };
    if (draft.revision !== input.expectedDraftRevision) return { kind: "stale_draft" as const, currentRevision: draft.revision };

    const provenanceNotes = JSON.stringify({
      runId: rule.runId,
      candidateRuleId: rule.id,
      referenceIds: ruleReferences.map((rs) => rs.referenceId),
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

    const approvedSnapshot = JSON.stringify({
      instruction: rule.instruction,
      pillar: rule.pillar,
      section: rule.section,
      category: rule.category,
      strength: rule.strength,
      applicability: rule.applicability,
    });

    tx.update(projectStyleReferenceAnalysisCandidateRules)
      .set({
        status: "approved",
        approvedDraftRuleId: insertResult.ruleId,
        approvedSnapshot,
        approvedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(projectStyleReferenceAnalysisCandidateRules.id, input.candidateRuleId))
      .run();

    return { kind: "ok" as const, draftRuleId: insertResult.ruleId, draftRevision: insertResult.newRevision };
  });
  if (!attempt.ok) return { ok: false, error: attempt.error };
  const outcome = attempt.value;

  if (outcome.kind === "not_found") return { ok: false, error: "Candidate rule not found." };
  if (outcome.kind === "immutable") return { ok: false, error: "Only proposed candidate rules can be approved." };
  if (outcome.kind === "stale_candidate") return { ok: false, error: "Stale candidate rule revision." };
  if (outcome.kind === "no_sources") return { ok: false, error: "Candidate rule has no linked references." };
  if (outcome.kind === "source_missing") return { ok: false, error: `Reference ${outcome.referenceId} no longer exists in this Project.` };
  if (outcome.kind === "no_draft") return { ok: false, error: "No Working Draft exists. Create one before approving rules." };
  if (outcome.kind === "stale_draft") return { ok: false, error: `Draft was changed elsewhere (current revision ${outcome.currentRevision}).` };

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, draftRuleId: outcome.draftRuleId, draftRevision: outcome.draftRevision };
}
