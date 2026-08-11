"use server";

// ---------------------------------------------------------------------------
// editorialApproval.ts — EDITORIAL.LATEST.APPROVAL.1
//
// One explicit, guarded batch action for the Editorial page's "Latest
// Approved" command: turns every Shot's currently usable "Latest
// generation" source into that Shot's approved video, all-or-nothing.
//
// Accepts ONLY `projectId`/`sequenceId` — never a Shot id, a video path, a
// count, or the page's mode selection. Every fact this action acts on
// (ownership, ordered Shot list, resolved sources) is re-read/re-resolved
// fresh here, through the same canonical resolver the page itself uses
// (`resolveVideoSourcesForShotList`), so a stale page-time selection can
// never drive a write and a forged/mismatched id pair is refused before any
// read that could mutate.
//
// Codex retake P1 — the async resolution above happens BEFORE the
// synchronous write transaction opens, leaving a window where a concurrent
// Shot move/add/delete or a newer `shot_videos` row could make the
// transaction commit against a stale snapshot. The transaction below
// re-verifies the WHOLE snapshot (Sequence ownership, the exact ordered
// Shot id list, and the deterministic Latest winner identity of EVERY
// snapshot Shot — not only the ones classified as eligible) against fresh
// reads through the SAME `tx` before writing anything; any mismatch throws
// and rolls back the entire batch rather than silently committing a
// stale/partial subset. Comparing every Shot (Codex retake round 2, P1) is
// what catches a previously-skipped Shot (no Latest source at resolution
// time) gaining a durable winner concurrently — an eligible-only compare
// would miss it entirely, since that Shot was never in the eligible loop
// to begin with. This reuses the existing pure, DB-free
// `pickLatestGenerationSources` resolver for the winner recomputation —
// never a second independent resolver — and deliberately does not redo
// filesystem/owner verification here (that judgment, made once outside the
// transaction by the canonical resolver, does not change concurrently).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences, shots, shotVideos } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveVideoSourcesForShotList } from "@/lib/editorial/videoSourceMode";
import { pickLatestGenerationSources } from "@/lib/editorial/videoSourceModeShared";
import { classifyLatestGenerationEligibility } from "@/lib/editorial/approveLatestGeneration";
import { applyShotVideoApprovalWithinTransaction } from "@/lib/shotVideoLibrary/approve";

export type ApproveLatestGenerationForSequenceResult =
  | {
      ok: true;
      approved: number;
      alreadyApproved: number;
      skipped: number;
      /**
       * `true` only when the transaction committed successfully but a
       * best-effort `revalidatePath` call threw afterward (Codex retake
       * P1) — the approvals above are still fully durable; some cached
       * pages may briefly show stale data until their own next visit or a
       * manual refresh. Never turns a committed result into `ok:false`.
       */
      revalidationIncomplete: boolean;
    }
  | { ok: false; error: string };

/** Thrown only for a concurrent-mutation mismatch caught INSIDE the write transaction — never a caller-facing type, just a marker so the catch block can return the honest "stale" message instead of the generic one. */
class StaleBatchError extends Error {}

export async function approveLatestGenerationForSequence(
  projectId: number,
  sequenceId: number
): Promise<ApproveLatestGenerationForSequenceResult> {
  if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(sequenceId) || sequenceId <= 0) {
    return { ok: false, error: "Invalid request." };
  }

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    return { ok: false, error: "Sequence not found." };
  }

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));

  if (shotList.length === 0) {
    return { ok: true, approved: 0, alreadyApproved: 0, skipped: 0, revalidationIncomplete: false };
  }

  const snapshotShotIds = shotList.map((s) => s.id);
  const resolved = await resolveVideoSourcesForShotList(shotList, "latest-generation");
  const { eligible, skippedCount } = classifyLatestGenerationEligibility(snapshotShotIds, resolved);

  // Freeze the deterministic Latest winner identity (the `shot_videos` row
  // id, or `null` when none existed) for EVERY Shot in the snapshot — not
  // only the ones classified as eligible (Codex retake round 2, P1). A
  // Shot with no usable source right now can still gain a durable winner
  // before commit; that change must refuse the batch exactly like a
  // changed/lost winner for an already-eligible Shot. Reuses the SAME
  // `resolved` map the canonical resolver already produced — no second
  // selection algorithm.
  const snapshotWinnerIds = new Map<number, number | null>(
    snapshotShotIds.map((shotId) => {
      const source = resolved.get(shotId);
      const winnerId = source?.provenance?.kind === "shot-video" ? source.provenance.shotVideoId : null;
      return [shotId, winnerId];
    })
  );

  // Codex retake round 3, P1 — the winner ID alone is not enough: an
  // EXISTING `shot_videos` row's `videoPath` could theoretically be
  // updated in place between resolution and commit, leaving the row's id
  // equal while the path itself changed. Freeze the exact path each
  // originally-eligible Shot resolved to, so the transaction below can
  // require it to still match before ever writing it into
  // `shots.approvedVideoPath`.
  const eligiblePathByShotId = new Map(eligible.map((item) => [item.shotId, item.videoPath]));

  if (eligible.length === 0) {
    return { ok: true, approved: 0, alreadyApproved: 0, skipped: skippedCount, revalidationIncomplete: false };
  }

  let approved = 0;
  let alreadyApproved = 0;
  try {
    db.transaction((tx) => {
      approved = 0;
      alreadyApproved = 0;

      // 1) Sequence still exists and still belongs to this Project. (A
      // Project row deleted concurrently would already have cascaded the
      // Sequence away via its own FK, so this single check also covers
      // Project existence — no separate re-read needed.)
      const [freshSequence] = tx
        .select({ id: sequences.id, projectId: sequences.projectId })
        .from(sequences)
        .where(eq(sequences.id, sequenceId))
        .all();
      if (!freshSequence || freshSequence.projectId !== projectId) {
        throw new StaleBatchError("Sequence changed since this request was resolved.");
      }

      // 2) The Sequence's ordered Shot id list is EXACTLY the snapshot
      // this attempt resolved against — a concurrent move/add/delete of
      // any Shot in the Sequence refuses the whole batch.
      const freshShotIds = tx
        .select({ id: shots.id })
        .from(shots)
        .where(eq(shots.sequenceId, sequenceId))
        .orderBy(asc(shots.orderIndex))
        .all()
        .map((s) => s.id);
      const sameShotList =
        freshShotIds.length === snapshotShotIds.length && freshShotIds.every((id, i) => id === snapshotShotIds[i]);
      if (!sameShotList) {
        throw new StaleBatchError("The Sequence's Shots changed since this request was resolved.");
      }

      // 3) The deterministic Latest `shot_videos` winner identity is
      // unchanged for EVERY snapshot Shot — not only the ones classified
      // as eligible (Codex retake round 2, P1): a Shot that had no usable
      // source at resolution time but gains a durable winner before commit
      // must also refuse the batch, exactly like a changed/lost winner for
      // an already-eligible Shot. Reuses the exact pure resolver the
      // page/action already trust, no second resolver, no filesystem/owner
      // re-check (that verdict does not change concurrently for an
      // unchanged row).
      //
      // Codex retake round 3, P1 — the winner id alone does not prove the
      // PATH is still the one this attempt resolved: for every originally
      // eligible Shot, the fresh winner's `videoPath` must also still
      // equal the exact path frozen in `eligible` before it is ever
      // written — an id match with a changed path would otherwise let a
      // stale/changed path reach `shots.approvedVideoPath`.
      const freshVideoRows = tx
        .select({
          id: shotVideos.id,
          shotId: shotVideos.shotId,
          source: shotVideos.source,
          videoPath: shotVideos.videoPath,
          createdAt: shotVideos.createdAt,
          generationJobId: shotVideos.generationJobId,
          sourceCandidateId: shotVideos.sourceCandidateId,
          durationSeconds: shotVideos.durationSeconds,
        })
        .from(shotVideos)
        .where(inArray(shotVideos.shotId, snapshotShotIds))
        .all();
      // SHOT.VIDEO.REFERENCES.1 — same exclusion as videoSourceMode.ts's
      // own `resolveLatestGenerationRaw`: a "reference_copy" row must never
      // win "Latest generation", including in this atomic re-verification.
      const freshEligibleVideoRows = freshVideoRows.filter((row): row is typeof row & { source: "generation" | "sequence_split" } => row.source !== "reference_copy");
      const freshWinners = pickLatestGenerationSources(snapshotShotIds, freshEligibleVideoRows);

      for (const shotId of snapshotShotIds) {
        const freshWinner = freshWinners.get(shotId);
        const freshWinnerId = freshWinner?.provenance?.kind === "shot-video" ? freshWinner.provenance.shotVideoId : null;
        if (freshWinnerId !== snapshotWinnerIds.get(shotId)) {
          throw new StaleBatchError("The current Latest generation source changed since this request was resolved.");
        }

        const eligiblePath = eligiblePathByShotId.get(shotId);
        if (eligiblePath !== undefined && freshWinner?.videoPath !== eligiblePath) {
          throw new StaleBatchError("The current Latest generation source changed since this request was resolved.");
        }
      }

      // Only now, with the whole snapshot re-proven fresh, perform the
      // actual writes.
      for (const item of eligible) {
        const result = applyShotVideoApprovalWithinTransaction(tx, item.shotId, item.videoPath);
        if (result.changed) approved++;
        else alreadyApproved++;
      }
    });
  } catch (err) {
    if (err instanceof StaleBatchError) {
      // No partial batch: the mismatch was caught before any write in
      // this attempt, and the transaction is not committed.
      return { ok: false, error: "The Sequence changed while approving — please retry." };
    }
    // Sanitized only — never a raw DB error back to the browser. The
    // transaction already rolled back every write in `eligible`, so no
    // partial batch is ever left committed.
    return { ok: false, error: "Failed to approve videos. No changes were made." };
  }

  // Best-effort revalidation ONLY after a known-successful commit above —
  // Codex retake P1: a cache-invalidation throw here must never turn an
  // already-committed approval into a reported failure. The client also
  // calls `router.refresh()` on any `ok:true` result regardless, which
  // independently forces a fresh render of the current page.
  let revalidationIncomplete = false;
  const revalidateTargets = [
    `/projects/${projectId}/sequences/${sequenceId}/editorial`,
    `/projects/${projectId}/sequences/${sequenceId}`,
    `/projects/${projectId}`,
    ...eligible.map((item) => `/projects/${projectId}/sequences/${sequenceId}/shots/${item.shotId}`),
  ];
  for (const target of revalidateTargets) {
    try {
      revalidatePath(target);
    } catch {
      revalidationIncomplete = true;
      // Fixed string only — never the caught error object/message, which
      // could carry implementation or request details (Codex retake round
      // 2, P2). Internal-only diagnostic, never surfaced to the client.
      console.error("approveLatestGenerationForSequence: a revalidatePath call failed after a successful commit.");
    }
  }

  return { ok: true, approved, alreadyApproved, skipped: skippedCount, revalidationIncomplete };
}
