// ---------------------------------------------------------------------------
// uploadReferenceImage.ts — STYLE.1.B.CORE
//
// Dedicated, confined upload path for Project Style Reference Board images.
// Deliberately NOT a reuse of `src/lib/uploadImage.ts::saveReferenceImage`
// (the ticket's explicit instruction): that helper trusts the client-declared
// filename extension, accepts GIF, and silently no-ops on delete failure.
// This helper:
//   - never trusts the declared extension/MIME — only real magic bytes;
//   - accepts PNG/JPEG/WebP only (no GIF, no SVG);
//   - writes to an exclusive temp path, verifies the bytes are actually a
//     fully decodable image via the bundled FFmpeg (same real-decode gate as
//     src/lib/cameraLab/decodePng.ts::isFullyDecodableImage), THEN publishes
//     atomically (fs.rename) — an invalid file is never visible under the
//     final path;
//   - confines every path under `uploads/project-style/references/`.
// ---------------------------------------------------------------------------

import { mkdir, writeFile, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isFullyDecodableImage } from "@/lib/cameraLab/decodePng";
import { runFfprobeJson } from "@/lib/ffmpeg";

export const MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export const REFERENCE_IMAGES_ROOT = path.join("uploads", "project-style", "references");

export type UploadReferenceImageErrorCode =
  | "missing_file"
  | "file_too_large"
  | "invalid_file_type"
  | "not_decodable"
  | "publish_failed";

export class UploadReferenceImageError extends Error {
  code: UploadReferenceImageErrorCode;

  constructor(code: UploadReferenceImageErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "UploadReferenceImageError";
  }
}

type FileLike = {
  size: number;
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["size"] === "number" &&
    typeof (value as Record<string, unknown>)["name"] === "string" &&
    typeof (value as Record<string, unknown>)["arrayBuffer"] === "function"
  );
}

type DetectedFormat = { ext: "png" | "jpg" | "webp" };

/** Detects the real image format from magic bytes only — the declared filename/MIME never participates. Returns null for anything else (including GIF/SVG/truncated/unknown data). */
function detectFormat(buf: Buffer): DetectedFormat | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: "webp" };
  }
  return null;
}

const SAFE_PROJECT_SUBFOLDER = /^project-\d+$/;

export type SavedReferenceImage = {
  imagePath: string;
  sourceFilename: string | null;
  width: number;
  height: number;
};

/**
 * Validates and durably saves one Reference Board upload for `projectId`.
 * Throws `UploadReferenceImageError` on any refusal — the caller must ensure
 * no DB row is ever created when this throws, since no file is published in
 * that case (the temp file is unlinked before the error is thrown).
 */
export async function saveProjectStyleReferenceImage(
  fileValue: unknown,
  projectId: number
): Promise<SavedReferenceImage> {
  const subfolder = `project-${projectId}`;
  if (!SAFE_PROJECT_SUBFOLDER.test(subfolder)) {
    throw new UploadReferenceImageError("invalid_file_type", "Invalid project subfolder.");
  }

  if (!isFileLike(fileValue) || fileValue.size <= 0) {
    throw new UploadReferenceImageError("missing_file", "No file provided.");
  }
  if (fileValue.size > MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES) {
    throw new UploadReferenceImageError("file_too_large", "File exceeds the 10 MB limit.");
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  // `fileValue.size` is a caller-declared field, not proof of the real byte
  // count materialized above — re-check the actual buffer, never trust the
  // declared size alone for the 10 MB gate.
  if (buffer.length <= 0) {
    throw new UploadReferenceImageError("missing_file", "No file provided.");
  }
  if (buffer.length > MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES) {
    throw new UploadReferenceImageError("file_too_large", "File exceeds the 10 MB limit.");
  }

  const format = detectFormat(buffer);
  if (!format) {
    throw new UploadReferenceImageError(
      "invalid_file_type",
      "Only PNG, JPEG or WebP files are accepted (verified by content, not by filename)."
    );
  }

  const absoluteDir = path.join(process.cwd(), "public", REFERENCE_IMAGES_ROOT, subfolder);
  await mkdir(absoluteDir, { recursive: true });

  const uuid = randomUUID();
  const tempAbsolutePath = path.join(absoluteDir, `.tmp-${uuid}`);
  const finalFilename = `${uuid}.${format.ext}`;
  const finalAbsolutePath = path.join(absoluteDir, finalFilename);

  // Exclusive ("wx"): fails loudly instead of silently overwriting if the
  // UUID temp path somehow already exists, rather than the default
  // create-or-truncate flag.
  await writeFile(tempAbsolutePath, buffer, { flag: "wx" });

  const decodable = await isFullyDecodableImage(tempAbsolutePath);
  if (!decodable) {
    throw await withTempCleanupNote(
      tempAbsolutePath,
      new UploadReferenceImageError("not_decodable", "The uploaded file could not be decoded as a real image.")
    );
  }

  let width: number | null = null;
  let height: number | null = null;
  try {
    const probed = (await runFfprobeJson(tempAbsolutePath)) as {
      streams?: { width?: number; height?: number }[];
    };
    const stream = probed.streams?.find((s) => typeof s.width === "number" && typeof s.height === "number");
    if (stream && typeof stream.width === "number" && typeof stream.height === "number") {
      width = stream.width;
      height = stream.height;
    }
  } catch {
    width = null;
    height = null;
  }

  if (!width || !height || width <= 0 || height <= 0) {
    throw await withTempCleanupNote(
      tempAbsolutePath,
      new UploadReferenceImageError("not_decodable", "The uploaded file's real dimensions could not be established.")
    );
  }

  try {
    await rename(tempAbsolutePath, finalAbsolutePath);
  } catch (err) {
    throw await withTempCleanupNote(
      tempAbsolutePath,
      new UploadReferenceImageError(
        "publish_failed",
        `Failed to publish the uploaded file: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }

  const imagePath = path.posix.join(REFERENCE_IMAGES_ROOT.split(path.sep).join("/"), subfolder, finalFilename);
  return { imagePath, sourceFilename: normalizeSourceFilename(fileValue.name), width, height };
}

const MAX_SOURCE_FILENAME_LENGTH = 255;

/** `fileValue.name` is untrusted client input, stored only as a display label — never used to build a filesystem path. Strips control characters and path separators (defense in depth, since a stray `/`/`\` here could otherwise look like a path fragment to a future reader) and bounds its length. */
function normalizeSourceFilename(raw: string): string | null {
  if (typeof raw !== "string") return null;
  // Character-by-character filtering (no regex hex-escape ambiguity):
  // drop ASCII control characters (code <= 0x1F), DEL (0x7F), and the two
  // path separators — this is a display label, never a path fragment.
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f || ch === "/" || ch === "\\") continue;
    out += ch;
  }
  const stripped = out.trim();
  if (stripped.length === 0) return null;
  return stripped.slice(0, MAX_SOURCE_FILENAME_LENGTH);
}

/**
 * Attempts to remove the temp file at `tempPath` and returns the error to
 * throw — never throws itself, so a caller can `throw await
 * withTempCleanupNote(...)` as a literal `throw` statement (preserving
 * TypeScript's control-flow narrowing, unlike an awaited call to a
 * `never`-returning async helper). If the cleanup fails for any reason
 * other than "already gone" (ENOENT), that failure and the exact path are
 * appended to `primaryError`'s message rather than swallowed — a caller
 * must never see a message implying cleanup succeeded when a temp file was
 * actually left behind.
 */
async function withTempCleanupNote(tempPath: string, primaryError: UploadReferenceImageError): Promise<UploadReferenceImageError> {
  try {
    await unlink(tempPath);
  } catch (cleanupErr) {
    if ((cleanupErr as NodeJS.ErrnoException)?.code !== "ENOENT") {
      return new UploadReferenceImageError(
        primaryError.code,
        `${primaryError.message} Additionally, failed to remove the temporary file ("${tempPath}"): ${
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        }`
      );
    }
  }
  return primaryError;
}

const SAFE_ROOT = REFERENCE_IMAGES_ROOT.split(path.sep).join("/");

/** String-level confinement predicate for a stored `imagePath` before any filesystem operation touches it. */
export function isConfinedReferenceImagePath(imagePath: string): boolean {
  if (typeof imagePath !== "string" || imagePath.length === 0 || imagePath.length > 1024) return false;
  if (!imagePath.startsWith(`${SAFE_ROOT}/`)) return false;
  if (imagePath.includes("..") || imagePath.includes("\\") || imagePath.includes("\0")) return false;
  return true;
}

export type DeletePublishedImageResult =
  | { outcome: "deleted" }
  | { outcome: "already_absent" }
  | { outcome: "failed"; error: string };

/**
 * Deletes a published reference image file and reports exactly what
 * happened — deliberately NOT a "never throws, never tells you" best-effort
 * helper: a caller (e.g. `uploadProjectStyleReferenceAction`'s post-publish
 * compensation) must be able to tell a real cleanup failure apart from a
 * genuine no-op, so it never claims "the uploaded file was cleaned up" when
 * that never actually happened.
 */
export async function deleteStoredProjectStyleReferenceImage(imagePath: string | null): Promise<DeletePublishedImageResult> {
  if (!imagePath) return { outcome: "already_absent" };
  if (!isConfinedReferenceImagePath(imagePath)) {
    return { outcome: "failed", error: `Refusing to delete an unconfined path ("${imagePath}").` };
  }
  const absolutePath = path.join(process.cwd(), "public", imagePath);
  try {
    await unlink(absolutePath);
    return { outcome: "deleted" };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { outcome: "already_absent" };
    return { outcome: "failed", error: `${absolutePath}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
