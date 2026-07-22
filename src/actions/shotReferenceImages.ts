"use server";
import { db } from "@/db";
import { shots, sequences, shotReferenceImages, assets, assetReferenceImages, storyboardImages, shotStoryboardThumbnails } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  saveReferenceImage,
  deleteStoredReferenceImage,
  SaveReferenceImageError,
} from "@/lib/uploadImage";
import { isReferenceImageRoleAvailableFor } from "@/lib/referenceImageRoles";
import { isValidCameraLabReturnTo } from "@/lib/cameraLab/returnToGuard";

// REFROLE.MVP.1 — validated against the shared catalogue
// (src/lib/referenceImageRoles.ts) instead of a locally duplicated
// whitelist. The literal type still comes from the schema's own inferred
// insert type (single source of truth for typing); the catalogue is the
// single source of truth for which values are actually accepted.
type ImageRole = NonNullable<typeof shotReferenceImages.$inferInsert.imageRole>;

function isImageRole(value: string): value is ImageRole {
  return isReferenceImageRoleAvailableFor(value, "shot");
}

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? "";
}

function normalizeOptionalString(value: string): string | null {
  return value.length > 0 ? value : null;
}

function mapUploadError(error: unknown): string {
  if (error instanceof SaveReferenceImageError) {
    switch (error.code) {
      case "missing_file": return "missing_file";
      case "invalid_file": return "invalid_file";
      case "file_too_large": return "file_too_large";
      case "invalid_file_type": return "invalid_file_type";
    }
  }
  return "invalid_file";
}

async function verifyChain(
  shotId: number,
  sequenceId: number,
  projectId: number
): Promise<boolean> {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return false;

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return false;

  return true;
}

function shotDetailPath(projectId: number, sequenceId: number, shotId: number) {
  return `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;
}

export async function createShotReferenceImage(
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);

  const imageFile = formData.get("imageFile");
  const label = normalizeOptionalString(getString(formData, "label"));
  const imageRoleRaw = getString(formData, "imageRole");
  const imageRole = imageRoleRaw && isImageRole(imageRoleRaw) ? imageRoleRaw : null;
  const notes = normalizeOptionalString(getString(formData, "notes"));

  const returnToRaw = getString(formData, "returnTo");
  const returnTo =
    returnToRaw && isValidCameraLabReturnTo(returnToRaw, projectId, sequenceId, shotId) ? returnToRaw : null;
  const returnToQuery = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";

  let imagePath: string;
  let sourceFilename: string | null;

  try {
    const result = await saveReferenceImage(imageFile, `shot-${shotId}`);
    imagePath = result.imagePath;
    sourceFilename = result.sourceFilename;
  } catch (err) {
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/new?error=${mapUploadError(err)}${returnToQuery}`
    );
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shotId));

  try {
    await db.insert(shotReferenceImages).values({
      shotId,
      orderIndex: maxOrder + 1,
      imagePath,
      sourceFilename,
      label,
      imageRole,
      notes,
    });
  } catch {
    await deleteStoredReferenceImage(imagePath);
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/new?error=upload_failed${returnToQuery}`
    );
  }

  redirect(returnTo ?? shotDetailPath(projectId, sequenceId, shotId));
}

export async function updateShotReferenceImage(
  imageId: number,
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const [existing] = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, imageId));

  if (!existing || existing.shotId !== shotId) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);
  }

  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);

  const label = normalizeOptionalString(getString(formData, "label"));
  const imageRoleRaw = getString(formData, "imageRole");
  const imageRole = imageRoleRaw && isImageRole(imageRoleRaw) ? imageRoleRaw : null;
  const notes = normalizeOptionalString(getString(formData, "notes"));

  const imageFile = formData.get("imageFile");
  const hasNewFile =
    imageFile !== null &&
    typeof imageFile === "object" &&
    "size" in imageFile &&
    (imageFile as { size: number }).size > 0;

  let newImagePath = existing.imagePath;
  let newSourceFilename = existing.sourceFilename;

  if (hasNewFile) {
    try {
      const result = await saveReferenceImage(imageFile, `shot-${shotId}`);
      newImagePath = result.imagePath;
      newSourceFilename = result.sourceFilename;
    } catch (err) {
      redirect(
        `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/${imageId}/edit?error=${mapUploadError(err)}`
      );
    }
  }

  try {
    await db
      .update(shotReferenceImages)
      .set({
        label,
        imageRole,
        notes,
        imagePath: newImagePath,
        sourceFilename: newSourceFilename,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(shotReferenceImages.id, imageId));
  } catch {
    if (hasNewFile) await deleteStoredReferenceImage(newImagePath);
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/${imageId}/edit?error=upload_failed`
    );
  }

  if (hasNewFile) await deleteStoredReferenceImage(existing.imagePath);

  redirect(shotDetailPath(projectId, sequenceId, shotId));
}

export async function captureVideoFrame(input: {
  projectId: number;
  sourceShotId: number;
  sourceSequenceId: number;
  imageFile: File;
  frameNumber: number;
  destination:
    | { type: "shot"; shotId: number; sequenceId: number }
    | { type: "asset"; assetId: number };
}): Promise<
  | { ok: true; imagePath: string; referenceId: number; destinationLabel: string }
  | { ok: false; error: string }
> {
  const { projectId, sourceShotId, sourceSequenceId, imageFile, frameNumber, destination } = input;

  // Verify source shot belongs to project
  const sourceValid = await verifyChain(sourceShotId, sourceSequenceId, projectId);
  if (!sourceValid) return { ok: false, error: "Source shot not found." };

  // Verify destination ownership
  if (destination.type === "shot") {
    const targetValid = await verifyChain(destination.shotId, destination.sequenceId, projectId);
    if (!targetValid) return { ok: false, error: "Target shot not found." };
  } else {
    const [targetAsset] = await db
      .select({ id: assets.id, projectId: assets.projectId })
      .from(assets)
      .where(eq(assets.id, destination.assetId));
    if (!targetAsset || targetAsset.projectId !== projectId) {
      return { ok: false, error: "Target asset not found." };
    }
  }

  // Save image to appropriate subfolder
  const subfolder =
    destination.type === "shot"
      ? `shot-${destination.shotId}`
      : `asset-${destination.assetId}`;

  let imagePath: string;
  let sourceFilename: string | null;

  try {
    const result = await saveReferenceImage(imageFile, subfolder);
    imagePath = result.imagePath;
    sourceFilename = result.sourceFilename;
  } catch (err) {
    if (err instanceof SaveReferenceImageError) {
      return { ok: false, error: `Upload failed: ${err.message}` };
    }
    return { ok: false, error: "Unable to save captured frame." };
  }

  // Insert reference into the correct table
  if (destination.type === "shot") {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
      .from(shotReferenceImages)
      .where(eq(shotReferenceImages.shotId, destination.shotId));

    const [inserted] = await db
      .insert(shotReferenceImages)
      .values({
        shotId: destination.shotId,
        orderIndex: maxOrder + 1,
        imagePath,
        sourceFilename,
        label: "Captured Frame",
        imageRole: "keyframe",
        notes: `Captured from frame ${frameNumber} of approved shot video.`,
      })
      .returning({ id: shotReferenceImages.id });

    return { ok: true, imagePath, referenceId: inserted.id, destinationLabel: "Shot Reference" };
  } else {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
      .from(assetReferenceImages)
      .where(eq(assetReferenceImages.assetId, destination.assetId));

    const [inserted] = await db
      .insert(assetReferenceImages)
      .values({
        assetId: destination.assetId,
        orderIndex: maxOrder + 1,
        imagePath,
        sourceFilename,
        label: "Captured Frame",
        imageRole: "keyframe",
        notes: `Captured from frame ${frameNumber} of shot video.`,
      })
      .returning({ id: assetReferenceImages.id });

    return { ok: true, imagePath, referenceId: inserted.id, destinationLabel: "Asset Reference" };
  }
}

/**
 * SEQGEN.PUSH.2, Lot C — sets `imageId` as the Shot's explicit Storyboard
 * thumbnail, always with `source: "manual"` (a user action always wins over
 * any future automatic push, and immediately overrides an existing
 * `automatic_push` selection too). Never copies the file, never touches the
 * image's own role/approval/order — a pure presentation-preference pointer.
 * The insert-or-update is a single atomic SQL statement (`onConflictDoUpdate`
 * against the table's own `shotId` UNIQUE constraint), so there is no
 * multi-statement race window to guard against.
 */
export async function setShotStoryboardThumbnail(
  imageId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [existing] = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, imageId));

  if (!existing || existing.shotId !== shotId) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?thumbnailError=${encodeURIComponent("Reference image not found.")}`);
  }

  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?thumbnailError=${encodeURIComponent("Shot not found.")}`);

  const now = new Date().toISOString();
  try {
    await db
      .insert(shotStoryboardThumbnails)
      .values({ shotId, referenceImageId: imageId, source: "manual", createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: shotStoryboardThumbnails.shotId,
        set: { referenceImageId: imageId, source: "manual", updatedAt: now },
      });
  } catch {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?thumbnailError=${encodeURIComponent("Failed to set this image as the Storyboard thumbnail. Please try again.")}`);
  }

  redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?thumbnailSet=1`);
}

export async function deleteShotReferenceImage(
  imageId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [existing] = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, imageId));

  if (!existing || existing.shotId !== shotId) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);
  }

  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);

  // Captured BEFORE any write — the exact original state to restore this
  // Reference Image AND its thumbnail selection to, byte-identical, if the
  // final cleanup below needs to compensate a failed unlink.
  const [originalThumbnail] = await db.select().from(shotStoryboardThumbnails).where(eq(shotStoryboardThumbnails.referenceImageId, imageId));

  // SEQGEN.PUSH.2 — policy choice: deleting the Reference Image currently
  // selected as the Shot's explicit Storyboard thumbnail auto-CLEARS that
  // selection rather than blocking the delete. Rationale: this selection is
  // an explicit presentation *preference*, not a content approval (unlike
  // e.g. an approved `storyboard_images` draft) — losing it is low-cost and
  // the Storyboard grid already has a safe legacy fallback, so forcing the
  // user through an extra "unselect first" step would be unnecessary
  // friction for a low-stakes action. The FK's own RESTRICT (no onDelete
  // action, see `shot_storyboard_thumbnails` in schema.ts) can never
  // actually fire because the selector is always cleared first.
  //
  // REVISE (round 2) — the filesystem cleanup below used to be a plain
  // best-effort `deleteStoredReferenceImage`/`deleteSharedStoryboardImageFile`
  // call AFTER an already-committed DB delete: a failed unlink left an
  // orphaned file while the redirect still announced plain success. Hardened
  // to the same rename-to-quarantine / synchronous-transaction /
  // unlink-or-restore discipline already proven in
  // `deleteShotVideoCandidate` (src/actions/sequenceVideoPush.ts) and
  // `deleteSequenceStoryboardImage` (src/actions/sequenceStoryboard.ts):
  //   1. Resolve the confined root for whichever physical location this
  //      path actually lives under (shared storyboard-images vs. this
  //      reference's own reference-images root) and rename the file to a
  //      same-directory quarantine path BEFORE any DB write — a reversible,
  //      atomic filesystem op, not a delete.
  //   2. Clear the thumbnail selector, delete the Reference Image row, AND
  //      re-check "is this exact path still needed by another live row" —
  //      all inside ONE synchronous transaction, so the check reflects the
  //      post-delete world atomically (closes the race the old post-hoc,
  //      non-transactional check left open).
  //   3. Transaction failed -> restore the quarantined file, report the
  //      DB failure (plus any restore failure, never silently dropped).
  //   4. Transaction committed, file still needed elsewhere -> restore the
  //      quarantined file (it must NOT be deleted — another live row still
  //      points at it); a failed restore here is reported explicitly, never
  //      silently swallowed while claiming success.
  //   5. Transaction committed, file truly orphaned -> final unlink; a
  //      failure here leaves the row correctly deleted (DB is the source of
  //      truth) but is reported via an explicit warning, never a silent
  //      orphan behind a plain success.
  const publicRoot = path.join(process.cwd(), "public");
  const isSharedStoryboardFile = existing.imagePath.startsWith("uploads/storyboard-images/");
  const allowedRoot = isSharedStoryboardFile ? path.join(publicRoot, "uploads", "storyboard-images") : path.join(publicRoot, "uploads", "reference-images");
  const absolute = path.resolve(publicRoot, existing.imagePath);
  const pathIsConfined =
    !existing.imagePath.includes("..") && !existing.imagePath.includes("\\") && !path.isAbsolute(existing.imagePath) && (absolute.startsWith(allowedRoot + path.sep) || absolute === allowedRoot);

  const quarantinePath = `${absolute}.trash-${Date.now()}-${imageId}`;
  let quarantined = false;
  if (pathIsConfined) {
    try {
      renameSync(absolute, quarantinePath);
      quarantined = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=${encodeURIComponent("Failed to prepare the file for deletion — nothing was changed. Please try again.")}`);
      }
      // ENOENT: the file was already gone — proceed straight to the row delete, nothing to restore later.
    }
  }

  let stillNeededElsewhere = false;
  try {
    db.transaction((tx) => {
      tx.delete(shotStoryboardThumbnails).where(eq(shotStoryboardThumbnails.referenceImageId, imageId)).run();
      tx.delete(shotReferenceImages).where(eq(shotReferenceImages.id, imageId)).run();
      // SEQGEN.STORYBOARD.EXTRACT.1-FIX2's own guard, re-checked HERE (inside
      // the same transaction, after this row is gone) instead of via a
      // separate post-hoc query: a reference sharing an extracted panel's
      // file, or any other reference row, may still point at this exact
      // path — never unlink while a live row still needs it.
      const [neededByDraft] = tx.select({ id: storyboardImages.id }).from(storyboardImages).where(eq(storyboardImages.imagePath, existing.imagePath)).all();
      const [neededByOtherReference] = tx.select({ id: shotReferenceImages.id }).from(shotReferenceImages).where(eq(shotReferenceImages.imagePath, existing.imagePath)).all();
      stillNeededElsewhere = !!neededByDraft || !!neededByOtherReference;
    });
  } catch (e) {
    let restoreFailure: string | null = null;
    if (quarantined) {
      try {
        renameSync(quarantinePath, absolute);
      } catch (restoreErr) {
        restoreFailure = `Additionally, failed to restore the file from quarantine ("${quarantinePath}"): ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`;
      }
    }
    const base = e instanceof Error ? e.message : "Failed to delete this reference image — nothing was changed. Please try again.";
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=${encodeURIComponent(restoreFailure ? `${base} ${restoreFailure}` : base)}`);
  }

  if (quarantined) {
    if (stillNeededElsewhere) {
      // The row is gone but the FILE is still owned by another live row —
      // it must be restored to its original path, never deleted.
      try {
        renameSync(quarantinePath, absolute);
      } catch (e) {
        redirect(
          `${shotDetailPath(projectId, sequenceId, shotId)}?error=${encodeURIComponent(`This reference was deleted, but its shared file could not be restored from quarantine ("${quarantinePath}") and may be temporarily unavailable to other references: ${e instanceof Error ? e.message : String(e)}`)}`
        );
      }
    } else {
      try {
        unlinkSync(quarantinePath); // final cleanup — the row has already been committed as deleted
      } catch (e) {
        // REVISE (round 3) — a failed final unlink must NEVER leave a
        // `.trash-*` orphan behind an already-committed DB delete with no
        // row, no thumbnail, and no retry path. Compensate on ALL THREE
        // sides, on the same hardened model as `deleteShotVideoCandidate`
        // (round 2): restore the file to its original path, re-insert the
        // original Reference Image row (same `id`, all original values),
        // and re-insert the original thumbnail selection row (same `id`,
        // all original values) IF one existed AND no legitimate concurrent
        // selection has since been made for this Shot (never clobber a
        // newer, real user choice with a stale restoration). Report the
        // exact state of all three — never a plain success while any part
        // of the compensation is incomplete.
        let fileRestored = false;
        try {
          renameSync(quarantinePath, absolute);
          fileRestored = true;
        } catch {
          /* file stuck under quarantinePath — reported explicitly below, never silently */
        }

        let rowRestored = false;
        try {
          db.insert(shotReferenceImages)
            .values({
              id: existing.id,
              shotId: existing.shotId,
              orderIndex: existing.orderIndex,
              imagePath: existing.imagePath,
              sourceFilename: existing.sourceFilename,
              label: existing.label,
              imageRole: existing.imageRole,
              notes: existing.notes,
              sourceStoryboardImageId: existing.sourceStoryboardImageId,
              sourceShotVideoCandidateId: existing.sourceShotVideoCandidateId,
              createdAt: existing.createdAt,
              updatedAt: existing.updatedAt,
            })
            .run();
          rowRestored = true;
        } catch {
          /* reported explicitly below */
        }

        let thumbnailRestored: "restored" | "not-applicable" | "skipped-concurrent-selection" | "failed" = "not-applicable";
        if (originalThumbnail && rowRestored) {
          const [currentThumbnail] = db.select().from(shotStoryboardThumbnails).where(eq(shotStoryboardThumbnails.shotId, originalThumbnail.shotId)).all();
          if (currentThumbnail) {
            // Another request legitimately selected a thumbnail for this
            // Shot after our delete committed — never overwrite a real,
            // newer user choice with a stale restoration.
            thumbnailRestored = "skipped-concurrent-selection";
          } else {
            try {
              db.insert(shotStoryboardThumbnails)
                .values({
                  id: originalThumbnail.id,
                  shotId: originalThumbnail.shotId,
                  referenceImageId: originalThumbnail.referenceImageId,
                  source: originalThumbnail.source,
                  createdAt: originalThumbnail.createdAt,
                  updatedAt: originalThumbnail.updatedAt,
                })
                .run();
              thumbnailRestored = "restored";
            } catch {
              thumbnailRestored = "failed";
            }
          }
        }

        if (fileRestored && rowRestored && thumbnailRestored !== "failed") {
          redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=${encodeURIComponent("Failed to finish deleting this reference image — nothing was changed. Please try again.")}`);
        }
        redirect(
          `${shotDetailPath(projectId, sequenceId, shotId)}?error=${encodeURIComponent(
            `Failed to finish deleting this reference image, and automatic recovery was incomplete (file ${fileRestored ? "restored" : "NOT restored"}, database row ${rowRestored ? "restored" : "NOT restored"}, thumbnail selection ${thumbnailRestored}). Please check this reference manually before retrying.`
          )}`
        );
      }
    }
  }

  redirect(shotDetailPath(projectId, sequenceId, shotId));
}
