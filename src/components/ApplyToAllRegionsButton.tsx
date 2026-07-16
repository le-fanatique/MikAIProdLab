"use client";

// ---------------------------------------------------------------------------
// ApplyToAllRegionsButton.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX5
//
// Client-only PREVIEW: computes the new x/y/width/height for every eligible
// region (editable, not extracted, not skipped) using the current Content
// Crop mode/percentages and each region's STABLE BASE rectangle (the
// region-{id}-base-{field} hidden fields rendered by the page from
// paramsJson.contentCropBaseRects — never the currently-displayed rectangle,
// which may already reflect a previous preset application). Computing from
// the base is what makes repeated Apply clicks idempotent and lets "Full
// cell" restore the original bounds instead of compounding each click.
//
// "Manual" is a deliberate no-op here: it means "leave whatever is
// currently displayed alone", so it must never overwrite anything, not even
// reset it back to the base — per-region interactive editing (drag/type)
// remains the only way to move a region in that mode.
//
// Writes the result into the existing region-{id}-{field} inputs and
// notifies each region's RegionCropBox via a CustomEvent so its overlay
// updates too. Never submits a form, never touches the DB, never creates a
// crop/draft/reference — persisting the previewed rectangles is exclusively
// Update All's job, same as any other manual edit to those same fields.
// ---------------------------------------------------------------------------

import { computeContentCropRect, type ContentCropMode } from "@/lib/storyboardExtraction/contentCrop";
import { REGION_RECT_APPLIED_EVENT } from "@/components/RegionCropBox";

type Props = {
  regionIds: number[];
  modeFieldId: string;
  headerFieldId: string;
  captionFieldId: string;
};

export default function ApplyToAllRegionsButton({ regionIds, modeFieldId, headerFieldId, captionFieldId }: Props) {
  return (
    <button
      type="button"
      disabled={regionIds.length === 0}
      onClick={() => {
        const modeEl = document.getElementById(modeFieldId) as HTMLSelectElement | null;
        const headerEl = document.getElementById(headerFieldId) as HTMLInputElement | null;
        const captionEl = document.getElementById(captionFieldId) as HTMLInputElement | null;
        const mode = (modeEl?.value ?? "manual") as ContentCropMode;

        if (mode === "manual") return; // deliberate no-op — see file header

        const headerPercent = Number(headerEl?.value ?? 0);
        const captionPercent = Number(captionEl?.value ?? 0);

        for (const regionId of regionIds) {
          const getBase = (field: string) =>
            Number((document.getElementById(`region-${regionId}-base-${field}`) as HTMLInputElement | null)?.value ?? 0);
          const baseCell = { x: getBase("x"), y: getBase("y"), width: getBase("width"), height: getBase("height") };
          const rect = computeContentCropRect(baseCell, mode, headerPercent, captionPercent);

          (["x", "y", "width", "height"] as const).forEach((field) => {
            const el = document.getElementById(`region-${regionId}-${field}`) as HTMLInputElement | null;
            if (el) el.value = String(rect[field]);
          });

          window.dispatchEvent(new CustomEvent(REGION_RECT_APPLIED_EVENT, { detail: { regionId, rect } }));
        }
      }}
      className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title="Preview only — click Update All afterward to save"
    >
      Apply to all regions
    </button>
  );
}
