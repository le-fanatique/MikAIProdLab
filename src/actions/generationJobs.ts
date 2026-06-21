"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { generationJobs, shots, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runWorkflowGeneration } from "@/actions/generation";

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

  // Run a new generation with current shot/workflow state
  const result = await runWorkflowGeneration({
    projectId,
    sequenceId,
    shotId,
    workflowId: job.workflowId,
  });

  if (result.ok) {
    redirect(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}/workflows/${job.workflowId}/map?jobId=${result.jobId}`
    );
  } else {
    errRedirect(result.error);
  }
}
