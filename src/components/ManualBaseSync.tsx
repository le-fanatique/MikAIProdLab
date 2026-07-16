"use client";

// ---------------------------------------------------------------------------
// ManualBaseSync.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX6 (REVISE round 2, finding #1)
//
// Progressive enhancement only: without JS, typing directly into a region's
// x/y/width/height fields still submits fine via the existing Update form —
// this component only keeps region-{id}-manual-base-{field} (the base
// `ApplyRatioAllButton` reads from when Content Crop is "Manual") in sync
// with genuine user typing, so a real manual edit becomes the new base for
// ratio/multiplier normalization, exactly like a drag already does via
// RegionCropBox's writeFieldsToDom(next, true).
//
// Listens for the native "input" event specifically because every
// PROGRAMMATIC write to these fields in this codebase (RegionCropBox's own
// drag/external-rect-applied paths, ApplyToAllRegionsButton,
// ApplyRatioAllButton) sets `.value` directly and never dispatches a
// synthetic "input"/"change" event — so this listener only ever fires for
// real keystrokes, never for an automated transformation's own output.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

const FIELDS = ["x", "y", "width", "height"] as const;

export default function ManualBaseSync({ regionIds }: { regionIds: number[] }) {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const regionId of regionIds) {
      const syncAll = () => {
        for (const f of FIELDS) {
          const src = document.getElementById(`region-${regionId}-${f}`) as HTMLInputElement | null;
          const dst = document.getElementById(`region-${regionId}-manual-base-${f}`) as HTMLInputElement | null;
          if (src && dst) dst.value = src.value;
        }
      };
      for (const field of FIELDS) {
        const input = document.getElementById(`region-${regionId}-${field}`) as HTMLInputElement | null;
        if (!input) continue;
        input.addEventListener("input", syncAll);
        cleanups.push(() => input.removeEventListener("input", syncAll));
      }
    }
    return () => cleanups.forEach((c) => c());
  }, [regionIds]);

  return null;
}
