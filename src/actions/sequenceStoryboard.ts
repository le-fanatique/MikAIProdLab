"use server";

// ---------------------------------------------------------------------------
// sequenceStoryboard.ts — SEQGEN.STORYBOARD.3
//
// Sequence Storyboard draft store — the Sequence-level twin of
// saveStoryboardDraftFromJob in src/actions/storyboard.ts. Deliberately a
// separate file from sequenceGeneration.ts (the ComfyUI-calling
// runSequenceGeneration/runSequenceGenerationFromForm), same separation
// already established between storyboard.ts and generation.ts for the
// Shot-level equivalent, so this file never pulls in the ComfyUI-calling
// modules it doesn't need.
//
// Never touches shots.approvedVideoPath, shot_reference_images, or any
// per-Shot prompt field — a Sequence Storyboard draft is stored and
// versioned independently in `sequence_storyboard_images`.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import { unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sequences, generationJobs, sequenceStoryboardImages, sequenceStoryboardExtractions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";

const SEQUENCE_STORYBOARD_ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// ---------------------------------------------------------------------------
// FIX6 (Lot B) — manual upload/delete of Sequence Storyboard Drafts, so
// multiple test boards can be compared side by side without going through a
// generation job. Deliberately stricter than the job-output copy path above
// (no GIF, magic-byte sniffing, explicit 10MB ceiling): this is the one path
// where arbitrary user-supplied bytes reach the server, so extension alone
// is not trusted.
// ---------------------------------------------------------------------------

const MAX_SEQUENCE_STORYBOARD_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

type UploadFamily = "png" | "jpeg" | "webp";

function extFamily(ext: string): UploadFamily | null {
  if (ext === ".png") return "png";
  if (ext === ".jpg" || ext === ".jpeg") return "jpeg";
  if (ext === ".webp") return "webp";
  return null;
}

/** Sniffs the actual file-signature (magic bytes) family, independent of the claimed extension — never trusts a filename alone. Returns null for anything unrecognized (including SVG, GIF, or a renamed non-image file). */
function sniffImageFamily(buf: Buffer): UploadFamily | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

type FileLike = { size: number; name: string; arrayBuffer: () => Promise<ArrayBuffer> };

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["size"] === "number" &&
    typeof (value as Record<string, unknown>)["name"] === "string" &&
    typeof (value as Record<string, unknown>)["arrayBuffer"] === "function"
  );
}

/**
 * Uploads a new Sequence Storyboard draft directly from a user-supplied
 * file — a new file under `uploads/sequence-storyboard-images/sequence-<id>/`
 * and a new `draft` row with null job/workflow/prompt/references provenance
 * (nothing was generated). Multiple uploads are kept side by side; nothing
 * here is ever overwritten. PNG/JPEG/WebP only, 10MB max, extension AND
 * magic-byte checked — SVG/GIF and any remote-URL field are refused
 * outright (no such field even exists on this form).
 */
export async function uploadSequenceStoryboardImage(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequenceStoryboardUploadError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    errRedirect("Invalid request.");
  }
  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirect("Sequence not found.");

  const fileValue = formData.get("file");
  if (!isFileLike(fileValue) || fileValue.size <= 0) {
    errRedirect("Please choose an image file to upload.");
  }
  if (fileValue.size > MAX_SEQUENCE_STORYBOARD_UPLOAD_BYTES) {
    errRedirect(`File exceeds the ${MAX_SEQUENCE_STORYBOARD_UPLOAD_BYTES / 1024 / 1024}MB limit.`);
  }

  const ext = path.extname(fileValue.name).toLowerCase();
  if (!UPLOAD_ALLOWED_EXTS.has(ext)) {
    errRedirect("Only PNG, JPEG, or WebP images are allowed.");
  }
  const claimedFamily = extFamily(ext)!;

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  const actualFamily = sniffImageFamily(buffer);
  if (actualFamily === null || actualFamily !== claimedFamily) {
    errRedirect("File content does not match a valid PNG, JPEG, or WebP image.");
  }

  const uuid = randomUUID();
  const destFilename = `${uuid}${ext}`;
  const destSubfolder = `sequence-${sequenceId}`;
  const destRelative = `uploads/sequence-storyboard-images/${destSubfolder}/${destFilename}`;
  const destDir = path.join(process.cwd(), "public", "uploads", "sequence-storyboard-images", destSubfolder);
  const destAbsolute = path.join(destDir, destFilename);

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(destAbsolute, buffer);
  } catch {
    errRedirect("Failed to save the uploaded file. Please try again.");
  }

  try {
    await db.insert(sequenceStoryboardImages).values({
      sequenceId,
      jobId: null,
      workflowId: null,
      imagePath: destRelative,
      status: "draft",
      promptSnapshot: null,
      referencesSnapshot: null,
    });
  } catch {
    await fs.unlink(destAbsolute).catch(() => {});
    errRedirect("Failed to save Sequence Storyboard draft. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequenceStoryboardUploaded=1`);
}

/**
 * Deletes a Sequence Storyboard draft — DB row and file. Blocked outright
 * (clear error, nothing deleted) if any `sequence_storyboard_extractions`
 * row already used this image as its source: an extraction may still read
 * `sourceImagePath` (e.g. to re-render the preview, or on "Run Detection
 * Again"), so the file must never disappear out from under it. Ownership
 * (image belongs to the given Sequence) and path containment (the resolved
 * absolute path must stay inside the sequence-storyboard-images root) are
 * both re-checked here, independent of whatever the client claims.
 */
export async function deleteSequenceStoryboardImage(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const imageId = parseInt(formData.get("imageId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequenceStoryboardUploadError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(sequenceId) || sequenceId <= 0 || !Number.isInteger(imageId) || imageId <= 0) {
    errRedirect("Invalid request.");
  }

  const [image] = await db.select().from(sequenceStoryboardImages).where(eq(sequenceStoryboardImages.id, imageId));
  if (!image) errRedirect("Sequence Storyboard draft not found.");
  if (image.sequenceId !== sequenceId) errRedirect("This draft does not belong to this Sequence.");

  const publicRoot = path.join(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, "uploads", "sequence-storyboard-images");
  const absolute = path.resolve(publicRoot, image.imagePath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    errRedirect("This draft's file path is not in the expected location and cannot be safely deleted.");
  }

  // REVISE (round 3, finding #2) — the filesystem and the SQLite database
  // are two separate systems with no shared transaction: an `unlinkSync`
  // executed "inside" a db.transaction callback is NOT rolled back by that
  // transaction if a LATER statement in the same callback (or the commit
  // itself) fails — the file would stay gone while the row survives via
  // SQL rollback. A `rename` within the same directory is atomic AND
  // reversible (unlike `unlink`), so it is used as a real compensating
  // action instead:
  //
  //   1. Rename the file to a same-directory quarantine path (outside any
  //      DB transaction — a plain filesystem op). ENOENT here just means
  //      "already gone"; anything else aborts immediately with nothing
  //      touched.
  //   2. Run the usage check + row DELETE in one synchronous
  //      db.transaction callback (round 2's fix, unchanged: closes the
  //      inter-request race on the usage check).
  //   3. Transaction committed -> permanently unlink the quarantined file
  //      (best-effort: the row is already correctly gone, which is the
  //      only state the rest of the app observes; a leftover quarantine
  //      file is invisible and harmless, never re-served to anyone).
  //   4. Transaction threw (usage race OR a genuine DB/commit failure) ->
  //      rename the quarantined file back to its original path, restoring
  //      it — the row (rolled back by SQLite) and the file are both back
  //      to exactly their pre-call state.
  const quarantinePath = `${absolute}.trash-${randomUUID()}`;
  let quarantined = false;
  try {
    renameSync(absolute, quarantinePath);
    quarantined = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      errRedirect("Failed to prepare the file for deletion — nothing was changed. Please try again.");
    }
    // ENOENT: the file was already gone — proceed straight to the row delete, nothing to restore later.
  }

  let raceDetected = false;
  try {
    db.transaction((tx) => {
      const usedByExtraction = tx
        .select({ id: sequenceStoryboardExtractions.id })
        .from(sequenceStoryboardExtractions)
        .where(eq(sequenceStoryboardExtractions.sourceStoryboardImageId, imageId))
        .all();
      if (usedByExtraction.length > 0) {
        raceDetected = true;
        throw new Error("SEQUENCE_STORYBOARD_DRAFT_IN_USE");
      }
      tx.delete(sequenceStoryboardImages).where(eq(sequenceStoryboardImages.id, imageId)).run();
    });
  } catch (e) {
    if (quarantined) {
      try {
        renameSync(quarantinePath, absolute); // restore — the row survived (rollback), so the file must too
      } catch {
        // The original directory or path became unwritable between steps —
        // an exceedingly narrow window; the quarantined file is orphaned
        // but not silently lost (still present on disk under quarantinePath,
        // just not linked back to its row). Reported honestly below either way.
      }
    }
    if (raceDetected) {
      errRedirect("This draft is already the source of an extraction and cannot be deleted.");
    }
    errRedirect("Failed to delete this draft — nothing was changed. Please try again.");
  }

  if (quarantined) {
    try {
      unlinkSync(quarantinePath); // final cleanup — the row has already been committed as deleted
    } catch {
      // REVISE (round 4) — this is NOT best-effort: the DB row is already
      // gone at this point, so a failed final cleanup would otherwise leave
      // an unreachable `.trash-*` file (no row, no UI, no retry path) while
      // still reporting success. Compensate on BOTH sides instead — restore
      // the file to its original path AND re-insert the original row
      // (captured from `image` before any of this ran, including its own
      // `id`, so the restored row is indistinguishable from the one that
      // existed before this call) — then report failure so the user can
      // retry, never success.
      let fileRestored = false;
      try {
        renameSync(quarantinePath, absolute);
        fileRestored = true;
      } catch {
        /* file stuck under quarantinePath — reported explicitly below, never silently */
      }

      let rowRestored = false;
      try {
        await db.insert(sequenceStoryboardImages).values({
          id: image.id,
          sequenceId: image.sequenceId,
          jobId: image.jobId,
          workflowId: image.workflowId,
          imagePath: image.imagePath,
          status: image.status,
          promptSnapshot: image.promptSnapshot,
          referencesSnapshot: image.referencesSnapshot,
          createdAt: image.createdAt,
          updatedAt: image.updatedAt,
          approvedAt: image.approvedAt,
        });
        rowRestored = true;
      } catch {
        /* reported explicitly below */
      }

      if (fileRestored && rowRestored) {
        errRedirect("Failed to finish deleting this draft — nothing was changed. Please try again.");
      }
      // Compensation itself was partial or failed entirely — never claim
      // success while guessing which half survived; say so explicitly.
      errRedirect(
        "Failed to finish deleting this draft, and automatic recovery was incomplete. Please check this Sequence Storyboard Draft manually before retrying."
      );
    }
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequenceStoryboardDeleted=1`);
}

/**
 * Copies a completed Sequence-generation job's image output into permanent
 * Sequence Storyboard storage and records a `draft` row. Never approves
 * anything, never touches `shots.approvedVideoPath` or
 * `shot_reference_images` — mirrors saveStoryboardDraftFromJob's validation
 * pattern exactly (job ownership, "done" status, outputs/jobs/ prefix,
 * extension allowlist, resolved-path containment, on-disk existence).
 * Every call inserts a new row — multiple drafts per Sequence are kept,
 * never overwritten.
 */
export async function saveSequenceStoryboardDraftFromJob(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const jobId = parseInt(formData.get("jobId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequenceStoryboardDraftError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(sequenceId) || sequenceId <= 0 || !Number.isInteger(jobId) || jobId <= 0) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirect("Sequence not found.");

  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job) errRedirect("Output not found.");
  if (job.sequenceId !== sequenceId) errRedirect("Output does not belong to this Sequence.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  if (!job.outputPath) errRedirect("Output path is missing.");
  if (!job.outputPath.startsWith("outputs/jobs/")) {
    errRedirect("Output path is not in the expected location.");
  }

  const ext = path.extname(job.outputPath).toLowerCase();
  if (!SEQUENCE_STORYBOARD_ATTACHABLE_IMAGE_EXTS.has(ext)) {
    errRedirect("Only image outputs can be saved as a Sequence Storyboard draft.");
  }

  const publicRoot = path.join(process.cwd(), "public");
  const allowedOutputsRoot = path.join(publicRoot, "outputs", "jobs");
  const sourceAbsolute = path.resolve(publicRoot, job.outputPath);

  if (
    !sourceAbsolute.startsWith(allowedOutputsRoot + path.sep) &&
    sourceAbsolute !== allowedOutputsRoot
  ) {
    errRedirect("Output path is not in the expected location.");
  }

  try {
    await fs.access(sourceAbsolute);
  } catch {
    errRedirect("Output file not found on disk.");
  }

  const uuid = randomUUID();
  const destFilename = `${uuid}${ext}`;
  const destSubfolder = `sequence-${sequenceId}`;
  const destRelative = `uploads/sequence-storyboard-images/${destSubfolder}/${destFilename}`;
  const destDir = path.join(publicRoot, "uploads", "sequence-storyboard-images", destSubfolder);
  const destAbsolute = path.join(destDir, destFilename);

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourceAbsolute, destAbsolute);
  } catch {
    errRedirect("Failed to copy output file. Please try again.");
  }

  // SEQGEN.STORYBOARD.3 (retake) — provenance is read from the job's own
  // immutable payloadSnapshot (captured at queue time by
  // runSequenceGeneration), never from client-submitted form fields or the
  // current page's query string — those can diverge from what was actually
  // queued (edited prompt, changed selection, different URL) after the job
  // already ran.
  const jobSnapshot = parseGenerationSnapshot(job.payloadSnapshot);
  const promptSnapshot = jobSnapshot?.promptText ?? null;
  const referencesSnapshot = jobSnapshot?.sequenceStoryboardReferenceMappings
    ? JSON.stringify(jobSnapshot.sequenceStoryboardReferenceMappings)
    : null;

  try {
    await db.insert(sequenceStoryboardImages).values({
      sequenceId,
      jobId,
      workflowId: job.workflowId,
      imagePath: destRelative,
      status: "draft",
      promptSnapshot,
      referencesSnapshot,
    });
  } catch {
    try {
      await fs.unlink(destAbsolute);
    } catch {
      /* best-effort cleanup only */
    }
    errRedirect("Failed to save Sequence Storyboard draft. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequenceStoryboardDraftSaved=1`);
}
