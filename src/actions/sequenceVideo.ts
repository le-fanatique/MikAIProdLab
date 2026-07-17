"use server";

// ---------------------------------------------------------------------------
// sequenceVideo.ts — SEQGEN.VIDEO.1
//
// Sequence Video draft store — the video twin of
// saveSequenceStoryboardDraftFromJob in src/actions/sequenceStoryboard.ts.
// Deliberately a separate file from sequenceVideoGeneration.ts (the
// ComfyUI-calling runSequenceVideoGeneration/-FromForm), same separation
// already established between sequenceStoryboard.ts and
// sequenceGeneration.ts for the image twin.
//
// A completed job is NEVER saved automatically — this is the one explicit
// action that copies a job's raw video output into durable storage and
// records a `draft` row. Never approves anything, never splits, never
// touches Shots, Shot references, Sequence Results, Film Results or
// Editorial.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sequences, generationJobs, sequenceVideoDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";

const SEQUENCE_VIDEO_ATTACHABLE_EXTS = new Set([".mp4", ".webm", ".mov"]);

/**
 * Copies a completed Sequence-VIDEO-generation job's raw output into
 * permanent Sequence Video storage and records a `draft` row. Mirrors
 * saveSequenceStoryboardDraftFromJob's validation pattern exactly (job
 * ownership, "done" status, outputs/jobs/ prefix, extension allowlist,
 * resolved-path containment, on-disk existence). Every call inserts a new
 * row — multiple drafts per Sequence are kept, never overwritten. Status is
 * always `draft`: no automatic approval, and choosing which draft to split
 * belongs to the future SEQGEN.SPLIT.1, not here.
 */
export async function saveSequenceVideoDraftFromJob(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const jobId = parseInt(formData.get("jobId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequenceVideoDraftError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(sequenceId) || sequenceId <= 0 || !Number.isInteger(jobId) || jobId <= 0) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirect("Sequence not found.");

  // REVISE-safe from the start: same "Output belongs to THIS Sequence"
  // ownership check the Sequence Storyboard image twin enforces — refuses
  // saving another Sequence's job output outright.
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job) errRedirect("Output not found.");
  if (job.sequenceId !== sequenceId) errRedirect("Output does not belong to this Sequence.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  if (!job.outputPath) errRedirect("Output path is missing.");
  if (!job.outputPath.startsWith("outputs/jobs/")) {
    errRedirect("Output path is not in the expected location.");
  }

  const ext = path.extname(job.outputPath).toLowerCase();
  if (!SEQUENCE_VIDEO_ATTACHABLE_EXTS.has(ext)) {
    errRedirect("Only video outputs (.mp4, .webm, .mov) can be saved as a Sequence Video draft.");
  }

  const publicRoot = path.join(process.cwd(), "public");
  const allowedOutputsRoot = path.join(publicRoot, "outputs", "jobs");
  const sourceAbsolute = path.resolve(publicRoot, job.outputPath);

  if (!sourceAbsolute.startsWith(allowedOutputsRoot + path.sep) && sourceAbsolute !== allowedOutputsRoot) {
    errRedirect("Output path is not in the expected location.");
  }

  try {
    await fs.access(sourceAbsolute);
  } catch {
    errRedirect("Output file not found on disk.");
  }

  // REVISE (Codex finding #2) — provenance is validated BEFORE the durable
  // copy whenever possible, so a job with no recorded source is refused
  // without ever creating a file that would then need cleanup at all.
  // Provenance is read from the job's own immutable payloadSnapshot
  // (captured at queue time by runSequenceVideoGeneration, and — since that
  // action's own REVISE fix — only ever recorded there once the board was
  // proven present in the actually-queued payload), never from
  // client-submitted form fields or the current page's query string.
  const jobSnapshot = parseGenerationSnapshot(job.payloadSnapshot);
  const promptSnapshot = jobSnapshot?.promptText ?? null;
  const sourceStoryboardImageId = jobSnapshot?.sequenceVideoSourceStoryboardImageId ?? null;
  const referencesSnapshot = jobSnapshot?.sequenceVideoImageMappings
    ? JSON.stringify(jobSnapshot.sequenceVideoImageMappings)
    : null;

  if (!sourceStoryboardImageId) {
    // This job's snapshot predates SEQGEN.VIDEO.1 or was never a Sequence
    // Video generation — refused BEFORE any file is copied, so there is
    // nothing to clean up here at all.
    errRedirect("This job has no recorded Sequence Storyboard source and cannot be saved as a Sequence Video draft.");
  }

  const uuid = randomUUID();
  const destFilename = `${uuid}${ext}`;
  const destSubfolder = `sequence-${sequenceId}`;
  const destRelative = `uploads/sequence-video-drafts/${destSubfolder}/${destFilename}`;
  const destDir = path.join(publicRoot, "uploads", "sequence-video-drafts", destSubfolder);
  const destAbsolute = path.join(destDir, destFilename);

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourceAbsolute, destAbsolute);
  } catch {
    // REVISE round 2 (Codex finding #2) — Node does NOT guarantee
    // `fs.copyFile` is atomic: a failure partway through (disk full,
    // interrupted, permission revoked mid-write) can still leave a partial
    // file at `destAbsolute`. Never assume "the catch fired, so nothing was
    // created" — verify/clean it up, and if that cleanup itself fails,
    // report the exact path honestly instead of the generic message, same
    // as the post-insert-failure path below.
    try {
      await fs.unlink(destAbsolute);
    } catch (unlinkErr) {
      if ((unlinkErr as NodeJS.ErrnoException)?.code !== "ENOENT") {
        errRedirect(
          `Failed to copy the output file, and a partial file could not be removed automatically. A file may remain at "${destRelative}" — please report this to an administrator.`
        );
      }
      // ENOENT: copyFile never actually created anything — no orphan.
    }
    errRedirect("Failed to copy output file. Please try again.");
  }

  // REVISE (Codex finding #2) — the copy above DID create a real durable
  // file, so every failure from this point on must be treated as
  // compensable: cleanup is attempted, but its own failure is NEVER
  // swallowed behind a generic message. A silent `catch {}` here is exactly
  // what let an orphaned video sit in `uploads/sequence-video-drafts/` with
  // no matching row and no way to discover it.
  try {
    await db.insert(sequenceVideoDrafts).values({
      sequenceId,
      sourceStoryboardImageId,
      jobId,
      workflowId: job.workflowId,
      videoPath: destRelative,
      status: "draft",
      promptSnapshot,
      referencesSnapshot,
    });
  } catch {
    try {
      await fs.unlink(destAbsolute);
    } catch {
      // The copied file could NOT be removed and there is no DB row
      // pointing at it — a real orphan. Report this explicitly instead of
      // the generic "please try again", which would hide that a file is
      // now stuck on disk needing manual/administrative cleanup.
      errRedirect(
        `Failed to save Sequence Video draft, and the copied file could not be removed automatically. An orphaned file may remain at "${destRelative}" — please report this to an administrator.`
      );
    }
    errRedirect("Failed to save Sequence Video draft. The copied file was removed; nothing was left behind. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequenceVideoDraftSaved=1`);
}
