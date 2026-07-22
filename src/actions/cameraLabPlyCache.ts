"use server";

// ---------------------------------------------------------------------------
// cameraLabPlyCache.ts — CAMLAB.POLISH.1 retake round 2 (+ round 5 hardening)
//
// `clearShotPlyCaches` — deliberately NOT built on the existing best-effort
// delete in `src/actions/generationJobs.ts` (`deleteGenerationJob`), which
// unlinks the output file directly (no quarantine, no restore path) and
// swallows unlink failures silently before an unconditional DB row delete.
// This action instead follows the same rename-to-quarantine /
// synchronous-conditional-transaction / unlink-or-restore discipline already
// proven in `deleteShotVideoCandidate` (sequenceVideoPush.ts) and
// `deleteSequenceStoryboardImage` (sequenceStoryboard.ts) — adapted for a
// BULK operation across every admissible PLY of one Shot, and for nulling a
// column (never deleting the `generation_jobs` row: jobs stay as history).
//
// Round 5 (Codex REVISE) — two correctness hardenings and one confinement:
//   1. A race on ANY target now aborts the WHOLE operation (never a partial
//      commit) — the conditional UPDATE transaction throws on the first
//      target whose outputPath changed concurrently, rolling back every
//      update in that same transaction, then every quarantined file in the
//      batch is restored.
//   2. A failed final unlink after a successful commit now attempts FULL
//      compensation (restore the file AND restore the job's outputPath back
//      to its original value) — never left as "cleared in DB, orphaned
//      quarantine file on disk". If compensation itself fails, the exact
//      job/path is named, never presented as a plain success.
//   3. `returnTo` is confined server-side to this Shot's own Camera Lab path
//      (never an arbitrary caller-supplied URL) via the shared guard also
//      used by `createShotReferenceImage`.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences, shots, generationJobs } from "@/db/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { extractEligiblePlyOutput } from "@/lib/cameraLab/eligibility";
import { resolveConfinedCameraLabReturnTo } from "@/lib/cameraLab/returnToGuard";

type Target = {
  jobId: number;
  outputPath: string;
  absolute: string;
  quarantinePath: string;
  quarantined: boolean;
};

/** Thrown inside the transaction to force an immediate rollback of EVERY update in this batch — a race on one target must never leave the others committed. */
class ConcurrentChangeError extends Error {
  constructor(public readonly target: Target) {
    super(`outputPath for job ${target.jobId} changed concurrently.`);
  }
}

export async function clearShotPlyCaches(formData: FormData): Promise<void> {
  const projectId = parseInt((formData.get("projectId") as string) ?? "", 10);
  const sequenceId = parseInt((formData.get("sequenceId") as string) ?? "", 10);
  const shotId = parseInt((formData.get("shotId") as string) ?? "", 10);
  // Codex P2 — never trust the raw form value as a redirect target; confined
  // to this exact Shot's Camera Lab path (or the reconstructed canonical
  // path when absent/invalid), for every redirect below including the
  // earliest validation failures.
  const returnTo = resolveConfinedCameraLabReturnTo(formData.get("returnTo") as string | null, projectId, sequenceId, shotId);

  function withQuery(params: Record<string, string>): string {
    const qs = new URLSearchParams(params);
    const sep = returnTo.includes("?") ? "&" : "?";
    return `${returnTo}${sep}${qs.toString()}`;
  }

  function errRedirect(msg: string): never {
    redirect(withQuery({ plyCacheError: msg }));
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // ── Ownership chain: Project -> Sequence -> Shot, re-verified every call ─
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) errRedirect("Project not found.");
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) errRedirect("Sequence not found or does not belong to this project.");
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) errRedirect("Shot not found or does not belong to this sequence.");

  // ── Re-derive the exact target list server-side — never trust a
  //    client-supplied job list. Strictly this Shot's own admissible PLY
  //    outputs; never image/video outputs, another Shot, or a path outside
  //    public/outputs/jobs/<id>/. ──────────────────────────────────────────
  const doneJobs = await db
    .select({
      id: generationJobs.id,
      shotId: generationJobs.shotId,
      status: generationJobs.status,
      outputPath: generationJobs.outputPath,
    })
    .from(generationJobs)
    .where(and(eq(generationJobs.shotId, shotId), eq(generationJobs.status, "done"), isNotNull(generationJobs.outputPath)));

  const publicRoot = path.join(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, "outputs", "jobs");
  const targets: Target[] = [];
  for (const job of doneJobs) {
    const eligible = extractEligiblePlyOutput(job, shotId);
    if (!eligible) continue;
    const outputPath = job.outputPath as string;
    const absolute = path.resolve(publicRoot, outputPath);
    if (!absolute.startsWith(allowedRoot + path.sep)) continue; // defensive; eligibility regex already guarantees this
    targets.push({
      jobId: job.id,
      outputPath,
      absolute,
      quarantinePath: `${absolute}.trash-${Date.now()}-${job.id}`,
      quarantined: false,
    });
  }

  if (targets.length === 0) {
    redirect(withQuery({ plyCachesCleared: "0" }));
  }

  // ── Phase 1: quarantine every target BEFORE any DB write — a reversible,
  //    atomic filesystem op, never a delete. ─────────────────────────────
  const quarantineFailures: string[] = [];
  for (const t of targets) {
    try {
      renameSync(t.absolute, t.quarantinePath);
      t.quarantined = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
        // Already gone on disk — still eligible for clearing its DB
        // outputPath below, nothing to quarantine/restore for this one.
        continue;
      }
      quarantineFailures.push(`"${t.outputPath}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  function restoreQuarantinedBatch(): string[] {
    const restoreFailures: string[] = [];
    for (const t of targets) {
      if (!t.quarantined) continue;
      try {
        renameSync(t.quarantinePath, t.absolute);
        t.quarantined = false;
      } catch (restoreErr) {
        restoreFailures.push(`"${t.outputPath}": ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
      }
    }
    return restoreFailures;
  }
  if (quarantineFailures.length > 0) {
    const restoreFailures = restoreQuarantinedBatch();
    const base = `Failed to prepare file(s) for clearing — nothing was changed: ${quarantineFailures.join("; ")}.`;
    errRedirect(restoreFailures.length > 0 ? `${base} Additionally, restore failed for: ${restoreFailures.join("; ")}.` : base);
  }

  // ── Phase 2: ONE synchronous transaction, ALL-OR-NOTHING — a race on ANY
  //    single target (its outputPath changed concurrently, conditional
  //    UPDATE affects 0 rows) throws immediately, rolling back every update
  //    already applied in this same transaction. Never a partial commit. ──
  try {
    db.transaction((tx) => {
      for (const t of targets) {
        const result = tx
          .update(generationJobs)
          .set({ outputPath: null, updatedAt: new Date().toISOString() })
          .where(and(eq(generationJobs.id, t.jobId), eq(generationJobs.outputPath, t.outputPath)))
          .run();
        if (result.changes !== 1) {
          throw new ConcurrentChangeError(t);
        }
      }
    });
  } catch (e) {
    // Whole transaction rolled back (better-sqlite3 semantics on a thrown
    // callback) — every target's outputPath is unchanged in the DB, so
    // every quarantined file must be restored, never left in limbo.
    const restoreFailures = restoreQuarantinedBatch();
    const base =
      e instanceof ConcurrentChangeError
        ? `Job ${e.target.jobId}'s cached PLY changed concurrently — the whole clear was cancelled, nothing was changed.`
        : `Failed to clear PLY caches — nothing was changed: ${e instanceof Error ? e.message : "unknown database error"}.`;
    errRedirect(restoreFailures.length > 0 ? `${base} Additionally, restore failed for: ${restoreFailures.join("; ")}.` : base);
  }

  // ── Phase 3: every target committed — permanent cleanup. A failed final
  //    unlink is fully compensated (file AND DB restored to their original
  //    state) rather than left as "DB says cleared, file still orphaned".
  //    If compensation itself fails, the exact job/path is named — never a
  //    plain success. ──────────────────────────────────────────────────────
  const cleared: Target[] = [];
  const revertedAfterCleanupFailure: Target[] = [];
  const incompleteCompensation: string[] = [];
  for (const t of targets) {
    if (!t.quarantined) {
      // Nothing was ever quarantined for this one (file was already gone at
      // Phase 1) — its outputPath is committed null, there is no file to
      // clean up.
      cleared.push(t);
      continue;
    }
    try {
      unlinkSync(t.quarantinePath);
      cleared.push(t);
      continue;
    } catch (unlinkErr) {
      let fileRestored = false;
      try {
        renameSync(t.quarantinePath, t.absolute);
        fileRestored = true;
      } catch {
        // fileRestored stays false — named explicitly in the message below.
      }
      // Codex round 6 — only ever restore the DB pointer if the file is
      // GENUINELY back at its original path; pointing `outputPath` at a
      // file that was never actually restored would create a DB row that
      // claims a file exists when it doesn't. And even then, the restore
      // is conditional on `outputPath` still being exactly what THIS
      // operation set it to (`IS NULL`) — never overwrite a value some
      // concurrent process may have written since our commit.
      let dbRestored = false;
      let dbSkippedReason: "no-file" | "concurrent-change" | "error" | null = null;
      if (!fileRestored) {
        dbSkippedReason = "no-file";
      } else {
        try {
          const [restored] = await db
            .update(generationJobs)
            .set({ outputPath: t.outputPath, updatedAt: new Date().toISOString() })
            .where(and(eq(generationJobs.id, t.jobId), isNull(generationJobs.outputPath)))
            .returning({ id: generationJobs.id });
          dbRestored = !!restored;
          if (!dbRestored) dbSkippedReason = "concurrent-change";
        } catch {
          dbRestored = false;
          dbSkippedReason = "error";
        }
      }
      const unlinkMsg = unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr);
      if (fileRestored && dbRestored) {
        revertedAfterCleanupFailure.push(t);
      } else {
        const dbDescription =
          dbSkippedReason === "no-file"
            ? "left null (the file was not restored, so the database pointer was intentionally not restored to avoid referencing a missing file)"
            : dbSkippedReason === "concurrent-change"
              ? "NOT restored — its outputPath changed concurrently since this operation nulled it, so restoring would have overwritten a newer value; the file is back on disk but not referenced by this job's outputPath"
              : "NOT restored (database update failed)";
        incompleteCompensation.push(
          `job ${t.jobId} ("${t.outputPath}"): final cleanup failed (${unlinkMsg}) and compensation was incomplete — ` +
            `file ${fileRestored ? "restored" : `NOT restored (still at "${t.quarantinePath}")`}, ` +
            `database ${dbDescription}.`
        );
      }
    }
  }

  const resultParams: Record<string, string> = { plyCachesCleared: String(cleared.length) };
  if (revertedAfterCleanupFailure.length > 0) {
    resultParams.plyCacheReverted = String(revertedAfterCleanupFailure.length);
  }
  if (incompleteCompensation.length > 0) {
    resultParams.plyCacheIncompleteCompensation = incompleteCompensation.join("; ");
  }
  redirect(withQuery(resultParams));
}
