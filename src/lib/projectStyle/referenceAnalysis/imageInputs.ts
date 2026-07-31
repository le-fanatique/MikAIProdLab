// ---------------------------------------------------------------------------
// imageInputs.ts — STYLE.1.B.ANALYSIS.CORE
//
// Re-validates and reads the real bytes of already-uploaded Reference Board
// images for one analysis Run. Deliberately does NOT reuse or extend
// `uploadReferenceImage.ts`'s save path — this module never writes a file,
// it only re-confirms an already-published Reference is still exactly what
// the DB row claims before it is ever sent to a provider. Server-only: real
// filesystem reads plus the bundled FFmpeg decode/probe gate.
// ---------------------------------------------------------------------------

import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isFullyDecodableImage } from "@/lib/cameraLab/decodePng";
import { runFfprobeJson } from "@/lib/ffmpeg";
import {
  isConfinedReferenceImagePath,
  MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES,
} from "@/lib/projectStyle/uploadReferenceImage";
import { REFERENCE_ANALYSIS_LIMITS } from "./contracts";

export type PreparedReferenceImage = {
  referenceId: number;
  imageSha256: string;
  mimeType: string;
  width: number;
  height: number;
  /** Raw base64 (no data-URL prefix). Never persisted, logged, or returned to a client — consumed once by `provider.ts` to build the outbound message, then discarded. */
  base64: string;
};

export type PrepareImagesResult =
  | { ok: true; images: PreparedReferenceImage[] }
  | { ok: false; error: string };

type ImageMagic = { ext: "png" | "jpg" | "webp"; mimeType: "image/png" | "image/jpeg" | "image/webp" };

/** Real-content format sniff — mirrors `uploadReferenceImage.ts`'s private `detectFormat`, re-applied here at READ time (never trusts the DB row's/upload-time claim alone). */
function detectFormat(buf: Buffer): ImageMagic | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mimeType: "image/png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mimeType: "image/jpeg" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", mimeType: "image/webp" };
  }
  return null;
}

/**
 * Reads, re-verifies and hashes the real bytes of every selected Reference's
 * stored image, in order. `references` must already be ownership/approval
 * checked by the caller — this function only re-confirms the FILE itself is
 * a confined, real, decodable image within limits. Refuses the whole batch
 * (no partial result) on the first failure.
 */
export async function prepareReferenceImagesForAnalysis(
  references: { referenceId: number; imagePath: string }[]
): Promise<PrepareImagesResult> {
  const images: PreparedReferenceImage[] = [];
  let totalBytes = 0;

  for (const ref of references) {
    if (!isConfinedReferenceImagePath(ref.imagePath)) {
      return { ok: false, error: `Reference ${ref.referenceId}: stored path is not confined.` };
    }

    const absolutePath = path.join(process.cwd(), "public", ref.imagePath);
    let buffer: Buffer;
    try {
      buffer = await readFile(absolutePath);
    } catch {
      return { ok: false, error: `Reference ${ref.referenceId}: stored file is missing or unreadable.` };
    }

    if (buffer.length <= 0) {
      return { ok: false, error: `Reference ${ref.referenceId}: stored file is empty.` };
    }
    if (buffer.length > MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES) {
      return { ok: false, error: `Reference ${ref.referenceId}: stored file exceeds the per-file size limit.` };
    }

    totalBytes += buffer.length;
    if (totalBytes > REFERENCE_ANALYSIS_LIMITS.maxTotalRawBytes) {
      return { ok: false, error: `Selected references exceed the total ${REFERENCE_ANALYSIS_LIMITS.maxTotalRawBytes} byte limit.` };
    }

    const magic = detectFormat(buffer);
    if (!magic) {
      return { ok: false, error: `Reference ${ref.referenceId}: stored file is not a real PNG, JPEG or WebP.` };
    }

    const decodable = await isFullyDecodableImage(absolutePath);
    if (!decodable) {
      return { ok: false, error: `Reference ${ref.referenceId}: stored file could not be decoded.` };
    }

    let width: number | null = null;
    let height: number | null = null;
    try {
      const probed = (await runFfprobeJson(absolutePath)) as { streams?: { width?: number; height?: number }[] };
      const stream = probed.streams?.find((s) => typeof s.width === "number" && typeof s.height === "number");
      if (stream) {
        width = stream.width as number;
        height = stream.height as number;
      }
    } catch {
      width = null;
      height = null;
    }
    if (!width || !height || width <= 0 || height <= 0) {
      return { ok: false, error: `Reference ${ref.referenceId}: real dimensions could not be established.` };
    }

    images.push({
      referenceId: ref.referenceId,
      imageSha256: createHash("sha256").update(buffer).digest("hex"),
      mimeType: magic.mimeType,
      width,
      height,
      base64: buffer.toString("base64"),
    });
  }

  return { ok: true, images };
}
