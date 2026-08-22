"use client";

// ---------------------------------------------------------------------------
// WorkflowLibraryGrid — WF.LIBRARY.1 §4, thumbnail size extracted in
// WF.LIBRARY.2
//
// The library's single client island. The thumbnail size mechanism itself
// (slider, persistence, the CSS custom property that sizes the grid) now
// lives in `ThumbnailSizeControl` — the same single definition the Settings
// workflow manager uses (`WorkflowTemplateGallery`'s `sizable` grid) — so
// this file only renders it and reads the resulting size via
// `var(--wf-thumb-size, ...)` in its own `gridTemplateColumns`. See
// `ThumbnailSizeControl`'s header comment for why a CSS variable, not a
// prop.
//
// It only ever touches presentation: `WorkflowTemplateCard` itself is
// untouched. It filters nothing, sorts nothing, reloads nothing, and never
// touches the URL.
//
// `searchForm` and `closeButton` are server-rendered content, passed in as
// props so the slider control can sit between them in the same top-bar row
// (RSC composition: a Server Component can be passed as a prop/children into
// a Client Component boundary without becoming client code itself).
// `children` is the grid content (cards, or the "no match" empty state) —
// also server-rendered.
// ---------------------------------------------------------------------------

import ThumbnailSizeControl from "@/components/ThumbnailSizeControl";
import { THUMBNAIL_SIZE_CSS_VAR, THUMBNAIL_SIZE_DEFAULT } from "@/lib/thumbnailSize";

type Props = {
  searchForm: React.ReactNode;
  closeButton: React.ReactNode;
  /** False for the "no result" empty state — rendered plainly instead of as
   * a sized grid track, so a single message is not squeezed into one
   * thumbnail-wide column. Default true. */
  showGrid?: boolean;
  children: React.ReactNode;
};

export default function WorkflowLibraryGrid({ searchForm, closeButton, showGrid = true, children }: Props) {
  return (
    <div className="flex flex-1 flex-col h-full min-w-0">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#232629] shrink-0">
        {searchForm}
        <ThumbnailSizeControl />
        {closeButton}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {showGrid ? (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(var(${THUMBNAIL_SIZE_CSS_VAR}, ${THUMBNAIL_SIZE_DEFAULT}px), 1fr))`,
            }}
          >
            {children}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">{children}</div>
        )}
      </div>
    </div>
  );
}
