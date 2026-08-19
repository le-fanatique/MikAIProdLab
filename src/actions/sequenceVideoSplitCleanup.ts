"use server";

// ---------------------------------------------------------------------------
// sequenceVideoSplitCleanup.ts — SEQGEN.SPLIT.CLEANUP.1, Lot B
//
// Clear unused past runs: deletes only runs of the currently-open draft that
// are neither the currently displayed run, `detecting`, nor referenced
// (directly or through one of their segments) by any `shot_video_candidates`
// row. Split from the former `src/actions/sequenceVideoSplit.ts` by
// IND.SPLIT.1 — see `src/actions/sequenceVideoSplitDetection.ts`,
// `src/actions/sequenceVideoSplitSegments.ts`, and
// `src/actions/sequenceVideoSplitValidate.ts` for the rest.
//
// Deletability is re-verified inside the SAME transaction that performs the
// delete for each run — never trusted from an earlier count or from the
// button being shown — closing the race with a concurrent Push. The FK on
// `shot_video_candidates` (no `onDelete` action, i.e. RESTRICT) is the
// last-resort guard if that race is somehow still lost; recognized
// explicitly by its exact SQLite error code, never by catching every
// possible failure.
//
// REVISE (round 2) — quarantine/transaction/compensation discipline
// mirroring `deleteShotVideo`'s file-owning branch in
// `shotVideoLibrary.ts`: the thumbnail directory is renamed out of the way
// BEFORE the DB row is ever touched, restored if the transaction fails for
// any reason, and only permanently removed once the transaction has
// actually committed — never DB-delete-then-best-effort-cleanup, which
// could leave an orphaned directory with zero DB provenance pointing back
// at it.
//
// REVISE (round 3) — the round-2 version still returned `kind: "deleted"`
// when the FINAL quarantine removal failed after commit, leaving a
// `.trash-*` directory with zero DB provenance and no retry path: exactly
// the orphan this discipline exists to prevent. This round captures a full
// snapshot of the run row AND every one of its segments (not just ids)
// BEFORE the delete, so that a final-cleanup failure can restore the
// directory AND re-insert the run plus every segment with their original
// ids/values — the multi-row extension of the same compensation shape
// already proven for a single row in `deleteShotVideo`
// (`shotVideoLibrary.ts:214-260`), `deleteShotVideoCandidate`
// (`sequenceVideoPush.ts:548-600`) and `deleteSequenceStoryboardImage`
// (`sequenceStoryboard.ts:272-321`). `kind: "deleted"` is now returned ONLY
// when the final cleanup actually succeeds; any other outcome is `kind:
// "error"` with the exact, granular compensation state.
// ---------------------------------------------------------------------------

import path from "node:path";
import fsPromises from "node:fs/promises";
import { db } from "@/db";
import { sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shotVideoCandidates } from "@/db/schema";
import { eq, asc, inArray, or } from "drizzle-orm";
import { THUMBNAIL_ROOT_RELATIVE } from "@/lib/sequenceVideoSplit/detectVideoSplits";
import { errRedirectTo, cleanupRedirectTo, isForeignKeyRestrictError } from "@/lib/sequenceVideoSplit/actionHelpers";

type ClearRunOutcome =
  | { kind: "already-gone" }
  | { kind: "protected" }
  | { kind: "deleted"; cleanupWarning: string | null }
  | { kind: "error"; error: string };

// REVISE (round 5) — widened from a single 150ms retry to a bounded,
// backing-off sequence (4 attempts total, ~850ms of retrying at worst)
// before a removal failure is treated as final. Still strictly bounded —
// never unbounded polling — but generous enough to absorb the transient
// locks (AV scanner, search indexer, a still-open handle from the rename
// that just happened) that a single 150ms retry could still lose to.
const QUARANTINE_REMOVAL_RETRY_DELAYS_MS = [100, 250, 500];

/**
 * Never gives up silently: attempts the removal, then retries with the
 * bounded backoff above. `ok: false` only after every attempt has failed.
 */
async function removeQuarantineDir(quarantineDir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError: unknown;
  const attempts = QUARANTINE_REMOVAL_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fsPromises.rm(quarantineDir, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      lastError = e;
      if (attempt < QUARANTINE_REMOVAL_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, QUARANTINE_REMOVAL_RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  return {
    ok: false,
    error: `Failed to remove quarantined thumbnail directory "${quarantineDir}" (retried ${attempts - 1} time(s)): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  };
}

/**
 * Deletes exactly one run if — and only if — it is genuinely unused,
 * following the quarantine/transaction/compensation discipline described
 * above. Never throws: every outcome, including a real DB failure, is
 * returned as an explicit `ClearRunOutcome` for the caller to tally and
 * report honestly.
 */
async function deleteOneUnusedRun(runId: number, currentRunId: number, sequenceVideoDraftId: number): Promise<ClearRunOutcome> {
  const liveDir = path.resolve(process.cwd(), "public", THUMBNAIL_ROOT_RELATIVE, `run-${runId}`);
  const quarantineDir = `${liveDir}.trash-${Date.now()}-${runId}`;

  let quarantined = false;
  try {
    await fsPromises.rename(liveDir, quarantineDir);
    quarantined = true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // ENOENT — this run never produced a thumbnail directory (e.g. a
    // Manual Detection run whose single thumbnail generation itself
    // failed). Nothing to quarantine; proceed exactly as if quarantine had
    // succeeded on an empty directory.
    if (err.code !== "ENOENT") {
      return { kind: "error", error: `Could not prepare this run's thumbnails for deletion: ${err.message}` };
    }
  }

  // REVISE (round 2) — widened via an explicit type alias and read back
  // through it below: `let` reassigned only from inside the `db.transaction`
  // closure otherwise narrows unpredictably under TS control-flow analysis
  // (the exact same quirk already documented and sidestepped for
  // `didNormalize`/`normalizedOldThumbnailPath` in `validateSplitPlan`
  // above).
  type DeleteResult = "deleted" | "already-gone" | "protected" | null;
  let deleteResult: DeleteResult = null;
  let transactionError: string | null = null;
  // Captured ONLY on the actual delete path, from the exact rows the
  // transaction is about to remove — the sole source of truth for
  // compensation if the final quarantine cleanup fails after commit.
  let runSnapshot: typeof sequenceVideoSplitRuns.$inferSelect | null = null;
  let segmentsSnapshot: (typeof sequenceVideoSplitSegments.$inferSelect)[] = [];

  try {
    db.transaction((tx) => {
      const [freshRun] = tx.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as (typeof sequenceVideoSplitRuns.$inferSelect)[];
      // Already gone — a concurrent cleanup (or this same action retried)
      // already removed it. Not this call's doing, not a failure either.
      if (!freshRun) {
        deleteResult = "already-gone";
        return;
      }
      if (freshRun.id === currentRunId || freshRun.status === "detecting" || freshRun.sequenceVideoDraftId !== sequenceVideoDraftId) {
        deleteResult = "protected";
        return;
      }

      const segments = tx
        .select()
        .from(sequenceVideoSplitSegments)
        .where(eq(sequenceVideoSplitSegments.splitRunId, runId))
        .orderBy(asc(sequenceVideoSplitSegments.orderIndex))
        .all() as unknown as (typeof sequenceVideoSplitSegments.$inferSelect)[];
      const segmentIds = segments.map((s) => s.id);

      const candidateHits = tx
        .select({ id: shotVideoCandidates.id })
        .from(shotVideoCandidates)
        .where(
          segmentIds.length > 0
            ? or(eq(shotVideoCandidates.splitRunId, runId), inArray(shotVideoCandidates.splitSegmentId, segmentIds))
            : eq(shotVideoCandidates.splitRunId, runId)
        )
        .all() as unknown as { id: number }[];

      if (candidateHits.length > 0) {
        deleteResult = "protected";
        return;
      }

      runSnapshot = freshRun;
      segmentsSnapshot = segments;

      // Cascades to this run's own segments (`onDelete: "cascade"` on
      // `sequenceVideoSplitSegments.splitRunId`) — no separate delete
      // needed, no migration involved, same cascade the schema already
      // establishes for every other consumer of this table.
      tx.delete(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).run();
      deleteResult = "deleted";
    });
  } catch (e) {
    if (isForeignKeyRestrictError(e)) {
      deleteResult = "protected";
    } else {
      // A real DB failure (lock contention, corruption, programming error,
      // etc.) — never silently reclassified as "protected." The directory
      // is still sitting safely in quarantine; restored below.
      transactionError = e instanceof Error ? e.message : String(e);
    }
  }

  if (transactionError !== null) {
    if (quarantined) {
      try {
        await fsPromises.rename(quarantineDir, liveDir);
      } catch (restoreErr) {
        return {
          kind: "error",
          error: `${transactionError} Additionally, its thumbnail directory could not be restored from quarantine ("${quarantineDir}"): ${
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
          }.`,
        };
      }
    }
    return { kind: "error", error: transactionError };
  }

  const finalDeleteResult = deleteResult as DeleteResult;

  if (finalDeleteResult === "already-gone") {
    if (quarantined) {
      // The DB row vanished (a concurrent cleanup already won) but this
      // call had already quarantined the directory that, by construction,
      // belonged to THIS run and nothing else — finish removing it rather
      // than leaving a `.trash-*` directory behind forever.
      //
      // REVISE (round 5, Codex finding) — `removeQuarantineDir`'s bounded
      // retry sequence (see above) already absorbs the transient-lock
      // case. If it STILL fails after every attempt, there is nothing to
      // compensate on the DB side (the row is genuinely, correctly gone —
      // deleted by whichever concurrent call actually won that race), but
      // the directory itself must never be abandoned under its disposable,
      // effectively unfindable `.trash-<timestamp>-<id>` name — that is
      // exactly the untracked orphan this finding forbids. Instead it is
      // moved BACK to its own plain, predictable path (`run-<id>`, the
      // exact location anything inspecting this run's thumbnails would
      // already look at) — never a compensation that resurrects the run
      // row itself (a concurrent caller legitimately deleted it; reviving
      // it here would be its own kind of incorrect state), but a stable,
      // addressable location a later pass (this same code path run again
      // for a stray directory of a nonexistent run, or a manual sweep)
      // can still find and finish removing once whatever held the lock
      // releases it.
      const cleanup = await removeQuarantineDir(quarantineDir);
      if (!cleanup.ok) {
        try {
          await fsPromises.rename(quarantineDir, liveDir);
          return {
            kind: "error",
            error: `Run already removed by a concurrent request. Its thumbnail directory could not be deleted after extended retries, so it was moved back to its normal location ("${liveDir}") instead of being left as an untracked quarantine copy — no DB row references it, but it remains discoverable at that path for a later cleanup pass or manual removal. ${cleanup.error}`,
          };
        } catch (restoreErr) {
          // Worst case: even moving it back failed. It remains at the
          // KNOWN quarantine path — still identifiable by the run id in
          // its own name, still explicitly reported, never silently
          // dropped as a bare "success."
          return {
            kind: "error",
            error: `Run already removed by a concurrent request. Its thumbnail directory could not be deleted after extended retries, and could also not be moved back to its normal location ("${liveDir}"): ${
              restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
            }. It remains at "${quarantineDir}" — still identifiable by this run's id — and requires manual removal. ${cleanup.error}`,
          };
        }
      }
    }
    return { kind: "already-gone" };
  }

  if (finalDeleteResult === "protected") {
    if (quarantined) {
      try {
        await fsPromises.rename(quarantineDir, liveDir);
      } catch (restoreErr) {
        return {
          kind: "error",
          error: `This run is protected, but its thumbnail directory could not be restored from quarantine ("${quarantineDir}"): ${
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
          }.`,
        };
      }
    }
    return { kind: "protected" };
  }

  // deleteResult === "deleted" — the DB row and its segments are committed
  // gone. Only now attempt to permanently remove the quarantined directory.
  if (!quarantined) return { kind: "deleted", cleanupWarning: null };
  const finalCleanup = await removeQuarantineDir(quarantineDir);
  if (finalCleanup.ok) return { kind: "deleted", cleanupWarning: null };

  // REVISE (round 3, then round 4 finding 1) — final cleanup failed AFTER
  // the DB commit: a `.trash-*` directory now exists with zero DB
  // provenance. NEVER report "deleted" here. Compensate on BOTH sides —
  // restore the directory to its live path AND re-insert the run plus
  // EVERY segment, each with its exact original id/values (from the
  // snapshot captured inside the transaction, before the delete ran) —
  // then report failure so the user can retry.
  //
  // The DB side is now ONE synchronous transaction (`db.transaction`),
  // never independent inserts: better-sqlite3 transactions are ACID —
  // a failure on ANY insert (run or any one segment) throws and the
  // transaction driver rolls back everything already written inside it,
  // so the DB can only ever end up in exactly one of two states — fully
  // restored or fully NOT restored — never a partially-restored run with
  // some but not all of its segments (the round-3 gap this closes).
  let dirRestored = false;
  try {
    await fsPromises.rename(quarantineDir, liveDir);
    dirRestored = true;
  } catch {
    /* directory stuck under quarantineDir — reported explicitly below, never silently */
  }

  let dbRestored = false;
  let dbRestoreError: string | null = null;
  if (runSnapshot) {
    const run = runSnapshot as typeof sequenceVideoSplitRuns.$inferSelect;
    const segs = segmentsSnapshot;
    try {
      db.transaction((tx) => {
        tx.insert(sequenceVideoSplitRuns)
          .values({
            id: run.id,
            sequenceId: run.sequenceId,
            sequenceVideoDraftId: run.sequenceVideoDraftId,
            sourceVideoPathSnapshot: run.sourceVideoPathSnapshot,
            sourceDurationSeconds: run.sourceDurationSeconds,
            sourceFps: run.sourceFps,
            sourceWidth: run.sourceWidth,
            sourceHeight: run.sourceHeight,
            engineVersion: run.engineVersion,
            sceneThreshold: run.sceneThreshold,
            minSegmentDurationSeconds: run.minSegmentDurationSeconds,
            paramsJson: run.paramsJson,
            rawCandidatesJson: run.rawCandidatesJson,
            expectedShotCount: run.expectedShotCount,
            expectedShotOrderSnapshot: run.expectedShotOrderSnapshot,
            status: run.status,
            errorMessage: run.errorMessage,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            validatedAt: run.validatedAt,
          })
          .run();

        for (const seg of segs) {
          tx.insert(sequenceVideoSplitSegments)
            .values({
              id: seg.id,
              splitRunId: seg.splitRunId,
              orderIndex: seg.orderIndex,
              startSeconds: seg.startSeconds,
              endSeconds: seg.endSeconds,
              confidence: seg.confidence,
              boundaryProvenance: seg.boundaryProvenance,
              targetShotId: seg.targetShotId,
              status: seg.status,
              thumbnailPath: seg.thumbnailPath,
              createdAt: seg.createdAt,
              updatedAt: seg.updatedAt,
            })
            .run();
        }
      });
      dbRestored = true;
    } catch (e) {
      // Transaction threw — better-sqlite3 has already rolled back every
      // insert attempted inside it. Nothing partial survives; `dbRestored`
      // stays false and the exact DB error is reported below.
      dbRestoreError = e instanceof Error ? e.message : String(e);
    }
  }

  const totalSegments = segmentsSnapshot.length;
  if (dirRestored && dbRestored) {
    return {
      kind: "error",
      error: `Final thumbnail cleanup failed, but this run was fully restored (directory, run row, and all ${totalSegments} segment(s)) — nothing was lost. Please retry.`,
    };
  }
  return {
    kind: "error",
    error: `Final thumbnail cleanup failed and automatic recovery was incomplete (directory ${
      dirRestored ? "restored" : "NOT restored"
    }, database rows ${dbRestored ? "restored" : `NOT restored — rolled back atomically, no partial Split Plan${dbRestoreError ? `: ${dbRestoreError}` : ""}`}). Please check this run manually before retrying.`,
  };
}

export async function clearUnusedSplitRuns(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const sequenceVideoDraftId = parseInt(formData.get("sequenceVideoDraftId") as string, 10);
  const currentRunIdRaw = (formData.get("currentRunId") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid request.");
  }
  if (!Number.isInteger(sequenceVideoDraftId) || sequenceVideoDraftId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid Sequence Video draft.");
  }
  // REVISE (round 2, finding 2) — `currentRunId` must be a genuine,
  // strictly-positive integer. A malformed value (`NaN`, blank, non-digit)
  // must be REFUSED outright, never silently treated as "nothing is
  // protected" — `NaN !== id` is true for every id, which would have
  // exposed the actually-displayed run to deletion.
  if (!/^\d+$/.test(currentRunIdRaw)) {
    errRedirectTo(returnTo, "splitError", "Invalid current run reference.");
  }
  const currentRunId = parseInt(currentRunIdRaw, 10);
  if (!Number.isInteger(currentRunId) || currentRunId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid current run reference.");
  }

  const [draft] = await db
    .select({ id: sequenceVideoDrafts.id, sequenceId: sequenceVideoDrafts.sequenceId })
    .from(sequenceVideoDrafts)
    .where(eq(sequenceVideoDrafts.id, sequenceVideoDraftId));
  if (!draft || draft.sequenceId !== sequenceId) {
    errRedirectTo(returnTo, "splitError", "Sequence Video draft not found or does not belong to this Sequence.");
  }

  // REVISE (round 2, finding 2) — `currentRunId` is trusted as "the
  // protected run" only after confirming server-side that it actually
  // belongs to this exact draft and Sequence. An id for a different draft,
  // a different Sequence, or a run that doesn't exist at all is refused
  // outright — never silently treated as "no run is protected," which
  // would let the genuinely-displayed run become a deletion candidate.
  const [currentRun] = await db
    .select({ id: sequenceVideoSplitRuns.id, sequenceVideoDraftId: sequenceVideoSplitRuns.sequenceVideoDraftId, sequenceId: sequenceVideoSplitRuns.sequenceId })
    .from(sequenceVideoSplitRuns)
    .where(eq(sequenceVideoSplitRuns.id, currentRunId));
  if (!currentRun || currentRun.sequenceVideoDraftId !== sequenceVideoDraftId || currentRun.sequenceId !== sequenceId) {
    errRedirectTo(returnTo, "splitError", "The currently displayed run could not be confirmed for this draft — refusing to clean up.");
  }

  const runsForDraft = await db
    .select({ id: sequenceVideoSplitRuns.id })
    .from(sequenceVideoSplitRuns)
    .where(eq(sequenceVideoSplitRuns.sequenceVideoDraftId, sequenceVideoDraftId));
  const candidateIds = runsForDraft.map((r) => r.id).filter((id) => id !== currentRunId);

  let deletedCount = 0;
  let protectedCount = 0;
  const cleanupWarnings: string[] = [];
  const hardErrors: string[] = [];

  for (const runId of candidateIds) {
    const outcome = await deleteOneUnusedRun(runId, currentRunId, sequenceVideoDraftId);
    if (outcome.kind === "already-gone") continue;
    if (outcome.kind === "protected") {
      protectedCount++;
    } else if (outcome.kind === "deleted") {
      deletedCount++;
      if (outcome.cleanupWarning) cleanupWarnings.push(`Run #${runId}: ${outcome.cleanupWarning}`);
    } else {
      // REVISE (round 2, finding 3) — a real transactional/filesystem
      // failure is surfaced with its own context, never folded into
      // "protected/skipped."
      hardErrors.push(`Run #${runId}: ${outcome.error}`);
    }
  }

  if (deletedCount === 0 && protectedCount === 0 && hardErrors.length === 0) {
    cleanupRedirectTo(returnTo, "No unused past runs to clean up.");
  }

  let message = `${deletedCount} run(s) deleted`;
  if (protectedCount > 0) message += `, ${protectedCount} run(s) protected/skipped`;
  message += ".";
  if (cleanupWarnings.length > 0) {
    message += ` Warning: some thumbnail directories could not be fully removed — ${cleanupWarnings.join(" ")}`;
  }
  if (hardErrors.length > 0) {
    message += ` Error: some runs could not be evaluated and were left untouched — ${hardErrors.join(" ")}`;
  }
  cleanupRedirectTo(returnTo, message);
}
