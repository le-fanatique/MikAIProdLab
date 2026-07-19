// ---------------------------------------------------------------------------
// ensureSaved.ts — SHOT.VIDEO.LIBRARY.1
//
// Server-only shared core (never a Server Action itself — no "use server",
// called only from other Server Actions): copies a "done" generation job's
// video output into the durable Shot Video Library exactly once per job.
// Used by BOTH `saveVideoOutputToLibrary` (save only, never approves —
// src/actions/shotVideoLibrary.ts) and `approveVideoOutput` (save-if-needed
// then approve — src/actions/generation.ts), so the two flows can never
// diverge on what "the library copy of this job's output" means or drift
// into two independently-hardcoded copies of the same file.
//
// REVISE (round 1) — hardened after Codex found the original version was
// not concurrency-safe (a SELECT-before-INSERT race could let two
// simultaneous saves of the same job each copy+insert), never probed a real
// duration (silently blocking this video from the OpenReel export route,
// which refuses any entry with no known positive duration), and could leave
// a partially-copied file at a servable path on a mid-copy failure. Fixed
// by: a DB-level UNIQUE constraint on `generationJobId` (the actual race
// closer, not just an app-level check — see schema.ts), temp-then-rename
// publication (mirrors `cutSegmentClip.ts`/`extractFirstFrame.ts`'s own
// established discipline: a partial/corrupt file is never visible at its
// final path), a real ffprobe duration probe before publication, and honest
// compensation on every failure branch — never a silent orphan, never a
// masked cleanup failure.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { generationJobs, shotVideos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runFfprobeJson } from "@/lib/ffmpeg";
import { shotVideoLibraryPathFor } from "./paths";

const APPROVABLE_VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);
const PROBE_TIMEOUT_MS = 15_000;

export type EnsureVideoSavedResult = { ok: true; videoPath: string; shotVideoId: number } | { ok: false; error: string };

/** Best-effort removal of a single path, treating a missing file as success — mirrors `cutSegmentClip.ts`'s own `removeIfExists`. Returns `null` on success, or a human-readable message describing exactly what failed, never throws. */
async function removeIfExists(absolutePath: string): Promise<string | null> {
  try {
    await fs.rm(absolutePath, { force: false });
    return null;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    return `"${absolutePath}": ${err.message}`;
  }
}

/**
 * Idempotent: a job already saved to the library is never re-copied — the
 * existing entry is returned as-is. Concurrency-safe: if two callers race
 * for the SAME job, at most one `INSERT` can ever commit (DB-level UNIQUE
 * constraint on `generationJobId`, nullable-safe) — the loser cleans up its
 * own now-unreferenced file and adopts the winner's row instead of erroring,
 * so both callers observe the exact same successful result.
 */
export async function ensureVideoOutputSavedToLibrary(jobId: number, shotId: number): Promise<EnsureVideoSavedResult> {
  const [existing] = await db.select().from(shotVideos).where(eq(shotVideos.generationJobId, jobId));
  if (existing) {
    if (existing.shotId !== shotId) return { ok: false, error: "Output does not belong to this shot." };
    return { ok: true, videoPath: existing.videoPath, shotVideoId: existing.id };
  }

  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job) return { ok: false, error: "Output not found." };
  if (job.shotId !== shotId) return { ok: false, error: "Output does not belong to this shot." };
  if (job.status !== "done") return { ok: false, error: "Output is not ready." };
  if (!job.outputPath) return { ok: false, error: "Output path is missing." };
  if (!job.outputPath.startsWith("outputs/jobs/")) return { ok: false, error: "Output path is not in the expected location." };

  const ext = path.extname(job.outputPath).toLowerCase();
  if (!APPROVABLE_VIDEO_EXTS.has(ext)) {
    return { ok: false, error: "Only video outputs (.mp4, .webm, .mov) can be saved to the Shot Video Library." };
  }

  const publicRoot = path.join(process.cwd(), "public");
  const allowedOutputsRoot = path.join(publicRoot, "outputs", "jobs");
  const sourceAbsolute = path.resolve(publicRoot, job.outputPath);
  if (!sourceAbsolute.startsWith(allowedOutputsRoot + path.sep) && sourceAbsolute !== allowedOutputsRoot) {
    return { ok: false, error: "Output path is not in the expected location." };
  }
  try {
    await fs.access(sourceAbsolute);
  } catch {
    return { ok: false, error: "Output file not found on disk." };
  }

  const uuid = randomUUID();
  const { relative: destRelative, absolute: destAbsolute } = shotVideoLibraryPathFor(shotId, uuid, ext);
  // Each attempt (even a concurrent one for the same job) generates its own
  // fresh uuid, so this attempt's own tmp/final paths can never collide with
  // any other attempt's — the only real contention point is the DB row,
  // resolved below via the UNIQUE constraint.
  const tmpAbsolute = `${destAbsolute}.tmp${ext}`;

  try {
    await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
    await fs.copyFile(sourceAbsolute, tmpAbsolute);
  } catch (e) {
    const cleanup = await removeIfExists(tmpAbsolute);
    return {
      ok: false,
      error: `Failed to copy video file. Please try again.${cleanup ? ` Additionally, failed to remove leftover temp file: ${cleanup}` : ""}`,
    };
  }

  let probedDurationSeconds: number;
  try {
    const probe = (await Promise.race([
      runFfprobeJson(tmpAbsolute),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Probe timed out.")), PROBE_TIMEOUT_MS)),
    ])) as { streams?: { codec_type?: string }[]; format?: { duration?: string } };
    const hasVideoStream = Array.isArray(probe.streams) && probe.streams.some((s) => s.codec_type === "video");
    if (!hasVideoStream) throw new Error("Output has no video stream.");
    const duration = probe.format?.duration ? Number(probe.format.duration) : NaN;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Output has no readable duration.");
    probedDurationSeconds = duration;
  } catch (e) {
    const cleanup = await removeIfExists(tmpAbsolute);
    return {
      ok: false,
      error: `Failed to probe the video output: ${e instanceof Error ? e.message : String(e)}${cleanup ? ` Additionally, failed to remove leftover temp file: ${cleanup}` : ""}`,
    };
  }

  try {
    await fs.rename(tmpAbsolute, destAbsolute);
  } catch (e) {
    const cleanupErrors = (await Promise.all([removeIfExists(tmpAbsolute), removeIfExists(destAbsolute)])).filter((m): m is string => m !== null);
    return {
      ok: false,
      error: `Failed to publish the video file: ${e instanceof Error ? e.message : String(e)}${
        cleanupErrors.length > 0 ? ` Additionally, failed to remove leftover file(s): ${cleanupErrors.join("; ")}` : ""
      }`,
    };
  }

  try {
    const inserted = await db
      .insert(shotVideos)
      .values({ shotId, source: "generation", videoPath: destRelative, durationSeconds: probedDurationSeconds, generationJobId: jobId })
      .returning({ id: shotVideos.id });
    return { ok: true, videoPath: destRelative, shotVideoId: inserted[0].id };
  } catch {
    // A UNIQUE constraint violation on generationJobId means a concurrent
    // save for the SAME job just won the race — not a failure, a lost race.
    // Clean up this attempt's own (now-unreferenced, already-published)
    // file and adopt the winner's row so both callers see the same result.
    // If the winner row genuinely isn't there (a different, real DB error),
    // this falls through to the honest error below instead of pretending
    // success.
    //
    // REVISE (round 2) — a lost race is ONLY ever reported as `ok: true`
    // when this attempt's own orphaned file was actually removed. A winner
    // existing is necessary but not sufficient: if `removeIfExists` itself
    // fails, this branch must return an explicit error naming the exact
    // leftover path — never silently claim success while a real,
    // unreferenced file is left on disk. The winning row is still valid in
    // that case (reported in the error text), but the caller must see a
    // failure so the leftover file is never invisible.
    const cleanup = await removeIfExists(destAbsolute);
    const [winner] = await db.select().from(shotVideos).where(eq(shotVideos.generationJobId, jobId));
    if (winner && !cleanup) {
      return { ok: true, videoPath: winner.videoPath, shotVideoId: winner.id };
    }
    if (winner && cleanup) {
      return {
        ok: false,
        error: `Lost the concurrent save race for this job (another save already completed successfully, entry #${winner.id}), but failed to remove this attempt's own now-unreferenced file: ${cleanup}. Please clean up the leftover file manually, or retry.`,
      };
    }
    return {
      ok: false,
      error: `Failed to save to the library — a database error occurred and no concurrent winner was found.${cleanup ? ` Additionally, failed to remove leftover file: ${cleanup}` : ""}`,
    };
  }
}
