// ---------------------------------------------------------------------------
// imageValidation.ts — SEQGEN.PUSH.2
//
// Pure: no I/O. The PNG magic-byte check used by `extractFirstFrame` before
// it even bothers invoking ffprobe — a fast, dependency-free rejection of
// anything that isn't even a PNG container, independently testable without
// touching the filesystem or a real FFmpeg binary.
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Whether `buf` starts with the 8-byte PNG file signature. A non-empty, non-zero-size file that fails this check is not a PNG at all, regardless of what its extension claims. */
export function hasPngSignature(buf: Buffer): boolean {
  if (buf.length < PNG_SIGNATURE.length) return false;
  return buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

export type ImageDimensions = { width: number; height: number };

/** Whether `dimensions` describes a real, positive, finite image size — never accepts a `0×0`, negative, `NaN`, or missing dimension a corrupt/truncated decode can report. */
export function hasValidImageDimensions(dimensions: ImageDimensions | null | undefined): dimensions is ImageDimensions {
  return !!dimensions && Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height) && dimensions.width > 0 && dimensions.height > 0;
}
