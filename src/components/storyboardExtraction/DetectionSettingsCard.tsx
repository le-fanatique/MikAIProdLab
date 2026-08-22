import Card from "@/components/Card";
import Collapsible from "@/components/Collapsible";
import FieldTooltip from "@/components/FieldTooltip";
import EngineFieldsToggle from "@/components/EngineFieldsToggle";
import UseShotCountButton from "@/components/UseShotCountButton";
import { ADVANCED_PARAM_SPECS } from "@/lib/storyboardExtraction/workerContract";
import { startStoryboardExtraction } from "@/actions/storyboardExtractionStart";

// FIX6 — presentation-only metadata (label + English hover/focus tooltip)
// for each ADVANCED_PARAM_SPECS entry. Bounds/engine-relevance live in
// workerContract.ts (the actual validated contract); this is purely UI text.
const ADVANCED_PARAM_FIELD_META: { key: string; label: string; tooltip: string }[] = [
  { key: "minCellAreaFraction", label: "Min cell area fraction", tooltip: "Smallest fraction of the source image area a candidate cell may cover. Lower catches smaller panels but risks stray slivers; higher discards small real panels." },
  { key: "gutterDensityThreshold", label: "Gutter density threshold", tooltip: "Content density below which a row/column reads as gutter. Lower requires an emptier gutter (stricter); higher tolerates noisier gutters (looser)." },
  { key: "colorDistanceThreshold", label: "Color distance threshold", tooltip: "Canny only. Grayscale distance from the sampled background color to count a pixel as content. Lower is more sensitive to subtle content; higher ignores faint content." },
  { key: "minGutterWidthPx", label: "Min gutter width (px)", tooltip: "Minimum pixel width for a low-density run to count as a real gutter. Lower catches thinner gutters but risks splitting on in-cell padding; higher requires a wider gap." },
  { key: "minGutterFraction", label: "Min gutter fraction", tooltip: "Same as Min gutter width, expressed as a fraction of the image dimension — whichever of the two is larger applies. Useful for very large images." },
  { key: "gutterMergeGapPx", label: "Gutter merge gap (px)", tooltip: "Bridges a raw low-density run across a thin explicit border line before the minimum-width filter applies. Lower keeps runs separate; higher merges more aggressively." },
  { key: "cannySigma", label: "Canny sigma", tooltip: "Canny only. Spread of the auto-Canny threshold around the image's median intensity. Lower is stricter (fewer edges detected); higher is looser (more edges, more noise)." },
  { key: "houghMinLineFraction", label: "Hough min line fraction", tooltip: "Canny only. Minimum fraction of the image dimension a straight line must span to count as a separator. Lower catches shorter border lines; higher requires longer, more confident lines." },
  { key: "houghVoteThreshold", label: "Hough vote threshold", tooltip: "Canny only. Minimum accumulator votes for a line to be detected. Lower detects more (possibly spurious) lines; higher requires stronger evidence." },
  { key: "houghMaxLineGap", label: "Hough max line gap (px)", tooltip: "Canny only. Maximum pixel gap allowed when joining line segments into one line. Lower keeps segments separate; higher joins more readily." },
  { key: "maxHoughLines", label: "Max Hough lines", tooltip: "Canny only. Hard cap on candidate lines processed, bounding worst-case time/memory. Lower is faster but may miss lines on busy images; higher is slower but more thorough." },
  { key: "captionUniformityThreshold", label: "Caption uniformity threshold", tooltip: "Fraction of near-white or near-black pixels in a row to call it a caption background band. Lower is more permissive (detects more captions, more false positives); higher requires a cleaner band." },
  { key: "captionMinRunPx", label: "Caption min run (px)", tooltip: "Minimum sustained pixel run for a uniform band to be treated as a caption boundary. Lower catches shorter captions; higher requires a longer, more confident run." },
  { key: "minIllustrationFraction", label: "Min illustration fraction", tooltip: "Discards a caption split that would leave less than this fraction of the cell as illustration. Lower allows smaller illustrations; higher rejects splits that look too aggressive." },
];

type DetectionParamsSummary = {
  engine?: string;
  columns?: number | null;
  rows?: number | null;
  sensitivity?: string;
  customThreshold?: number | null;
  advancedParams?: Record<string, number>;
} | null;

type Props = {
  canRerun: boolean;
  sequenceId: number;
  sourceStoryboardImageId: number | null;
  basePath: string;
  extractionStatus: string;
  detectionParamsSummary: DetectionParamsSummary;
  suggestedGrid: { columns: number; rows: number } | null;
  sequenceShotsCount: number;
  /** SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — the currently selected explicit Shot range (from the page's own `shotFrom`/`shotTo` search params), carried into "Run Detection Again" so the new extraction resolves against the same range instead of silently reverting to the inherited/full-Sequence default. */
  shotFromValue: string | null;
  shotToValue: string | null;
};

/** "Detection Settings" collapsible — the "Run Detection Again" form or its unavailable-source fallback (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function DetectionSettingsCard({
  canRerun,
  sequenceId,
  sourceStoryboardImageId,
  basePath,
  extractionStatus,
  detectionParamsSummary,
  suggestedGrid,
  sequenceShotsCount,
  shotFromValue,
  shotToValue,
}: Props) {
  return (
    <Collapsible label="Detection Settings" defaultOpen>
      <Card>
        {canRerun ? (
          <form id="detect-again-form" action={startStoryboardExtraction} className="flex flex-col gap-3">
            <EngineFieldsToggle formId="detect-again-form" />
            <input type="hidden" name="sequenceId" value={String(sequenceId)} />
            <input type="hidden" name="sourceStoryboardImageId" value={String(sourceStoryboardImageId)} />
            <input type="hidden" name="returnTo" value={basePath} />
            {/* SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — carries this page's currently selected explicit Shot range into the new extraction. */}
            <input type="hidden" name="shotFrom" value={shotFromValue ?? ""} />
            <input type="hidden" name="shotTo" value={shotToValue ?? ""} />

            <div className="flex flex-wrap gap-4">
              <fieldset className="flex flex-col gap-1">
                <legend className="text-[9px] uppercase tracking-wider text-[#4b5158] mb-0.5">Detection engine</legend>
                <label className="flex items-center gap-1.5 text-xs text-[#a4abb2]">
                  <input
                    type="radio"
                    name="engine"
                    value="otsu"
                    defaultChecked={detectionParamsSummary?.engine === "otsu"}
                  />
                  Otsu (Legacy) — single global threshold, no edge/line detection
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#a4abb2]">
                  <input
                    type="radio"
                    name="engine"
                    value="canny"
                    defaultChecked={!detectionParamsSummary?.engine || detectionParamsSummary.engine === "canny"}
                  />
                  Canny + Hough — polarity-independent edge/line detection (default)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#a4abb2]">
                  <input
                    type="radio"
                    name="engine"
                    value="grid"
                    defaultChecked={detectionParamsSummary?.engine === "grid"}
                  />
                  Exact Grid — geometric slicing only, no visual detection
                </label>
              </fieldset>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Sensitivity</span>
                <select
                  name="sensitivity"
                  data-engine-only=""
                  defaultValue={detectionParamsSummary?.sensitivity ?? "medium"}
                  className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                >
                  <option value="low">Low — trust the primary result more</option>
                  <option value="medium">Medium</option>
                  <option value="high">High — fall back to grid more readily</option>
                </select>
                <span className="text-[9px] text-[#4b5158] max-w-xs">
                  Ignored when Custom threshold (below) is set, and when Exact Grid is selected.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-wider text-[#4b5158] inline-flex items-center gap-1">
                  Custom threshold (0.00-1.00)
                  <FieldTooltip text="Overrides the Sensitivity preset above. Lower values trust the primary engine's result even at low confidence (fewer grid fallbacks); higher values fall back to the grid more readily." />
                </span>
                <input
                  type="number"
                  name="customThreshold"
                  step="0.01"
                  min={0}
                  max={1}
                  placeholder="e.g. 0.80"
                  defaultValue={detectionParamsSummary?.customThreshold ?? ""}
                  className="w-28 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Columns / Rows (optional)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    id="detect-columns"
                    name="columns"
                    min={1}
                    max={12}
                    placeholder="Columns"
                    defaultValue={detectionParamsSummary?.columns ?? ""}
                    className="w-24 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                  />
                  <span className="text-[#4b5158]">×</span>
                  <input
                    type="number"
                    id="detect-rows"
                    name="rows"
                    min={1}
                    max={12}
                    placeholder="Rows"
                    defaultValue={detectionParamsSummary?.rows ?? ""}
                    className="w-24 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                  />
                </div>
                {suggestedGrid && (
                  <UseShotCountButton
                    columnsFieldId="detect-columns"
                    rowsFieldId="detect-rows"
                    suggestedColumns={suggestedGrid.columns}
                    suggestedRows={suggestedGrid.rows}
                  />
                )}
                <span className="text-[9px] text-[#4b5158] max-w-xs">
                  Used for Exact Grid, or as the fallback shape if Otsu/Canny fall back. Must multiply to the
                  expected Shot count ({sequenceShotsCount}) if both are set.
                </span>
              </div>
            </div>

            <Collapsible label="Advanced Diagnostics">
              <p className="text-[9px] text-[#4b5158] mb-3 max-w-xl">
                Raw worker parameters — the values shown are exactly what is sent to the detection worker and
                persisted for this extraction. Leave a field blank to keep its default. Fields grayed out below
                are unused by the currently selected engine (their value is simply ignored server-side).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ADVANCED_PARAM_FIELD_META.map((meta) => {
                  const spec = ADVANCED_PARAM_SPECS.find((s) => s.key === meta.key)!;
                  const engineOnly = spec.engines.join(" ");
                  return (
                    <label key={meta.key} className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-[#4b5158] inline-flex items-center gap-1">
                        {meta.label}
                        <FieldTooltip text={meta.tooltip} />
                      </span>
                      <input
                        type="number"
                        name={meta.key}
                        step={spec.integer ? 1 : "any"}
                        min={spec.min}
                        max={spec.max}
                        data-engine-only={engineOnly}
                        placeholder={String(spec.integer ? Math.round((spec.min + spec.max) / 2) : "default")}
                        defaultValue={detectionParamsSummary?.advancedParams?.[meta.key] ?? ""}
                        className="w-full rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                      />
                    </label>
                  );
                })}
              </div>
            </Collapsible>

            <div>
              <button
                type="submit"
                className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Run Detection Again
              </button>
              <span className="ml-3 text-[9px] text-[#4b5158]">
                Creates a new extraction — this one ({extractionStatus}) is kept, never overwritten.
              </span>
            </div>
          </form>
        ) : (
          <p className="text-xs text-[#4b5158]">
            This extraction&apos;s source image is no longer available, so it cannot be re-run.
          </p>
        )}
      </Card>
    </Collapsible>
  );
}
