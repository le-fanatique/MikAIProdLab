"use server";

// ---------------------------------------------------------------------------
// storyboardExtractionRegions.ts — SEQGEN.STORYBOARD.EXTRACT.1 / FIX4
//
// Region edits — pure DB updates, no file I/O; unit and bulk actions. Split
// from the former `src/actions/storyboardExtraction.ts` by IND.SPLIT.1 —
// see `src/actions/storyboardExtractionStart.ts` and
// `src/actions/storyboardExtractionConfirm.ts` for the rest.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
  shots,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  proposeShotMapping,
  parseStrictBoundedFloat,
} from "@/lib/storyboardExtraction/workerContract";
import { parseRegionEdits, type RegionEdit } from "@/lib/storyboardExtraction/regionEdits";
import {
  resolveExtractionShotRange,
  type ExtractionShotRangeSource,
} from "@/lib/storyboardExtraction/resolveExtractionShotRange";
import {
  isContentCropMode,
  parseStrictContentCropPercent,
  type ContentCropMode,
  type ContentCropBaseRects,
  type Rect,
} from "@/lib/storyboardExtraction/contentCrop";
import { isRatioPreset, isValidSizeMultiplier, type RatioPreset } from "@/lib/storyboardExtraction/ratioCrop";
import { errRedirectTo, okRedirectTo } from "@/lib/storyboardExtraction/actionHelpers";

async function loadEditableRegion(regionId: number, extractionId: number) {
  const [region] = await db
    .select()
    .from(sequenceStoryboardExtractionRegions)
    .where(eq(sequenceStoryboardExtractionRegions.id, regionId));
  if (!region) throw new Error("Region not found.");
  if (region.extractionId !== extractionId) throw new Error("Region does not belong to this extraction.");
  if (region.status === "extracted") throw new Error("This region has already been extracted and can no longer be edited.");
  return region;
}

export async function addExtractionRegion(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(extractionId) || extractionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }
  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction) errRedirectTo(returnTo, "extractError", "Extraction not found.");
  if (extraction.status !== "ready") errRedirectTo(returnTo, "extractError", "This extraction can no longer be edited.");

  const existing = await db
    .select({ orderIndex: sequenceStoryboardExtractionRegions.orderIndex })
    .from(sequenceStoryboardExtractionRegions)
    .where(eq(sequenceStoryboardExtractionRegions.extractionId, extractionId));
  const nextOrder = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.orderIndex)) + 1;

  // Default manual rectangle: a centered 30%x30% box, clamped to at least 8px.
  const w = Math.max(8, Math.round(extraction.sourceWidth * 0.3));
  const h = Math.max(8, Math.round(extraction.sourceHeight * 0.3));
  const x = Math.max(0, Math.round((extraction.sourceWidth - w) / 2));
  const y = Math.max(0, Math.round((extraction.sourceHeight - h) / 2));

  // REVISE fix — a manually-added region gets its own Content Crop base
  // rect too, recorded at the moment of creation, same as a detected one.
  let existingParams: Record<string, unknown> = {};
  try {
    existingParams = extraction.paramsJson ? JSON.parse(extraction.paramsJson) : {};
  } catch {
    existingParams = {};
  }
  const existingBaseRects: ContentCropBaseRects =
    existingParams.contentCropBaseRects && typeof existingParams.contentCropBaseRects === "object"
      ? (existingParams.contentCropBaseRects as ContentCropBaseRects)
      : {};
  const newRect: Rect = { x, y, width: w, height: h };
  const updatedParamsJson = JSON.stringify({
    ...existingParams,
    contentCropBaseRects: { ...existingBaseRects, [String(nextOrder)]: newRect },
  });

  db.transaction((tx) => {
    tx.insert(sequenceStoryboardExtractionRegions)
      .values({
        extractionId,
        orderIndex: nextOrder,
        x,
        y,
        width: w,
        height: h,
        illustrationHeight: null,
        textSeparationDetected: false,
        confidence: 1,
        detectionMode: "manual",
        status: "pending",
        targetShotId: null,
      })
      .run();
    tx.update(sequenceStoryboardExtractions)
      .set({ paramsJson: updatedParamsJson, updatedAt: new Date().toISOString() })
      .where(eq(sequenceStoryboardExtractions.id, extractionId))
      .run();
  });

  okRedirectTo(returnTo, "extractRegionAdded");
}

export async function resizeExtractionRegion(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const regionId = parseInt(formData.get("regionId") as string, 10);
  const x = parseInt(formData.get("x") as string, 10);
  const y = parseInt(formData.get("y") as string, 10);
  const width = parseInt(formData.get("width") as string, 10);
  const height = parseInt(formData.get("height") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (
    !Number.isInteger(extractionId) ||
    extractionId <= 0 ||
    !Number.isInteger(regionId) ||
    regionId <= 0 ||
    ![x, y, width, height].every((v) => Number.isInteger(v))
  ) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }
  if (width <= 0 || height <= 0 || x < 0 || y < 0) {
    errRedirectTo(returnTo, "extractError", "Region dimensions must be positive.");
  }

  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction) errRedirectTo(returnTo, "extractError", "Extraction not found.");
  if (x + width > extraction.sourceWidth || y + height > extraction.sourceHeight) {
    errRedirectTo(returnTo, "extractError", "Region is outside the source image bounds.");
  }

  try {
    await loadEditableRegion(regionId, extractionId);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid region.");
  }

  await db
    .update(sequenceStoryboardExtractionRegions)
    .set({ x, y, width, height, updatedAt: new Date().toISOString() })
    .where(eq(sequenceStoryboardExtractionRegions.id, regionId));

  okRedirectTo(returnTo, "extractRegionResized");
}

export async function reassignExtractionRegion(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const regionId = parseInt(formData.get("regionId") as string, 10);
  const rawShotId = (formData.get("targetShotId") as string | null) ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(extractionId) || extractionId <= 0 || !Number.isInteger(regionId) || regionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }

  try {
    // Called for its guards alone — it throws when the region is missing,
    // foreign to this extraction, or already extracted. Its return value was
    // never used; the unused binding came along with the split and goes here.
    await loadEditableRegion(regionId, extractionId);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid region.");
  }

  const [extraction] = await db
    .select({ sequenceId: sequenceStoryboardExtractions.sequenceId })
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction) errRedirectTo(returnTo, "extractError", "Extraction not found.");

  let targetShotId: number | null = null;
  if (rawShotId.trim() !== "") {
    const parsed = parseInt(rawShotId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errRedirectTo(returnTo, "extractError", "Invalid Shot.");
    }
    const [shot] = await db.select({ id: shots.id, sequenceId: shots.sequenceId }).from(shots).where(eq(shots.id, parsed));
    if (!shot) errRedirectTo(returnTo, "extractError", "Shot not found.");
    if (shot.sequenceId !== extraction.sequenceId) errRedirectTo(returnTo, "extractError", "Shot does not belong to this Sequence.");
    targetShotId = parsed;
  }

  await db
    .update(sequenceStoryboardExtractionRegions)
    .set({
      targetShotId,
      status: targetShotId !== null ? "assigned" : "pending",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sequenceStoryboardExtractionRegions.id, regionId));

  okRedirectTo(returnTo, "extractRegionReassigned");
}

export async function skipExtractionRegion(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const regionId = parseInt(formData.get("regionId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(extractionId) || extractionId <= 0 || !Number.isInteger(regionId) || regionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }
  try {
    await loadEditableRegion(regionId, extractionId);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid region.");
  }

  await db
    .update(sequenceStoryboardExtractionRegions)
    .set({ status: "skipped", updatedAt: new Date().toISOString() })
    .where(eq(sequenceStoryboardExtractionRegions.id, regionId));

  okRedirectTo(returnTo, "extractRegionSkipped");
}

export async function deleteExtractionRegion(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const regionId = parseInt(formData.get("regionId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(extractionId) || extractionId <= 0 || !Number.isInteger(regionId) || regionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }
  try {
    await loadEditableRegion(regionId, extractionId);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid region.");
  }

  await db.delete(sequenceStoryboardExtractionRegions).where(eq(sequenceStoryboardExtractionRegions.id, regionId));

  okRedirectTo(returnTo, "extractRegionDeleted");
}

// ---------------------------------------------------------------------------
// Bulk actions (FIX4) — still pure DB updates, no file I/O, no crop/draft/
// reference ever created here. Both are idempotent (re-submitting the same
// values/mapping twice yields the same end state), so no extra double-submit
// guard is needed beyond what atomicity below already provides.
// ---------------------------------------------------------------------------

/**
 * "Update All" — applies every editable region's currently-displayed x/y/
 * width/height in a single transaction. Any single invalid entry (bad
 * bounds, region already extracted, region outside source image, region not
 * belonging to this extraction) aborts the ENTIRE batch — no partial apply,
 * matching the unit `Update` action's own per-region bounds checks exactly
 * so the two paths can never silently disagree on what's valid.
 */
export async function resizeAllExtractionRegions(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  const regionsRaw = (formData.get("regionsJson") as string | null) ?? "[]";

  if (!Number.isInteger(extractionId) || extractionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }

  let edits: RegionEdit[];
  try {
    edits = parseRegionEdits(regionsRaw);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid region data.");
  }
  if (edits.length === 0) {
    errRedirectTo(returnTo, "extractError", "No editable regions to update.");
  }

  // FIX5 — Content Crop settings (mode + header/caption %) accompany every
  // Update All submission (the form always includes them), persisted into
  // paramsJson alongside the existing detection params/padding, so a reload
  // pre-fills the same choice. Optional/absent (e.g. a hand-crafted request
  // without the field) means "don't touch this part of paramsJson" — never
  // silently reset to a default. Invalid values reject the WHOLE batch, same
  // as an invalid region rectangle: the rectangles were computed from these
  // exact settings client-side, so persisting one without the other would
  // desynchronize what the page shows on reload from what's on disk.
  const rawContentCropMode = (formData.get("contentCropMode") as string | null)?.trim() ?? "";
  let contentCropMode: ContentCropMode | null = null;
  let contentCropHeaderPercent: number | null = null;
  let contentCropCaptionPercent: number | null = null;
  if (rawContentCropMode !== "") {
    if (!isContentCropMode(rawContentCropMode)) {
      errRedirectTo(returnTo, "extractError", "Invalid Content Crop mode.");
    }
    contentCropMode = rawContentCropMode;

    const rawHeader = (formData.get("contentCropHeaderPercent") as string | null) ?? "";
    const rawCaption = (formData.get("contentCropCaptionPercent") as string | null) ?? "";
    // REVISE fix — strict parsing: "20abc" must be refused outright, never
    // silently truncated to 20 the way parseInt would. The client is never
    // a trust boundary for this value.
    const headerPercent = parseStrictContentCropPercent(rawHeader);
    const captionPercent = parseStrictContentCropPercent(rawCaption);
    if (headerPercent === null || captionPercent === null) {
      errRedirectTo(
        returnTo,
        "extractError",
        "Content Crop header/caption percentages must be whole numbers between 0 and 45."
      );
    }
    contentCropHeaderPercent = headerPercent;
    contentCropCaptionPercent = captionPercent;
  }

  // FIX6 (Lot C) — ratio + size multiplier, same "present together, absent
  // means don't touch this part of paramsJson" contract as Content Crop
  // above. Only meaningful alongside a Content Crop submission (the same
  // form always sends all of them together), but validated independently
  // so a malformed ratio never silently falls back to "free".
  const rawRatio = (formData.get("contentCropRatio") as string | null)?.trim() ?? "";
  let contentCropRatio: RatioPreset | null = null;
  let contentCropSizeMultiplier: number | null = null;
  if (rawRatio !== "") {
    if (!isRatioPreset(rawRatio)) {
      errRedirectTo(returnTo, "extractError", "Invalid ratio preset.");
    }
    contentCropRatio = rawRatio;

    const rawMultiplier = (formData.get("contentCropSizeMultiplier") as string | null) ?? "";
    const multiplier = parseStrictBoundedFloat(rawMultiplier, 0.1, 1.0);
    if (multiplier === null || !isValidSizeMultiplier(multiplier)) {
      errRedirectTo(returnTo, "extractError", "Size multiplier must be a number between 0.10 and 1.00.");
    }
    contentCropSizeMultiplier = multiplier;
  }

  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction) errRedirectTo(returnTo, "extractError", "Extraction not found.");
  if (extraction.status !== "ready") {
    errRedirectTo(returnTo, "extractError", "This extraction can no longer be edited.");
  }

  const existingRegions = await db
    .select()
    .from(sequenceStoryboardExtractionRegions)
    .where(eq(sequenceStoryboardExtractionRegions.extractionId, extractionId));
  const existingById = new Map(existingRegions.map((r) => [r.id, r]));

  // Full validation pass BEFORE any write — a single bad entry must reject
  // the whole batch, never partially apply.
  for (const edit of edits) {
    const region = existingById.get(edit.regionId);
    if (!region) {
      errRedirectTo(returnTo, "extractError", `Region ${edit.regionId} not found in this extraction.`);
    }
    if (region.status === "extracted") {
      errRedirectTo(returnTo, "extractError", `Region ${edit.regionId} has already been extracted and can no longer be edited.`);
    }
    if (edit.x + edit.width > extraction.sourceWidth || edit.y + edit.height > extraction.sourceHeight) {
      errRedirectTo(returnTo, "extractError", `Region ${edit.regionId} is outside the source image bounds.`);
    }
  }

  let existingParams: Record<string, unknown> = {};
  try {
    existingParams = extraction.paramsJson ? JSON.parse(extraction.paramsJson) : {};
  } catch {
    existingParams = {};
  }

  // REVISE fix — backfill a Content Crop base rect for any region about to
  // be edited that doesn't have one yet (extractions created before this
  // field existed). Uses the region's PRE-edit rectangle (its state right
  // now, before this very update applies edit.x/y/width/height below) —
  // never the just-submitted values — so an old region's first Update All
  // after upgrading establishes a real, stable base instead of silently
  // freezing an already-cropped rectangle as if it were the original.
  // Runs on every Update All (not only when Content Crop fields are
  // present) so a plain manual edit still protects a future Content Crop
  // use on the same region.
  const existingBaseRects: ContentCropBaseRects =
    existingParams.contentCropBaseRects && typeof existingParams.contentCropBaseRects === "object"
      ? (existingParams.contentCropBaseRects as ContentCropBaseRects)
      : {};
  const baseRectsWithBackfill: ContentCropBaseRects = { ...existingBaseRects };
  for (const edit of edits) {
    const region = existingById.get(edit.regionId)!;
    const key = String(region.orderIndex);
    if (!(key in baseRectsWithBackfill)) {
      baseRectsWithBackfill[key] = { x: region.x, y: region.y, width: region.width, height: region.height };
    }
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const edit of edits) {
      tx.update(sequenceStoryboardExtractionRegions)
        .set({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, updatedAt: now })
        .where(eq(sequenceStoryboardExtractionRegions.id, edit.regionId))
        .run();
    }

    const nextParams: Record<string, unknown> = { ...existingParams, contentCropBaseRects: baseRectsWithBackfill };
    if (contentCropMode !== null) {
      nextParams.contentCrop = {
        mode: contentCropMode,
        headerPercent: contentCropHeaderPercent,
        captionPercent: contentCropCaptionPercent,
        ratio: contentCropRatio,
        sizeMultiplier: contentCropSizeMultiplier,
      };
    }
    tx.update(sequenceStoryboardExtractions)
      .set({ paramsJson: JSON.stringify(nextParams), updatedAt: now })
      .where(eq(sequenceStoryboardExtractions.id, extractionId))
      .run();
  });

  okRedirectTo(returnTo, "extractAllUpdated");
}

/**
 * "Assign All" — explicitly (re-)applies the same reading-order → Shot-order
 * mapping used at detection time (proposeShotMapping) to every currently
 * editable, non-skipped region. Never touches `skipped` (an explicit prior
 * user decision, not silently overridden) or `extracted` (immutable) regions.
 * Regions past the last Shot are left unassigned ("pending"), never
 * inventing a mapping — Shots past the last region simply stay unmapped,
 * surfaced by the existing "Shots without a region" banner. Pure DB update:
 * never queues extraction, never creates a crop/draft/reference.
 */
export async function assignAllExtractionRegions(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(extractionId) || extractionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }

  // SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — an explicit correction, own
  // FormData, same field names as everywhere else in this feature. Lets the
  // user fix a decided-wrong Shot range and re-apply the mapping without
  // re-running detection. Both facultative: absent means "use whatever
  // paramsJson already recorded", never mandatory.
  const rawShotFromId = (formData.get("shotFrom") as string | null)?.trim();
  const explicitShotFromId = rawShotFromId && /^-?\d+$/.test(rawShotFromId) ? parseInt(rawShotFromId, 10) : null;
  const rawShotToId = (formData.get("shotTo") as string | null)?.trim();
  const explicitShotToId = rawShotToId && /^-?\d+$/.test(rawShotToId) ? parseInt(rawShotToId, 10) : null;
  const explicitShotRange =
    explicitShotFromId !== null || explicitShotToId !== null
      ? { fromShotId: explicitShotFromId, toShotId: explicitShotToId }
      : null;

  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction) errRedirectTo(returnTo, "extractError", "Extraction not found.");
  if (extraction.status !== "ready") {
    errRedirectTo(returnTo, "extractError", "This extraction can no longer be edited.");
  }

  const allRegions = await db
    .select()
    .from(sequenceStoryboardExtractionRegions)
    .where(eq(sequenceStoryboardExtractionRegions.extractionId, extractionId))
    .orderBy(asc(sequenceStoryboardExtractionRegions.orderIndex));
  const mappableRegions = allRegions.filter((r) => r.status !== "extracted" && r.status !== "skipped");
  if (mappableRegions.length === 0) {
    errRedirectTo(returnTo, "extractError", "No regions available to assign (all are extracted or skipped).");
  }

  const sequenceShots = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, extraction.sequenceId))
    .orderBy(asc(shots.orderIndex));

  // SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — `paramsJson.shotRange` is what
  // `startStoryboardExtraction` actually resolved and used for THIS
  // extraction (§5's `ResolvedExtractionShotRange`, minus warnings). Absent,
  // illegible, or missing the field (every extraction that predates this
  // ticket) falls back to the full Sequence — the exact unchanged behavior.
  let existingParams: Record<string, unknown> = {};
  try {
    existingParams = extraction.paramsJson ? JSON.parse(extraction.paramsJson) : {};
  } catch {
    existingParams = {};
  }
  const persistedShotRange = existingParams.shotRange as
    | { shotIdsInOrder?: unknown; source?: ExtractionShotRangeSource; droppedShotIds?: unknown }
    | undefined;
  const persistedShotIdsInOrder =
    persistedShotRange && Array.isArray(persistedShotRange.shotIdsInOrder)
      ? (persistedShotRange.shotIdsInOrder as number[])
      : null;

  // REVISE — a Shot named by `persistedShotIdsInOrder` may have been deleted
  // AFTER detection persisted it (a live, ordinary occurrence: nothing here
  // pins the Sequence's Shots at detection time). Using that list raw let
  // `proposeShotMapping` hand a dead Shot id to `targetShotId`, and the
  // write threw `FOREIGN KEY constraint failed` — uncaught, out of any
  // redirect, rolling back the whole transaction. Every branch now goes
  // through the same `resolveExtractionShotRange`, which already filters
  // dead ids, reports them, and falls back to the full Sequence when none
  // survive — exactly what the explicit branch already relied on.
  const resolved = explicitShotRange
    ? resolveExtractionShotRange(sequenceShots, null, explicitShotRange)
    : persistedShotIdsInOrder
      ? resolveExtractionShotRange(sequenceShots, persistedShotIdsInOrder, null)
      : null;

  const shotIdsInOrder = resolved ? resolved.shotIdsInOrder : sequenceShots.map((s) => s.id);
  // An explicit override, or a persisted range that needed re-resolving
  // against the live Shots (dead ids filtered, or a full fallback), is
  // written back so a page reload never reverts to a stale/dead mapping.
  const paramsJsonToPersist = resolved
    ? JSON.stringify({
        ...existingParams,
        shotRange: {
          shotIdsInOrder: resolved.shotIdsInOrder,
          source: resolved.source,
          droppedShotIds: resolved.droppedShotIds,
        },
      })
    : null;

  const mapping = proposeShotMapping(
    mappableRegions.map((r) => ({ orderIndex: r.orderIndex })),
    shotIdsInOrder
  );

  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const region of mappableRegions) {
      const targetShotId = mapping.get(region.orderIndex) ?? null;
      tx.update(sequenceStoryboardExtractionRegions)
        .set({
          targetShotId,
          status: targetShotId !== null ? "assigned" : "pending",
          updatedAt: now,
        })
        .where(eq(sequenceStoryboardExtractionRegions.id, region.id))
        .run();
    }
    if (paramsJsonToPersist !== null) {
      tx.update(sequenceStoryboardExtractions)
        .set({ paramsJson: paramsJsonToPersist, updatedAt: now })
        .where(eq(sequenceStoryboardExtractions.id, extractionId))
        .run();
    }
  });

  okRedirectTo(returnTo, "extractAllAssigned");
}
