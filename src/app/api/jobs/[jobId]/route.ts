import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { generationJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { GenerationJob } from "@/db/schema";
import {
  getConfiguredComfyBaseUrl,
  getComfyHistory,
  extractFirstComfyOutput,
  buildComfyViewUrl,
} from "@/lib/comfy/comfyServerClient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Video workflows can take several minutes on local/remote GPUs.
const JOB_TIMEOUT_MS = 600_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobRow = Pick<
  GenerationJob,
  | "id"
  | "status"
  | "promptId"
  | "outputPath"
  | "errorMessage"
  | "createdAt"
  | "updatedAt"
  | "startedAt"
  | "completedAt"
>;

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function serializeJob(job: JobRow) {
  return {
    id: job.id,
    status: job.status,
    promptId: job.promptId ?? null,
    outputPath: job.outputPath ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
  };
}

async function updateJobFields(
  jobId: number,
  fields: Partial<{
    status: GenerationJob["status"];
    promptId: string | null;
    outputPath: string;
    errorMessage: string;
    startedAt: string;
    completedAt: string;
    updatedAt: string;
  }>
): Promise<JobRow> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(generationJobs)
    .set({ ...fields, updatedAt: fields.updatedAt ?? now })
    .where(eq(generationJobs.id, jobId))
    .returning({
      id: generationJobs.id,
      status: generationJobs.status,
      promptId: generationJobs.promptId,
      outputPath: generationJobs.outputPath,
      errorMessage: generationJobs.errorMessage,
      createdAt: generationJobs.createdAt,
      updatedAt: generationJobs.updatedAt,
      startedAt: generationJobs.startedAt,
      completedAt: generationJobs.completedAt,
    });
  return updated;
}

async function failJob(jobId: number, message: string): Promise<JobRow> {
  const now = new Date().toISOString();
  return updateJobFields(jobId, {
    status: "failed",
    errorMessage: message.slice(0, 500),
    completedAt: now,
    updatedAt: now,
  });
}

async function timeoutJob(jobId: number): Promise<JobRow> {
  const now = new Date().toISOString();
  return updateJobFields(jobId, {
    status: "timeout",
    errorMessage: "ComfyUI job timed out.",
    completedAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Output download + save
// ---------------------------------------------------------------------------

async function downloadAndSaveOutput(
  jobId: number,
  baseUrl: string,
  file: { filename: string; subfolder?: string; type?: string }
): Promise<string> {
  const url = buildComfyViewUrl({ baseUrl, file });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `ComfyUI /view responded ${response.status} for ${file.filename}`
    );
  }

  const buffer = await response.arrayBuffer();

  // Derive extension from the ComfyUI filename — never use filename directly as local path
  const ext = path.extname(file.filename) || ".bin";
  const localFilename = `output-${Date.now()}${ext}`;
  const outputDir = path.join(process.cwd(), "public", "outputs", "jobs", String(jobId));

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, localFilename), Buffer.from(buffer));

  // Return relative path from public/ — no leading slash
  return `outputs/jobs/${jobId}/${localFilename}`;
}

// ---------------------------------------------------------------------------
// GET /api/jobs/[jobId]
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr, 10);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid job id." }, { status: 400 });
  }

  // Fetch job
  const [rawJob] = await db
    .select({
      id: generationJobs.id,
      status: generationJobs.status,
      promptId: generationJobs.promptId,
      outputPath: generationJobs.outputPath,
      errorMessage: generationJobs.errorMessage,
      createdAt: generationJobs.createdAt,
      updatedAt: generationJobs.updatedAt,
      startedAt: generationJobs.startedAt,
      completedAt: generationJobs.completedAt,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!rawJob) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  let job: JobRow = rawJob;

  // --- Terminal statuses: return as-is ---
  if (
    job.status === "done" ||
    job.status === "failed" ||
    job.status === "timeout"
  ) {
    return NextResponse.json({ ok: true, job: serializeJob(job) });
  }

  // --- Pending / uploading: return as-is (F.5-C owns those transitions) ---
  if (job.status === "pending" || job.status === "uploading") {
    return NextResponse.json({ ok: true, job: serializeJob(job) });
  }

  // --- Queued / running: check ComfyUI ---
  if (job.status === "queued" || job.status === "running") {
    // Guard: need a promptId
    const promptId = job.promptId;
    if (!promptId) {
      job = await failJob(jobId, "Missing ComfyUI prompt id.");
      return NextResponse.json({ ok: true, job: serializeJob(job) });
    }

    // Timeout check (before calling ComfyUI)
    const startTimestamp = job.startedAt
      ? Date.parse(job.startedAt)
      : Date.parse(job.createdAt);
    if (Date.now() - startTimestamp > JOB_TIMEOUT_MS) {
      job = await timeoutJob(jobId);
      return NextResponse.json({ ok: true, job: serializeJob(job) });
    }

    // Mark as running if still queued
    if (job.status === "queued") {
      job = await updateJobFields(jobId, { status: "running" });
    }

    // Poll ComfyUI history — one check, no loop
    try {
      const history = await getComfyHistory(promptId);
      const outputFile = extractFirstComfyOutput(history, promptId);

      if (!outputFile) {
        // Not done yet — return current running state
        return NextResponse.json({ ok: true, job: serializeJob(job) });
      }

      // Output available — download and save
      const baseUrl = await getConfiguredComfyBaseUrl();
      const outputPath = await downloadAndSaveOutput(jobId, baseUrl, outputFile);

      const now = new Date().toISOString();
      job = await updateJobFields(jobId, {
        status: "done",
        outputPath,
        completedAt: now,
        updatedAt: now,
      });

      return NextResponse.json({ ok: true, job: serializeJob(job) });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error checking ComfyUI.";
      job = await failJob(jobId, message);
      return NextResponse.json({ ok: true, job: serializeJob(job) });
    }
  }

  // Fallback — unknown status: return as-is
  return NextResponse.json({ ok: true, job: serializeJob(job) });
}
