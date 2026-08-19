"use server";

// ---------------------------------------------------------------------------
// storyboardExtractionConfirm.ts — SEQGEN.STORYBOARD.EXTRACT.1
//
// Confirm & Extract — the only action that creates files/drafts. Split from
// the former `src/actions/storyboardExtraction.ts` by IND.SPLIT.1 — see
// `src/actions/storyboardExtractionStart.ts` and
// `src/actions/storyboardExtractionRegions.ts` for the rest.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
  storyboardImages,
  shotReferenceImages,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { runCrop } from "@/lib/storyboardExtraction/opencvWorker";
import { errRedirectTo, okRedirectTo, resolveSourceImageAbsolutePath } from "@/lib/storyboardExtraction/actionHelpers";

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

  // FIX5 — once this extraction has ever used Content Crop (paramsJson has
  // a `contentCrop` key, regardless of which mode), the region's current
  // width/height IS the user's final, explicit word on what to extract —
  // never silently overridden by the auto-detected illustrationHeight
  // below. An extraction that has never touched Content Crop keeps the
  // exact original FIX1 behavior (auto-exclude the detected caption band
  // when the split looks valid), so nothing changes for anyone not using
  // this feature.
  let hasUsedContentCrop = false;
  try {
    const parsed = extraction.paramsJson ? JSON.parse(extraction.paramsJson) : null;
    hasUsedContentCrop = Boolean(parsed && typeof parsed === "object" && "contentCrop" in parsed);
  } catch {
    hasUsedContentCrop = false;
  }

  // Exclude the detected caption band first (illustration-only crop), then
  // apply padding as an inward shrink on what remains — clamped so the crop
  // never collapses to zero and never leaves the source image bounds.
  // Falls back to the full cell whenever the split is absent or invalid,
  // exactly as required: never trust a stale/out-of-range illustrationHeight.
  const cropRegions = assignedRegions.map((r) => {
    const hasValidSplit =
      !hasUsedContentCrop &&
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
