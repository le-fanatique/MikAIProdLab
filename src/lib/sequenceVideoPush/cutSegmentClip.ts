// ---------------------------------------------------------------------------
// cutSegmentClip.ts — SEQGEN.PUSH.1 (Lot A)
//
// Server-only. Cuts one Split Segment's exact `[startSeconds, endSeconds)`
// range out of an already-confined source video into a standalone,
// permanent clip under `public/uploads/shot-video-candidates/shot-<id>/`.
// Only the bundled FFmpeg (`getFfmpegPath`/`getFfprobePath`) is used, always
// via `execFile` with an argument array — never a shell string. Mirrors the
// temp-file-then-atomic-rename convention already established by
// `generateSegmentThumbnail` (detectVideoSplits.ts): a partial/corrupt clip
// is never left at a servable path.
//
// NEVER import from a Client Component — child_process/binary paths are
// meaningless (and a potential info leak) outside a Node server context.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getFfmpegPath, runFfprobeJson } from "@/lib/ffmpeg";
import { buildCutSegmentArgs, checkClipDuration } from "./buildCutArgs";

const execFileAsync = promisify(execFile);

const CUT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — bounded, generous for a short Sequence Video draft
const PROBE_TIMEOUT_MS = 15_000;

export const SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE = "uploads/shot-video-candidates";

/** Confined destination path for a shot's video candidate clip — mirrors `thumbnailAbsolutePathFor`'s own root-scoped, unique-per-attempt convention. `attemptUuid` guarantees a concurrent race between two pushes never shares the same file. */
export function shotVideoCandidatePathFor(shotId: number, splitSegmentId: number, attemptUuid: string): { relative: string; absolute: string } {
  const relative = `${SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE}/shot-${shotId}/segment-${splitSegmentId}-${attemptUuid}.mp4`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

/** Probes `sourceAbsolutePath` once for whether it carries an audio stream — determines `-c:a aac`/`-an` for every segment cut from the same source in one push. */
export async function sourceHasAudioStream(sourceAbsolutePath: string): Promise<boolean> {
  const probe = (await runFfprobeJson(sourceAbsolutePath)) as { streams?: { codec_type?: string }[] };
  return Array.isArray(probe.streams) && probe.streams.some((s) => s.codec_type === "audio");
}

export type CutSegmentClipResult =
  | { ok: true; relativePath: string; absolutePath: string; probedDurationSeconds: number }
  | { ok: false; error: string };

/**
 * Best-effort removal of a single path, treating a missing file as success.
 * Returns `null` on success (including "already gone"), or a human-readable
 * message describing exactly what failed to be removed — never throws.
 */
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
 * Cuts one segment, probes the result, and only then leaves it at its final
 * servable path (temp-then-rename). The ENTIRE production sequence — mkdir,
 * ffmpeg, existence check, probe, rename — runs inside one try/catch so that
 * NO step (including `mkdir`/`rename` themselves, which threw straight out
 * of this function's contract before this revision) can ever escape as an
 * uncaught exception instead of the documented `{ ok: false }` result.
 *
 * On ANY failure, both the temp path and the final path are unconditionally
 * (best-effort) removed — whichever one exists at the point of failure is
 * unknown a priori (a `rename` can fail before or after the OS-level move on
 * some filesystems), so both are always attempted rather than guessed from
 * the last known step. A cleanup failure is NEVER silently dropped — it is
 * appended to the returned error, so a caller can never mistake "the cut
 * failed" for "the cut failed AND left an orphaned file on disk".
 */
export async function cutSegmentClip(params: {
  sourceAbsolutePath: string;
  shotId: number;
  splitSegmentId: number;
  startSeconds: number;
  endSeconds: number;
  sourceFps: number | null | undefined;
  hasAudio: boolean;
}): Promise<CutSegmentClipResult> {
  const { sourceAbsolutePath, shotId, splitSegmentId, startSeconds, endSeconds, sourceFps, hasAudio } = params;

  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return { ok: false, error: "FFmpeg binary is not available for this platform/architecture." };
  if (!(endSeconds > startSeconds)) {
    return { ok: false, error: `Segment #${splitSegmentId} has a zero or negative duration and cannot be cut.` };
  }

  const attemptUuid = randomUUID();
  const { relative, absolute } = shotVideoCandidatePathFor(shotId, splitSegmentId, attemptUuid);
  const tmpAbsolute = `${absolute}.tmp`;

  try {
    await fs.mkdir(path.dirname(absolute), { recursive: true });

    const args = buildCutSegmentArgs({ sourceAbsolutePath, outputAbsolutePath: tmpAbsolute, startSeconds, endSeconds, hasAudio });
    try {
      await execFileAsync(ffmpegPath, args, { timeout: CUT_TIMEOUT_MS, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    } catch (e) {
      const stderr = (e as { stderr?: string })?.stderr;
      throw new Error(`FFmpeg failed to cut segment #${splitSegmentId}: ${stderr || (e instanceof Error ? e.message : String(e))}`);
    }

    try {
      await fs.access(tmpAbsolute);
    } catch {
      throw new Error(`FFmpeg reported success for segment #${splitSegmentId} but produced no output file.`);
    }

    // Probe the temp file BEFORE the atomic rename — an invalid clip must
    // never reach the servable path at all, not even transiently.
    let probe: { format?: { duration?: string }; streams?: { codec_type?: string }[] };
    try {
      probe = (await Promise.race([
        runFfprobeJson(tmpAbsolute),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Probe timed out.")), PROBE_TIMEOUT_MS)),
      ])) as typeof probe;
    } catch (e) {
      throw new Error(`Failed to probe produced clip for segment #${splitSegmentId}: ${e instanceof Error ? e.message : String(e)}`);
    }

    const hasVideoStream = Array.isArray(probe.streams) && probe.streams.some((s) => s.codec_type === "video");
    if (!hasVideoStream) {
      throw new Error(`Produced clip for segment #${splitSegmentId} has no video stream.`);
    }

    const probedDuration = probe.format?.duration ? Number(probe.format.duration) : NaN;
    if (!Number.isFinite(probedDuration)) {
      throw new Error(`Produced clip for segment #${splitSegmentId} has no readable duration.`);
    }

    const durationCheck = checkClipDuration({ probedDurationSeconds: probedDuration, expectedStartSeconds: startSeconds, expectedEndSeconds: endSeconds, sourceFps });
    if (!durationCheck.ok) {
      throw new Error(`Segment #${splitSegmentId}: ${durationCheck.error}`);
    }

    await fs.rename(tmpAbsolute, absolute);
    return { ok: true, relativePath: relative, absolutePath: absolute, probedDurationSeconds: probedDuration };
  } catch (e) {
    const primaryError = e instanceof Error ? e.message : String(e);
    const cleanupErrors = (await Promise.all([removeIfExists(tmpAbsolute), removeIfExists(absolute)])).filter((m): m is string => m !== null);
    if (cleanupErrors.length > 0) {
      return { ok: false, error: `${primaryError} Additionally, failed to remove leftover file(s): ${cleanupErrors.join("; ")}` };
    }
    return { ok: false, error: primaryError };
  }
}

/** Honest best-effort removal of one candidate clip file — used to clean up every clip produced by a failed/partial push attempt. Never throws; a real failure is reported via the returned result, never silently swallowed at the call site (callers collect these into a batch warning). */
export async function deleteShotVideoCandidateFile(relativeClipPath: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!relativeClipPath) return { ok: true };
  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE);
  const absolute = path.resolve(publicRoot, relativeClipPath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    return { ok: false, error: `Refused to delete clip outside the allowed root: "${relativeClipPath}"` };
  }
  try {
    await fs.unlink(absolute);
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { ok: true };
    return { ok: false, error: `Failed to remove clip "${relativeClipPath}": ${err.message}` };
  }
}
