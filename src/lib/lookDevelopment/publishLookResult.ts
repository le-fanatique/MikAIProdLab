import "server-only";

// ---------------------------------------------------------------------------
// publishLookResult.ts — STYLE.1.G.CORE.1 (Scope E)
//
// Publishes a "done" Look Development generation job's output into the
// dedicated, durable Look Development storage root — mirrors
// src/lib/shotVideoLibrary/ensureSaved.ts's `ensureVideoOutputSavedToLibrary`
// exactly: idempotent (UNIQUE `generation_job_id`), temp-file + atomic
// rename, real media validation before publication, and honest cleanup on
// every failure branch. Concurrency: a DB-level UNIQUE constraint (not a
// prior SELECT) is the sole authority on "has this job already been
// published" — the loser of a race cleans up its own now-unreferenced file
// and adopts the winner's row.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { generationJobs, lookTestResults, lookTests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lookDevelopmentResultPathFor } from "./paths";
import { hasPngSignature, hasValidImageDimensions } from "@/lib/sequenceVideoPush/imageValidation";
import { runFfprobeJson, runFfmpegDecodeCheck } from "@/lib/ffmpeg";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);

export type PublishLookResultResult = { ok: true; resultId: number; filePath: string } | { ok: false; error: string };

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
 * STYLE.1.G.CORE.1 Round 5 (Finding 2) — `runFfprobeJson` is a direct
 * promisified `execFile` call: its rejection can contain the FFprobe
 * binary's absolute path, the exact command line, the absolute input
 * (temp) path, and raw FFprobe stderr. None of that may ever reach a
 * caller of `ensureLookResultPublished`. This is the ONE place FFprobe is
 * invoked for Look Development publication — every failure mode (process
 * error, malformed JSON, missing/invalid stream) is caught here and
 * converted to a fixed, sanitized `Error` whose message contains only a
 * safe, generic reason. The raw detail is logged server-side only.
 */
async function runSanitizedProbeStream(
  absolutePath: string,
  matchesStream: (stream: Record<string, unknown>) => boolean,
  kindLabel: "image" | "video"
): Promise<{ width: number; height: number }> {
  let probe: Record<string, unknown>;
  try {
    probe = (await runFfprobeJson(absolutePath)) as Record<string, unknown>;
  } catch (e) {
    console.error(`runSanitizedProbeStream("${absolutePath}", ${kindLabel}) — FFprobe invocation failed:`, e);
    throw new Error(`Failed to inspect the ${kindLabel} output with FFprobe — the file may be corrupt or unreadable.`);
  }

  let streams: Array<Record<string, unknown>> | undefined;
  try {
    streams = probe.streams as Array<Record<string, unknown>> | undefined;
  } catch (e) {
    console.error(`runSanitizedProbeStream("${absolutePath}", ${kindLabel}) — unexpected FFprobe output shape:`, e, probe);
    throw new Error(`Failed to inspect the ${kindLabel} output with FFprobe — the file may be corrupt or unreadable.`);
  }

  const stream = streams?.find(matchesStream);
  if (!stream) {
    throw new Error(`FFprobe found no ${kindLabel} stream — the file may be corrupt, truncated, or not a valid ${kindLabel}.`);
  }

  const w = typeof stream.width === "number" ? stream.width : Number(stream.width);
  const h = typeof stream.height === "number" ? stream.height : Number(stream.height);
  return { width: w, height: h };
}

/**
 * Idempotent: a job already published is never re-copied. Refuses (zero
 * mutation) if the job is not `done`, does not belong to this Look Test, or
 * its output kind does not match the Look Test's `mode`.
 */
export async function ensureLookResultPublished(jobId: number, lookTestId: number, projectId: number): Promise<PublishLookResultResult> {
  const [existing] = await db.select().from(lookTestResults).where(eq(lookTestResults.generationJobId, jobId));
  if (existing) {
    if (existing.lookTestId !== lookTestId || existing.projectId !== projectId) return { ok: false, error: "Output does not belong to this Look Test." };
    return { ok: true, resultId: existing.id, filePath: existing.filePath };
  }

  const [test] = await db.select().from(lookTests).where(eq(lookTests.id, lookTestId));
  if (!test || test.projectId !== projectId) return { ok: false, error: "Look Test not found." };

  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job) return { ok: false, error: "Output not found." };
  if (job.lookTestId !== lookTestId) return { ok: false, error: "Output does not belong to this Look Test." };
  if (job.status !== "done") return { ok: false, error: "Output is not ready." };
  if (!job.outputPath) return { ok: false, error: "Output path is missing." };
  if (!job.outputPath.startsWith("outputs/jobs/")) return { ok: false, error: "Output path is not in the expected location." };

  const ext = path.extname(job.outputPath).toLowerCase();
  const allowedExts = test.mode === "video" ? VIDEO_EXTS : IMAGE_EXTS;
  if (!allowedExts.has(ext)) {
    return { ok: false, error: `Only ${test.mode} outputs can be published for this Look Test.` };
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
  const { relative: destRelative, absolute: destAbsolute } = lookDevelopmentResultPathFor(projectId, uuid, ext);
  const tmpAbsolute = `${destAbsolute}.tmp${ext}`;

  try {
    await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
    await fs.copyFile(sourceAbsolute, tmpAbsolute);
  } catch {
    const cleanup = await removeIfExists(tmpAbsolute);
    return {
      ok: false,
      error: `Failed to copy output file. Please try again.${cleanup ? ` Additionally, failed to remove leftover temp file: ${cleanup}` : ""}`,
    };
  }

  // Real media validation before publication — reject junk files that only
  // happen to have the expected extension.  For images: magic bytes check
  // (PNG, JPEG, WebP).  For video: the file must be non-empty and its
  // extension must be a known video format (full FFprobe validation is
  // performed by the video push path, not here — a Look Test video is
  // published from a `done` job that already passed FFprobe during its
  // own pipeline).
  try {
    const stat = await fs.stat(tmpAbsolute);
    if (stat.size === 0) throw new Error("Output file is empty.");

    if (test.mode === "image") {
      // Magic bytes fast-reject.
      const buf = Buffer.alloc(12);
      const fh = await fs.open(tmpAbsolute, "r");
      try {
        await fh.read(buf, 0, 12, 0);
      } finally {
        await fh.close();
      }
      const isPng = hasPngSignature(buf);
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const isWebP =
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50;
      if (!isPng && !isJpeg && !isWebP) {
        throw new Error("Output file does not have valid image headers (expected PNG, JPEG, or WebP).");
      }

      // Real decode + dimensions via bundled ffprobe.
      const imgStream = await runSanitizedProbeStream(tmpAbsolute, (s) => s.codec_type === "image" || s.codec_type === "video", "image");
      if (!hasValidImageDimensions({ width: imgStream.width, height: imgStream.height })) {
        throw new Error("FFprobe reported invalid or zero image dimensions — file may be corrupt or truncated.");
      }

      // FFprobe only reads container/stream headers — a real PNG truncated
      // to 50% still reports a valid codec and dimensions from FFprobe
      // alone. A real decode is the only way to catch that. Bounded to a
      // single still frame, never applied to video (see Round 4 Finding 5
      // — an unbounded full-video decode against a fixed timeout could
      // reject a valid long/high-resolution output).
      await runFfmpegDecodeCheck(tmpAbsolute);
    } else {
      // Video: real FFprobe stream validation only (Round 4 Finding 5 —
      // never a full frame-by-frame decode for video).
      const videoStream = await runSanitizedProbeStream(tmpAbsolute, (s) => s.codec_type === "video", "video");
      if (!hasValidImageDimensions({ width: videoStream.width, height: videoStream.height })) {
        throw new Error("FFprobe reported invalid or zero video dimensions — file may be corrupt.");
      }
    }
  } catch (e) {
    const cleanup = await removeIfExists(tmpAbsolute);
    // Sanitized for the caller: never the absolute temp path or raw
    // FFmpeg/FFprobe stderr (both already logged server-side by their own
    // throw sites / removeIfExists). The specific, safe validation reason
    // (e.g. "no video stream", "invalid dimensions") is still useful to
    // the user and contains no path/stderr, so it is kept.
    const safeReason = e instanceof Error ? e.message : "Unknown validation error.";
    console.error(`ensureLookResultPublished: validation failed for "${tmpAbsolute}": ${safeReason}`);
    return {
      ok: false,
      error: `Failed to validate the output file: ${safeReason}${cleanup ? " Additionally, a leftover temporary file could not be removed and was logged server-side for manual cleanup." : ""}`,
    };
  }

  try {
    await fs.rename(tmpAbsolute, destAbsolute);
  } catch (e) {
    const cleanupErrors = (await Promise.all([removeIfExists(tmpAbsolute), removeIfExists(destAbsolute)])).filter((m): m is string => m !== null);
    return {
      ok: false,
      error: `Failed to publish the output file: ${e instanceof Error ? e.message : String(e)}${
        cleanupErrors.length > 0 ? ` Additionally, failed to remove leftover file(s): ${cleanupErrors.join("; ")}` : ""
      }`,
    };
  }

  const now = new Date().toISOString();
  try {
    const inserted = await db
      .insert(lookTestResults)
      .values({ lookTestId, projectId, generationJobId: jobId, kind: test.mode, filePath: destRelative, status: "candidate", createdAt: now, updatedAt: now })
      .returning({ id: lookTestResults.id });
    return { ok: true, resultId: inserted[0].id, filePath: destRelative };
  } catch {
    // Lost a concurrent publish race for the SAME job — the DB UNIQUE
    // constraint on generation_job_id is the sole authority, not this
    // catch's mere occurrence. Clean up this attempt's own now-unreferenced
    // file and adopt the winner's row so both callers observe the same
    // result; if that cleanup itself fails, report the exact leftover path
    // rather than silently claiming success.
    const cleanup = await removeIfExists(destAbsolute);
    const [winner] = await db.select().from(lookTestResults).where(eq(lookTestResults.generationJobId, jobId));
    if (winner && !cleanup) return { ok: true, resultId: winner.id, filePath: winner.filePath };
    if (winner && cleanup) {
      return {
        ok: false,
        error: `Lost the concurrent publish race for this job (another publish already completed successfully, entry #${winner.id}), but failed to remove this attempt's own now-unreferenced file: ${cleanup}. Please clean up the leftover file manually, or retry.`,
      };
    }
    return {
      ok: false,
      error: `Failed to publish — a database error occurred and no concurrent winner was found.${cleanup ? ` Additionally, failed to remove leftover file: ${cleanup}` : ""}`,
    };
  }
}
