// ---------------------------------------------------------------------------
// Film Result renderer (FILM.RESULT.1.B)
//
// Concatenates the active Sequence Results' already-rendered videos into a
// single film MP4 — one level up from renderBasicSequenceResult.ts, which
// concatenates shot videos into a Sequence Result. Reuses that file's
// validated FFmpeg strategy directly (buildFfmpegConcatArgs, dual-root
// uploads path resolution, audio-stream detection) rather than
// re-implementing it: segments here are always "video" kind (no
// placeholder/gap — V1 excludes non-renderable sequences instead of
// rendering a black placeholder for them, and inserts no artificial gaps
// between sequences).
//
// Deliberately stricter than the Basic renderer on missing source files:
// a sequence the manifest marked `included: true` (i.e. it has an active,
// non-outdated Sequence Result with a videoPath) whose file turns out to be
// missing on disk is a storage/DB inconsistency, not a normal "no result
// yet" case — so this renderer fails hard instead of downgrading to a
// placeholder + warning.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getFfmpegPath, runFfprobeJson } from "@/lib/ffmpeg";
import {
  buildFfmpegConcatArgs,
  resolveExistingAbsolutePath,
  sourceHasAudioStream,
  type ResolvedSegment,
} from "@/lib/editorial/renderBasicSequenceResult";
import type { FilmResultManifest } from "@/types/filmResult";

const execFileAsync = promisify(execFile);

// Concatenating full sequences takes longer than concatenating shots within
// one sequence — a generous ceiling, same order of magnitude as Basic's.
const RENDER_TIMEOUT_MS = 20 * 60 * 1000;

export class RenderFilmResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderFilmResultError";
  }
}

function outputPathFor(projectId: number, uuid: string): { relative: string; absolute: string } {
  const relative = `uploads/film-results/project-${projectId}/${uuid}.mp4`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

// Above this gap, a stale DB-recorded duration vs. the file's real duration
// is treated as a mismatch worth warning about (Étape 8's "duration
// mismatch if detected" requirement).
const DURATION_MISMATCH_THRESHOLD_SECONDS = 0.5;

async function probeSourceDurationSeconds(absolutePath: string): Promise<number | null> {
  try {
    const probe = (await runFfprobeJson(absolutePath)) as { format?: { duration?: string } };
    const duration = probe.format?.duration ? parseFloat(probe.format.duration) : NaN;
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

async function resolveSequenceSegment(
  seq: FilmResultManifest["sequences"][number],
  warnings: string[]
): Promise<ResolvedSegment> {
  const label = seq.sequenceTitle ?? `Sequence ${seq.sequenceId}`;

  if (!seq.videoPath || seq.durationSeconds === null) {
    throw new RenderFilmResultError(
      `Sequence "${label}" was marked as renderable but has no video path — this indicates a manifest inconsistency.`
    );
  }

  const absolutePath = await resolveExistingAbsolutePath(seq.videoPath);
  if (!absolutePath) {
    throw new RenderFilmResultError(
      `Source video for sequence "${label}" was not found on disk: "${seq.videoPath}".`
    );
  }

  const hasAudio = await sourceHasAudioStream(absolutePath);

  // The Sequence Result's stored durationSeconds can go stale relative to
  // the actual file (e.g. hand-edited DB rows, or a source re-render that
  // didn't update the row) — trust the probed file duration for the actual
  // render (avoids a video/audio desync when a synthetic silent audio
  // track is padded to a DB duration longer than the real video content),
  // but warn so the discrepancy is visible.
  const probedDuration = await probeSourceDurationSeconds(absolutePath);
  let durationSeconds = seq.durationSeconds;
  if (probedDuration !== null && Math.abs(probedDuration - seq.durationSeconds) > DURATION_MISMATCH_THRESHOLD_SECONDS) {
    warnings.push(
      `Sequence "${label}": recorded duration (${seq.durationSeconds.toFixed(1)}s) does not match the actual video file (${probedDuration.toFixed(1)}s) — using the actual file duration.`
    );
    durationSeconds = probedDuration;
  }

  return {
    kind: "video",
    itemId: seq.sequenceId,
    absolutePath,
    trimInSeconds: 0,
    durationSeconds,
    hasAudio,
  };
}

export type RenderFilmResultResult = {
  outputVideoPath: string;
  durationSeconds: number;
  warnings: string[];
};

export async function renderFilmResultFromManifest(args: {
  projectId: number;
  manifest: FilmResultManifest;
}): Promise<RenderFilmResultResult> {
  const { projectId, manifest } = args;

  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    throw new RenderFilmResultError("FFmpeg binary is not available for this platform/architecture.");
  }

  // Only this function's OWN warnings (e.g. ffprobe duration confirmation
  // failures) — manifest.warnings (missing/outdated sequences) is the
  // caller's concern (see filmPublish.ts), not duplicated here.
  const warnings: string[] = [];
  const includedSequences = manifest.sequences.filter((seq) => seq.included && seq.videoPath);

  if (includedSequences.length === 0) {
    throw new RenderFilmResultError("No active sequence results with playable videos were found.");
  }

  const segments: ResolvedSegment[] = [];
  for (const seq of includedSequences) {
    segments.push(await resolveSequenceSegment(seq, warnings));
  }

  const uuid = randomUUID();
  const { relative, absolute } = outputPathFor(projectId, uuid);
  const tmpAbsolute = `${absolute}.tmp`;

  await fs.mkdir(path.dirname(absolute), { recursive: true });

  const ffmpegArgs = buildFfmpegConcatArgs(segments, tmpAbsolute);

  try {
    await execFileAsync(ffmpegPath, ffmpegArgs, {
      timeout: RENDER_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    await fs.rm(tmpAbsolute, { force: true });
    throw new RenderFilmResultError(
      `FFmpeg render failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    await fs.access(tmpAbsolute);
  } catch {
    throw new RenderFilmResultError("FFmpeg reported success but produced no output file.");
  }

  await fs.rename(tmpAbsolute, absolute);

  let durationSeconds = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  try {
    const probe = (await runFfprobeJson(absolute)) as { format?: { duration?: string } };
    const probedDuration = probe.format?.duration ? parseFloat(probe.format.duration) : NaN;
    if (Number.isFinite(probedDuration) && probedDuration > 0) {
      durationSeconds = probedDuration;
    } else {
      warnings.push("Could not confirm the rendered duration via ffprobe — using the computed total instead.");
    }
  } catch {
    warnings.push("Could not confirm the rendered duration via ffprobe — using the computed total instead.");
  }

  return { outputVideoPath: relative, durationSeconds, warnings };
}
