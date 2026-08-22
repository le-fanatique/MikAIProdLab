// ---------------------------------------------------------------------------
// thumbnailSize.ts — WF.LIBRARY.2
//
// The single definition of the "thumbnail size" preference shared by the
// workflow library (`WorkflowSelectorPanel` → `WorkflowLibraryGrid`,
// WF.LIBRARY.1) and the Settings workflow manager
// (`/settings/workflows` → `WorkflowTemplateGallery`). One user preference on
// one kind of content (workflow thumbnails), so one `localStorage` key and
// one CSS custom property — not two sliders with two keys.
//
// Pure module: no "use client", no React import, no DOM access — so the one
// piece of real logic here (`normalizeThumbnailSize`) is testable without a
// DOM (method §5). `ThumbnailSizeControl` (the client component) is the only
// caller of `localStorage` and the DOM; this module never touches either.
// ---------------------------------------------------------------------------

export const THUMBNAIL_SIZE_MIN = 140;
export const THUMBNAIL_SIZE_MAX = 320;
export const THUMBNAIL_SIZE_DEFAULT = 220;
export const THUMBNAIL_SIZE_STEP = 20;

/** `localStorage` key shared by both surfaces — see the module comment. */
export const THUMBNAIL_SIZE_STORAGE_KEY = "wf-thumb-size";

/** CSS custom property both surfaces' grids read via `var(...)`, so a size
 * chosen by a Client Component ancestor reaches a Server Component grid
 * (`WorkflowTemplateGallery`) without a function crossing the RSC boundary. */
export const THUMBNAIL_SIZE_CSS_VAR = "--wf-thumb-size";

/**
 * Normalizes a raw value read from `localStorage` (this surface's own write,
 * or the other surface's — the two surfaces share the storage key) into a
 * valid thumbnail size. Anything absent, non-numeric, or outside the
 * slider's own range falls back to the default — never clamped, per the
 * ticket: a value written by a surface with a different range is not silently
 * reinterpreted as this surface's nearest bound.
 */
export function normalizeThumbnailSize(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return THUMBNAIL_SIZE_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return THUMBNAIL_SIZE_DEFAULT;
  if (n < THUMBNAIL_SIZE_MIN || n > THUMBNAIL_SIZE_MAX) return THUMBNAIL_SIZE_DEFAULT;
  return n;
}
