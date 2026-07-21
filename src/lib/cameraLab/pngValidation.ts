/**
 * CAMLAB.SHOTREF.1 — pure PNG validation for a Gaussian Camera snapshot.
 * No I/O: the Server Action reads bytes and probes the target; this module
 * decides. Reuses the established PNG helpers from SEQGEN.PUSH.2 instead of
 * re-deriving them.
 */

import {
  hasPngSignature,
  hasValidImageDimensions,
  type ImageDimensions,
} from "@/lib/sequenceVideoPush/imageValidation";
import { MAX_REFERENCE_IMAGE_SIZE_BYTES } from "@/lib/uploadImage";

/** PNG spec bound: width/height are 31-bit positive integers. */
const PNG_MAX_DIMENSION = 2_147_483_647;

/**
 * Parses the real IHDR dimensions of a PNG buffer. Returns null unless the
 * buffer starts with the PNG signature AND its first chunk is a well-formed
 * 13-byte IHDR carrying positive, in-spec dimensions. Truncated headers,
 * foreign first chunks, zero/overflow dimensions all return null — the
 * filename or MIME type never participates.
 */
export function parsePngDimensions(buf: Buffer): ImageDimensions | null {
  if (!hasPngSignature(buf)) return null;
  // signature(8) + length(4) + "IHDR"(4) + data(13) = 29 bytes minimum
  if (buf.length < 29) return null;
  const ihdrLength = buf.readUInt32BE(8);
  if (ihdrLength !== 13) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const dimensions = { width, height };
  if (!hasValidImageDimensions(dimensions)) return null;
  if (width > PNG_MAX_DIMENSION || height > PNG_MAX_DIMENSION) return null;
  return dimensions;
}

export type SnapshotPngCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

/**
 * Full acceptance rule for a captured snapshot: a real, size-bounded PNG
 * whose IHDR dimensions equal the target reference's REAL dimensions
 * exactly. The 10 MB limit is the existing global Reference Images limit
 * (`MAX_REFERENCE_IMAGE_SIZE_BYTES`), deliberately unchanged — an over-limit
 * exact capture is refused, never compressed, converted or downscaled.
 */
export function validateSnapshotPng(
  buf: Buffer,
  expected: ImageDimensions
): SnapshotPngCheck {
  if (!hasValidImageDimensions(expected)) {
    return { ok: false, error: "The target reference image's real dimensions could not be established." };
  }
  if (buf.length === 0) {
    return { ok: false, error: "The captured snapshot is empty." };
  }
  if (buf.length > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      error: `The captured PNG is ${(buf.length / (1024 * 1024)).toFixed(1)} MB, above the 10 MB Reference Images limit. An exact capture at this resolution cannot be added without changing its resolution; no compressed or downscaled version is produced.`,
    };
  }
  const dimensions = parsePngDimensions(buf);
  if (!dimensions) {
    return { ok: false, error: "The captured file is not a valid PNG." };
  }
  if (dimensions.width !== expected.width || dimensions.height !== expected.height) {
    return {
      ok: false,
      error: `The captured PNG is ${dimensions.width} x ${dimensions.height} but the target reference image is ${expected.width} x ${expected.height}. The snapshot must match the source resolution exactly.`,
    };
  }
  return { ok: true, width: dimensions.width, height: dimensions.height };
}

/**
 * String-level confinement predicate for a DB-authorized reference image
 * path: must live under `uploads/` with no traversal, no backslash, no
 * absolute path, no empty segment. The Server Action additionally resolves
 * the real path (symlinks included) under `public/uploads` before probing.
 */
export function isConfinableUploadsPath(imagePath: string): boolean {
  if (typeof imagePath !== "string" || imagePath.length === 0 || imagePath.length > 1024) return false;
  if (!imagePath.startsWith("uploads/")) return false;
  if (imagePath.includes("\\") || imagePath.includes("\0") || imagePath.includes("%")) return false;
  const segments = imagePath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return true;
}
