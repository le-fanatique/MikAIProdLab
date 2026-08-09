// ---------------------------------------------------------------------------
// approve.ts — SHOT.VIDEO.LIBRARY.1
//
// Server-only shared core (never a Server Action itself — no "use server"):
// the ONE place that ever writes `shots.approvedVideoPath` for a Shot Video
// Library entry and outdates dependent Sequence/Film Results. Used by BOTH
// `approveShotVideo` (src/actions/shotVideoLibrary.ts, either source) and
// `approveVideoOutput` (src/actions/generation.ts, Generation Content's
// quick one-click approve), so a real approval through either surface can
// never silently skip Results invalidation.
//
// REVISE (round 1) — `approveVideoOutput` previously wrote
// `shots.approvedVideoPath` directly, bypassing this exact logic entirely;
// a real change made through that button never outdated active/published
// Sequence/Film Results. Fixed by routing BOTH callers through this one
// function.
//
// EDITORIAL.LATEST.APPROVAL.1 — `applyShotVideoApprovalWithinTransaction`
// below is the per-Shot mutation core, extracted so a caller that needs to
// approve MANY Shots atomically (the Editorial "Latest Approved" batch
// action) can run it once per Shot inside its OWN single outer transaction
// (true all-or-nothing), instead of nesting `approveShotVideoPath`'s
// per-call transaction (better-sqlite3 does not support nested
// transactions). `approveShotVideoPath` itself is unchanged behaviorally —
// it still opens exactly one transaction per call — it now just delegates
// its body to this shared function.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shots, sequences, sequenceResults, filmResults } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export type ApproveShotVideoResult = { ok: true } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The actual per-Shot write, run against an ALREADY-OPEN transaction handle
 * (never opens its own) — so a caller composing several of these into one
 * outer `db.transaction` gets true atomicity across every Shot it touches.
 * Re-reads the Shot fresh from `tx` (never trusts a caller-held Shot row),
 * derives `sequenceId`/`projectId` from that fresh row only, and stays
 * strictly idempotent: a `videoPath` that already matches the Shot's
 * current `approvedVideoPath` is a no-op, including no Results
 * invalidation. Returns `{changed: true}` only when a real write happened,
 * so a batch caller can report accurate approved/already-approved counts.
 * Throws (never returns an `ok:false`) on a genuinely invalid Shot/Sequence
 * so it participates correctly in the caller's transaction rollback.
 */
export function applyShotVideoApprovalWithinTransaction(
  tx: Tx,
  shotId: number,
  videoPath: string
): { changed: boolean } {
  const [freshShot] = tx.select().from(shots).where(eq(shots.id, shotId)).all();
  if (!freshShot) throw new Error("Shot is no longer valid.");

  // Idempotent no-op: re-approving the already-approved video (a
  // direct/replayed call) must never re-outdate Sequence/Film Results
  // for an output that hasn't actually changed.
  if (freshShot.approvedVideoPath === videoPath) return { changed: false };

  const [sequence] = tx.select({ id: sequences.id, projectId: sequences.projectId }).from(sequences).where(eq(sequences.id, freshShot.sequenceId)).all();
  if (!sequence) throw new Error("Sequence is no longer valid.");

  const now = new Date().toISOString();
  tx.update(shots).set({ approvedVideoPath: videoPath, updatedAt: now }).where(eq(shots.id, shotId)).run();
  tx.update(sequenceResults)
    .set({ status: "outdated", updatedAt: now })
    .where(and(eq(sequenceResults.sequenceId, sequence.id), eq(sequenceResults.projectId, sequence.projectId), inArray(sequenceResults.status, ["active", "published"])))
    .run();
  tx.update(filmResults)
    .set({ status: "outdated", updatedAt: now })
    .where(and(eq(filmResults.projectId, sequence.projectId), inArray(filmResults.status, ["active", "published"])))
    .run();
  return { changed: true };
}

/**
 * Sets `shots.approvedVideoPath = videoPath` and outdates every
 * active/published Sequence/Film Result for the Shot's own Project — one
 * synchronous transaction, re-verified fresh, strictly idempotent (a no-op,
 * including no Results invalidation, when `videoPath` already IS the
 * approved one). `sequenceId`/`projectId` are derived from the Shot's own
 * live row inside the transaction, never trusted from a caller-supplied
 * value, so this is safe to call from any surface that has only a
 * `shotId` + the video path to approve.
 */
export async function approveShotVideoPath(shotId: number, videoPath: string): Promise<ApproveShotVideoResult> {
  try {
    db.transaction((tx) => {
      applyShotVideoApprovalWithinTransaction(tx, shotId, videoPath);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to approve this video." };
  }
}
