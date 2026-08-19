"use client";

// ---------------------------------------------------------------------------
// ContentCropModeSelect.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX5
//
// The Content Crop mode <select>. On change, pre-fills the sibling header%/
// caption% <input> fields with that preset's suggested starting values —
// "Manual" leaves them untouched (its whole point is "don't apply a bulk
// transform"). The user can still adjust the filled-in values afterward
// before clicking Apply to all regions; this is only a convenience default,
// never re-applied automatically. A real form control (has `name`), so it
// submits normally with the rest of the Update All form — this component
// only adds the onChange convenience behavior on top of that.
// ---------------------------------------------------------------------------

import { CONTENT_CROP_PRESET_VALUES, type ContentCropMode } from "@/lib/storyboardExtraction/contentCrop";

type Props = {
  defaultValue: ContentCropMode;
  headerFieldId: string;
  captionFieldId: string;
};

const MODE_LABELS: Record<ContentCropMode, string> = {
  full: "Full cell",
  remove_bottom: "Remove bottom caption",
  remove_top: "Remove top header",
  remove_top_and_bottom: "Remove top and bottom text",
  manual: "Manual",
};

export default function ContentCropModeSelect({ defaultValue, headerFieldId, captionFieldId }: Props) {
  return (
    <select
      id="content-crop-mode"
      name="contentCropMode"
      defaultValue={defaultValue}
      onChange={(e) => {
        const mode = e.target.value as ContentCropMode;
        if (mode === "manual") return;
        const preset = CONTENT_CROP_PRESET_VALUES[mode];
        const headerEl = document.getElementById(headerFieldId) as HTMLInputElement | null;
        const captionEl = document.getElementById(captionFieldId) as HTMLInputElement | null;
        if (headerEl) headerEl.value = String(preset.headerPercent);
        if (captionEl) captionEl.value = String(preset.captionPercent);
      }}
      className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
    >
      {(Object.keys(MODE_LABELS) as ContentCropMode[]).map((mode) => (
        <option key={mode} value={mode}>
          {MODE_LABELS[mode]}
        </option>
      ))}
    </select>
  );
}
