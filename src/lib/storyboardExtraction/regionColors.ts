// ---------------------------------------------------------------------------
// storyboardExtraction/regionColors.ts — SEQGEN.STORYBOARD.EXTRACT.1-FIX3
//
// Pure, deterministic per-region color assignment shared between the
// preview overlay (RegionCropBox) and the Regions list, keyed by a region's
// own `orderIndex` — not its transient position in a rendered list — so a
// given region keeps the same color across add/delete/re-run of sibling
// regions. Never the sole way to identify a region: callers must always
// pair this with the visible region number (already real text) and an
// aria-label, never rely on color alone.
// ---------------------------------------------------------------------------

// 12 hues spaced for mutual contrast against a dark UI background and
// against each other (not a perceptual-uniformity library — just visually
// distinct, readable swatch colors at small sizes).
const REGION_COLOR_PALETTE: readonly string[] = [
  "#5b93d6", // blue
  "#cf7b6b", // terracotta
  "#6b9e72", // green
  "#cda24f", // amber
  "#a678d1", // violet
  "#4fb8b0", // teal
  "#d6708f", // rose
  "#8aa6c7", // steel blue
  "#c98f3f", // ochre
  "#7ec46a", // lime green
  "#e0958a", // salmon
  "#7a8fd6", // periwinkle
];

/** Cyclic fallback: an orderIndex beyond the palette wraps around (modulo), so every region always gets *a* distinct-looking color from a small, readable set rather than an unbounded/generated palette. */
export function getRegionColor(orderIndex: number): string {
  const i = ((orderIndex % REGION_COLOR_PALETTE.length) + REGION_COLOR_PALETTE.length) % REGION_COLOR_PALETTE.length;
  return REGION_COLOR_PALETTE[i];
}

export const REGION_COLOR_PALETTE_SIZE = REGION_COLOR_PALETTE.length;
