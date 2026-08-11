// ---------------------------------------------------------------------------
// failureMessages.ts — SHOT.VIDEO.REFERENCES.1 (Retake Round 3, Codex P1)
//
// Server-only pure helpers — deliberately NOT a `"use server"` module (no
// directive here). Next.js's `"use server"` boundary only allows exporting
// async functions from a file carrying that directive; exporting a class or
// a plain sync function from `shotReferenceVideos.ts`/
// `shotVideoReferenceBridge.ts` directly (as an earlier draft of this round
// did) silently voids that WHOLE module's exports at build time ("The
// module has no exports at all"). Extracting the sentinel error type and
// the pure failure-message classifiers here — imported by both action
// files — keeps them exportable/testable without ever touching the actions'
// own `"use server"` export surface.
//
// Every classifier here is the EXACT function the corresponding action's
// catch block calls — never a re-implementation kept in sync by hand — so a
// caller (production code or a proof) is testing the real decision logic.
// ---------------------------------------------------------------------------

/** Thrown by `shotReferenceVideos.ts`'s own transactions for one of two known-safe stale-request reasons — never constructed anywhere else, so `instanceof` alone is proof a caught value is one of these two known cases. */
export class StaleRequestError extends Error {
  reason: "chain" | "row";
  constructor(reason: "chain" | "row") {
    super(reason);
    this.name = "StaleRequestError";
    this.reason = reason;
  }
}

const CHAIN_CHANGED_MESSAGE =
  "This Shot no longer belongs to the expected Sequence/Project — it may have been moved. Nothing was changed — please refresh and retry.";
const ROW_STALE_MESSAGE = "This Video Reference changed or was already deleted. Please refresh and try again.";

/** The exact classification `createShotReferenceVideo`'s catch block uses. Never reads `.message`/`String(e)` off an arbitrary caught value — only `StaleRequestError.reason` (checked via `instanceof`, never duck-typed) selects a fixed, pre-written string. */
export function classifyCreateFailureReason(e: unknown): string {
  return e instanceof StaleRequestError && e.reason === "chain" ? CHAIN_CHANGED_MESSAGE : "Failed to save this Video Reference — nothing was changed. Please try again.";
}

/** The exact classification `deleteShotReferenceVideo`'s catch block uses — same rationale as `classifyCreateFailureReason`. */
export function classifyDeleteFailureReason(e: unknown): string {
  if (e instanceof StaleRequestError && e.reason === "chain") return CHAIN_CHANGED_MESSAGE;
  if (e instanceof StaleRequestError && e.reason === "row") return ROW_STALE_MESSAGE;
  return "Failed to delete this Video Reference — nothing was changed. Please try again.";
}

// ---------------------------------------------------------------------------
// Bridge-specific sentinels (shotVideoReferenceBridge.ts). A plain string
// marker (not a class) is enough here since both bridge transactions throw
// via `new Error(SOURCE_CHANGED | CHAIN_CHANGED)` and `bridgeFailureMessage`
// only ever compares `.message` for EQUALITY against these two known
// constants — it never interpolates the caught value into its output, so an
// adversarial message can, at worst, fail both comparisons and fall to the
// generic branch.
// ---------------------------------------------------------------------------

export const BRIDGE_SOURCE_CHANGED = "SOURCE_CHANGED";
export const BRIDGE_CHAIN_CHANGED = "CHAIN_CHANGED";

/** The exact classification both bridge actions' catch blocks use — never a path, never a raw DB/OS error. */
export function bridgeFailureMessage(txError: unknown, fileRemoved: boolean): string {
  const reason = txError instanceof Error ? txError.message : null;
  const base =
    reason === BRIDGE_CHAIN_CHANGED
      ? "This Shot no longer belongs to the expected Sequence/Project — it may have been moved. Nothing was added — please refresh and retry."
      : reason === BRIDGE_SOURCE_CHANGED
        ? "The source video changed or was removed while this copy was being prepared. Nothing was added — please retry."
        : "Failed to complete this copy. Please try again.";
  return fileRemoved ? base : `${base} A copied file may remain on the server; please retry or contact support if this persists.`;
}
