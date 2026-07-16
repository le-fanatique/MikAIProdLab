import Link from "next/link";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
} from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import Collapsible from "@/components/Collapsible";
import RegionCropBox from "@/components/RegionCropBox";
import UseShotCountButton from "@/components/UseShotCountButton";
import UpdateAllButton from "@/components/UpdateAllButton";
import ContentCropModeSelect from "@/components/ContentCropModeSelect";
import ApplyToAllRegionsButton from "@/components/ApplyToAllRegionsButton";
import ApplyRatioAllButton from "@/components/ApplyRatioAllButton";
import ManualBaseSync from "@/components/ManualBaseSync";
import FieldTooltip from "@/components/FieldTooltip";
import EngineFieldsToggle from "@/components/EngineFieldsToggle";
import { refImageUrl } from "@/lib/refImageUrl";
import { computeGridFactorization, ADVANCED_PARAM_SPECS, type DetectionDiagnostics } from "@/lib/storyboardExtraction/workerContract";
import { getRegionColor } from "@/lib/storyboardExtraction/regionColors";
import {
  isContentCropMode,
  getContentCropBaseRect,
  type ContentCropMode,
  type ContentCropBaseRects,
} from "@/lib/storyboardExtraction/contentCrop";
import { isRatioPreset, RATIO_PRESETS, type RatioPreset } from "@/lib/storyboardExtraction/ratioCrop";
import {
  startStoryboardExtraction,
  addExtractionRegion,
  resizeExtractionRegion,
  reassignExtractionRegion,
  skipExtractionRegion,
  deleteExtractionRegion,
  confirmStoryboardExtraction,
  resizeAllExtractionRegions,
  assignAllExtractionRegions,
} from "@/actions/storyboardExtraction";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

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

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-8 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">{label}</span>
    </div>
  );
}

export default async function StoryboardExtractPage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const basePath = `/projects/${pid}/sequences/${sid}/storyboard/extract`;
  const storyboardPagePath = `/projects/${pid}/storyboard?sequenceId=${sid}`;
  const returnTo = basePath;

  const extractError = sp(resolvedSearchParams["extractError"]);
  const okFlags = {
    added: sp(resolvedSearchParams["extractRegionAdded"]) === "1",
    resized: sp(resolvedSearchParams["extractRegionResized"]) === "1",
    reassigned: sp(resolvedSearchParams["extractRegionReassigned"]) === "1",
    skipped: sp(resolvedSearchParams["extractRegionSkipped"]) === "1",
    deleted: sp(resolvedSearchParams["extractRegionDeleted"]) === "1",
    confirmed: sp(resolvedSearchParams["extractConfirmed"]) === "1",
    allUpdated: sp(resolvedSearchParams["extractAllUpdated"]) === "1",
    allAssigned: sp(resolvedSearchParams["extractAllAssigned"]) === "1",
  };
  const okMessage = okFlags.confirmed
    ? "Extraction confirmed. Crops were saved as Shot storyboard drafts."
    : okFlags.allUpdated
      ? "All editable regions updated."
      : okFlags.allAssigned
        ? "All editable regions assigned to Shots in reading order."
        : okFlags.added
          ? "Region added."
          : okFlags.resized
            ? "Region updated."
            : okFlags.reassigned
              ? "Region reassigned."
              : okFlags.skipped
                ? "Region skipped."
                : okFlags.deleted
                  ? "Region deleted."
                  : null;

  const extractionIdRaw = sp(resolvedSearchParams["extractionId"]);
  const extractionId = extractionIdRaw ? parseInt(extractionIdRaw, 10) : null;

  const crumbs = [
    { label: "Projects", href: "/projects" },
    { label: project.name, href: `/projects/${pid}` },
    { label: "Storyboard", href: storyboardPagePath },
    { label: "Extract Storyboard Panels" },
  ];

  // ── State A: no extraction chosen yet — explicit source selection ───────
  if (extractionId === null) {
    const sourceDrafts = await db
      .select()
      .from(sequenceStoryboardImages)
      .where(eq(sequenceStoryboardImages.sequenceId, sid))
      .orderBy(desc(sequenceStoryboardImages.createdAt));

    return (
      <div>
        <Breadcrumb crumbs={crumbs} />
        <PageHeader title="Extract Storyboard Panels" meta={`${project.name} · ${sequence.title}`} />

        {extractError && <p className="text-xs text-[#cf7b6b] mb-4">{extractError}</p>}

        {sourceDrafts.length === 0 ? (
          <EmptyState
            title="No Sequence Storyboard images yet."
            description="Generate a Sequence Storyboard contact sheet first."
            action={
              <Link href={storyboardPagePath} className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
                ← Back to Storyboard
              </Link>
            }
          />
        ) : (
          <>
            <p className="text-xs text-[#6e767d] mb-4">
              Choose which Sequence Storyboard image to detect panels from. Nothing is analyzed until you pick one
              explicitly.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sourceDrafts.map((d) => (
                <div key={d.id} className="flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden">
                  <div className="relative aspect-video w-full bg-[#0d0e10] shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refImageUrl(d.imagePath)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-1.5 px-2 py-1.5">
                    <span className="text-[10px] font-mono text-[#4b5158]">
                      {new Date(d.createdAt).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <form action={startStoryboardExtraction}>
                      <input type="hidden" name="sequenceId" value={String(sid)} />
                      <input type="hidden" name="sourceStoryboardImageId" value={String(d.id)} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="mt-0.5 block w-full text-center rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-2 py-1.5 text-[11px] font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors"
                      >
                        Extract from this image
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 pt-4 border-t border-[#232629]">
          <Link href={storyboardPagePath} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
            ← Back to Storyboard
          </Link>
        </div>
      </div>
    );
  }

  // ── State B: an extraction is active — preview + edit + confirm ─────────
  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction || extraction.sequenceId !== sid) notFound();

  const regions = await db
    .select()
    .from(sequenceStoryboardExtractionRegions)
    .where(eq(sequenceStoryboardExtractionRegions.extractionId, extractionId))
    .orderBy(asc(sequenceStoryboardExtractionRegions.orderIndex));

  const sequenceShots = await db
    .select({ id: shots.id, shotCode: shots.shotCode, title: shots.title })
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));

  // Every action below (Update/Reassign/Skip/Add/Delete) must return to this
  // same active extraction, not the bare source-selection page — the outer
  // `returnTo` (state A only) deliberately omits extractionId.
  const returnToActive = `${basePath}?extractionId=${extractionId}`;

  const assignedShotIds = new Set(regions.filter((r) => r.status !== "skipped" && r.targetShotId !== null).map((r) => r.targetShotId!));
  const shotsWithoutRegion = sequenceShots.filter((s) => !assignedShotIds.has(s.id));
  const unassignedRegions = regions.filter((r) => r.status === "pending");
  const isEditable = extraction.status === "ready";
  const assignedCount = regions.filter((r) => r.status === "assigned").length;
  const editableRegionIds = regions.filter((r) => r.status !== "extracted").map((r) => r.id);
  // FIX5 — Content Crop's bulk preview never touches skipped regions (an
  // explicit prior decision, not silently reopened by a batch action) or
  // extracted ones (immutable) — narrower than editableRegionIds above,
  // which Update All still uses as-is since a skipped region's fields
  // remain manually editable one at a time.
  const contentCropTargetRegionIds = regions
    .filter((r) => isEditable && r.status !== "extracted" && r.status !== "skipped")
    .map((r) => r.id);

  // FIX3 — Detection Settings / Run Detection Again. Re-runs detection on
  // the SAME source image (never overwrites the current extraction — always
  // inserts a fresh, separately-numbered one via startStoryboardExtraction).
  const canRerun = extraction.sourceStoryboardImageId !== null;
  const suggestedGrid =
    sequenceShots.length > 0 && extraction.sourceWidth > 0 && extraction.sourceHeight > 0
      ? computeGridFactorization(sequenceShots.length, extraction.sourceWidth / extraction.sourceHeight)
      : null;

  let detectionParamsSummary: {
    engine?: string;
    /** Legacy pre-FIX6 field, kept read-only for backward-compat banner logic below (old extractions have no `diagnostics`). */
    mode?: string;
    columns?: number | null;
    rows?: number | null;
    sensitivity?: string;
    customThreshold?: number | null;
    advancedParams?: Record<string, number>;
    expectedShotCount?: number;
    padding?: number;
    contentCrop?: { mode?: string; headerPercent?: number | null; captionPercent?: number | null };
    contentCropBaseRects?: ContentCropBaseRects;
    diagnostics?: DetectionDiagnostics;
  } | null = null;
  try {
    detectionParamsSummary = extraction.paramsJson ? JSON.parse(extraction.paramsJson) : null;
  } catch {
    detectionParamsSummary = null;
  }

  // REVISE (Codex finding #4) — `detectionMode === "grid-fallback"` is a
  // per-REGION field the worker also uses for the explicit Grid engine's
  // own regions (see build_fallback_regions in the Python worker): it is
  // NOT proof that automatic detection was ambiguous. The structured
  // `diagnostics` object (extraction-level) is the only reliable source for
  // that distinction — `finalEngine === "grid-fallback"` only happens when
  // otsu/canny's primary result was rejected and replaced; `finalEngine ===
  // "grid"` means the user explicitly chose Exact Grid and no visual
  // detection ever ran. Extractions that predate FIX6 (no `diagnostics`)
  // fall back to the pre-FIX6 heuristic — the only case where the two truly
  // cannot be told apart.
  const diagnostics = detectionParamsSummary?.diagnostics;
  const isRealAutoFallback = diagnostics
    ? diagnostics.fallbackTriggered && diagnostics.finalEngine === "grid-fallback"
    : regions.some((r) => r.detectionMode === "grid-fallback");
  const isExplicitGrid = diagnostics
    ? diagnostics.finalEngine === "grid"
    : detectionParamsSummary?.engine === "grid" || detectionParamsSummary?.mode === "grid";
  const isAmbiguousSingleRegion =
    isEditable && regions.length <= 1 && sequenceShots.length > 1 && !isRealAutoFallback && !isExplicitGrid;

  // FIX5 — pre-fill Content Crop from whatever was last persisted for this
  // extraction; a non-destructive "Full cell" default when nothing was
  // saved yet, so the very first visit never silently crops anything.
  const persistedContentCropMode = detectionParamsSummary?.contentCrop?.mode;
  const contentCropMode: ContentCropMode =
    persistedContentCropMode && isContentCropMode(persistedContentCropMode) ? persistedContentCropMode : "full";
  const contentCropHeaderPercent = detectionParamsSummary?.contentCrop?.headerPercent ?? 15;
  const contentCropCaptionPercent = detectionParamsSummary?.contentCrop?.captionPercent ?? 20;
  // FIX6 (Lot C) — ratio/multiplier pre-fill, same non-destructive-default contract as Content Crop above.
  const persistedRatio = (detectionParamsSummary?.contentCrop as { ratio?: string } | undefined)?.ratio;
  const contentCropRatio: RatioPreset = persistedRatio && isRatioPreset(persistedRatio) ? persistedRatio : "free";
  const contentCropSizeMultiplier =
    (detectionParamsSummary?.contentCrop as { sizeMultiplier?: number } | undefined)?.sizeMultiplier ?? 1;

  return (
    <div>
      <Breadcrumb crumbs={crumbs} />
      <PageHeader title="Extract Storyboard Panels" meta={`${project.name} · ${sequence.title}`} />

      {extractError && <p className="text-xs text-[#cf7b6b] mb-4">{extractError}</p>}
      {okMessage && <p className="text-xs text-[#6b9e72] mb-4">{okMessage}</p>}

      {extraction.status === "detecting" && (
        <p className="text-xs text-[#cda24f] mb-4">Detecting panels…</p>
      )}

      {extraction.status === "failed" && (
        <p className="text-xs text-[#cf7b6b] mb-4">
          Detection failed: {extraction.errorMessage ?? "Unknown error."}
        </p>
      )}

      {extraction.status === "confirmed" && (
        <p className="text-xs text-[#6b9e72] mb-4">
          This extraction was already confirmed. Extracted crops are visible in the Storyboard grid for their
          assigned Shots.
        </p>
      )}

      {isRealAutoFallback && (
        <p className="text-xs text-[#cda24f] mb-4">
          Automatic panel detection ({diagnostics?.primaryEngine ?? "Otsu/Canny"}) was ambiguous for this image
          {diagnostics?.fallbackReason ? ` (${diagnostics.fallbackReason})` : ""}, so a grid was proposed instead,
          sized to match this Sequence&apos;s {sequenceShots.length} Shots. Every proposed region is low-confidence
          and stays unassigned until you review and explicitly assign it — nothing here is extracted automatically.
        </p>
      )}

      {isExplicitGrid && (
        <p className="text-xs text-[#6e767d] mb-4">
          This extraction used the <span className="text-[#a4abb2]">Exact Grid</span> engine — a deterministic
          geometric grid, not automatic visual detection. Nothing was ambiguous; review and assign regions as usual.
        </p>
      )}

      {isAmbiguousSingleRegion && (
        <p className="text-xs text-[#cf7b6b] mb-4">
          Detection found only one region, but this Sequence has {sequenceShots.length} Shots. Use{" "}
          <span className="text-[#a4abb2]">Add Region</span> below to create the missing panels manually.
        </p>
      )}

      {detectionParamsSummary && (
        <div className="text-[10px] text-[#4b5158] mb-4 flex flex-col gap-0.5">
          <p>
            Detection engine: {detectionParamsSummary.engine ?? "canny"}
            {detectionParamsSummary.columns && detectionParamsSummary.rows
              ? ` (${detectionParamsSummary.columns}×${detectionParamsSummary.rows})`
              : ""}
            {detectionParamsSummary.customThreshold != null
              ? `, Custom threshold: ${detectionParamsSummary.customThreshold}`
              : detectionParamsSummary.sensitivity
                ? `, Sensitivity: ${detectionParamsSummary.sensitivity}`
                : ""}
            {detectionParamsSummary.expectedShotCount != null ? `, expected ${detectionParamsSummary.expectedShotCount} Shots` : ""}
            {detectionParamsSummary.contentCrop?.mode
              ? `. Content Crop: ${detectionParamsSummary.contentCrop.mode}` +
                (detectionParamsSummary.contentCrop.headerPercent != null
                  ? ` (header ${detectionParamsSummary.contentCrop.headerPercent}%, caption ${detectionParamsSummary.contentCrop.captionPercent}%)`
                  : "")
              : ""}
          </p>
          {detectionParamsSummary.diagnostics && (
            <p>
              Diagnostics — primary: {detectionParamsSummary.diagnostics.primaryEngine}, detected:{" "}
              {detectionParamsSummary.diagnostics.detectedCount}, confidence: {detectionParamsSummary.diagnostics.confidence}
              {detectionParamsSummary.diagnostics.threshold != null
                ? `, threshold: ${detectionParamsSummary.diagnostics.threshold}`
                : ""}
              , final engine: {detectionParamsSummary.diagnostics.finalEngine}
              {detectionParamsSummary.diagnostics.fallbackTriggered
                ? ` — fallback triggered (${detectionParamsSummary.diagnostics.fallbackReason ?? "unspecified reason"})`
                : ""}
            </p>
          )}
        </div>
      )}

      <Collapsible label="Detection Settings" defaultOpen>
        <Card>
          {canRerun ? (
            <form id="detect-again-form" action={startStoryboardExtraction} className="flex flex-col gap-3">
              <EngineFieldsToggle formId="detect-again-form" />
              <input type="hidden" name="sequenceId" value={String(sid)} />
              <input type="hidden" name="sourceStoryboardImageId" value={String(extraction.sourceStoryboardImageId)} />
              <input type="hidden" name="returnTo" value={basePath} />

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
                    expected Shot count ({sequenceShots.length}) if both are set.
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
                  Creates a new extraction — this one ({extraction.status}) is kept, never overwritten.
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

      {(extraction.status === "ready" || extraction.status === "confirmed") && (
        <>
          <SectionLabel label="Preview" />
          <Card>
            <p className="text-[10px] text-[#4b5158] mb-2">
              Drag a region to move it, or drag a corner handle to resize — the numeric fields below update live.
              Click <span className="text-[#a4abb2]">Update</span> to save.
            </p>
            <div
              data-crop-container
              className="relative w-full max-w-3xl"
              style={{ aspectRatio: `${extraction.sourceWidth} / ${extraction.sourceHeight}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={refImageUrl(extraction.sourceImagePath)}
                alt="Storyboard source"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
              />
              {regions.map((r, i) => (
                <RegionCropBox
                  key={r.id}
                  regionId={r.id}
                  index={i}
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  sourceWidth={extraction.sourceWidth}
                  sourceHeight={extraction.sourceHeight}
                  status={r.status}
                  detectionMode={r.detectionMode}
                  confidence={r.confidence}
                  editable={isEditable && r.status !== "extracted"}
                  color={getRegionColor(r.orderIndex)}
                  lockRatioFieldId={`region-${r.id}-lock-ratio`}
                  ratioSelectId="content-crop-ratio"
                />
              ))}
            </div>
          </Card>
        </>
      )}

      {(unassignedRegions.length > 0 || shotsWithoutRegion.length > 0) && isEditable && (
        <p className="text-xs text-[#cda24f] mt-3">
          {unassignedRegions.length > 0 &&
            `${unassignedRegions.length} region${unassignedRegions.length !== 1 ? "s are" : " is"} not assigned to a Shot yet. `}
          {shotsWithoutRegion.length > 0 &&
            `${shotsWithoutRegion.length} Shot${shotsWithoutRegion.length !== 1 ? "s have" : " has"} no region assigned (${shotsWithoutRegion
              .map((s) => s.shotCode ?? `#${s.id}`)
              .join(", ")}).`}
        </p>
      )}

      {(extraction.status === "ready" || extraction.status === "confirmed") && (
        <>
          <SectionLabel label={`Regions (${regions.length})`} />
          {isEditable && editableRegionIds.length > 0 && (
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
                    sourceWidth={extraction.sourceWidth}
                    sourceHeight={extraction.sourceHeight}
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
          )}
          {regions.length === 0 ? (
            <p className="text-xs text-[#4b5158]">No regions detected. Use “Add Region” below to create one manually.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {regions.map((r, i) => {
                const editable = isEditable && r.status !== "extracted";
                return (
                  <Card key={r.id}>
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="text-xs font-mono text-[#6e767d] w-16 shrink-0">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: getRegionColor(r.orderIndex) }}
                            aria-hidden="true"
                          />
                          #{i + 1}
                        </span>
                        <div className={`mt-1 text-[9px] uppercase tracking-wider ${
                          r.status === "extracted" ? "text-[#6b9e72]" : r.status === "skipped" ? "text-[#4b5158]" : r.status === "assigned" ? "text-[#5b93d6]" : "text-[#cda24f]"
                        }`}>
                          {r.status}
                        </div>
                        <div className="mt-1 text-[9px] text-[#4b5158]">{Math.round(r.confidence * 100)}% conf.</div>
                        {r.detectionMode === "grid-fallback" && isRealAutoFallback && (
                          <div className="mt-1 text-[9px] text-[#cda24f]">Grid fallback — review required</div>
                        )}
                        {r.detectionMode === "grid-fallback" && isExplicitGrid && (
                          <div className="mt-1 text-[9px] text-[#6e767d]">Exact Grid</div>
                        )}
                        {!r.textSeparationDetected && (
                          <div className="mt-1 text-[9px] text-[#4b5158]">Full cell (no caption split)</div>
                        )}
                      </div>

                      {editable ? (
                        <form action={resizeExtractionRegion} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="extractionId" value={String(extractionId)} />
                          <input type="hidden" name="regionId" value={String(r.id)} />
                          <input type="hidden" name="returnTo" value={returnToActive} />
                          {(() => {
                            const base = getContentCropBaseRect(detectionParamsSummary?.contentCropBaseRects, r.orderIndex, {
                              x: r.x,
                              y: r.y,
                              width: r.width,
                              height: r.height,
                            });
                            return (["x", "y", "width", "height"] as const).map((field) => (
                              <input
                                key={`base-${field}`}
                                type="hidden"
                                id={`region-${r.id}-base-${field}`}
                                value={base[field]}
                                readOnly
                              />
                            ));
                          })()}
                          {/* REVISE round 2 (finding #1) — separate stable base for Apply Ratio All in "Manual" mode: starts from this region's CURRENT rectangle (never the FIX5-detected cell), kept in sync with real manual edits only (RegionCropBox drag, direct field typing via ManualBaseSync) — never by an automated transformation's own output, which is what keeps repeated Apply Ratio All clicks idempotent. */}
                          {(["x", "y", "width", "height"] as const).map((field) => (
                            <input
                              key={`manual-base-${field}`}
                              type="hidden"
                              id={`region-${r.id}-manual-base-${field}`}
                              defaultValue={r[field]}
                            />
                          ))}
                          {(["x", "y", "width", "height"] as const).map((field) => (
                            <label key={field} className="flex flex-col gap-0.5">
                              <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">{field}</span>
                              <input
                                type="number"
                                id={`region-${r.id}-${field}`}
                                name={field}
                                defaultValue={r[field]}
                                min={field === "x" || field === "y" ? 0 : 1}
                                className="w-20 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                              />
                            </label>
                          ))}
                          <button
                            type="submit"
                            className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                          >
                            Update
                          </button>
                          <label className="flex items-center gap-1 text-[10px] text-[#a4abb2]">
                            <input type="checkbox" id={`region-${r.id}-lock-ratio`} />
                            Lock ratio
                          </label>
                        </form>
                      ) : (
                        <div className="text-xs font-mono text-[#4b5158]">
                          x={r.x} y={r.y} w={r.width} h={r.height}
                        </div>
                      )}

                      <div className="flex items-end gap-2">
                        {editable ? (
                          <form action={reassignExtractionRegion} className="flex items-end gap-2">
                            <input type="hidden" name="extractionId" value={String(extractionId)} />
                            <input type="hidden" name="regionId" value={String(r.id)} />
                            <input type="hidden" name="returnTo" value={returnToActive} />
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Shot</span>
                              <select
                                name="targetShotId"
                                defaultValue={r.targetShotId ?? ""}
                                className="w-40 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                              >
                                <option value="">— Unassigned —</option>
                                {sequenceShots.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.shotCode ?? s.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                            >
                              Assign
                            </button>
                          </form>
                        ) : (
                          <div className="text-xs text-[#4b5158]">
                            {sequenceShots.find((s) => s.id === r.targetShotId)?.shotCode ?? "—"}
                          </div>
                        )}
                      </div>

                      {editable && (
                        <div className="flex items-end gap-2 ml-auto">
                          {r.status !== "skipped" && (
                            <form action={skipExtractionRegion}>
                              <input type="hidden" name="extractionId" value={String(extractionId)} />
                              <input type="hidden" name="regionId" value={String(r.id)} />
                              <input type="hidden" name="returnTo" value={returnToActive} />
                              <button type="submit" className="text-[10px] text-[#cda24f] hover:text-[#e0b968] transition-colors">
                                Skip
                              </button>
                            </form>
                          )}
                          <form action={deleteExtractionRegion}>
                            <input type="hidden" name="extractionId" value={String(extractionId)} />
                            <input type="hidden" name="regionId" value={String(r.id)} />
                            <input type="hidden" name="returnTo" value={returnToActive} />
                            <button type="submit" className="text-[10px] text-[#cf7b6b] hover:text-[#e0958a] transition-colors">
                              Delete
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {isEditable && (
            <div className="mt-3">
              <form action={addExtractionRegion}>
                <input type="hidden" name="extractionId" value={String(extractionId)} />
                <input type="hidden" name="returnTo" value={returnToActive} />
                <button
                  type="submit"
                  className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                >
                  + Add Region
                </button>
              </form>
            </div>
          )}

          {isEditable && (
            <>
              <SectionLabel label="Confirm & Extract" />
              <Card>
                <p className="text-xs text-[#6e767d] mb-3">
                  {assignedCount === 0
                    ? "No regions are assigned to a Shot yet — assign at least one before extracting."
                    : `${assignedCount} region${assignedCount !== 1 ? "s" : ""} will be cropped and saved as draft storyboard images on their assigned Shots. Skipped and unassigned regions are left untouched.`}
                </p>
                <form action={confirmStoryboardExtraction} className="flex items-end gap-3">
                  <input type="hidden" name="extractionId" value={String(extractionId)} />
                  <input type="hidden" name="returnTo" value={returnToActive} />
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Padding (px, inward)</span>
                    <input
                      type="number"
                      name="padding"
                      defaultValue={0}
                      min={0}
                      className="w-28 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={assignedCount === 0}
                    className="rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-3 py-1.5 text-sm font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm & Extract
                  </button>
                </form>
              </Card>
            </>
          )}
        </>
      )}

      <div className="mt-10 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link href={basePath} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Choose a different source
        </Link>
        <Link href={storyboardPagePath} className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors">
          ↑ Back to Storyboard
        </Link>
      </div>
    </div>
  );
}
