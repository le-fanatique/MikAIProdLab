// ---------------------------------------------------------------------------
// ownershipChain.ts — SHOT.VIDEO.REFERENCES.1 (Retake Round 2, Codex P1)
//
// Server-only. A small, synchronous re-check of "does this exact Shot still
// belong to this exact Sequence, which still belongs to this exact Project"
// — run INSIDE the same final transaction that inserts/deletes a Video
// Reference row or writes a bridge destination row.
//
// Every mutating action here already validates ownership once, BEFORE the
// async upload/copy/probe window (a real wall-clock delay: FFprobe spawns a
// subprocess). That pre-check alone is not enough: a concurrent request
// could move the Shot to a different Sequence, or the Sequence to a
// different Project, while the upload/copy is still in flight. Re-reading
// the chain a second time, synchronously, inside the transaction that is
// about to commit, closes that window — a stale chain rolls the whole
// transaction back exactly like a stale source row does.
// ---------------------------------------------------------------------------

import { shots, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Re-reads `shots.sequenceId` and `sequences.projectId` fresh, inside the
 * caller's own open transaction. Returns `false` (never throws) on any
 * mismatch or missing row — the caller decides how to fail (throw a
 * sanitized, distinguishable error and let the transaction roll back).
 */
export function isOwnershipChainCurrent(tx: Tx, shotId: number, sequenceId: number, projectId: number): boolean {
  const [shot] = tx.select({ sequenceId: shots.sequenceId }).from(shots).where(eq(shots.id, shotId)).all();
  if (!shot || shot.sequenceId !== sequenceId) return false;

  const [sequence] = tx.select({ projectId: sequences.projectId }).from(sequences).where(eq(sequences.id, sequenceId)).all();
  if (!sequence || sequence.projectId !== projectId) return false;

  return true;
}
