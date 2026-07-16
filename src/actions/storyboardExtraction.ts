"use server";

// ---------------------------------------------------------------------------
// storyboardExtraction.ts — SEQGEN.STORYBOARD.EXTRACT.1
//
// Detects panels in an existing Sequence Storyboard contact sheet (OpenCV
// worker), lets the user review/edit the proposed regions, then extracts
// confirmed regions into Shot-level `storyboard_images` drafts.
//
// `Extract` (confirmExtraction) is the ONLY action that creates files/drafts.
// Every other action here is a pure DB update (add/resize/reassign/skip/
// delete a region) — no filesystem I/O. Nothing here ever sets a draft to
// "approved", touches `shots.approvedVideoPath`, or writes to
// `shot_reference_images`.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  sequences,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
  storyboardImages,
  shotReferenceImages,
  shots,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { runDetect, runCrop, OPENCV_INPUT_IMAGE_EXTS, OpenCvWorkerError } from "@/lib/storyboardExtraction/opencvWorker";
import {
  proposeShotMapping,
  sortRegionsReadingOrder,
  isDetectionRequestMode,
  isSensitivity,
  isValidGridDimension,
  type DetectionRequestMode,
  type Sensitivity,
} from "@/lib/storyboardExtraction/workerContract";
import { parseRegionEdits, type RegionEdit } from "@/lib/storyboardExtraction/regionEdits";

function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

function okRedirectTo(returnTo: string, param: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=1`);
}

/** Resolves+validates a `sequence_storyboard_images` relative path against the same publicRoot/uploads containment pattern used across the codebase. */
async function resolveSourceImageAbsolutePath(relativePath: string): Promise<string> {
  const publicRoot = path.join(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, "uploads", "sequence-storyboard-images");
  const absolute = path.resolve(publicRoot, relativePath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    throw new OpenCvWorkerError("Source image path is not in the expected location.");
  }
  const ext = path.extname(absolute).toLowerCase();
  if (!OPENCV_INPUT_IMAGE_EXTS.has(ext)) {
    throw new OpenCvWorkerError("Source image has an unsupported format.");
  }
  return absolute;
}

// ---------------------------------------------------------------------------
// Start a new extraction (detection)
// ---------------------------------------------------------------------------

export async function startStoryboardExtraction(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const sourceStoryboardImageId = parseInt(formData.get("sourceStoryboardImageId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }
  if (!Number.isInteger(sourceStoryboardImageId) || sourceStoryboardImageId <= 0) {
    errRedirectTo(returnTo, "extractError", "Please choose a source image.");
  }

  // FIX3 — Detection Settings, all optional with safe defaults so the
  // original source-selection form (which never sends these fields) keeps
  // its exact prior behavior (mode "auto", sensitivity "medium", no
  // explicit grid shape).
  const rawMode = ((formData.get("mode") as string | null) ?? "auto").trim() || "auto";
  if (!isDetectionRequestMode(rawMode)) {
    errRedirectTo(returnTo, "extractError", "Invalid detection mode.");
  }
  const mode: DetectionRequestMode = rawMode;

  const rawSensitivity = ((formData.get("sensitivity") as string | null) ?? "medium").trim() || "medium";
  if (!isSensitivity(rawSensitivity)) {
    errRedirectTo(returnTo, "extractError", "Invalid sensitivity.");
  }
  const sensitivity: Sensitivity = rawSensitivity;

  const rawColumns = (formData.get("columns") as string | null)?.trim() ?? "";
  const rawRows = (formData.get("rows") as string | null)?.trim() ?? "";
  let columns: number | null = null;
  let rows: number | null = null;
  if (rawColumns !== "" || rawRows !== "") {
    if (rawColumns === "" || rawRows === "") {
      errRedirectTo(returnTo, "extractError", "Provide both Columns and Rows, or neither.");
    }
    const parsedColumns = parseInt(rawColumns, 10);
    const parsedRows = parseInt(rawRows, 10);
    if (!isValidGridDimension(parsedColumns) || !isValidGridDimension(parsedRows)) {
      errRedirectTo(returnTo, "extractError", "Columns and Rows must each be a whole number between 1 and 12.");
    }
    columns = parsedColumns;
    rows = parsedRows;
  }
  // Grid mode without explicit Columns/Rows still needs the expected Shot
  // count to build a shape from — validated once that count is known below;
  // the worker itself refuses with a clear error if neither is available.

  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirectTo(returnTo, "extractError", "Sequence not found.");

  const [source] = await db
    .select()
    .from(sequenceStoryboardImages)
    .where(eq(sequenceStoryboardImages.id, sourceStoryboardImageId));
  if (!source) errRedirectTo(returnTo, "extractError", "Source image not found.");
  if (source.sequenceId !== sequenceId) errRedirectTo(returnTo, "extractError", "Source image does not belong to this Sequence.");

  let absoluteInputPath: string;
  try {
    absoluteInputPath = await resolveSourceImageAbsolutePath(source.imagePath);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid source image.");
  }

  const sequenceShots = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));
  const shotIdsInOrder = sequenceShots.map((s) => s.id);
  const expectedShotCount = shotIdsInOrder.length;

  // Persisted verbatim below as paramsJson — the params actually used for
  // this extraction, not just what was requested (mirrors what padding
  // already does at confirm time).
  const detectionParams = { mode, columns, rows, sensitivity, expectedShotCount };

  const [extraction] = await db
    .insert(sequenceStoryboardExtractions)
    .values({
      sequenceId,
      sourceStoryboardImageId,
      sourceImagePath: source.imagePath,
      sourceWidth: 0,
      sourceHeight: 0,
      status: "detecting",
      paramsJson: JSON.stringify(detectionParams),
    })
    .returning();

  const extractionBase = returnTo.split("?")[0];

  try {
    const detected = await runDetect(absoluteInputPath, {
      expectedShotCount,
      mode,
      columns: columns ?? undefined,
      rows: rows ?? undefined,
      sensitivity,
    });
    const orderedRegions = sortRegionsReadingOrder(detected.regions);

    const withOrder = orderedRegions.map((r, i) => ({ ...r, orderIndex: i }));
    const mapping = proposeShotMapping(withOrder, shotIdsInOrder);

    db.transaction((tx) => {
      tx.update(sequenceStoryboardExtractions)
        .set({
          sourceWidth: detected.sourceWidth,
          sourceHeight: detected.sourceHeight,
          status: "ready",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sequenceStoryboardExtractions.id, extraction.id))
        .run();

      for (const r of withOrder) {
        // A grid-fallback proposal is always low-confidence and never
        // auto-assigned: the region is still pre-filled with the
        // position-proposed Shot so a single click confirms it, but its
        // status stays "pending" until the user explicitly reassigns it —
        // the mandatory manual-validation gate the ticket requires for
        // fallback regions, reusing the same "pending = not extracted"
        // state machine already used for unassigned regions.
        const isGridFallback = r.detectionMode === "grid-fallback";
        const targetShotId = mapping.get(r.orderIndex) ?? null;
        tx.insert(sequenceStoryboardExtractionRegions)
          .values({
            extractionId: extraction.id,
            orderIndex: r.orderIndex,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            illustrationHeight: r.illustrationHeight,
            textSeparationDetected: r.textSeparationDetected,
            confidence: r.confidence,
            detectionMode: r.detectionMode,
            status: !isGridFallback && targetShotId !== null ? "assigned" : "pending",
            targetShotId,
          })
          .run();
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Detection failed.";
    await db
      .update(sequenceStoryboardExtractions)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date().toISOString() })
      .where(eq(sequenceStoryboardExtractions.id, extraction.id));
  }

  redirect(`${extractionBase}?extractionId=${extraction.id}`);
}

// ---------------------------------------------------------------------------
// Region edits — pure DB updates, no file I/O
// ---------------------------------------------------------------------------

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

  await db.insert(sequenceStoryboardExtractionRegions).values({
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

  let region;
  try {
    region = await loadEditableRegion(regionId, extractionId);
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

  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const edit of edits) {
      tx.update(sequenceStoryboardExtractionRegions)
        .set({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, updatedAt: now })
        .where(eq(sequenceStoryboardExtractionRegions.id, edit.regionId))
        .run();
    }
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
  const shotIdsInOrder = sequenceShots.map((s) => s.id);

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
  });

  okRedirectTo(returnTo, "extractAllAssigned");
}

// ---------------------------------------------------------------------------
// Confirm & Extract — the only action that creates files/drafts
// ---------------------------------------------------------------------------

const CONFIRM_ATTACHABLE_IMAGE_EXTS = new Set([".png"]);

export async function confirmStoryboardExtraction(formData: FormData): Promise<void> {
  const extractionId = parseInt(formData.get("extractionId") as string, 10);
  const rawPadding = (formData.get("padding") as string | null) ?? "0";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(extractionId) || extractionId <= 0) {
    errRedirectTo(returnTo, "extractError", "Invalid request.");
  }
  const padding = parseInt(rawPadding, 10);
  if (!Number.isInteger(padding) || padding < 0) {
    errRedirectTo(returnTo, "extractError", "Padding must be a non-negative whole number.");
  }

  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction) errRedirectTo(returnTo, "extractError", "Extraction not found.");
  if (extraction.status !== "ready") {
    errRedirectTo(returnTo, "extractError", "This extraction is not ready to confirm (already confirmed or failed).");
  }

  const assignedRegions = await db
    .select()
    .from(sequenceStoryboardExtractionRegions)
    .where(
      and(
        eq(sequenceStoryboardExtractionRegions.extractionId, extractionId),
        eq(sequenceStoryboardExtractionRegions.status, "assigned")
      )
    );
  if (assignedRegions.length === 0) {
    errRedirectTo(returnTo, "extractError", "No regions are assigned to a Shot yet.");
  }

  let absoluteInputPath: string;
  try {
    absoluteInputPath = await resolveSourceImageAbsolutePath(extraction.sourceImagePath);
  } catch (e) {
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Invalid source image.");
  }

  // Exclude the detected caption band first (illustration-only crop), then
  // apply padding as an inward shrink on what remains — clamped so the crop
  // never collapses to zero and never leaves the source image bounds.
  // Falls back to the full cell whenever the split is absent or invalid,
  // exactly as required: never trust a stale/out-of-range illustrationHeight.
  const cropRegions = assignedRegions.map((r) => {
    const hasValidSplit =
      r.textSeparationDetected &&
      r.illustrationHeight !== null &&
      Number.isInteger(r.illustrationHeight) &&
      r.illustrationHeight > 0 &&
      r.illustrationHeight < r.height;
    const effectiveHeight = hasValidSplit ? r.illustrationHeight! : r.height;

    const maxPadX = Math.floor((r.width - 1) / 2);
    const maxPadY = Math.floor((effectiveHeight - 1) / 2);
    const padX = Math.min(padding, Math.max(0, maxPadX));
    const padY = Math.min(padding, Math.max(0, maxPadY));
    return {
      index: r.id,
      x: r.x + padX,
      y: r.y + padY,
      width: r.width - 2 * padX,
      height: effectiveHeight - 2 * padY,
    };
  });

  const scratchDir = path.join(os.tmpdir(), "mikai-storyboard-extract", String(extractionId), randomUUID());

  let cropResult;
  try {
    cropResult = await runCrop(absoluteInputPath, cropRegions, scratchDir);
  } catch (e) {
    await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Crop failed.");
  }

  const regionById = new Map(assignedRegions.map((r) => [r.id, r]));
  const publicRoot = path.join(process.cwd(), "public");

  type CopiedFile = {
    regionId: number;
    shotId: number;
    orderIndex: number;
    destAbsolute: string;
    destRelative: string;
  };
  const copied: CopiedFile[] = [];

  try {
    for (const file of cropResult.files) {
      const region = regionById.get(file.index);
      if (!region || region.targetShotId === null) {
        throw new Error("Worker returned a crop for an unassigned region.");
      }
      const ext = path.extname(file.filename).toLowerCase();
      if (!CONFIRM_ATTACHABLE_IMAGE_EXTS.has(ext)) {
        throw new Error("Worker returned an unsupported crop file format.");
      }

      const scratchAbsolute = path.resolve(scratchDir, file.filename);
      if (!scratchAbsolute.startsWith(scratchDir + path.sep)) {
        throw new Error("Worker returned a crop file outside the scratch directory.");
      }
      await fs.access(scratchAbsolute);

      const uuid = randomUUID();
      const destFilename = `${uuid}${ext}`;
      const destSubfolder = `shot-${region.targetShotId}`;
      const destRelative = `uploads/storyboard-images/${destSubfolder}/${destFilename}`;
      const destDir = path.join(publicRoot, "uploads", "storyboard-images", destSubfolder);
      const destAbsolute = path.join(destDir, destFilename);

      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(scratchAbsolute, destAbsolute);
      copied.push({
        regionId: region.id,
        shotId: region.targetShotId,
        orderIndex: region.orderIndex,
        destAbsolute,
        destRelative,
      });
    }
  } catch (e) {
    for (const c of copied) {
      await fs.unlink(c.destAbsolute).catch(() => {});
    }
    await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Failed to save extracted crops.");
  }

  await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});

  // Per-Shot starting orderIndex for the new references, read once before
  // the transaction (mirrors the exact coalesce(max(...), -1)+1 pattern
  // already used by attachOutputAsShotReference in src/actions/generation.ts).
  // Incremented in-memory below so two regions confirmed in the same batch
  // for the same Shot never collide on orderIndex.
  const shotIdsInvolved = Array.from(new Set(copied.map((c) => c.shotId)));
  const nextOrderByShot = new Map<number, number>();
  for (const shotId of shotIdsInvolved) {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
      .from(shotReferenceImages)
      .where(eq(shotReferenceImages.shotId, shotId));
    nextOrderByShot.set(shotId, maxOrder + 1);
  }

  try {
    db.transaction((tx) => {
      // Double-submit / race guard: re-check status as the very first
      // statement of the write transaction (SQLite serializes writers), so
      // if two Confirm & Extract requests both passed the earlier "ready"
      // check, only the first to reach this point actually commits —
      // the second throws here and its copied files are cleaned up below,
      // never creating a duplicate draft/reference pair.
      const [fresh] = tx
        .select({ status: sequenceStoryboardExtractions.status })
        .from(sequenceStoryboardExtractions)
        .where(eq(sequenceStoryboardExtractions.id, extractionId))
        .all() as unknown as { status: string }[];
      if (!fresh || fresh.status !== "ready") {
        throw new Error("This extraction was already confirmed.");
      }

      const now = new Date().toISOString();
      for (const c of copied) {
        const [insertedDraft] = tx
          .insert(storyboardImages)
          .values({
            shotId: c.shotId,
            imagePath: c.destRelative,
            status: "draft",
            extractionRegionId: c.regionId,
          })
          .returning({ id: storyboardImages.id })
          .all() as unknown as { id: number }[];

        // Shares the exact same file as the draft above — no binary copy.
        // Never auto-approved (imageRole alone carries no approval
        // semantics); provenance recorded via sourceStoryboardImageId so
        // deletion can later confirm the file is still needed by the draft.
        const orderIndex = nextOrderByShot.get(c.shotId) ?? 0;
        nextOrderByShot.set(c.shotId, orderIndex + 1);
        tx.insert(shotReferenceImages)
          .values({
            shotId: c.shotId,
            orderIndex,
            imagePath: c.destRelative,
            sourceFilename: null,
            label: "Storyboard Frame",
            imageRole: "storyboard_frame",
            notes: `Extracted from Sequence Storyboard panel #${c.orderIndex + 1}.`,
            sourceStoryboardImageId: insertedDraft.id,
          })
          .run();

        tx.update(sequenceStoryboardExtractionRegions)
          .set({ status: "extracted", cropImagePath: c.destRelative, updatedAt: now })
          .where(eq(sequenceStoryboardExtractionRegions.id, c.regionId))
          .run();
      }

      // Merge padding into whatever detection params were already recorded
      // at detection time (mode/columns/rows/sensitivity/expectedShotCount)
      // rather than overwrite them — paramsJson should reflect every
      // parameter actually used for this extraction, not just the last one set.
      let existingParams: Record<string, unknown> = {};
      try {
        existingParams = extraction.paramsJson ? JSON.parse(extraction.paramsJson) : {};
      } catch {
        existingParams = {};
      }
      tx.update(sequenceStoryboardExtractions)
        .set({
          status: "confirmed",
          paramsJson: JSON.stringify({ ...existingParams, padding }),
          updatedAt: now,
        })
        .where(eq(sequenceStoryboardExtractions.id, extractionId))
        .run();
    });
  } catch (e) {
    for (const c of copied) {
      await fs.unlink(c.destAbsolute).catch(() => {});
    }
    errRedirectTo(returnTo, "extractError", e instanceof Error ? e.message : "Failed to save extraction results.");
  }

  okRedirectTo(returnTo, "extractConfirmed");
}
