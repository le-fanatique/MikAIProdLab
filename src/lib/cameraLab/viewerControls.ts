// ---------------------------------------------------------------------------
// viewerControls.ts — CAMLAB.VIEWER.CONTROLS.1
//
// Pure, deterministic numeric contracts for the Gaussian Viewer's depth
// correction and wheel dolly precision. No DOM, no PlayCanvas globals —
// only plain numbers and `{x,y,z}` structures so this module is testable
// without a browser/GPU. `GaussianViewerPanel.tsx` is the only caller;
// this module never touches the PLY file itself.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Depth scale
// ---------------------------------------------------------------------------

export const DEPTH_SCALE_MIN = 0.1;
export const DEPTH_SCALE_MAX = 2.0;
export const DEPTH_SCALE_DEFAULT = 1.0;
export const DEPTH_SCALE_STEP = 0.01;

/** Clamps to `[0.10, 2.00]`; non-finite input falls back to the default (`1.00`), never `NaN`. */
export function clampDepthScale(value: number): number {
  if (!Number.isFinite(value)) return DEPTH_SCALE_DEFAULT;
  return Math.min(DEPTH_SCALE_MAX, Math.max(DEPTH_SCALE_MIN, value));
}

export type Vec3Like = { x: number; y: number; z: number };
export type LocalAabb = { center: Vec3Like; halfExtents: Vec3Like };
export type WorldAabb = { center: Vec3Like; halfExtents: Vec3Like };

function finiteOr0(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Transforms a LOCAL-space SHARP AABB `{center, halfExtents}` into WORLD
 * space for camera framing — applying EXACTLY the same 180° X rotation and
 * local Z scale the `sharp-splat` entity itself carries, once, never
 * twice. Mirrors `splatParent.setEulerAngles(180,0,0)` +
 * `splatParent.setLocalScale(1,1,depthScale)`:
 *   - world center   = (x, -y, -(z * depthScale))
 *   - world halfExts = (hx, hy, hz * depthScale)
 * Non-finite input coordinates are treated as 0; `depthScale` is clamped
 * the same way the slider itself clamps it. Half-extents are always
 * non-negative.
 */
export function transformLocalAabbToWorld(aabb: LocalAabb, depthScale: number): WorldAabb {
  const d = clampDepthScale(depthScale);
  return {
    center: {
      x: finiteOr0(aabb.center.x),
      y: -finiteOr0(aabb.center.y),
      z: -(finiteOr0(aabb.center.z) * d),
    },
    halfExtents: {
      x: Math.abs(finiteOr0(aabb.halfExtents.x)),
      y: Math.abs(finiteOr0(aabb.halfExtents.y)),
      z: Math.abs(finiteOr0(aabb.halfExtents.z) * d),
    },
  };
}

// ---------------------------------------------------------------------------
// Initial orbit — same numeric contract as the existing
// `computeInitialOrbit`, extracted so it can be tested against the
// depth-transformed bounds without a `pc.Vec3`/PlayCanvas dependency.
// ---------------------------------------------------------------------------

export type OrbitStateData = {
  yaw: number;
  pitch: number;
  distance: number;
  target: Vec3Like;
};

function vecLength(v: Vec3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function computeInitialOrbitFromAabb(aabb: WorldAabb | null): OrbitStateData {
  if (aabb) {
    const radius = Math.max(vecLength(aabb.halfExtents), 0.1);
    return {
      yaw: 0,
      pitch: 0,
      distance: Math.max(radius * 0.9, 0.3),
      target: { x: aabb.center.x, y: aabb.center.y, z: aabb.center.z },
    };
  }
  return { yaw: 0, pitch: 0, distance: 2, target: { x: 0, y: 0, z: -2 } };
}

// ---------------------------------------------------------------------------
// Wheel dolly — deltaMode normalization, sensitivity presets, Alt fine-dolly,
// next-distance calculation.
// ---------------------------------------------------------------------------

/** Standard `WheelEvent.deltaMode` values, restated so this module never imports `lib.dom` constants. */
export const WHEEL_DELTA_MODE_PIXEL = 0;
export const WHEEL_DELTA_MODE_LINE = 1;
export const WHEEL_DELTA_MODE_PAGE = 2;

export const WHEEL_DELTA_LINE_UNIT_PX = 16;
export const WHEEL_NORMALIZED_CLAMP = 100;

/**
 * Normalizes `deltaY` to a pixel-equivalent unit and clamps to
 * `[-100, 100]` — pixel mode passes through as-is, line mode multiplies by
 * 16px/line, page mode multiplies by the real viewport height. Non-finite
 * `deltaY` normalizes to `0` (no movement), never `NaN`.
 */
export function normalizeWheelDelta(deltaY: number, deltaMode: number, viewportHeight: number): number {
  if (!Number.isFinite(deltaY)) return 0;
  const unit =
    deltaMode === WHEEL_DELTA_MODE_LINE
      ? WHEEL_DELTA_LINE_UNIT_PX
      : deltaMode === WHEEL_DELTA_MODE_PAGE
        ? Number.isFinite(viewportHeight) && viewportHeight > 0
          ? viewportHeight
          : 800
        : 1;
  const scaled = deltaY * unit;
  if (!Number.isFinite(scaled)) return 0;
  return Math.min(WHEEL_NORMALIZED_CLAMP, Math.max(-WHEEL_NORMALIZED_CLAMP, scaled));
}

export type ZoomSensitivityPreset = "Fine" | "Normal" | "Fast";

/** Fixed, documented coefficients — `Fast` intentionally close to the pre-ticket historical constant (`0.0011`). */
export const ZOOM_SENSITIVITY_COEFFICIENTS: Record<ZoomSensitivityPreset, number> = {
  Fine: 0.00025,
  Normal: 0.0006,
  Fast: 0.0011,
};

export const ZOOM_SENSITIVITY_DEFAULT: ZoomSensitivityPreset = "Normal";

export const ZOOM_SENSITIVITY_PRESETS: readonly ZoomSensitivityPreset[] = ["Fine", "Normal", "Fast"];

export function isZoomSensitivityPreset(value: unknown): value is ZoomSensitivityPreset {
  return value === "Fine" || value === "Normal" || value === "Fast";
}

/** Reads a possibly-absent/corrupt persisted preset — falls back silently to `Normal`, never throws. */
export function parseZoomSensitivityPreset(value: unknown): ZoomSensitivityPreset {
  return isZoomSensitivityPreset(value) ? value : ZOOM_SENSITIVITY_DEFAULT;
}

export const ALT_WHEEL_MULTIPLIER = 0.2;

/** The current preset's coefficient, `×0.2` while Alt is held. */
export function resolveWheelCoefficient(preset: ZoomSensitivityPreset, altKey: boolean): number {
  const base = ZOOM_SENSITIVITY_COEFFICIENTS[preset] ?? ZOOM_SENSITIVITY_COEFFICIENTS[ZOOM_SENSITIVITY_DEFAULT];
  return altKey ? base * ALT_WHEEL_MULTIPLIER : base;
}

export const DOLLY_DISTANCE_MIN = 0.05;
export const DOLLY_DISTANCE_MAX = 500;

/**
 * `distance * exp(normalizedDelta * coefficient)`, bounded to
 * `[0.05, 500]`. Any non-finite input is treated as its neutral value
 * (distance falls back to the minimum bound, delta/coefficient to `0`),
 * and the result is always finite.
 */
export function computeNextDollyDistance(distance: number, normalizedDelta: number, coefficient: number): number {
  const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : DOLLY_DISTANCE_MIN;
  const safeDelta = Number.isFinite(normalizedDelta) ? normalizedDelta : 0;
  const safeCoefficient = Number.isFinite(coefficient) ? coefficient : ZOOM_SENSITIVITY_COEFFICIENTS[ZOOM_SENSITIVITY_DEFAULT];
  const next = safeDistance * Math.exp(safeDelta * safeCoefficient);
  if (!Number.isFinite(next)) return safeDistance;
  return Math.min(DOLLY_DISTANCE_MAX, Math.max(DOLLY_DISTANCE_MIN, next));
}
