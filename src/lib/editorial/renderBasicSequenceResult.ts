// ---------------------------------------------------------------------------
// Basic sequence result renderer (BASIC.EDITORIAL.1.B)
//
// Turns a BasicCutManifest into a real MP4 file via a single FFmpeg
// invocation: Option B from docs/BASIC_EDITORIAL_1A_RENDERING_AUDIT.md —
// filter_complex concat with a full re-encode to H.264/AAC. Chosen there
// because source approved videos aren't guaranteed to share codec,
// resolution, framerate, or even the presence of an audio stream; a
// stream-copy concat (Option A) would silently fail or corrupt output the
// moment two clips disagree on any of those.
//
// Every ffmpeg/ffprobe invocation uses execFile with an argument array —
// never a shell string — so there is no command-injection surface
// regardless of path content. Server-only: never import from a Client
// Component (same rule as src/lib/ffmpeg.ts, which this module wraps).
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getFfmpegPath, runFfprobeJson } from "@/lib/ffmpeg";
import type { BasicCutManifest, BasicCutManifestItem } from "./basicCutManifest";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Output normalization targets — fixed for V1 (see BASIC_EDITORIAL_1A_
// RENDERING_AUDIT.md §6: normalization is mandatory, not optional, given
// heterogeneous ComfyUI-generated source videos). Chosen as a modest,
// widely-compatible target — not tied to any specific source shot's
// resolution, since sources can differ shot to shot.
// ---------------------------------------------------------------------------
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;
const TARGET_SAMPLE_RATE = 44100;

const RENDER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — generous for a short sequence, still bounded

export class RenderBasicSequenceResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderBasicSequenceResultError";
  }
}

/**
 * Two candidate physical roots for `uploads/`-relative paths, matching
 * src/app/api/uploads/[...path]/route.ts's own dual-root check — resolves
 * the BASIC_EDITORIAL_1A_RENDERING_AUDIT.md §3/§9 "storage/uploads vs
 * public/uploads" ambiguity by checking both, same as the serving route
 * does, rather than guessing one.
 */
function candidateAbsolutePaths(relativeUploadsPath: string): string[] {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, "storage", relativeUploadsPath),
    path.resolve(cwd, "public", relativeUploadsPath),
  ];
}

/**
 * Exported for reuse by FILM.RESULT.1.B's renderer (src/lib/film/
 * renderFilmResult.ts), which resolves Sequence Result video paths — the
 * exact same "uploads/-relative string -> real file on disk" problem, one
 * level up.
 */
export async function resolveExistingAbsolutePath(relativeUploadsPath: string): Promise<string | null> {
  for (const candidate of candidateAbsolutePaths(relativeUploadsPath)) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Where a freshly-rendered result is written. Matches src/actions/
 * generation.ts's existing write convention exactly (public/uploads/...,
 * mkdir -p, randomUUID filename) — the one precedent this codebase already
 * has for writing a server-generated file into the uploads tree.
 */
function outputAbsolutePathFor(sequenceId: number, uuid: string): { relative: string; absolute: string } {
  const relative = `uploads/sequence-results/sequence-${sequenceId}/${uuid}.mp4`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

// ---------------------------------------------------------------------------
// Segment resolution — turns manifest items + empty spaces into a single
// chronological list of concrete render segments, checking real source
// file existence/audio-stream presence along the way (the manifest itself
// only reflects DB state, not filesystem reality — see basicCutManifest.ts).
// ---------------------------------------------------------------------------

/**
 * Exported (type + the "video" variant's shape) for reuse by FILM.RESULT.1.B's
 * renderer, which builds a list of "video"-kind segments only — one per
 * included Sequence Result, no placeholder/gap kinds needed at the film
 * level (V1 excludes non-renderable sequences instead of rendering a
 * black placeholder for them).
 */
export type ResolvedSegment =
  | { kind: "video"; itemId: number; absolutePath: string; trimInSeconds: number; durationSeconds: number; hasAudio: boolean }
  | { kind: "placeholder"; itemId: number; durationSeconds: number }
  | { kind: "gap"; durationSeconds: number };

export async function sourceHasAudioStream(absolutePath: string): Promise<boolean> {
  try {
    const probe = (await runFfprobeJson(absolutePath)) as { streams?: Array<{ codec_type?: string }> };
    return Array.isArray(probe.streams) && probe.streams.some((s) => s.codec_type === "audio");
  } catch {
    return false;
  }
}

async function resolveItemSegment(item: BasicCutManifestItem, warnings: string[]): Promise<ResolvedSegment> {
  if (item.status !== "video" || !item.sourceVideoPath) {
    return { kind: "placeholder", itemId: item.itemId, durationSeconds: item.durationSeconds };
  }

  const absolutePath = await resolveExistingAbsolutePath(item.sourceVideoPath);
  if (!absolutePath) {
    warnings.push(
      `Item ${item.itemId} (shot ${item.shotId}): source video "${item.sourceVideoPath}" not found on disk — rendered as a placeholder.`
    );
    return { kind: "placeholder", itemId: item.itemId, durationSeconds: item.durationSeconds };
  }

  const trimInValid =
    item.trimInSeconds !== null && item.trimOutSeconds !== null && item.trimInSeconds >= 0 && item.trimOutSeconds > item.trimInSeconds;
  const trimInSeconds = trimInValid ? item.trimInSeconds! : 0;

  const hasAudio = await sourceHasAudioStream(absolutePath);

  return {
    kind: "video",
    itemId: item.itemId,
    absolutePath,
    trimInSeconds,
    durationSeconds: item.durationSeconds,
    hasAudio,
  };
}

async function resolveSegments(manifest: BasicCutManifest, warnings: string[]): Promise<ResolvedSegment[]> {
  const timedItems = manifest.items.map((item) => ({ kind: "item" as const, startSeconds: item.startSeconds, item }));
  const timedGaps = manifest.emptySpaces.map((space) => ({ kind: "gap" as const, startSeconds: space.startSeconds, space }));
  const chronological = [...timedItems, ...timedGaps].sort((a, b) => a.startSeconds - b.startSeconds);

  const segments: ResolvedSegment[] = [];
  for (const entry of chronological) {
    if (entry.kind === "gap") {
      if (entry.space.durationSeconds > 0) {
        segments.push({ kind: "gap", durationSeconds: entry.space.durationSeconds });
      }
      continue;
    }
    segments.push(await resolveItemSegment(entry.item, warnings));
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Pure ffmpeg argument construction — no I/O, so it can be inspected/
// hand-tested without launching ffmpeg (per this ticket's request for
// "FFmpeg arg generation" to be testable independently of an actual render).
// ---------------------------------------------------------------------------

export function buildFfmpegConcatArgs(segments: ResolvedSegment[], outputAbsolutePath: string): string[] {
  const inputArgs: string[][] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];
  const filterParts: string[] = [];

  const colorSourceFor = (durationSeconds: number) =>
    `color=c=black:s=${TARGET_WIDTH}x${TARGET_HEIGHT}:r=${TARGET_FPS}:d=${durationSeconds.toFixed(3)}`;
  const silentSourceFor = (durationSeconds: number) =>
    `anullsrc=channel_layout=stereo:sample_rate=${TARGET_SAMPLE_RATE}:d=${durationSeconds.toFixed(3)}`;

  segments.forEach((segment, i) => {
    const vLabel = `v${i}`;
    const aLabel = `a${i}`;

    if (segment.kind === "video") {
      const videoInputIndex = inputArgs.length;
      inputArgs.push(["-ss", segment.trimInSeconds.toFixed(3), "-t", segment.durationSeconds.toFixed(3), "-i", segment.absolutePath]);
      filterParts.push(
        `[${videoInputIndex}:v]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS}[${vLabel}]`
      );

      if (segment.hasAudio) {
        filterParts.push(`[${videoInputIndex}:a]aformat=sample_rates=${TARGET_SAMPLE_RATE}:channel_layouts=stereo[${aLabel}]`);
      } else {
        const audioInputIndex = inputArgs.length;
        inputArgs.push(["-f", "lavfi", "-i", silentSourceFor(segment.durationSeconds)]);
        filterParts.push(`[${audioInputIndex}:a]aformat=sample_rates=${TARGET_SAMPLE_RATE}:channel_layouts=stereo[${aLabel}]`);
      }
    } else {
      // placeholder or gap — identical synthetic black+silent treatment
      const videoInputIndex = inputArgs.length;
      inputArgs.push(["-f", "lavfi", "-i", colorSourceFor(segment.durationSeconds)]);
      filterParts.push(`[${videoInputIndex}:v]setsar=1[${vLabel}]`);

      const audioInputIndex = inputArgs.length;
      inputArgs.push(["-f", "lavfi", "-i", silentSourceFor(segment.durationSeconds)]);
      filterParts.push(`[${audioInputIndex}:a]aformat=sample_rates=${TARGET_SAMPLE_RATE}:channel_layouts=stereo[${aLabel}]`);
    }

    videoLabels.push(`[${vLabel}]`);
    audioLabels.push(`[${aLabel}]`);
  });

  const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join("");
  const filterComplex = `${filterParts.join(";")};${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  const args: string[] = [];
  for (const group of inputArgs) args.push(...group);
  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    // Explicit container format — required because the output is written
    // to a "<uuid>.mp4.tmp" path first (renamed to "<uuid>.mp4" only on
    // success, see renderBasicSequenceResult's doc comment), and ffmpeg
    // cannot infer a container from a ".tmp" trailing extension.
    "-f",
    "mp4",
    "-y",
    outputAbsolutePath
  );

  return args;
}

export type RenderBasicSequenceResultResult = {
  outputVideoPath: string; // uploads/-relative, ready to store in sequence_results.videoPath
  durationSeconds: number;
  warnings: string[];
};

/**
 * Renders a manifest to a real MP4. Writes to a `.tmp` path first, then
 * renames to the final filename on success — a partial/corrupt file from a
 * failed or killed ffmpeg process is never left at the servable path. On
 * any failure, the `.tmp` file (if it exists) is removed before the error
 * propagates.
 */
export async function renderBasicSequenceResult(args: {
  projectId: number;
  sequenceId: number;
  manifest: BasicCutManifest;
}): Promise<RenderBasicSequenceResultResult> {
  const { sequenceId, manifest } = args;

  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    throw new RenderBasicSequenceResultError("FFmpeg binary is not available for this platform/architecture.");
  }

  const warnings = [...manifest.warnings];
  const segments = await resolveSegments(manifest, warnings);
  if (segments.length === 0) {
    throw new RenderBasicSequenceResultError("No renderable segments — the sequence is empty.");
  }

  const uuid = randomUUID();
  const { relative, absolute } = outputAbsolutePathFor(sequenceId, uuid);
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
    const message = err instanceof Error ? err.message : String(err);
    throw new RenderBasicSequenceResultError(`FFmpeg render failed: ${message}`);
  }

  try {
    await fs.access(tmpAbsolute);
  } catch {
    throw new RenderBasicSequenceResultError("FFmpeg reported success but produced no output file.");
  }

  await fs.rename(tmpAbsolute, absolute);

  let durationSeconds = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  try {
    const probe = (await runFfprobeJson(absolute)) as { format?: { duration?: string } };
    const probedDuration = probe.format?.duration ? parseFloat(probe.format.duration) : NaN;
    if (Number.isFinite(probedDuration) && probedDuration > 0) {
      durationSeconds = probedDuration;
    } else {
      warnings.push("Could not confirm rendered duration via ffprobe — using the manifest's computed total instead.");
    }
  } catch {
    warnings.push("Could not confirm rendered duration via ffprobe — using the manifest's computed total instead.");
  }

  return {
    outputVideoPath: relative,
    durationSeconds,
    warnings,
  };
}
