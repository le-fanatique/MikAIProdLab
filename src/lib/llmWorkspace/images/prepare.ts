// ---------------------------------------------------------------------------
// images/prepare.ts — LLMW.DESCRIPTOR.IMAGE.1 (B16a)
//
// Re-reads and re-validates the real bytes of already-stored images at CALL
// time, for one workspace operation that declares `descriptor.images`. Never
// writes a file: it only re-confirms that a row's `imagePath` still points at
// a confined, real, decodable image within bounds before those bytes are ever
// handed to a provider. Server-only — real filesystem reads plus the bundled
// FFmpeg decode/probe gate.
//
// **Deliberate duplication, decided by the user on 2026-08-18.**
// `src/lib/projectStyle/referenceAnalysis/imageInputs.ts` performs the same
// re-validation for Project Style's Reference Board. It is not refactored into
// this module, and this module does not call it, for two reasons the user
// weighed and accepted:
//
//   - that file has no test anywhere under `tests/`, so extracting a shared
//     core from a hardened security gate could not be proven safe today;
//   - `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.9 requires that exact gate to
//     survive the B20 migration untouched.
//
// The duplication is therefore scheduled, not forgotten: **B20 collapses the
// two**, since migrating that action into the registry is its whole purpose.
// Do not add a third copy — a new image family declares an entry in
// `images/registry.ts` and reuses this preparer.
//
// The two differences from `imageInputs.ts` are not accidents. Every bound
// here is passed in by the caller (the descriptor declares them, §3 of the
// ticket) rather than read off one domain's constants, and each image carries
// an opaque per-run `key` rather than a database id — the identifier the
// prompt and the model's answer both cite (`R1..Rn`).
// ---------------------------------------------------------------------------

import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isFullyDecodableImage } from "@/lib/cameraLab/decodePng";
import { runFfprobeJson } from "@/lib/ffmpeg";

/** One already-resolved, already-ownership-checked row, in the order the user selected it. */
export type ResolvedWorkspaceImage = {
  id: number;
  imagePath: string;
  /** What the prompt may say about this image in words. Never pixels. */
  metadata: Record<string, string | null>;
};

export type PreparedWorkspaceImage = {
  /** Opaque per-run identifier (`R1..Rn`) — what the prompt labels this image as, and what the model's answer cites. Never the database id. */
  key: string;
  id: number;
  metadata: Record<string, string | null>;
  imageSha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  /** Raw base64, no data-URL prefix. Never persisted, logged, or returned to a client — consumed once when the outbound `ChatMessage` is built, then discarded. */
  base64: string;
};

export type PrepareWorkspaceImagesBounds = {
  isConfined: (imagePath: string) => boolean;
  maxFileBytes: number;
  maxTotalBytes: number;
  /** `"R"` produces `R1..Rn`. Declared by the descriptor, never assumed here. */
  keyPrefix: string;
};

export type PrepareWorkspaceImagesResult =
  | { ok: true; images: PreparedWorkspaceImage[] }
  | { ok: false; error: string };

type ImageMagic = { mimeType: PreparedWorkspaceImage["mimeType"] };

/**
 * Real-content format sniff, applied at READ time — the stored row's claim
 * about its own file is never trusted on its own.
 *
 * **GIF is refused on purpose**, although `saveReferenceImage`
 * (`src/lib/uploadImage.ts`) accepts a `.gif` at upload: neither this sniff
 * nor the decode gate below establishes a single still frame for it, and an
 * image the product cannot decode is not an image the product sends to a
 * provider. The refusal is named (`is not a real PNG, JPEG or WebP`), never a
 * silent skip.
 */
function detectFormat(buf: Buffer): ImageMagic | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: "image/jpeg" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp" };
  }
  return null;
}

export function imageKeyForOrdinal(keyPrefix: string, ordinal: number): string {
  return `${keyPrefix}${ordinal + 1}`;
}

/**
 * Reads, re-verifies, hashes and encodes every resolved image, in the order
 * given. `images` must already be ownership/anchor checked by the caller
 * (`images/registry.ts`'s `resolve`) — this function only re-confirms the
 * FILE itself.
 *
 * **Refuses the whole batch on the first failure**, never a partial result: a
 * prompt that labels its images `R1..Rn` and an answer that cites those keys
 * both become incoherent the moment one image silently drops out.
 */
export async function prepareWorkspaceImages(
  images: ResolvedWorkspaceImage[],
  bounds: PrepareWorkspaceImagesBounds
): Promise<PrepareWorkspaceImagesResult> {
  const prepared: PreparedWorkspaceImage[] = [];
  let totalBytes = 0;

  for (let ordinal = 0; ordinal < images.length; ordinal++) {
    const image = images[ordinal];
    const key = imageKeyForOrdinal(bounds.keyPrefix, ordinal);

    if (!bounds.isConfined(image.imagePath)) {
      return { ok: false, error: `Image ${key}: stored path is not confined.` };
    }

    const absolutePath = path.join(process.cwd(), "public", image.imagePath);
    let buffer: Buffer;
    try {
      buffer = await readFile(absolutePath);
    } catch {
      return { ok: false, error: `Image ${key}: stored file is missing or unreadable.` };
    }

    if (buffer.length <= 0) {
      return { ok: false, error: `Image ${key}: stored file is empty.` };
    }
    if (buffer.length > bounds.maxFileBytes) {
      return { ok: false, error: `Image ${key}: stored file exceeds the per-file size limit.` };
    }

    totalBytes += buffer.length;
    if (totalBytes > bounds.maxTotalBytes) {
      return { ok: false, error: `Selected images exceed the total ${bounds.maxTotalBytes} byte limit.` };
    }

    const magic = detectFormat(buffer);
    if (!magic) {
      return { ok: false, error: `Image ${key}: stored file is not a real PNG, JPEG or WebP.` };
    }

    if (!(await isFullyDecodableImage(absolutePath))) {
      return { ok: false, error: `Image ${key}: stored file could not be decoded.` };
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
      return { ok: false, error: `Image ${key}: real dimensions could not be established.` };
    }

    prepared.push({
      key,
      id: image.id,
      metadata: image.metadata,
      imageSha256: createHash("sha256").update(buffer).digest("hex"),
      mimeType: magic.mimeType,
      width,
      height,
      base64: buffer.toString("base64"),
    });
  }

  return { ok: true, images: prepared };
}
