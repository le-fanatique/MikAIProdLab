"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { generationJobs, shots, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runShotGenerationCore } from "@/lib/comfy/runShotGeneration";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { deriveShotRetryStyleIntent } from "@/lib/comfy/deriveShotRetryStyleIntent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePositiveInt(value: FormDataEntryValue | null): number {
  const n = parseInt(value as string, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function appendQueryParam(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

// ---------------------------------------------------------------------------
// getSafeJobOutputPath — returns resolved absolute path only if within jobId folder
// ---------------------------------------------------------------------------

function getSafeJobOutputPath(outputPath: string | null, jobId: number): string | null {
  if (!outputPath) return null;
  const normalized = outputPath.replace(/\\/g, "/");
  if (path.isAbsolute(normalized)) return null;
  if (normalized.includes("..")) return null;
  const expectedPrefix = `outputs/jobs/${jobId}/`;
  if (!normalized.startsWith(expectedPrefix)) return null;
  const publicRoot = path.join(process.cwd(), "public");
  const resolved = path.resolve(publicRoot, normalized);
  const allowedRoot = path.join(publicRoot, "outputs", "jobs", String(jobId));
  if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) return null;
  return resolved;
}

// ---------------------------------------------------------------------------
// retryGenerationJob
// ---------------------------------------------------------------------------

export async function retryGenerationJob(formData: FormData): Promise<void> {
  const projectId = parsePositiveInt(formData.get("projectId"));
  const sequenceId = parsePositiveInt(formData.get("sequenceId"));
  const shotId = parsePositiveInt(formData.get("shotId"));
  const jobId = parsePositiveInt(formData.get("jobId"));
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    redirect(appendQueryParam(returnTo, "retryError", msg));
  }

  if (!projectId || !sequenceId || !shotId || !jobId) {
    errRedirect("Invalid request.");
  }

  // Fetch original job
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!job) errRedirect("Job not found.");
  if (job.shotId !== shotId) errRedirect("Job does not belong to this shot.");
  if (job.status !== "failed" && job.status !== "timeout") {
    errRedirect("Only failed or timed out jobs can be retried.");
  }

  // Verify ownership chain: shot → sequence → project
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  // STYLE.1.E.SURFACES.1 (retake) / GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — see
  // deriveShotRetryStyleIntent's own doc comment for the full contract: retry
  // preserves the EXACT original Style consumer or explicit opt-out, and
  // refuses outright on a corrupt/foreign consumer, rather than silently
  // treating it as normal.
  const priorSnapshot = parseGenerationSnapshot(job.payloadSnapshot);
  const styleDecision = deriveShotRetryStyleIntent(priorSnapshot);
  if (!styleDecision.ok) {
    errRedirect(styleDecision.error);
  }
  const { styleIntent, appendProjectStyleRequested } = styleDecision;

  // Run a new generation with current shot/workflow state. runShotGenerationCore
  // itself re-verifies that the workflow's CURRENT persisted kind is still
  // coherent with `styleIntent` (e.g. a preserved "shot-video" now pointing
  // at an image workflow is refused, never silently switched to shot-image).
  const result = await runShotGenerationCore(
    {
      projectId,
      sequenceId,
      shotId,
      workflowId: job.workflowId,
      appendProjectStyleRequested,
    },
    styleIntent
  );

  if (result.ok) {
    redirect(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}/workflows/${job.workflowId}/map?jobId=${result.jobId}`
    );
  } else {
    errRedirect(result.error);
  }
}

// ---------------------------------------------------------------------------
// deleteGenerationJob
// ---------------------------------------------------------------------------

export async function deleteGenerationJob(formData: FormData): Promise<void> {
  const projectId = parsePositiveInt(formData.get("projectId"));
  const sequenceId = parsePositiveInt(formData.get("sequenceId"));
  const shotId = parsePositiveInt(formData.get("shotId"));
  const jobId = parsePositiveInt(formData.get("jobId"));
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    redirect(appendQueryParam(returnTo, "deleteError", msg));
  }

  if (!projectId || !sequenceId || !shotId || !jobId) {
    errRedirect("Invalid request.");
  }

  // Fetch job
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!job) errRedirect("Job not found.");
  if (job.shotId !== shotId) errRedirect("Job does not belong to this shot.");

  // Verify ownership chain
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  // Delete output file best-effort
  const safeFilePath = getSafeJobOutputPath(job.outputPath, jobId);
  if (safeFilePath) {
    try {
      await fs.unlink(safeFilePath);
    } catch {
      // best-effort
    }
  }

  // Delete empty job dir best-effort
  const jobDir = path.join(process.cwd(), "public", "outputs", "jobs", String(jobId));
  try {
    await fs.rmdir(jobDir);
  } catch {
    // best-effort — non-empty or already gone
  }

  // Delete DB row
  await db.delete(generationJobs).where(eq(generationJobs.id, jobId));

  redirect(appendQueryParam(returnTo, "deleteSuccess", "1"));
}
