"use server";

// ---------------------------------------------------------------------------
// storyboardExtractionStart.ts — SEQGEN.STORYBOARD.EXTRACT.1
//
// Starts a new extraction (detection). Split from the former
// `src/actions/storyboardExtraction.ts` by IND.SPLIT.1 — see
// `src/actions/storyboardExtractionRegions.ts` and
// `src/actions/storyboardExtractionConfirm.ts` for the rest.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  sequences,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
  generationJobs,
  shots,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { runDetect } from "@/lib/storyboardExtraction/opencvWorker";
import {
  proposeShotMapping,
  sortRegionsReadingOrder,
  isDetectionEngine,
  isSensitivity,
  parseStrictBoundedFloat,
  parseStrictBoundedInt,
  ADVANCED_PARAM_SPECS,
  CUSTOM_THRESHOLD_MIN,
  CUSTOM_THRESHOLD_MAX,
  MIN_GRID_DIMENSION,
  MAX_GRID_DIMENSION,
  type DetectionEngine,
  type Sensitivity,
  type AdvancedDetectionParams,
} from "@/lib/storyboardExtraction/workerContract";
import { type ContentCropBaseRects } from "@/lib/storyboardExtraction/contentCrop";
import { errRedirectTo, resolveSourceImageAbsolutePath } from "@/lib/storyboardExtraction/actionHelpers";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { resolveExtractionShotRange } from "@/lib/storyboardExtraction/resolveExtractionShotRange";

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

  // FIX3/FIX6 — Detection Settings, all optional with safe defaults so the
  // original source-selection form (which never sends these fields) keeps
  // its exact prior behavior (engine "canny" — the old "auto" mode's actual
  // algorithm, sensitivity "medium", no explicit grid shape, no custom
  // threshold, no advanced params).
  const rawEngine = ((formData.get("engine") as string | null) ?? "canny").trim() || "canny";
  if (!isDetectionEngine(rawEngine)) {
    errRedirectTo(returnTo, "extractError", "Invalid detection engine.");
  }
  const engine: DetectionEngine = rawEngine;

  const rawSensitivity = ((formData.get("sensitivity") as string | null) ?? "medium").trim() || "medium";
  if (!isSensitivity(rawSensitivity)) {
    errRedirectTo(returnTo, "extractError", "Invalid sensitivity.");
  }
  const sensitivity: Sensitivity = rawSensitivity;

  // FIX6 — Custom threshold (0.00-1.00) takes priority over the sensitivity
  // preset when present. Absent/blank means "use sensitivity", never a
  // silent 0 — strict parsing rejects anything malformed rather than
  // guessing.
  const rawCustomThreshold = (formData.get("customThreshold") as string | null)?.trim() ?? "";
  let customThreshold: number | null = null;
  if (rawCustomThreshold !== "") {
    customThreshold = parseStrictBoundedFloat(rawCustomThreshold, CUSTOM_THRESHOLD_MIN, CUSTOM_THRESHOLD_MAX);
    if (customThreshold === null) {
      errRedirectTo(returnTo, "extractError", "Custom threshold must be a number between 0.00 and 1.00.");
    }
  }

  // FIX6 — Advanced detection parameters: every field optional, strictly
  // bounded server-side before ever reaching the worker (mirrors the
  // worker's own PARAM_BOUNDS exactly). Absent/blank fields keep the
  // worker's own pre-FIX6 default constants.
  const advancedParams: AdvancedDetectionParams = {};
  for (const spec of ADVANCED_PARAM_SPECS) {
    const raw = (formData.get(spec.key) as string | null)?.trim() ?? "";
    if (raw === "") continue;
    const value = parseStrictBoundedFloat(raw, spec.min, spec.max);
    if (value === null) {
      errRedirectTo(returnTo, "extractError", `${spec.flag} must be a number between ${spec.min} and ${spec.max}.`);
    }
    if (spec.integer && !Number.isInteger(value)) {
      errRedirectTo(returnTo, "extractError", `${spec.flag} must be a whole number.`);
    }
    advancedParams[spec.key] = value;
  }

  const rawColumns = (formData.get("columns") as string | null)?.trim() ?? "";
  const rawRows = (formData.get("rows") as string | null)?.trim() ?? "";
  let columns: number | null = null;
  let rows: number | null = null;
  if (rawColumns !== "" || rawRows !== "") {
    if (rawColumns === "" || rawRows === "") {
      errRedirectTo(returnTo, "extractError", "Provide both Columns and Rows, or neither.");
    }
    // REVISE (round 2, finding #2) — `parseInt` accepts a partial match
    // ("3abc" -> 3, stopping at the first non-digit) so a malformed value
    // could still pass `isValidGridDimension`. `parseStrictBoundedInt`
    // requires the WHOLE string to be a plain decimal integer before
    // checking bounds, rejecting "3abc", "2.5", "1e1", "0", and "13" alike.
    const parsedColumns = parseStrictBoundedInt(rawColumns, MIN_GRID_DIMENSION, MAX_GRID_DIMENSION);
    const parsedRows = parseStrictBoundedInt(rawRows, MIN_GRID_DIMENSION, MAX_GRID_DIMENSION);
    if (parsedColumns === null || parsedRows === null) {
      errRedirectTo(returnTo, "extractError", "Columns and Rows must each be a whole number between 1 and 12.");
    }
    columns = parsedColumns;
    rows = parsedRows;
  }
  // Grid mode without explicit Columns/Rows still needs the expected Shot
  // count to build a shape from — validated once that count is known below;
  // the worker itself refuses with a clear error if neither is available.

  // SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — the user's own explicit Shot
  // range override, same field names/ids as the generation-time feature.
  // Both facultative: absent means "no explicit choice", never mandatory —
  // an uploaded storyboard image (no job, no inherited range) must reach
  // `resolveExtractionShotRange` with both inputs null and get the full
  // Sequence back, exactly as before this ticket.
  const rawShotFromId = (formData.get("shotFrom") as string | null)?.trim();
  const explicitShotFromId = rawShotFromId && /^-?\d+$/.test(rawShotFromId) ? parseInt(rawShotFromId, 10) : null;
  const rawShotToId = (formData.get("shotTo") as string | null)?.trim();
  const explicitShotToId = rawShotToId && /^-?\d+$/.test(rawShotToId) ? parseInt(rawShotToId, 10) : null;
  const explicitShotRange =
    explicitShotFromId !== null || explicitShotToId !== null
      ? { fromShotId: explicitShotFromId, toShotId: explicitShotToId }
      : null;

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

  // SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 — the inherited Shot range, read
  // from the source image's own generation job when one exists. Every link
  // in this chain can be missing — a manually uploaded image has no jobId
  // at all (nullable, `onDelete: "set null"`), the job row may since have
  // been deleted, the snapshot may be unparsable, or the field may simply
  // predate this ticket. Every one of those falls through to `null`
  // ("no inherited range"), never an error — this is the exact path the
  // user's constraint protects.
  let inheritedShotIds: number[] | null = null;
  if (source.jobId !== null) {
    const [job] = await db
      .select({ payloadSnapshot: generationJobs.payloadSnapshot })
      .from(generationJobs)
      .where(eq(generationJobs.id, source.jobId));
    const snapshot = job ? parseGenerationSnapshot(job.payloadSnapshot) : null;
    inheritedShotIds = snapshot?.sequenceStoryboardShotRange?.shotIdsInOrder ?? null;
  }

  const resolvedShotRange = resolveExtractionShotRange(sequenceShots, inheritedShotIds, explicitShotRange);
  const shotIdsInOrder = resolvedShotRange.shotIdsInOrder;
  const expectedShotCount = shotIdsInOrder.length;

  // Persisted verbatim below as paramsJson — the params actually used for
  // this extraction, not just what was requested (mirrors what padding
  // already does at confirm time). `shotRange` records what
  // `resolveExtractionShotRange` actually decided, re-read verbatim by
  // Assign All rather than re-derived from a stale job lookup.
  const detectionParams = {
    engine,
    columns,
    rows,
    sensitivity,
    customThreshold,
    advancedParams,
    expectedShotCount,
    shotRange: {
      shotIdsInOrder: resolvedShotRange.shotIdsInOrder,
      source: resolvedShotRange.source,
      droppedShotIds: resolvedShotRange.droppedShotIds,
    },
  };

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
      engine,
      columns: columns ?? undefined,
      rows: rows ?? undefined,
      sensitivity,
      customThreshold: customThreshold ?? undefined,
      advancedParams,
    });
    const orderedRegions = sortRegionsReadingOrder(detected.regions);

    const withOrder = orderedRegions.map((r, i) => ({ ...r, orderIndex: i }));
    const mapping = proposeShotMapping(withOrder, shotIdsInOrder);

    // REVISE fix — each region's detected rectangle is its permanent
    // Content Crop base: recorded once, here, before any edit/preset can
    // ever touch it, so "Full cell" can always restore exactly this and
    // repeated preset clicks stay idempotent (see contentCrop.ts header).
    const contentCropBaseRects: ContentCropBaseRects = {};
    for (const r of withOrder) {
      contentCropBaseRects[String(r.orderIndex)] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    const finalParamsJson = JSON.stringify({ ...detectionParams, contentCropBaseRects, diagnostics: detected.diagnostics });

    db.transaction((tx) => {
      tx.update(sequenceStoryboardExtractions)
        .set({
          sourceWidth: detected.sourceWidth,
          sourceHeight: detected.sourceHeight,
          status: "ready",
          paramsJson: finalParamsJson,
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
