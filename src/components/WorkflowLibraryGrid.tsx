"use client";

// ---------------------------------------------------------------------------
// WorkflowLibraryGrid — WF.LIBRARY.1 §4
//
// The library's single client island. Follows `GenerationPanelShell`'s exact
// precedent (`GenerationPanelShell.tsx:8-25`): the thumbnail size is read
// from `localStorage` only after mount, under its own key, so the server
// render and the first client render never disagree. Every localStorage
// access is wrapped in try/catch — no storage, private browsing, or a
// pre-mount render must ever keep the grid from showing (a fixed default
// size always applies first).
//
// It only ever touches presentation: a CSS custom property, applied via
// `gridTemplateColumns: minmax(size, 1fr)`, that sizes the grid's columns —
// `WorkflowTemplateCard` itself is untouched. It filters nothing, sorts
// nothing, reloads nothing, and never touches the URL.
//
// `searchForm` and `closeButton` are server-rendered content, passed in as
// props so the slider control can sit between them in the same top-bar row
// (RSC composition: a Server Component can be passed as a prop/children into
// a Client Component boundary without becoming client code itself).
// `children` is the grid content (cards, or the "no match" empty state) —
// also server-rendered.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

const LS_KEY = "wf-library-thumb-size";
const MIN_SIZE = 140;
const MAX_SIZE = 320;
const DEFAULT_SIZE = 220;
const STEP = 20;

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
  const [size, setSize] = useState(DEFAULT_SIZE);

  // Read saved size from localStorage after mount (avoids SSR mismatch) —
  // same pattern as GenerationPanelShell's panel width.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const n = parseInt(stored, 10);
        if (n >= MIN_SIZE && n <= MAX_SIZE) setSize(n);
      }
    } catch {}
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseInt(e.target.value, 10);
    if (Number.isNaN(n)) return;
    setSize(n);
    try {
      localStorage.setItem(LS_KEY, String(n));
    } catch {}
  }

  return (
    <div className="flex flex-1 flex-col h-full min-w-0">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#232629] shrink-0">
        {searchForm}
        <label className="flex items-center gap-2 text-xs text-[#6e767d] shrink-0">
          <span>Size</span>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={STEP}
            value={size}
            onChange={handleChange}
            aria-label="Thumbnail size"
            className="w-24 accent-[#5b93d6]"
          />
        </label>
        {closeButton}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {showGrid ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
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
