// ---------------------------------------------------------------------------
// syncPhase.ts — STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1 (lot A)
//
// Pure, client-safe (no DB/network, no "server-only", no `@/actions/*`, no
// `react`). Extracted from `ReferenceAnalysisWorkspace.tsx`: the decision of
// whether a `pending-sync` phase is needed after a commit + relecture, and
// how a retry replays only the failed reads.
//
// This mirrors `restoreLookTestSnapshotSelections.ts`'s shape: a component
// keeps its state and its handlers, and delegates only the pure calculation.
// ---------------------------------------------------------------------------

export type SyncNeed = "none" | "analysis" | "draft" | "both";

/** Result of a relecture: what succeeded, what failed. */
export type ReadOutcome = { analysis?: boolean; draft?: boolean };

/** The six situations that today produce a `pending-sync`. */
export type SyncOrigin =
  | "analysisLaunched"
  | "analysisConfirmed"
  | "observationMutated"
  | "candidateRuleMutated"
  | "ruleApproved"
  | "retry";

export type PendingSync = { syncNeed: SyncNeed; message: string };

/**
 * Decides whether a `pending-sync` is needed after a known CORE commit and a
 * relecture. Returns `null` when everything was reread — the caller then goes
 * back to `idle`.
 *
 * Total function: every (origin, outcome) pair has an answer.
 */
export function resolvePendingSync(origin: SyncOrigin, outcome: ReadOutcome): PendingSync | null {
  switch (origin) {
    case "analysisLaunched":
    case "analysisConfirmed":
      if (outcome.analysis === false) {
        return { syncNeed: "analysis", message: "Analysis completed but the result could not be loaded." };
      }
      return null;

    case "observationMutated":
      if (outcome.analysis === false) {
        return { syncNeed: "analysis", message: "Observation saved but analysis state could not be refreshed." };
      }
      return null;

    case "candidateRuleMutated":
      if (outcome.analysis === false) {
        return { syncNeed: "analysis", message: "Candidate rule saved but analysis state could not be refreshed." };
      }
      return null;

    case "ruleApproved": {
      const analysisFailed = outcome.analysis === false;
      const draftFailed = outcome.draft === false;
      if (analysisFailed && draftFailed) {
        return { syncNeed: "both", message: "Rule approved but analysis state and Working Draft could not be refreshed." };
      }
      if (analysisFailed) {
        return { syncNeed: "analysis", message: "Rule approved but analysis state could not be refreshed." };
      }
      if (draftFailed) {
        return { syncNeed: "draft", message: "Rule approved but Working Draft could not be refreshed." };
      }
      return null;
    }

    case "retry": {
      const analysisFailed = outcome.analysis === false;
      const draftFailed = outcome.draft === false;
      if (!analysisFailed && !draftFailed) return null;
      const syncNeed: SyncNeed = analysisFailed && draftFailed ? "both" : analysisFailed ? "analysis" : "draft";
      return { syncNeed, message: "Sync still incomplete. Retry when ready." };
    }
  }
}

/**
 * Replays ONLY reads. The two readers are injected, and this function has
 * access to no mutation — that is the property the ticket must prove, and it
 * is true by construction, not by observation.
 *
 * Reads run SEQUENTIALLY (analysis first, then draft) — this is a different
 * path from `handleRuleApproved`'s `Promise.all`, and the two are not
 * unified here.
 */
export async function retrySync(
  need: SyncNeed,
  readers: {
    readAnalysis: () => Promise<{ ok: boolean }>;
    readDraft: () => Promise<{ ok: boolean }>;
  },
): Promise<PendingSync | null> {
  let analysisOk = true;
  let draftOk = true;

  if (need === "analysis" || need === "both") {
    const r = await readers.readAnalysis();
    analysisOk = r.ok;
  }
  if (need === "draft" || need === "both") {
    const r = await readers.readDraft();
    draftOk = r.ok;
  }

  return resolvePendingSync("retry", { analysis: analysisOk, draft: draftOk });
}
