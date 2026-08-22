"use client";

// ---------------------------------------------------------------------------
// ThumbnailSizeControl — WF.LIBRARY.2
//
// The one mechanism behind the "Size" slider on both the workflow library
// (`WorkflowLibraryGrid`, WF.LIBRARY.1) and the Settings workflow manager
// (`/settings/workflows`). It owns the state, the `localStorage`
// persistence and the slider markup — a self-contained leaf with no
// children, so it can be dropped exactly where the slider visually belongs
// in either caller's layout (a client component for the library's overlay
// bar, a Server Component page for Settings) without any function crossing
// the Server/Client boundary.
//
// It does not size anything itself: on change (and once, after mount, from
// `localStorage`) it writes the chosen size onto `document.documentElement`
// as the `--wf-thumb-size` CSS custom property. Any grid that opts in reads
// it with `var(--wf-thumb-size, <default>px)` in a plain inline style —
// `WorkflowLibraryGrid` and `WorkflowTemplateGallery`'s `sizable` grid both
// do. This is what lets a Server-rendered grid (`WorkflowTemplateGallery`)
// resize from a value chosen in a Client Component ancestor: CSS variables
// cascade through the DOM regardless of the RSC boundary, where a JS number
// prop could not cross it without becoming a function.
//
// Same non-negotiables as `WorkflowLibraryGrid` before it: every
// `localStorage` access is wrapped in `try/catch`, and the size is read only
// after mount (`useEffect`) so the server render and the first client render
// never disagree — before that, the CSS `var(...)` fallback applies and the
// grid is never empty of a size.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import {
  THUMBNAIL_SIZE_CSS_VAR,
  THUMBNAIL_SIZE_DEFAULT,
  THUMBNAIL_SIZE_MAX,
  THUMBNAIL_SIZE_MIN,
  THUMBNAIL_SIZE_STEP,
  THUMBNAIL_SIZE_STORAGE_KEY,
  normalizeThumbnailSize,
} from "@/lib/thumbnailSize";

function applyCssVar(size: number) {
  try {
    document.documentElement.style.setProperty(THUMBNAIL_SIZE_CSS_VAR, `${size}px`);
  } catch {}
}

export default function ThumbnailSizeControl() {
  const [size, setSize] = useState(THUMBNAIL_SIZE_DEFAULT);

  useEffect(() => {
    try {
      const n = normalizeThumbnailSize(localStorage.getItem(THUMBNAIL_SIZE_STORAGE_KEY));
      setSize(n);
      applyCssVar(n);
    } catch {}
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = Number.parseInt(e.target.value, 10);
    if (Number.isNaN(n)) return;
    setSize(n);
    applyCssVar(n);
    try {
      localStorage.setItem(THUMBNAIL_SIZE_STORAGE_KEY, String(n));
    } catch {}
  }

  return (
    <label className="flex items-center gap-2 text-xs text-[#6e767d] shrink-0">
      <span>Size</span>
      <input
        type="range"
        min={THUMBNAIL_SIZE_MIN}
        max={THUMBNAIL_SIZE_MAX}
        step={THUMBNAIL_SIZE_STEP}
        value={size}
        onChange={handleChange}
        aria-label="Thumbnail size"
        className="w-24 accent-[#5b93d6]"
      />
    </label>
  );
}
