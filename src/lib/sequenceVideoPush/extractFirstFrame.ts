// ---------------------------------------------------------------------------
// extractFirstFrame.ts — SEQGEN.PUSH.2 (Lot B)
//
// Server-only. Extracts the first decodable frame of an already-produced
// Shot Video Candidate clip into a standalone, permanent still image under
// the SAME confined root already used for manually-uploaded/captured Shot
// Reference Images (`public/uploads/reference-images/shot-<id>/`) — no new
// root, no duplicated confinement convention. Only the bundled FFmpeg is
// used, always via `execFile` with an argument array, never a shell string.
// Mirrors `cutSegmentClip.ts`'s exact discipline: the ENTIRE production
// sequence runs inside one try/catch so no step can escape as an uncaught
// exception, and on ANY failure both the temp and final paths are
// unconditionally (best-effort) removed with every cleanup failure appended
// to the returned error, never silently dropped.
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
import { buildFirstFrameArgs } from "./buildCutArgs";
import { hasPngSignature, hasValidImageDimensions } from "./imageValidation";

const execFileAsync = promisify(execFile);
const EXTRACT_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 15_000;

/** Same root already used for manually-uploaded/captured Shot Reference Images (`src/lib/uploadImage.ts`) — a push-derived first frame is stored and deleted exactly like any other Shot reference, never a separate parallel convention. */
export const SHOT_REFERENCE_IMAGES_ROOT_RELATIVE = "uploads/reference-images";

/** Confined destination path for an auto-extracted first-frame reference image. `attemptUuid` guarantees a concurrent race between two pushes never shares the same file — same convention as `shotVideoCandidatePathFor`. */
export function firstFrameImagePathFor(shotId: number, splitSegmentId: number, attemptUuid: string): { relative: string; absolute: string } {
  const relative = `${SHOT_REFERENCE_IMAGES_ROOT_RELATIVE}/shot-${shotId}/first-frame-${splitSegmentId}-${attemptUuid}.png`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

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

export type ExtractFirstFrameResult = { ok: true; relativePath: string; absolutePath: string } | { ok: false; error: string };

/** Extracts frame 1 of `clipAbsolutePath` (an already-produced, already-confined Shot Video Candidate clip) into a permanent PNG reference image. Temp-then-rename: a partial/corrupt image is never left at a servable path. */
export async function extractFirstFrame(params: { clipAbsolutePath: string; shotId: number; splitSegmentId: number }): Promise<ExtractFirstFrameResult> {
  const { clipAbsolutePath, shotId, splitSegmentId } = params;

  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return { ok: false, error: "FFmpeg binary is not available for this platform/architecture." };

  const attemptUuid = randomUUID();
  const { relative, absolute } = firstFrameImagePathFor(shotId, splitSegmentId, attemptUuid);
  // REVISE (SEQGEN.PUSH.2-FIX1) — the temp path keeps the `.png` suffix
  // (`<name>.png.tmp.png`, not `<name>.png.tmp`) so it stays recognizable
  // as a PNG target to any extension-based inference, on top of (never
  // instead of) `buildFirstFrameArgs`'s own explicit `-c:v png`. The final
  // rename target is unchanged.
  const tmpAbsolute = `${absolute}.tmp.png`;

  try {
    await fs.mkdir(path.dirname(absolute), { recursive: true });

    const args = buildFirstFrameArgs({ clipAbsolutePath, outputAbsolutePath: tmpAbsolute });
    try {
      await execFileAsync(ffmpegPath, args, { timeout: EXTRACT_TIMEOUT_MS, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    } catch (e) {
      const stderr = (e as { stderr?: string })?.stderr;
      throw new Error(`FFmpeg failed to extract the first frame for segment #${splitSegmentId}: ${stderr || (e instanceof Error ? e.message : String(e))}`);
    }

    let stat: { size: number };
    try {
      stat = await fs.stat(tmpAbsolute);
    } catch {
      throw new Error(`FFmpeg reported success for segment #${splitSegmentId}'s first frame but produced no output file.`);
    }
    if (stat.size <= 0) {
      throw new Error(`First frame produced for segment #${splitSegmentId} is empty.`);
    }

    // REVISE (round 2) — a non-empty file is not necessarily a valid image:
    // check the PNG magic bytes first (fast, catches an obviously wrong
    // container), THEN probe it with the bundled ffprobe and require a real,
    // positive, finite width/height (catches a truncated/corrupt PNG whose
    // header alone still looks right). A non-image/non-decodable output
    // fails the whole segment — never published, batch cleaned up honestly
    // by the caller exactly like any other production failure.
    let header: Buffer;
    try {
      const fh = await fs.open(tmpAbsolute, "r");
      try {
        const buf = Buffer.alloc(8);
        await fh.read(buf, 0, 8, 0);
        header = buf;
      } finally {
        await fh.close();
      }
    } catch (e) {
      throw new Error(`Failed to read the produced first frame for segment #${splitSegmentId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!hasPngSignature(header)) {
      throw new Error(`First frame produced for segment #${splitSegmentId} is not a valid PNG file.`);
    }

    let probe: { streams?: { codec_type?: string; width?: number; height?: number }[] };
    try {
      probe = (await Promise.race([
        runFfprobeJson(tmpAbsolute),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Probe timed out.")), PROBE_TIMEOUT_MS)),
      ])) as typeof probe;
    } catch (e) {
      throw new Error(`Failed to probe the produced first frame for segment #${splitSegmentId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const imageStream = probe.streams?.find((s) => s.codec_type === "video");
    if (!hasValidImageDimensions(imageStream ? { width: imageStream.width ?? NaN, height: imageStream.height ?? NaN } : null)) {
      throw new Error(`First frame produced for segment #${splitSegmentId} has no decodable image stream with valid dimensions.`);
    }

    await fs.rename(tmpAbsolute, absolute);
    return { ok: true, relativePath: relative, absolutePath: absolute };
  } catch (e) {
    const primaryError = e instanceof Error ? e.message : String(e);
    const cleanupErrors = (await Promise.all([removeIfExists(tmpAbsolute), removeIfExists(absolute)])).filter((m): m is string => m !== null);
    if (cleanupErrors.length > 0) {
      return { ok: false, error: `${primaryError} Additionally, failed to remove leftover file(s): ${cleanupErrors.join("; ")}` };
    }
    return { ok: false, error: primaryError };
  }
}

/** Honest best-effort removal of one first-frame image file — mirrors `deleteShotVideoCandidateFile`'s exact contract, used to clean up every frame produced by a failed/partial push attempt. */
export async function deleteFirstFrameImageFile(relativeImagePath: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!relativeImagePath) return { ok: true };
  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, SHOT_REFERENCE_IMAGES_ROOT_RELATIVE);
  const absolute = path.resolve(publicRoot, relativeImagePath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    return { ok: false, error: `Refused to delete first frame outside the allowed root: "${relativeImagePath}"` };
  }
  try {
    await fs.unlink(absolute);
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { ok: true };
    return { ok: false, error: `Failed to remove first frame "${relativeImagePath}": ${err.message}` };
  }
}
