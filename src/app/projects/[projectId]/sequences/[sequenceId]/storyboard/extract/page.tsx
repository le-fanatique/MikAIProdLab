import Link from "next/link";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
  generationJobs,
} from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import SectionLabel from "@/components/storyboardExtraction/SectionLabel";
import SourceSelectionView from "@/components/storyboardExtraction/SourceSelectionView";
import ExtractionStatusBanners from "@/components/storyboardExtraction/ExtractionStatusBanners";
import DetectionSettingsCard from "@/components/storyboardExtraction/DetectionSettingsCard";
import RegionsPreview from "@/components/storyboardExtraction/RegionsPreview";
import BulkRegionControls from "@/components/storyboardExtraction/BulkRegionControls";
import RegionCard from "@/components/storyboardExtraction/RegionCard";
import AddRegionForm from "@/components/storyboardExtraction/AddRegionForm";
import ConfirmExtractCard from "@/components/storyboardExtraction/ConfirmExtractCard";
import StoryboardShotRangeCard from "@/components/storyboardExtraction/StoryboardShotRangeCard";
import { computeGridFactorization, type DetectionDiagnostics } from "@/lib/storyboardExtraction/workerContract";
import {
  isContentCropMode,
  type ContentCropMode,
  type ContentCropBaseRects,
} from "@/lib/storyboardExtraction/contentCrop";
import { isRatioPreset, type RatioPreset } from "@/lib/storyboardExtraction/ratioCrop";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { resolveExtractionShotRange } from "@/lib/storyboardExtraction/resolveExtractionShotRange";

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

// Same "shotCode, else title, else Shot {id}" convention as the generate
// page's own copy and StoryboardShotRangeChoice's option labels.
function shotDisplayLabel(shot: { id: number; shotCode: string | null; title: string | null }): string {
  return shot.shotCode?.trim() || shot.title?.trim() || `Shot ${shot.id}`;
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
      <SourceSelectionView
        crumbs={crumbs}
        metaText={`${project.name} · ${sequence.title}`}
        extractError={extractError}
        sourceDrafts={sourceDrafts}
        storyboardPagePath={storyboardPagePath}
        sequenceId={sid}
        returnTo={returnTo}
      />
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

  // SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — the inherited Shot range, read
  // independently of `startStoryboardExtraction`'s own copy (same convention
  // as this repository's other pages recomputing their own canonical data —
  // see the generate page's header comment). Every link can be missing: a
  // manually uploaded source image has no `jobId` at all, the job may since
  // have been deleted, or the snapshot may lack the field — all fall through
  // to `null` ("no inherited range"), never an error.
  let inheritedShotIds: number[] | null = null;
  if (extraction.sourceStoryboardImageId !== null) {
    const [sourceImage] = await db
      .select({ jobId: sequenceStoryboardImages.jobId })
      .from(sequenceStoryboardImages)
      .where(eq(sequenceStoryboardImages.id, extraction.sourceStoryboardImageId));
    if (sourceImage?.jobId !== null && sourceImage?.jobId !== undefined) {
      const [job] = await db
        .select({ payloadSnapshot: generationJobs.payloadSnapshot })
        .from(generationJobs)
        .where(eq(generationJobs.id, sourceImage.jobId));
      const snapshot = job ? parseGenerationSnapshot(job.payloadSnapshot) : null;
      inheritedShotIds = snapshot?.sequenceStoryboardShotRange?.shotIdsInOrder ?? null;
    }
  }

  // The user's own explicit override — read straight from this page's own
  // `shotFrom`/`shotTo` search params, the same GET form contract
  // `StoryboardShotRangeChoice` already uses on the generate page. Both
  // facultative: absent means "no explicit choice", never mandatory.
  const rawShotFrom = sp(resolvedSearchParams["shotFrom"]);
  const rawShotTo = sp(resolvedSearchParams["shotTo"]);
  const explicitShotFromId = rawShotFrom && /^-?\d+$/.test(rawShotFrom) ? parseInt(rawShotFrom, 10) : null;
  const explicitShotToId = rawShotTo && /^-?\d+$/.test(rawShotTo) ? parseInt(rawShotTo, 10) : null;
  const explicitShotRange =
    explicitShotFromId !== null || explicitShotToId !== null
      ? { fromShotId: explicitShotFromId, toShotId: explicitShotToId }
      : null;

  const resolvedShotRange = resolveExtractionShotRange(sequenceShots, inheritedShotIds, explicitShotRange);
  const resolvedShotIdSet = new Set(resolvedShotRange.shotIdsInOrder);
  const effectiveShotCount = resolvedShotRange.shotIdsInOrder.length;

  // Every action below (Update/Reassign/Skip/Add/Delete) must return to this
  // same active extraction, not the bare source-selection page — the outer
  // `returnTo` (state A only) deliberately omits extractionId.
  const returnToActive = `${basePath}?extractionId=${extractionId}`;

  const assignedShotIds = new Set(regions.filter((r) => r.status !== "skipped" && r.targetShotId !== null).map((r) => r.targetShotId!));
  // SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — scoped to the resolved range: a
  // Shot outside the current range was never expected to have a region, so
  // it is not a deficit.
  const shotsWithoutRegion = sequenceShots.filter((s) => resolvedShotIdSet.has(s.id) && !assignedShotIds.has(s.id));
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
    effectiveShotCount > 0 && extraction.sourceWidth > 0 && extraction.sourceHeight > 0
      ? computeGridFactorization(effectiveShotCount, extraction.sourceWidth / extraction.sourceHeight)
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
    isEditable && regions.length <= 1 && effectiveShotCount > 1 && !isRealAutoFallback && !isExplicitGrid;

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

      <ExtractionStatusBanners
        extractError={extractError}
        okMessage={okMessage}
        status={extraction.status}
        errorMessage={extraction.errorMessage}
        isRealAutoFallback={isRealAutoFallback}
        diagnostics={diagnostics}
        sequenceShotsCount={effectiveShotCount}
        isExplicitGrid={isExplicitGrid}
        isAmbiguousSingleRegion={isAmbiguousSingleRegion}
        detectionParamsSummary={detectionParamsSummary}
      />

      <StoryboardShotRangeCard
        basePath={basePath}
        currentSearchParams={{ extractionId: String(extractionId) }}
        shots={sequenceShots.map((s) => ({ id: s.id, label: shotDisplayLabel(s) }))}
        currentFromValue={rawShotFrom ?? ""}
        currentToValue={rawShotTo ?? ""}
        source={resolvedShotRange.source}
        shotCount={effectiveShotCount}
        totalShotCount={sequenceShots.length}
        droppedShotIds={resolvedShotRange.droppedShotIds}
        warnings={resolvedShotRange.warnings}
      />

      <DetectionSettingsCard
        canRerun={canRerun}
        sequenceId={sid}
        sourceStoryboardImageId={extraction.sourceStoryboardImageId}
        basePath={basePath}
        extractionStatus={extraction.status}
        detectionParamsSummary={detectionParamsSummary}
        suggestedGrid={suggestedGrid}
        sequenceShotsCount={effectiveShotCount}
        shotFromValue={rawShotFrom}
        shotToValue={rawShotTo}
      />

      {(extraction.status === "ready" || extraction.status === "confirmed") && (
        <>
          <SectionLabel label="Preview" />
          <RegionsPreview
            sourceImagePath={extraction.sourceImagePath}
            sourceWidth={extraction.sourceWidth}
            sourceHeight={extraction.sourceHeight}
            regions={regions}
            isEditable={isEditable}
          />
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
            <BulkRegionControls
              extractionId={extractionId}
              returnToActive={returnToActive}
              contentCropMode={contentCropMode}
              contentCropHeaderPercent={contentCropHeaderPercent}
              contentCropCaptionPercent={contentCropCaptionPercent}
              contentCropRatio={contentCropRatio}
              contentCropSizeMultiplier={contentCropSizeMultiplier}
              contentCropTargetRegionIds={contentCropTargetRegionIds}
              sourceWidth={extraction.sourceWidth}
              sourceHeight={extraction.sourceHeight}
              editableRegionIds={editableRegionIds}
              shotFromValue={rawShotFrom}
              shotToValue={rawShotTo}
            />
          )}
          {regions.length === 0 ? (
            <p className="text-xs text-[#4b5158]">No regions detected. Use “Add Region” below to create one manually.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {regions.map((r, i) => {
                const editable = isEditable && r.status !== "extracted";
                return (
                  <RegionCard
                    key={r.id}
                    r={r}
                    index={i}
                    editable={editable}
                    extractionId={extractionId}
                    returnToActive={returnToActive}
                    isRealAutoFallback={isRealAutoFallback}
                    isExplicitGrid={isExplicitGrid}
                    sequenceShots={sequenceShots}
                    contentCropBaseRects={detectionParamsSummary?.contentCropBaseRects}
                  />
                );
              })}
            </div>
          )}

          {isEditable && <AddRegionForm extractionId={extractionId} returnToActive={returnToActive} />}

          {isEditable && (
            <>
              <SectionLabel label="Confirm & Extract" />
              <ConfirmExtractCard extractionId={extractionId} returnToActive={returnToActive} assignedCount={assignedCount} />
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
