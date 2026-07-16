// ---------------------------------------------------------------------------
// storyboardExtraction/ratioCrop.ts — SEQGEN.STORYBOARD.EXTRACT.1-FIX6 (Lot C)
//
// Pure ratio + size-multiplier computation, composing with contentCrop.ts's
// computeContentCropRect: the full deterministic pipeline is
//   base cell -> Content Crop (header/caption %) -> ratio -> multiplier -> clamp
// always starting from the SAME stable base rect (contentCrop.ts's
// ContentCropBaseRects), never from the last preview — this is what makes a
// repeated "Apply Ratio All" click idempotent and lets "Full cell"/"Manual"
// keep working exactly as FIX5 established.
//
// No DB/filesystem access — safe to import from both server actions and
// client components (bundled into ApplyRatioAllButton and RegionCropBox).
// ---------------------------------------------------------------------------

import { computeContentCropRect, type ContentCropMode, type Rect } from "./contentCrop";

export type RatioPreset = "free" | "19:9" | "2.35:1" | "2.38:1";

export const RATIO_PRESETS: readonly RatioPreset[] = ["free", "19:9", "2.35:1", "2.38:1"];

export function isRatioPreset(value: string): value is RatioPreset {
  return (RATIO_PRESETS as readonly string[]).includes(value);
}

/** width/height for every non-"free" preset. "19:9" is kept literal — never silently swapped for the far more common "16:9". */
export const RATIO_VALUES: Record<Exclude<RatioPreset, "free">, number> = {
  "19:9": 19 / 9,
  "2.35:1": 2.35,
  "2.38:1": 2.38,
};

export function ratioValueOf(preset: RatioPreset): number | null {
  return preset === "free" ? null : RATIO_VALUES[preset];
}

export const MIN_SIZE_MULTIPLIER = 0.1;
export const MAX_SIZE_MULTIPLIER = 1.0;

export function isValidSizeMultiplier(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_SIZE_MULTIPLIER && n <= MAX_SIZE_MULTIPLIER;
}

const MIN_RATIO_RESULT_PX = 8; // matches contentCrop.ts's MIN_RESULT_HEIGHT_PX / RegionCropBox's MIN_SIZE_PX

/**
 * Applies a ratio preset to `cell`, keeping its width and computing
 * `height = round(width / ratio)`, vertically centered within `cell`.
 * "free" is an identity transform. Returns null — never a silently
 * width-adjusted rectangle — when the cell isn't tall enough at its current
 * width to hold the requested ratio (the cell is already wider, relative to
 * its own height, than the target ratio allows): the caller must surface
 * this as a clear refusal, not apply anything.
 */
export function computeRatioRect(cell: Rect, ratio: RatioPreset): Rect | null {
  if (ratio === "free") return { ...cell };
  const ratioValue = RATIO_VALUES[ratio];
  const newHeight = Math.round(cell.width / ratioValue);
  if (newHeight < MIN_RATIO_RESULT_PX || newHeight > cell.height) return null;
  const y = cell.y + Math.round((cell.height - newHeight) / 2);
  return { x: cell.x, y, width: cell.width, height: newHeight };
}

/** Shrinks `rect` around its own center by `multiplier` (bounded [0.10, 1.00] by the caller). Never grows — multiplier > 1 is out of range and rejected upstream. */
export function computeMultiplierRect(rect: Rect, multiplier: number): Rect {
  const newWidth = Math.max(MIN_RATIO_RESULT_PX, Math.round(rect.width * multiplier));
  const newHeight = Math.max(MIN_RATIO_RESULT_PX, Math.round(rect.height * multiplier));
  const x = rect.x + Math.round((rect.width - newWidth) / 2);
  const y = rect.y + Math.round((rect.height - newHeight) / 2);
  return { x, y, width: newWidth, height: newHeight };
}

/** Final clamp against the source image bounds — a no-op in the common case (ratio/multiplier only ever shrink within an already-in-bounds cell), defensive against rounding pushing a rect a pixel outside. */
export function clampRectToImageBounds(rect: Rect, sourceWidth: number, sourceHeight: number): Rect {
  let width = Math.min(rect.width, sourceWidth);
  let height = Math.min(rect.height, sourceHeight);
  let x = Math.max(0, Math.min(rect.x, sourceWidth - width));
  let y = Math.max(0, Math.min(rect.y, sourceHeight - height));
  width = Math.min(width, sourceWidth - x);
  height = Math.min(height, sourceHeight - y);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export type RatioPipelineParams = {
  baseCell: Rect;
  contentCropMode: ContentCropMode;
  headerPercent: number;
  captionPercent: number;
  ratio: RatioPreset;
  sizeMultiplier: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type RatioPipelineResult = { ok: true; rect: Rect } | { ok: false; error: string };

/**
 * The full deterministic pipeline (FIX6 Lot C): Content Crop -> ratio ->
 * multiplier -> clamp, always computed from `baseCell` (the region's stable
 * base rect, never the last preview). "manual" content-crop mode is NOT
 * special-cased here — a caller that wants "leave it alone" for manual
 * should skip calling this pipeline entirely, exactly as
 * ApplyToAllRegionsButton already does for plain Content Crop.
 */
export function computeRatioPipeline(params: RatioPipelineParams): RatioPipelineResult {
  const afterContentCrop = computeContentCropRect(params.baseCell, params.contentCropMode, params.headerPercent, params.captionPercent);
  const afterRatio = computeRatioRect(afterContentCrop, params.ratio);
  if (afterRatio === null) {
    return {
      ok: false,
      error: `Cannot apply ratio ${params.ratio}: this region is not tall enough at its current width to hold that ratio.`,
    };
  }
  const afterMultiplier = computeMultiplierRect(afterRatio, params.sizeMultiplier);
  const clamped = clampRectToImageBounds(afterMultiplier, params.sourceWidth, params.sourceHeight);
  return { ok: true, rect: clamped };
}
