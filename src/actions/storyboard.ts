"use server";

// ---------------------------------------------------------------------------
// storyboard.ts — SEQGEN.STORYBOARD.2
//
// Draft/approve/reject actions for `storyboard_images`, the dedicated
// storyboard-image store. Mirrors the exact path-validation pattern already
// used by attachOutputAsShotReference/approveVideoOutput in
// src/actions/generation.ts (job ownership, "done" status, outputs/jobs/
// prefix check, extension allowlist, resolved-path containment check,
// on-disk existence check) rather than reinventing it. Never touches
// `shots.approvedVideoPath` or `shot_reference_images`, never queues a
// ComfyUI job, never modifies the job runner or polling.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { generationJobs, storyboardImages, shots } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Same allowlist as ATTACHABLE_IMAGE_EXTS in src/actions/generation.ts
// (not exported there, so duplicated here rather than reached into a
// "use server" module's private scope).
const STORYBOARD_ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/**
 * Copies a completed generation job's image output into permanent
 * storyboard storage and records a `draft` row. Never approves anything,
 * never touches `shots.approvedVideoPath` or `shot_reference_images`.
 */
export async function saveStoryboardDraftFromJob(formData: FormData): Promise<void> {
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const jobId = parseInt(formData.get("jobId") as string, 10);
  const promptSnapshot = (formData.get("promptSnapshot") as string | null) ?? null;
  const referencesSnapshot = (formData.get("referencesSnapshot") as string | null) ?? null;
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}storyboardDraftError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(shotId) || shotId <= 0 || !Number.isInteger(jobId) || jobId <= 0) {
    errRedirect("Invalid request.");
  }

  const [shot] = await db.select({ id: shots.id }).from(shots).where(eq(shots.id, shotId));
  if (!shot) errRedirect("Shot not found.");

  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job) errRedirect("Output not found.");
  if (job.shotId !== shotId) errRedirect("Output does not belong to this shot.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  if (!job.outputPath) errRedirect("Output path is missing.");
  if (!job.outputPath.startsWith("outputs/jobs/")) {
    errRedirect("Output path is not in the expected location.");
  }

  const ext = path.extname(job.outputPath).toLowerCase();
  if (!STORYBOARD_ATTACHABLE_IMAGE_EXTS.has(ext)) {
    errRedirect("Only image outputs can be saved as a storyboard draft.");
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
  const destSubfolder = `shot-${shotId}`;
  const destRelative = `uploads/storyboard-images/${destSubfolder}/${destFilename}`;
  const destDir = path.join(publicRoot, "uploads", "storyboard-images", destSubfolder);
  const destAbsolute = path.join(destDir, destFilename);

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourceAbsolute, destAbsolute);
  } catch {
    errRedirect("Failed to copy output file. Please try again.");
  }

  try {
    await db.insert(storyboardImages).values({
      shotId,
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
    errRedirect("Failed to save storyboard draft. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}storyboardDraftSaved=1`);
}

/**
 * Explicit approval. Demotes any other currently-approved draft of the same
 * Shot back to "draft" first (never deletes/rejects it) so "at most one
 * approved draft active per Shot" holds without losing data. Never touches
 * `shots.approvedVideoPath`, never creates a Shot, never writes to
 * `shot_reference_images`.
 */
export async function approveStoryboardDraft(formData: FormData): Promise<void> {
  const draftId = parseInt(formData.get("draftId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}storyboardApproveError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(draftId) || draftId <= 0 || !Number.isInteger(shotId) || shotId <= 0) {
    errRedirect("Invalid request.");
  }

  const [draft] = await db.select().from(storyboardImages).where(eq(storyboardImages.id, draftId));
  if (!draft) errRedirect("Storyboard draft not found.");
  if (draft.shotId !== shotId) errRedirect("Draft does not belong to this shot.");

  const now = new Date().toISOString();

  await db
    .update(storyboardImages)
    .set({ status: "draft", updatedAt: now })
    .where(and(eq(storyboardImages.shotId, shotId), eq(storyboardImages.status, "approved")));

  await db
    .update(storyboardImages)
    .set({ status: "approved", approvedAt: now, updatedAt: now })
    .where(eq(storyboardImages.id, draftId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}storyboardApproved=1`);
}

/**
 * Explicit rejection — keeps the row (status change only, never a delete)
 * so provenance/history is preserved. "Regenerate conserve les anciens
 * drafts jusqu'a une action explicite de rejet" — this is that explicit
 * action; it still does not delete anything.
 */
export async function rejectStoryboardDraft(formData: FormData): Promise<void> {
  const draftId = parseInt(formData.get("draftId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}storyboardRejectError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(draftId) || draftId <= 0 || !Number.isInteger(shotId) || shotId <= 0) {
    errRedirect("Invalid request.");
  }

  const [draft] = await db.select().from(storyboardImages).where(eq(storyboardImages.id, draftId));
  if (!draft) errRedirect("Storyboard draft not found.");
  if (draft.shotId !== shotId) errRedirect("Draft does not belong to this shot.");

  await db
    .update(storyboardImages)
    .set({ status: "rejected", updatedAt: new Date().toISOString() })
    .where(eq(storyboardImages.id, draftId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}storyboardRejected=1`);
}
