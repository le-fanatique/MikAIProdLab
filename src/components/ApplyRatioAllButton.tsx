"use client";

// ---------------------------------------------------------------------------
// ApplyRatioAllButton.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX6 (Lot C)
//
// Client-only PREVIEW, same contract as ApplyToAllRegionsButton (FIX5): runs
// the FULL deterministic pipeline (Content Crop -> ratio -> multiplier ->
// clamp) for every eligible region, always from its STABLE BASE rectangle
// (region-{id}-base-{field}), never from whatever is currently displayed —
// this is what makes repeated clicks idempotent. Writes results into the
// existing region-{id}-{field} inputs and notifies RegionCropBox via the
// same CustomEvent ApplyToAllRegionsButton already uses. Never submits a
// form, never touches the DB — Update All remains the only persistence.
//
// REVISE (Codex finding #3, then round 2 finding #1) — unlike
// ApplyToAllRegionsButton, "manual" Content Crop is NOT a no-op here:
// ratio/multiplier are controls distinct from the content-crop preset, and
// a user must be able to start from a region's rectangle and normalize its
// ratio even with Content Crop set to Manual.
//
// For every OTHER mode, the pipeline starts from region-{id}-base-{field}
// (the FIX5 stable base — the originally detected/added cell), exactly as
// before. For "manual" specifically, it instead starts from
// region-{id}-manual-base-{field}: a SEPARATE stable reference that tracks
// the region's live, hand-edited rectangle (kept in sync by RegionCropBox's
// drag handling and by ManualBaseSync for direct field typing) but is
// NEVER written by this button's own output — so a first click normalizes
// whatever the user actually drew, a second click without any further
// manual edit is idempotent (same base, same result), and a genuine new
// manual edit correctly becomes the next base.
// ---------------------------------------------------------------------------

import { computeContentCropRect, type ContentCropMode } from "@/lib/storyboardExtraction/contentCrop";
import { computeRatioPipeline, isRatioPreset, type RatioPreset } from "@/lib/storyboardExtraction/ratioCrop";
import { REGION_RECT_APPLIED_EVENT } from "@/components/RegionCropBox";

type Props = {
  regionIds: number[];
  modeFieldId: string;
  headerFieldId: string;
  captionFieldId: string;
  ratioFieldId: string;
  multiplierFieldId: string;
  sourceWidth: number;
  sourceHeight: number;
};

export default function ApplyRatioAllButton({
  regionIds,
  modeFieldId,
  headerFieldId,
  captionFieldId,
  ratioFieldId,
  multiplierFieldId,
  sourceWidth,
  sourceHeight,
}: Props) {
  return (
    <button
      type="button"
      disabled={regionIds.length === 0}
      onClick={() => {
        const modeEl = document.getElementById(modeFieldId) as HTMLSelectElement | null;
        const headerEl = document.getElementById(headerFieldId) as HTMLInputElement | null;
        const captionEl = document.getElementById(captionFieldId) as HTMLInputElement | null;
        const ratioEl = document.getElementById(ratioFieldId) as HTMLSelectElement | null;
        const multiplierEl = document.getElementById(multiplierFieldId) as HTMLInputElement | null;

        const mode = (modeEl?.value ?? "manual") as ContentCropMode;

        const headerPercent = Number(headerEl?.value ?? 0);
        const captionPercent = Number(captionEl?.value ?? 0);
        const ratioRaw = ratioEl?.value ?? "free";
        const ratio: RatioPreset = isRatioPreset(ratioRaw) ? ratioRaw : "free";
        const sizeMultiplier = Number(multiplierEl?.value ?? 1);

        const errors: string[] = [];
        for (const regionId of regionIds) {
          const baseFieldPrefix = mode === "manual" ? "manual-base" : "base";
          const getBase = (field: string) =>
            Number((document.getElementById(`region-${regionId}-${baseFieldPrefix}-${field}`) as HTMLInputElement | null)?.value ?? 0);
          const baseCell = { x: getBase("x"), y: getBase("y"), width: getBase("width"), height: getBase("height") };
          const contentCropRect = computeContentCropRect(baseCell, mode, headerPercent, captionPercent);
          const result = computeRatioPipeline({
            baseCell: contentCropRect,
            contentCropMode: "full", // content crop already applied above; ratio pipeline's own content-crop step is a no-op pass-through
            headerPercent: 0,
            captionPercent: 0,
            ratio,
            sizeMultiplier,
            sourceWidth,
            sourceHeight,
          });

          if (!result.ok) {
            errors.push(`Region #${regionId}: ${result.error}`);
            continue;
          }

          (["x", "y", "width", "height"] as const).forEach((field) => {
            const el = document.getElementById(`region-${regionId}-${field}`) as HTMLInputElement | null;
            if (el) el.value = String(result.rect[field]);
          });
          window.dispatchEvent(new CustomEvent(REGION_RECT_APPLIED_EVENT, { detail: { regionId, rect: result.rect } }));
        }

        if (errors.length > 0) {
          window.alert(`Ratio could not be applied to ${errors.length} region(s):\n${errors.join("\n")}`);
        }
      }}
      className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title="Preview only — click Update All afterward to save"
    >
      Apply Ratio All
    </button>
  );
}
