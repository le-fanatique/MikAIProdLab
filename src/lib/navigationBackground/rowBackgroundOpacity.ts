// ---------------------------------------------------------------------------
// rowBackgroundOpacity.ts — UX.MEDIA.PREVIEW.1
//
// Plain constants shared between server (uploadNavigationBackground.ts,
// rowBackgrounds.ts) and client (RowBackground.tsx) code. Kept in its own
// file, with zero Node-only imports, specifically so the client editor never
// pulls in uploadNavigationBackground.ts's FFmpeg/fs dependency graph into
// the browser bundle.
// ---------------------------------------------------------------------------

export const MIN_ROW_BACKGROUND_OPACITY = 0.05;
export const MAX_ROW_BACKGROUND_OPACITY = 0.5;
export const DEFAULT_ROW_BACKGROUND_OPACITY = 0.2;

export function isValidRowBackgroundOpacity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_ROW_BACKGROUND_OPACITY &&
    value <= MAX_ROW_BACKGROUND_OPACITY
  );
}
