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
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sequences, generationJobs, sequenceStoryboardImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";

const SEQUENCE_STORYBOARD_ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

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
