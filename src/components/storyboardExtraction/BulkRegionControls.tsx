import ContentCropModeSelect from "@/components/storyboardExtraction/ContentCropModeSelect";
import ApplyToAllRegionsButton from "@/components/storyboardExtraction/ApplyToAllRegionsButton";
import ApplyRatioAllButton from "@/components/storyboardExtraction/ApplyRatioAllButton";
import ManualBaseSync from "@/components/ManualBaseSync";
import FieldTooltip from "@/components/FieldTooltip";
import UpdateAllButton from "@/components/UpdateAllButton";
import { resizeAllExtractionRegions, assignAllExtractionRegions } from "@/actions/storyboardExtractionRegions";
import { RATIO_PRESETS, type RatioPreset } from "@/lib/storyboardExtraction/ratioCrop";
import type { ContentCropMode } from "@/lib/storyboardExtraction/contentCrop";

type Props = {
  extractionId: number;
  returnToActive: string;
  contentCropMode: ContentCropMode;
  contentCropHeaderPercent: number;
  contentCropCaptionPercent: number;
  contentCropRatio: RatioPreset;
  contentCropSizeMultiplier: number;
  contentCropTargetRegionIds: number[];
  sourceWidth: number;
  sourceHeight: number;
  editableRegionIds: number[];
  /** SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — the currently selected explicit Shot range (from the page's own `shotFrom`/`shotTo` search params), carried into "Assign All" so a corrected range can be re-applied without re-running detection. */
  shotFromValue: string | null;
  shotToValue: string | null;
};

/** Content Crop + Ratio bulk-edit form, plus Update All / Assign All (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function BulkRegionControls({
  extractionId,
  returnToActive,
  contentCropMode,
  contentCropHeaderPercent,
  contentCropCaptionPercent,
  contentCropRatio,
  contentCropSizeMultiplier,
  contentCropTargetRegionIds,
  sourceWidth,
  sourceHeight,
  editableRegionIds,
  shotFromValue,
  shotToValue,
}: Props) {
  return (
    <div className="flex flex-col gap-3 mb-3">
      <form id="update-all-form" action={resizeAllExtractionRegions} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="extractionId" value={String(extractionId)} />
        <input type="hidden" name="returnTo" value={returnToActive} />
        <input type="hidden" id="update-all-regions-json" name="regionsJson" defaultValue="[]" />

        <fieldset className="flex flex-wrap items-end gap-2">
          <legend className="text-[9px] uppercase tracking-wider text-[#4b5158] mb-0.5 w-full">
            Content Crop
          </legend>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Mode</span>
            <ContentCropModeSelect
              defaultValue={contentCropMode}
              headerFieldId="content-crop-header-percent"
              captionFieldId="content-crop-caption-percent"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Header %</span>
            <input
              type="number"
              id="content-crop-header-percent"
              name="contentCropHeaderPercent"
              min={0}
              max={45}
              defaultValue={contentCropHeaderPercent}
              className="w-20 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Caption %</span>
            <input
              type="number"
              id="content-crop-caption-percent"
              name="contentCropCaptionPercent"
              min={0}
              max={45}
              defaultValue={contentCropCaptionPercent}
              className="w-20 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
            />
          </label>
          <ApplyToAllRegionsButton
            regionIds={contentCropTargetRegionIds}
            modeFieldId="content-crop-mode"
            headerFieldId="content-crop-header-percent"
            captionFieldId="content-crop-caption-percent"
          />
        </fieldset>

        <fieldset className="flex flex-wrap items-end gap-2">
          <legend className="text-[9px] uppercase tracking-wider text-[#4b5158] mb-0.5 w-full">Ratio</legend>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Ratio</span>
            <select
              id="content-crop-ratio"
              name="contentCropRatio"
              defaultValue={contentCropRatio}
              className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
            >
              {RATIO_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p === "free" ? "Free (no ratio)" : p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[#4b5158] inline-flex items-center gap-1">
              Size multiplier
              <FieldTooltip text="Shrinks width and height around the region's center, applied after Content Crop and the ratio. 1.00 keeps full size, 0.10 is the smallest allowed." />
            </span>
            <input
              type="number"
              id="content-crop-size-multiplier"
              name="contentCropSizeMultiplier"
              step="0.01"
              min={0.1}
              max={1}
              defaultValue={contentCropSizeMultiplier}
              className="w-24 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
            />
          </label>
          <ApplyRatioAllButton
            regionIds={contentCropTargetRegionIds}
            modeFieldId="content-crop-mode"
            headerFieldId="content-crop-header-percent"
            captionFieldId="content-crop-caption-percent"
            ratioFieldId="content-crop-ratio"
            multiplierFieldId="content-crop-size-multiplier"
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
          />
          <ManualBaseSync regionIds={contentCropTargetRegionIds} />
        </fieldset>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <UpdateAllButton
          regionIds={editableRegionIds}
          formId="update-all-form"
          hiddenFieldId="update-all-regions-json"
        />
        <form action={assignAllExtractionRegions}>
          <input type="hidden" name="extractionId" value={String(extractionId)} />
          <input type="hidden" name="returnTo" value={returnToActive} />
          {/* SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — carries this page's currently selected explicit Shot range so a corrected range applies without re-running detection. */}
          <input type="hidden" name="shotFrom" value={shotFromValue ?? ""} />
          <input type="hidden" name="shotTo" value={shotToValue ?? ""} />
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Assign All
          </button>
        </form>
        <span className="text-[9px] text-[#4b5158] max-w-sm">
          Apply to all regions previews the Content Crop on every editable, non-skipped region — Update All
          is the only action that saves it. Assign All maps editable, non-skipped regions to Shots in
          reading order. None of these extract files or create drafts/references.
        </span>
      </div>
    </div>
  );
}
