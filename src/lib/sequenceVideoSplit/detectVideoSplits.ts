// ---------------------------------------------------------------------------
// detectVideoSplits.ts — SEQGEN.SPLIT.1 (Lot B)
//
// Server-only. Real FFmpeg/FFprobe execution: probes a `sequence_video_drafts`
// video for duration/fps/dimensions/stream validity (via the already-bundled
// `runFfprobeJson`), runs the scene-cut detection command, parses its stderr
// with the pure `parseFfmpegSceneOutput`, proposes N segments for N expected
// Shot durations with the pure `selectSegmentBoundaries`, then generates one
// mid-segment thumbnail per proposed segment.
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
import { parseFfmpegSceneOutput } from "./parseFfmpegSceneOutput";
import { selectSegmentBoundaries, type ProposedSegment } from "./selectSegmentBoundaries";

const execFileAsync = promisify(execFile);

export class DetectVideoSplitsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetectVideoSplitsError";
  }
}

/**
 * Resolves+validates a `sequence_video_drafts.videoPath` relative path
 * against the same publicRoot/uploads containment pattern used across the
 * codebase (mirrors storyboardExtraction.ts's `resolveSourceImageAbsolutePath`)
 * — the source video path is always read from the draft's own DB row, never
 * taken directly from client input.
 */
export async function resolveSequenceVideoDraftAbsolutePath(relativePath: string): Promise<string> {
  const publicRoot = path.join(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, "uploads", "sequence-video-drafts");
  const absolute = path.resolve(publicRoot, relativePath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    throw new DetectVideoSplitsError("Source video path is not in the expected location.");
  }
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    throw new DetectVideoSplitsError("Source video file was not found on disk.");
  }
  return absolute;
}

const FFMPEG_DETECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — bounded, generous for a short Sequence Video draft
const THUMBNAIL_TIMEOUT_MS = 30_000;

export type FrameRateMode = "cfr" | "vfr" | "unknown";

export type ProbedVideoInfo = {
  durationSeconds: number;
  /** Only ever non-null when `frameRateMode === "cfr"` — see below. */
  fps: number | null;
  frameRateMode: FrameRateMode;
  width: number | null;
  height: number | null;
};

export function parseFrameRateFraction(raw: string | undefined): number | null {
  if (!raw) return null;
  const [num, den] = raw.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

/**
 * Pure CFR/VFR/unknown classification, extracted so it's independently
 * testable without FFprobe I/O — see `probeVideoInfo`'s own doc comment for
 * the full reasoning. `fps` is only ever non-null when `frameRateMode ===
 * "cfr"`.
 */
export function classifyFrameRate(rFrameRateRaw: string | undefined, avgFrameRateRaw: string | undefined): { fps: number | null; frameRateMode: FrameRateMode } {
  const rFps = parseFrameRateFraction(rFrameRateRaw);
  const avgFps = parseFrameRateFraction(avgFrameRateRaw);

  if (rFps === null || avgFps === null || rFps <= 0 || avgFps <= 0) {
    return { fps: null, frameRateMode: "unknown" };
  }
  // Tight relative tolerance (0.1%) — enough to absorb ffprobe's own
  // fraction-rounding for a genuinely constant rate (e.g. "24000/1001" vs
  // an averaged "23.976...") without accepting a real VFR mismatch.
  const relativeDiff = Math.abs(rFps - avgFps) / rFps;
  if (relativeDiff <= 0.001) {
    return { fps: rFps, frameRateMode: "cfr" };
  }
  return { fps: null, frameRateMode: "vfr" };
}

/**
 * REVISE (round 2, finding 2) — defensive read of the `frameRateMode`
 * persisted into a run's `paramsJson` by `startSequenceVideoSplitDetection`.
 * The persisted marker is worthless if nothing ever consults it: this is
 * the ONE place that should be called before ever enabling frame-exact
 * behavior for a run, so a missing field, unparseable JSON, or any value
 * other than the three known ones ALWAYS falls back to `"unknown"` —
 * never silently treated as `"cfr"`. This also correctly (and
 * conservatively) covers every run persisted BEFORE this field existed at
 * all: `paramsJson` for those runs has no `frameRateMode` key, so
 * `JSON.parse(...).frameRateMode` is `undefined`, which the strict
 * three-value check below rejects — exactly like a corrupted/unknown value,
 * never assumed proven-CFR from `sourceFps` being numeric alone.
 */
export function parseFrameRateModeFromParamsJson(paramsJson: string | null): FrameRateMode {
  if (!paramsJson) return "unknown";
  try {
    const parsed: unknown = JSON.parse(paramsJson);
    if (parsed && typeof parsed === "object" && "frameRateMode" in parsed) {
      const value = (parsed as { frameRateMode: unknown }).frameRateMode;
      if (value === "cfr" || value === "vfr" || value === "unknown") return value;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Confirms the source has a valid video stream and returns duration/fps/
 * dimensions — never reconstructed from the fragile scene-detection stderr
 * scraping.
 *
 * REVISE (SEQGEN.SPLIT.WORKSPACE.1, round 2, finding 2) — `fps` is ONLY
 * ever populated (and `frameRateMode` only ever `"cfr"`) when ffprobe's two
 * independent frame-rate readings agree: `r_frame_rate` (the stream's
 * declared/nominal rate) AND `avg_frame_rate` (packet-count / duration —
 * the actual average measured over the whole stream). A genuinely variable
 * frame rate source can report a perfectly plausible `r_frame_rate` (e.g.
 * "30/1") while its `avg_frame_rate` reveals the true average differs
 * (e.g. "27500/1000") — trusting `r_frame_rate` alone (the previous
 * behavior) would silently promise frame-exact splitting a VFR source
 * cannot actually honor. Either value missing/unparseable, or the two
 * disagreeing beyond a tight relative tolerance, downgrades the result to
 * `frameRateMode: "vfr" | "unknown"` and `fps: null` — which
 * `isReliableFps`/`roundBoundarySeconds` already treat as "no frame-exact
 * guarantee, fall back to high-precision seconds."
 */
export async function probeVideoInfo(absolutePath: string): Promise<ProbedVideoInfo> {
  let probe: unknown;
  try {
    probe = await runFfprobeJson(absolutePath);
  } catch (e) {
    throw new DetectVideoSplitsError(`FFprobe failed to read the source video: ${e instanceof Error ? e.message : String(e)}`);
  }

  const typed = probe as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; r_frame_rate?: string; avg_frame_rate?: string; width?: number; height?: number }>;
  };

  const videoStream = typed.streams?.find((s) => s.codec_type === "video");
  if (!videoStream) {
    throw new DetectVideoSplitsError("Source file has no valid video stream.");
  }

  const durationSeconds = typed.format?.duration ? parseFloat(typed.format.duration) : NaN;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new DetectVideoSplitsError("Could not determine the source video's duration.");
  }

  const { fps, frameRateMode } = classifyFrameRate(videoStream.r_frame_rate, videoStream.avg_frame_rate);

  return {
    durationSeconds,
    fps,
    frameRateMode,
    width: typeof videoStream.width === "number" ? videoStream.width : null,
    height: typeof videoStream.height === "number" ? videoStream.height : null,
  };
}

/**
 * Runs the scene-cut detection ffmpeg command and returns its raw stderr
 * text. Uses `metadata=mode=print:key=lavfi.scene_score` — NOT plain
 * `showinfo` — because on the bundled ffmpeg build, `showinfo` alone prints
 * `pts_time` but never prints the `lavfi.scene_score` metadata that
 * `select` itself computes (confirmed against the real dev drafts: 0
 * `scene_score` lines from `showinfo` output). `metadata=print` is what
 * actually emits BOTH `pts_time` and `lavfi.scene_score` as a paired
 * two-line block per kept frame, in ffmpeg's own log output (stderr) —
 * exactly what `parseFfmpegSceneOutput` expects. `showinfo` is deliberately
 * NOT chained alongside it: doing so would print a second, unpaired
 * `pts_time` line per frame and corrupt the pairing.
 */
export async function runFfmpegSceneDetection(absolutePath: string, sceneThreshold: number): Promise<string> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    throw new DetectVideoSplitsError("FFmpeg binary is not available for this platform/architecture.");
  }

  const args = [
    "-hide_banner",
    "-i",
    absolutePath,
    "-filter:v",
    `select='gt(scene,${sceneThreshold})',metadata=mode=print:key=lavfi.scene_score`,
    "-an",
    "-f",
    "null",
    "-",
  ];

  try {
    const { stderr } = await execFileAsync(ffmpegPath, args, {
      timeout: FFMPEG_DETECT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stderr;
  } catch (e) {
    // ffmpeg with `-f null -` still exits 0 on success; a thrown error here
    // is a real failure (bad input, timeout, ...) — execFileAsync attaches
    // stderr to the error object on non-zero exit.
    const stderr = (e as { stderr?: string })?.stderr;
    throw new DetectVideoSplitsError(`FFmpeg scene detection failed: ${stderr || (e instanceof Error ? e.message : String(e))}`);
  }
}

/**
 * SEQGEN.SPLIT.WORKSPACE.1 (Lot C) — same detection filter as
 * `runFfmpegSceneDetection`, scoped to ONE segment's own `[rangeStartSeconds,
 * rangeStartSeconds + rangeDurationSeconds]` range via input-side `-ss`/`-t`
 * (the same seek style already proven accurate for thumbnail generation on
 * the real dev drafts). No other segment's frames are ever read or
 * reanalyzed. Because `-ss` sits BEFORE `-i` (input seeking, not
 * `-copyts`), every `pts_time` this prints is RANGE-RELATIVE (starts near
 * 0) — callers MUST add `rangeStartSeconds` back before treating a
 * candidate as an absolute video timestamp; this function deliberately
 * returns the raw range-relative stderr text only, so that conversion
 * happens in exactly one place (never duplicated/forgotten).
 */
export async function runFfmpegSceneDetectionInRange(
  absolutePath: string,
  sceneThreshold: number,
  rangeStartSeconds: number,
  rangeDurationSeconds: number
): Promise<string> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    throw new DetectVideoSplitsError("FFmpeg binary is not available for this platform/architecture.");
  }

  const args = [
    "-hide_banner",
    "-ss",
    rangeStartSeconds.toFixed(3),
    "-i",
    absolutePath,
    "-t",
    rangeDurationSeconds.toFixed(3),
    "-filter:v",
    `select='gt(scene,${sceneThreshold})',metadata=mode=print:key=lavfi.scene_score`,
    "-an",
    "-f",
    "null",
    "-",
  ];

  try {
    const { stderr } = await execFileAsync(ffmpegPath, args, {
      timeout: FFMPEG_DETECT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stderr;
  } catch (e) {
    const stderr = (e as { stderr?: string })?.stderr;
    throw new DetectVideoSplitsError(`FFmpeg local scene detection failed: ${stderr || (e instanceof Error ? e.message : String(e))}`);
  }
}

const THUMBNAIL_ROOT_RELATIVE = "uploads/sequence-video-split-thumbnails";

function thumbnailAbsolutePathFor(splitRunUuid: string, thumbnailKey: string): { relative: string; absolute: string } {
  const relative = `${THUMBNAIL_ROOT_RELATIVE}/run-${splitRunUuid}/segment-${thumbnailKey}.jpg`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

export type ThumbnailGenerationResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Generates a single mid-segment thumbnail via `ffmpeg -ss <mid> -i <src> -frames:v 1 <out>`.
 * Writes to a `.tmp` path first, renames on success — a partial/corrupt file
 * is never left at the servable path. A missing thumbnail is a
 * degraded-but-recoverable review experience (never a reason to fail the
 * whole detection run/edit), BUT the failure itself is always returned as an
 * actionable diagnostic — REVISE (round 2) explicitly rejected a bare
 * `console.error` + `null` return here, since that made an ffmpeg failure
 * indistinguishable from a `.tmp` file that failed to clean up; callers must
 * be able to tell the user something went wrong, not just silently show "No
 * thumbnail."
 *
 * `thumbnailKey` MUST be stable and unique per segment for the lifetime of
 * the run — `orderIndex` is only safe to use for the initial detection
 * batch (a fresh, never-reused 0..n-1 sequence). Once a run has been edited
 * (Split/Merge can renumber every following segment's `orderIndex`), reusing
 * `orderIndex` as the filename key would let a NEW segment's thumbnail
 * silently overwrite an EXISTING segment's still-referenced thumbnail file
 * at the same index — callers regenerating a thumbnail after an edit must
 * pass the segment's own stable DB id instead.
 */
export async function generateSegmentThumbnail(
  sourceAbsolutePath: string,
  segment: Pick<ProposedSegment, "startSeconds" | "endSeconds">,
  splitRunUuid: string,
  thumbnailKey: string
): Promise<ThumbnailGenerationResult> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return { ok: false, error: "FFmpeg binary is not available for this platform/architecture." };

  const midSeconds = segment.startSeconds + (segment.endSeconds - segment.startSeconds) / 2;
  const { relative, absolute } = thumbnailAbsolutePathFor(splitRunUuid, thumbnailKey);
  const tmpAbsolute = `${absolute}.tmp`;

  await fs.mkdir(path.dirname(absolute), { recursive: true });

  try {
    await execFileAsync(
      ffmpegPath,
      ["-ss", midSeconds.toFixed(3), "-i", sourceAbsolutePath, "-frames:v", "1", "-y", "-f", "image2", tmpAbsolute],
      { timeout: THUMBNAIL_TIMEOUT_MS, windowsHide: true, maxBuffer: 5 * 1024 * 1024 }
    );
    await fs.access(tmpAbsolute);
    await fs.rename(tmpAbsolute, absolute);
    return { ok: true, path: relative };
  } catch (e) {
    const ffmpegError = e instanceof Error ? e.message : String(e);
    try {
      await fs.rm(tmpAbsolute, { force: true });
    } catch (cleanupErr) {
      // Never silently swallowed: propagated as the returned diagnostic
      // (not just a server log) — a partial `.tmp` file that fails to
      // delete is a real, admin-visible, actionable problem.
      const cleanupMsg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      return {
        ok: false,
        error: `Thumbnail generation failed (${ffmpegError}); additionally failed to remove the partial file "${tmpAbsolute}": ${cleanupMsg}`,
      };
    }
    return { ok: false, error: `Thumbnail generation failed: ${ffmpegError}` };
  }
}

export type CleanupResult = { ok: true } | { ok: false; error: string };

/** Honest cleanup of every thumbnail file under a given run's own thumbnail directory — used when a detection run must be discarded (e.g. mid-generation failure) so no orphaned file survives. Never silently swallows a real failure (permissions, disk state): reports it so the caller can surface it instead of announcing a clean run that isn't. */
export async function cleanupRunThumbnails(splitRunUuid: string): Promise<CleanupResult> {
  const dir = path.resolve(process.cwd(), "public", THUMBNAIL_ROOT_RELATIVE, `run-${splitRunUuid}`);
  try {
    // `force: true` only suppresses ENOENT (already gone) — a real
    // permission/lock error still rejects and is reported below.
    await fs.rm(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `Failed to remove thumbnail directory "${THUMBNAIL_ROOT_RELATIVE}/run-${splitRunUuid}": ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Deletes a single segment's thumbnail file — used whenever a thumbnail
 * becomes unreferenced: the segment's row was deleted (`Merge`), or the
 * segment was regenerated with a new file and the old one is no longer
 * pointed to by any DB row (`Adjust`/`Split`/the retained side of `Merge`).
 * `null`/already-missing (ENOENT) is treated as success (nothing to clean
 * up); any other failure (permissions, lock) is reported, never silently
 * swallowed.
 *
 * REVISE (round 2) — strictly confined to `THUMBNAIL_ROOT_RELATIVE`: this
 * function deletes a path that ultimately traces back to a DB column, so a
 * corrupted/malicious row can never make it unlink something outside the
 * thumbnails tree.
 */
export async function deleteSegmentThumbnail(relativeThumbnailPath: string | null): Promise<CleanupResult> {
  if (!relativeThumbnailPath) return { ok: true };
  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, THUMBNAIL_ROOT_RELATIVE);
  const absolute = path.resolve(publicRoot, relativeThumbnailPath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    return { ok: false, error: `Refused to delete thumbnail outside the allowed root: "${relativeThumbnailPath}"` };
  }
  try {
    await fs.unlink(absolute);
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { ok: true };
    return { ok: false, error: `Failed to remove orphaned thumbnail "${relativeThumbnailPath}": ${err.message}` };
  }
}

export type DetectVideoSplitsResult = {
  probed: ProbedVideoInfo;
  rawCandidates: { timestampSeconds: number; score: number | null }[];
  segments: (ProposedSegment & { thumbnailPath: string | null })[];
  /** REVISE (round 3) — every `generateSegmentThumbnail` failure from the initial batch, never discarded. A missing thumbnail is degraded-but-recoverable (the run still becomes "ready"), but the diagnostic itself must reach the caller so it can be persisted/surfaced, not just silently produce a `null` path. */
  thumbnailWarnings: string[];
};

/**
 * Full detection pipeline for one `sequence_video_drafts` row: probe ->
 * scene detection -> parse -> boundary selection -> per-segment thumbnail.
 * `splitRunUuid` scopes this run's thumbnails into their own directory so a
 * later "Run Detection Again" (a NEW versioned run, never overwriting this
 * one) never collides with or clobbers an earlier run's thumbnails.
 */
export async function detectVideoSplits(params: {
  sourceAbsolutePath: string;
  expectedShotDurations: (number | null | undefined)[];
  sceneThreshold: number;
  minSegmentDurationSeconds: number;
  splitRunUuid: string;
}): Promise<DetectVideoSplitsResult> {
  const { sourceAbsolutePath, expectedShotDurations, sceneThreshold, minSegmentDurationSeconds, splitRunUuid } = params;

  const probed = await probeVideoInfo(sourceAbsolutePath);
  const stderrText = await runFfmpegSceneDetection(sourceAbsolutePath, sceneThreshold);
  const rawCandidates = parseFfmpegSceneOutput(stderrText);

  const proposedSegments = selectSegmentBoundaries({
    videoDurationSeconds: probed.durationSeconds,
    expectedShotDurations,
    candidates: rawCandidates,
    minSegmentDurationSeconds,
    sourceFps: probed.fps,
  });

  const segments: (ProposedSegment & { thumbnailPath: string | null })[] = [];
  const thumbnailWarnings: string[] = [];
  for (const segment of proposedSegments) {
    // Initial batch only: orderIndex is a fresh, never-reused 0..n-1
    // sequence here, safe as the thumbnail key (see generateSegmentThumbnail's
    // own doc comment for why this is NOT safe once a run has been edited).
    // A generation failure here is degraded-but-recoverable (segment simply
    // has no thumbnail yet) — not a reason to fail the whole detection run —
    // but the diagnostic itself is always collected, never discarded.
    const result = await generateSegmentThumbnail(sourceAbsolutePath, segment, splitRunUuid, `initial-${segment.orderIndex}`);
    if (result.ok) {
      segments.push({ ...segment, thumbnailPath: result.path });
    } else {
      segments.push({ ...segment, thumbnailPath: null });
      thumbnailWarnings.push(`Segment #${segment.orderIndex + 1}: ${result.error}`);
    }
  }

  return { probed, rawCandidates, segments, thumbnailWarnings };
}

export function newSplitRunUuid(): string {
  return randomUUID();
}
