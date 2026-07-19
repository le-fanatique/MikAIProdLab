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
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shots, sequences, sequenceResults, filmResults } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export type ApproveShotVideoResult = { ok: true } | { ok: false; error: string };

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
      const [freshShot] = tx.select().from(shots).where(eq(shots.id, shotId)).all();
      if (!freshShot) throw new Error("Shot is no longer valid.");

      // Idempotent no-op: re-approving the already-approved video (a
      // direct/replayed call) must never re-outdate Sequence/Film Results
      // for an output that hasn't actually changed.
      if (freshShot.approvedVideoPath === videoPath) return;

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
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to approve this video." };
  }
}
