// ---------------------------------------------------------------------------
// storyboardExtraction/contentCrop.ts — SEQGEN.STORYBOARD.EXTRACT.1-FIX5
//
// Pure computation of "which part of a detected cell to keep" — header/
// caption band removal expressed as a percentage of the cell's own height.
//
// REVISE fix: presets must be computed from a STABLE per-region reference
// rectangle ("base rect" — the cell's bounds as first detected/added, never
// mutated afterward), not from whatever is currently displayed. Computing
// from the live rectangle made repeated Apply clicks cumulative (each click
// removed another header/caption band from an already-shrunk cell) and made
// "Full cell" unable to restore the original bounds once anything had been
// removed. Base rects are persisted in the extraction's existing `paramsJson`
// (`contentCropBaseRects`, keyed by each region's own orderIndex) — no new
// column, no migration — established once per region at creation time (see
// startStoryboardExtraction / addExtractionRegion) and backfilled
// defensively for any pre-existing extraction that predates this field (see
// resizeAllExtractionRegions), so an old extraction's first Apply after this
// fix treats its current rectangle as the base going forward rather than
// erroring. "Manual" mode is the one exception: it must keep using whatever
// is currently displayed and must never overwrite the base — callers should
// skip calling computeContentCropRect for "manual" entirely rather than
// resetting the display to the base.
//
// No DB/filesystem access — safe to import from both server actions and
// client components (bundled into the Apply-to-all-regions button).
// ---------------------------------------------------------------------------

export type ContentCropMode = "full" | "remove_bottom" | "remove_top" | "remove_top_and_bottom" | "manual";

export const CONTENT_CROP_MODES: readonly ContentCropMode[] = [
  "full",
  "remove_bottom",
  "remove_top",
  "remove_top_and_bottom",
  "manual",
];

export function isContentCropMode(value: string): value is ContentCropMode {
  return (CONTENT_CROP_MODES as readonly string[]).includes(value);
}

export const MIN_CONTENT_CROP_PERCENT = 0;
export const MAX_CONTENT_CROP_PERCENT = 45;

/** Each of header%/caption% is bounded independently to at most 45%, so even both maxed at once always leaves at least 10% of the cell's height as illustration. */
export function isValidContentCropPercent(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_CONTENT_CROP_PERCENT && n <= MAX_CONTENT_CROP_PERCENT;
}

/**
 * REVISE fix: strict integer parsing for a percent field submitted as a raw
 * form string. `parseInt` alone accepts "20abc" as 20 (it stops at the
 * first non-digit rather than rejecting the whole string) — the server must
 * refuse anything that isn't a plain, whole, non-negative number end to
 * end, since the client is never a trust boundary. Returns null (never a
 * best-effort guess) for empty/whitespace-only input, any non-digit
 * character, a leading sign, a decimal point, or a value outside
 * [MIN_CONTENT_CROP_PERCENT, MAX_CONTENT_CROP_PERCENT].
 */
export function parseStrictContentCropPercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return isValidContentCropPercent(n) ? n : null;
}

export type ContentCropPresetValues = { headerPercent: number; captionPercent: number };

/** Suggested starting header%/caption% per preset — adjustable afterward, never silently re-applied. "manual" has no preset values (the mode itself means "leave whatever is currently there alone"). */
export const CONTENT_CROP_PRESET_VALUES: Record<Exclude<ContentCropMode, "manual">, ContentCropPresetValues> = {
  full: { headerPercent: 0, captionPercent: 0 },
  remove_bottom: { headerPercent: 0, captionPercent: 20 },
  remove_top: { headerPercent: 15, captionPercent: 0 },
  remove_top_and_bottom: { headerPercent: 15, captionPercent: 20 },
};

export type Rect = { x: number; y: number; width: number; height: number };

/** Persisted in extraction.paramsJson.contentCropBaseRects, keyed by each region's own (string) orderIndex — never by DB id, so it can be populated before an insert's auto-generated id is known. */
export type ContentCropBaseRects = Record<string, Rect>;

function isPlausibleRect(value: unknown): value is Rect {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    Number.isInteger(r.x) &&
    Number.isInteger(r.y) &&
    typeof r.width === "number" &&
    Number.isInteger(r.width) &&
    r.width > 0 &&
    typeof r.height === "number" &&
    Number.isInteger(r.height) &&
    r.height > 0
  );
}

/** Looks up a region's base rect by orderIndex, defensively validating shape (a hand-edited or corrupted paramsJson must never crash rendering) — falls back to `fallback` (the region's own current rectangle) when missing or malformed, which is exactly the "compatibilite des anciennes extractions" the review asked for: an extraction that predates this field simply treats its current rectangle as the base from here on. */
export function getContentCropBaseRect(baseRects: ContentCropBaseRects | undefined, orderIndex: number, fallback: Rect): Rect {
  const rect = baseRects?.[String(orderIndex)];
  return isPlausibleRect(rect) ? rect : fallback;
}

const MIN_RESULT_HEIGHT_PX = 8; // matches RegionCropBox's own MIN_SIZE_PX — never collapse a cell to nothing

/**
 * Computes the kept rectangle after removing a top header band and/or a
 * bottom caption band from `cell`, each sized as a percentage of the cell's
 * OWN height. "full" and "manual" are both identity transforms (manual
 * means "don't touch it in bulk" — per-region interactive editing is the
 * only thing that should move it). Width and x are never touched — only
 * vertical bands are removed. If the two percentages would remove more than
 * the cell can give up (leaving less than MIN_RESULT_HEIGHT_PX), both are
 * scaled down proportionally rather than silently producing a degenerate
 * rectangle — defensive only: with percentages bounded to 45% each this
 * cannot happen for any cell taller than ~18px.
 */
export function computeContentCropRect(
  cell: Rect,
  mode: ContentCropMode,
  headerPercent: number,
  captionPercent: number
): Rect {
  if (mode === "manual" || mode === "full") {
    return { ...cell };
  }

  let headerPx = mode === "remove_top" || mode === "remove_top_and_bottom" ? Math.round((cell.height * headerPercent) / 100) : 0;
  let captionPx = mode === "remove_bottom" || mode === "remove_top_and_bottom" ? Math.round((cell.height * captionPercent) / 100) : 0;

  const maxRemovable = Math.max(0, cell.height - MIN_RESULT_HEIGHT_PX);
  const totalRemoved = headerPx + captionPx;
  if (totalRemoved > maxRemovable && totalRemoved > 0) {
    const scale = maxRemovable / totalRemoved;
    headerPx = Math.round(headerPx * scale);
    captionPx = Math.round(captionPx * scale);
  }

  const newHeight = Math.max(MIN_RESULT_HEIGHT_PX, cell.height - headerPx - captionPx);
  return {
    x: cell.x,
    y: cell.y + headerPx,
    width: cell.width,
    height: newHeight,
  };
}
