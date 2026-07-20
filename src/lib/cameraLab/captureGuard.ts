/**
 * CAMLAB.VIEWER.1 — pure GPU capture-resolution guard. Client-safe (no
 * imports): decides whether an exact `width x height` offscreen render
 * target can be created on the current device, from real WebGL limits read
 * by the caller. Never downscales or substitutes — either the exact
 * resolution is possible, or the capture is refused with a clear reason.
 */

export type GpuCaptureLimits = {
  /** gl.MAX_RENDERBUFFER_SIZE */
  maxRenderBufferSize: number;
  /** gl.MAX_TEXTURE_SIZE — the capture color buffer is a texture */
  maxTextureSize: number;
  /** gl.MAX_VIEWPORT_DIMS[0] */
  maxViewportWidth: number;
  /** gl.MAX_VIEWPORT_DIMS[1] */
  maxViewportHeight: number;
};

export type CaptureResolutionCheck =
  | { ok: true }
  | { ok: false; reason: string };

const CAPTURE_MAX_PIXELS = 268_435_456; // 16384 x 16384 — absolute sanity bound

export function checkCaptureResolution(
  width: number,
  height: number,
  limits: GpuCaptureLimits
): CaptureResolutionCheck {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "Source image dimensions must be positive integers." };
  }
  const limitValues = [
    limits.maxRenderBufferSize,
    limits.maxTextureSize,
    limits.maxViewportWidth,
    limits.maxViewportHeight,
  ];
  if (!limitValues.every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, reason: "GPU limits could not be read from the WebGL context." };
  }
  const maxSide = Math.min(limits.maxRenderBufferSize, limits.maxTextureSize);
  if (width > maxSide || height > maxSide) {
    return {
      ok: false,
      reason: `Capture at ${width} x ${height} exceeds this GPU's maximum render target size (${maxSide} px per side). No downscaled capture is produced.`,
    };
  }
  if (width > limits.maxViewportWidth || height > limits.maxViewportHeight) {
    return {
      ok: false,
      reason: `Capture at ${width} x ${height} exceeds this GPU's maximum viewport (${limits.maxViewportWidth} x ${limits.maxViewportHeight}). No downscaled capture is produced.`,
    };
  }
  if (width * height > CAPTURE_MAX_PIXELS) {
    return {
      ok: false,
      reason: `Capture at ${width} x ${height} exceeds the maximum supported pixel count. No downscaled capture is produced.`,
    };
  }
  return { ok: true };
}
