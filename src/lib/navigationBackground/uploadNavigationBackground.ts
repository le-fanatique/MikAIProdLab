// ---------------------------------------------------------------------------
// uploadNavigationBackground.ts — UX.MEDIA.PREVIEW.1
//
// Dedicated, confined upload path for Project/Sequence navigation row
// background images. Mirrors the discipline already established by
// src/lib/projectStyle/uploadReferenceImage.ts (never trust declared
// extension/MIME, real-decode gate via FFmpeg, exclusive temp write, atomic
// publish) but confines every path under
// `uploads/navigation-backgrounds/` — a dedicated root, never shared with
// Project Style references.
// ---------------------------------------------------------------------------

import { mkdir, writeFile, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isFullyDecodableImage } from "@/lib/cameraLab/decodePng";
import { runFfprobeJson } from "@/lib/ffmpeg";

export const MAX_NAVIGATION_BACKGROUND_SIZE_BYTES = 10 * 1024 * 1024;

export const NAVIGATION_BACKGROUNDS_ROOT = path.join("uploads", "navigation-backgrounds");

// Re-exported for existing callers of this module — the actual constants
// live in rowBackgroundOpacity.ts (a plain, Node-free file) so a client
// component can import just the numbers without pulling in this module's
// FFmpeg/fs dependency graph.
export {
  MIN_ROW_BACKGROUND_OPACITY,
  MAX_ROW_BACKGROUND_OPACITY,
  DEFAULT_ROW_BACKGROUND_OPACITY,
  isValidRowBackgroundOpacity,
} from "./rowBackgroundOpacity";

export type UploadNavigationBackgroundErrorCode =
  | "missing_file"
  | "file_too_large"
  | "invalid_file_type"
  | "not_decodable"
  | "publish_failed";

export class UploadNavigationBackgroundError extends Error {
  code: UploadNavigationBackgroundErrorCode;

  constructor(code: UploadNavigationBackgroundErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "UploadNavigationBackgroundError";
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

/** Detects the real image format from magic bytes only — the declared filename/MIME never participates. */
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

export type NavigationBackgroundOwnerKind = "project" | "sequence";

const SAFE_OWNER_SUBFOLDER = /^(project|sequence)-\d+$/;

export type SavedNavigationBackground = {
  imagePath: string;
};

/**
 * Validates and durably saves one navigation row background upload for a
 * given Project or Sequence. Throws `UploadNavigationBackgroundError` on any
 * refusal — the temp file is always unlinked before throwing, so no
 * caller ever needs to clean up after a throw from this function.
 */
export async function saveNavigationBackgroundImage(
  fileValue: unknown,
  ownerKind: NavigationBackgroundOwnerKind,
  ownerId: number
): Promise<SavedNavigationBackground> {
  const subfolder = `${ownerKind}-${ownerId}`;
  if (!SAFE_OWNER_SUBFOLDER.test(subfolder)) {
    throw new UploadNavigationBackgroundError("invalid_file_type", "Invalid owner subfolder.");
  }

  if (!isFileLike(fileValue) || fileValue.size <= 0) {
    throw new UploadNavigationBackgroundError("missing_file", "No file provided.");
  }
  if (fileValue.size > MAX_NAVIGATION_BACKGROUND_SIZE_BYTES) {
    throw new UploadNavigationBackgroundError("file_too_large", "File exceeds the 10 MB limit.");
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  if (buffer.length <= 0) {
    throw new UploadNavigationBackgroundError("missing_file", "No file provided.");
  }
  if (buffer.length > MAX_NAVIGATION_BACKGROUND_SIZE_BYTES) {
    throw new UploadNavigationBackgroundError("file_too_large", "File exceeds the 10 MB limit.");
  }

  const format = detectFormat(buffer);
  if (!format) {
    throw new UploadNavigationBackgroundError(
      "invalid_file_type",
      "Only PNG, JPEG or WebP files are accepted (verified by content, not by filename)."
    );
  }

  const absoluteDir = path.join(process.cwd(), "public", NAVIGATION_BACKGROUNDS_ROOT, subfolder);
  await mkdir(absoluteDir, { recursive: true });

  const uuid = randomUUID();
  const tempAbsolutePath = path.join(absoluteDir, `.tmp-${uuid}`);
  const finalFilename = `${uuid}.${format.ext}`;
  const finalAbsolutePath = path.join(absoluteDir, finalFilename);

  await writeFile(tempAbsolutePath, buffer, { flag: "wx" });

  const decodable = await isFullyDecodableImage(tempAbsolutePath);
  if (!decodable) {
    throw await withTempCleanupNote(
      tempAbsolutePath,
      new UploadNavigationBackgroundError("not_decodable", "The uploaded file could not be decoded as a real image.")
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
      new UploadNavigationBackgroundError("not_decodable", "The uploaded file's real dimensions could not be established.")
    );
  }

  try {
    await rename(tempAbsolutePath, finalAbsolutePath);
  } catch (err) {
    throw await withTempCleanupNote(
      tempAbsolutePath,
      new UploadNavigationBackgroundError(
        "publish_failed",
        `Failed to publish the uploaded file: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }

  const imagePath = path.posix.join(NAVIGATION_BACKGROUNDS_ROOT.split(path.sep).join("/"), subfolder, finalFilename);
  return { imagePath };
}

async function withTempCleanupNote(
  tempPath: string,
  primaryError: UploadNavigationBackgroundError
): Promise<UploadNavigationBackgroundError> {
  try {
    await unlink(tempPath);
  } catch (cleanupErr) {
    if ((cleanupErr as NodeJS.ErrnoException)?.code !== "ENOENT") {
      return new UploadNavigationBackgroundError(
        primaryError.code,
        `${primaryError.message} Additionally, failed to remove the temporary file ("${tempPath}"): ${
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        }`
      );
    }
  }
  return primaryError;
}

const SAFE_ROOT = NAVIGATION_BACKGROUNDS_ROOT.split(path.sep).join("/");

/** String-level confinement predicate for a stored `imagePath` before any filesystem operation touches it. Global-root only — see `isConfinedNavigationBackgroundPathForOwner` for the owner-aware check every mutation must actually use. */
export function isConfinedNavigationBackgroundPath(imagePath: string): boolean {
  if (typeof imagePath !== "string" || imagePath.length === 0 || imagePath.length > 1024) return false;
  if (!imagePath.startsWith(`${SAFE_ROOT}/`)) return false;
  if (imagePath.includes("..") || imagePath.includes("\\") || imagePath.includes("\0")) return false;
  return true;
}

// Retake Round 2 (Codex Round 2 P1) — the exact published filename shape:
// a v4 UUID (as generated by `randomUUID()` in `saveNavigationBackgroundImage`)
// plus one of the three accepted extensions. Rejects anything else (including
// a bare directory traversal disguised as a filename) once the owner
// subfolder itself has already matched.
const PUBLISHED_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i;

/**
 * Owner-aware confinement predicate — the ONE every mutation in
 * `rowBackgrounds.ts`/`deleteProject`/`deleteSequenceRow` must call before
 * touching a stored path on disk. `isConfinedNavigationBackgroundPath` alone
 * only proves the path is somewhere under the shared
 * `uploads/navigation-backgrounds/` root; it says nothing about WHICH
 * owner's subfolder it's actually in. A corrupted/forged row pointing at a
 * DIFFERENT Project's or Sequence's subfolder (or even a differently-typed
 * owner, e.g. a Project row pointing at a `sequence-*` path) would pass the
 * global check and let a mutation rename/delete another owner's file. This
 * requires the path to be EXACTLY
 * `uploads/navigation-backgrounds/{ownerKind}-{ownerId}/{uuid}.{ext}` — one
 * path segment for the owner subfolder, one for a validly-shaped published
 * filename, nothing more.
 */
export function isConfinedNavigationBackgroundPathForOwner(
  imagePath: string,
  ownerKind: NavigationBackgroundOwnerKind,
  ownerId: number
): boolean {
  if (!isConfinedNavigationBackgroundPath(imagePath)) return false;
  const expectedPrefix = `${SAFE_ROOT}/${ownerKind}-${ownerId}/`;
  if (!imagePath.startsWith(expectedPrefix)) return false;
  const rest = imagePath.slice(expectedPrefix.length);
  if (rest.length === 0 || rest.includes("/")) return false;
  return PUBLISHED_FILENAME_RE.test(rest);
}

export type DeletePublishedImageResult =
  | { outcome: "deleted" }
  | { outcome: "already_absent" }
  | { outcome: "failed"; error: string };

/**
 * Deletes a published navigation background file and reports exactly what
 * happened — never a best-effort silent no-op, since a caller's compensation
 * logic must be able to tell a real cleanup failure apart from a genuine
 * no-op.
 */
export async function deleteStoredNavigationBackgroundImage(imagePath: string | null): Promise<DeletePublishedImageResult> {
  if (!imagePath) return { outcome: "already_absent" };
  if (!isConfinedNavigationBackgroundPath(imagePath)) {
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
