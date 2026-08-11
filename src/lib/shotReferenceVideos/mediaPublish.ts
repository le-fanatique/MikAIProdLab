// ---------------------------------------------------------------------------
// mediaPublish.ts — SHOT.VIDEO.REFERENCES.1
//
// Server-only shared core (never a Server Action itself — no "use server").
// Two publish primitives, both ending in the same hardened
// probe-then-atomic-rename-then-cleanup-on-failure tail (mirrors
// `src/lib/shotVideoLibrary/ensureSaved.ts`'s own discipline):
//
//   - `publishUploadedVideoBuffer` — a direct user upload (FormData File):
//     validates size/extension/magic bytes BEFORE any disk write, writes the
//     raw bytes to an exclusive temp name, probes, publishes.
//   - `publishCopiedVideoFile` — a physical copy of an ALREADY-durable,
//     already-validated MikAI file (the two cross-collection bridges): no
//     magic-byte re-check (the source was already accepted once), but the
//     destination copy is independently re-probed — never trusts the
//     source row's stored metadata, always the actually-copied bytes.
//
// Neither function ever mutates a DB row — callers own their own insert (and
// its own rollback-the-file-on-DB-failure discipline), exactly like
// `createShotReferenceImage`/`ensureVideoOutputSavedToLibrary` do.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runFfprobeJson } from "@/lib/ffmpeg";
import {
  ALLOWED_REFERENCE_VIDEO_EXTENSIONS,
  MAX_REFERENCE_VIDEO_SIZE_BYTES,
  hasAllowedReferenceVideoSignature,
  hasValidVideoDimensions,
  hasPositiveFiniteDuration,
} from "./videoValidation";

const PROBE_TIMEOUT_MS = 15_000;

export type PublishedVideoMetadata = { durationSeconds: number; width: number; height: number };

export type PublishVideoResult =
  | { ok: true; relative: string; metadata: PublishedVideoMetadata }
  | { ok: false; error: string };

type DestFor = (uuid: string, ext: string) => { relative: string; absolute: string };

/** Best-effort removal of a single path, treating a missing file as success — mirrors `ensureSaved.ts`'s own `removeIfExists`. Returns `null` on success, or a human-readable message describing exactly what failed, never throws. */
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
 * Retake Round 3 (Codex P1) — the ONLY error type `probeVideoMetadata` ever
 * throws. Its message is always one of a small, fixed set of strings this
 * module itself writes — never an interpolated raw FFprobe/OS value. This
 * lets `probeThenPublish` trust `instanceof VideoValidationError` as proof a
 * message is safe to surface, instead of trusting that every current AND
 * FUTURE throw site inside `probeVideoMetadata` happens to stay sanitized.
 */
export class VideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoValidationError";
  }
}

async function probeVideoMetadata(absolutePath: string): Promise<PublishedVideoMetadata> {
  let probe: { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } };
  try {
    probe = (await Promise.race([
      runFfprobeJson(absolutePath),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Probe timed out.")), PROBE_TIMEOUT_MS)),
    ])) as typeof probe;
  } catch (e) {
    // A raw FFprobe/execFile failure commonly embeds the absolute server
    // path (and possibly stderr) in its message — logged server-side only,
    // never surfaced to the UI (the ticket's own explicit requirement).
    console.error(`probeVideoMetadata("${absolutePath}") failed:`, e);
    throw new VideoValidationError("Failed to probe this video with FFprobe.");
  }

  const videoStreams = Array.isArray(probe.streams) ? probe.streams.filter((s) => s.codec_type === "video") : [];
  if (videoStreams.length !== 1) {
    throw new VideoValidationError(`File must contain exactly one video stream (found ${videoStreams.length}).`);
  }
  const [stream] = videoStreams;
  const dimensions = { width: Number(stream.width), height: Number(stream.height) };
  if (!hasValidVideoDimensions(dimensions)) {
    throw new VideoValidationError("Video has no valid (positive) dimensions.");
  }
  const duration = probe.format?.duration ? Number(probe.format.duration) : NaN;
  if (!hasPositiveFiniteDuration(duration)) {
    throw new VideoValidationError("Video has no readable, positive duration.");
  }
  return { durationSeconds: duration, width: dimensions.width, height: dimensions.height };
}

/**
 * Retake Round 3 (Codex P1) — the ONE place that decides what a probe
 * failure looks like to a caller. Only a `VideoValidationError` (a type ONLY
 * `probeVideoMetadata` constructs, always with one of its own fixed
 * strings) is ever surfaced verbatim; anything else — including a
 * hypothetical future throw site that isn't sanitized, or an adversarial
 * Error carrying an absolute path/stderr/token in its message — falls back
 * to one fixed, generic reason. Exported so this exact classification logic
 * (not a re-implementation of it) can be proven directly against adversarial
 * input.
 */
export function classifyProbeFailureReason(e: unknown): string {
  return e instanceof VideoValidationError ? e.message : "This video could not be validated.";
}

/** Shared tail: probe the exclusively-written tmp file, publish via atomic rename, or clean up on any failure. Never leaves a tmp file behind on any branch. */
async function probeThenPublish(tmpAbsolute: string, destAbsolute: string, destRelative: string): Promise<PublishVideoResult> {
  let metadata: PublishedVideoMetadata;
  try {
    metadata = await probeVideoMetadata(tmpAbsolute);
  } catch (e) {
    const cleanup = await removeIfExists(tmpAbsolute);
    if (cleanup) console.error(`probeThenPublish: failed to remove leftover temp file "${tmpAbsolute}":`, cleanup);
    if (!(e instanceof VideoValidationError)) {
      console.error(`probeThenPublish("${tmpAbsolute}"): unexpected validation failure:`, e);
    }
    const reason = classifyProbeFailureReason(e);
    return {
      ok: false,
      error: `Failed to validate the video: ${reason}${cleanup ? " Additionally, a leftover temp file could not be removed." : ""}`,
    };
  }

  try {
    await fs.rename(tmpAbsolute, destAbsolute);
  } catch (e) {
    // Fixed, sanitized message — a raw fs.rename error embeds both absolute
    // paths, which must never reach the UI. Logged server-side only.
    console.error(`probeThenPublish: rename("${tmpAbsolute}", "${destAbsolute}") failed:`, e);
    const cleanupErrors = (await Promise.all([removeIfExists(tmpAbsolute), removeIfExists(destAbsolute)])).filter((m): m is string => m !== null);
    return {
      ok: false,
      error: `Failed to publish the video file. Please try again.${cleanupErrors.length > 0 ? " Additionally, failed to remove leftover file(s) on disk." : ""}`,
    };
  }

  return { ok: true, relative: destRelative, metadata };
}

/**
 * Best-effort removal of a file that was just published/copied but whose
 * owning DB write (insert, or a transactional re-verification) then failed
 * or was rolled back — used by both `createShotReferenceVideo` and the two
 * cross-collection bridges. Returns `true` only if the file is confirmed
 * gone (or was already gone); `false` if a leftover, unreferenced file may
 * remain. Never throws, never returns/logs the path to a caller — the
 * concrete path is logged server-side only, so a caller can compose a
 * sanitized, honest UI message from the boolean alone.
 */
export async function removeOrphanedPublishedFile(absolutePath: string, context: string): Promise<boolean> {
  const detail = await removeIfExists(absolutePath);
  if (detail) {
    console.error(`${context}: failed to remove an orphaned published file "${absolutePath}":`, detail);
    return false;
  }
  return true;
}

type FileLike = {
  size: number;
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["size"] === "number" &&
    typeof (value as Record<string, unknown>)["name"] === "string" &&
    typeof (value as Record<string, unknown>)["arrayBuffer"] === "function"
  );
}

export type UploadValidationErrorCode = "missing_file" | "file_too_large" | "invalid_file_type" | "invalid_file_content";

export class UploadValidationError extends Error {
  code: UploadValidationErrorCode;
  constructor(code: UploadValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "UploadValidationError";
  }
}

/**
 * Direct user upload. Validates size, extension, and REAL magic bytes (never
 * the claimed extension/MIME alone) before any disk write. Writes with the
 * `wx` flag (exclusive create — fails if the fresh uuid name somehow already
 * exists, never silently overwrites) to a `.tmp<ext>` name, then delegates
 * to the shared probe-then-publish tail.
 */
export async function publishUploadedVideoBuffer(fileValue: unknown, destFor: DestFor): Promise<PublishVideoResult | { ok: false; validationError: UploadValidationError }> {
  if (!isFileLike(fileValue) || fileValue.size <= 0) {
    return { ok: false, validationError: new UploadValidationError("missing_file", "No file provided.") };
  }
  if (fileValue.size > MAX_REFERENCE_VIDEO_SIZE_BYTES) {
    return { ok: false, validationError: new UploadValidationError("file_too_large", "File exceeds the 500 MiB limit.") };
  }
  const ext = path.extname(fileValue.name).toLowerCase();
  if (!ALLOWED_REFERENCE_VIDEO_EXTENSIONS.has(ext)) {
    return { ok: false, validationError: new UploadValidationError("invalid_file_type", `File type not allowed: ${ext || "(none)"}. Only MP4, WebM, and MOV are accepted.`) };
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  if (!hasAllowedReferenceVideoSignature(buffer, ext)) {
    return { ok: false, validationError: new UploadValidationError("invalid_file_content", "This file's content does not match a valid MP4, WebM, or MOV video, regardless of its name.") };
  }

  const uuid = randomUUID();
  const { relative: destRelative, absolute: destAbsolute } = destFor(uuid, ext);
  const tmpAbsolute = `${destAbsolute}.tmp${ext}`;

  try {
    await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
    await fs.writeFile(tmpAbsolute, buffer, { flag: "wx" });
  } catch {
    // Fixed, sanitized message — a raw fs error (e.g. ENOENT) commonly
    // embeds the absolute server path, which must never reach the UI.
    const cleanup = await removeIfExists(tmpAbsolute);
    if (cleanup) console.error(`publishUploadedVideoBuffer: failed to remove leftover temp file "${tmpAbsolute}":`, cleanup);
    return { ok: false, error: `Failed to write the uploaded video. Please try again.${cleanup ? " Additionally, a leftover temp file could not be removed." : ""}` };
  }

  return probeThenPublish(tmpAbsolute, destAbsolute, destRelative);
}

/**
 * Copies an already-durable, already-once-validated MikAI file (a
 * `shot_videos.videoPath` or `shot_reference_videos.videoPath` row) into a
 * NEW physical location under `destFor` with a fresh UUID name — the two
 * cross-collection bridges ("Duplicate as Video Reference" / "Add to Shot
 * Videos"). No magic-byte re-check (the source already passed one, or is an
 * internally-produced generation/split output that was already
 * ffprobe-validated) — but the copy IS independently re-probed, so a
 * corrupted/short copy or a source file that has since degraded is still
 * caught before publication, and the returned metadata always reflects the
 * actually-copied bytes, never the source row's stored values.
 */
export async function publishCopiedVideoFile(sourceAbsolute: string, ext: string, destFor: DestFor): Promise<PublishVideoResult> {
  const uuid = randomUUID();
  const { relative: destRelative, absolute: destAbsolute } = destFor(uuid, ext);
  const tmpAbsolute = `${destAbsolute}.tmp${ext}`;

  try {
    await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
    await fs.access(sourceAbsolute);
    await fs.copyFile(sourceAbsolute, tmpAbsolute, fs.constants.COPYFILE_EXCL);
  } catch {
    // Fixed, sanitized message — same reasoning as `publishUploadedVideoBuffer`'s own catch above.
    const cleanup = await removeIfExists(tmpAbsolute);
    if (cleanup) console.error(`publishCopiedVideoFile: failed to remove leftover temp file "${tmpAbsolute}":`, cleanup);
    return { ok: false, error: `Failed to copy the source video file. Please try again.${cleanup ? " Additionally, a leftover temp file could not be removed." : ""}` };
  }

  return probeThenPublish(tmpAbsolute, destAbsolute, destRelative);
}
