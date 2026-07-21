import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { generationJobs } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { GenerationJob } from "@/db/schema";
import {
  getConfiguredComfyBaseUrl,
  getComfyHistory,
  extractFirstComfyOutput,
  extractPlyComfyOutput,
  buildComfyViewUrl,
  buildComfyPlyViewUrl,
  isPromptInComfyQueue,
  type ComfyHistoryResponse,
} from "@/lib/comfy/comfyServerClient";
import { PLY_MAX_BYTES, validatePlyFile } from "@/lib/comfy/plyArtifact";
import { getComfySettings } from "@/lib/settings";
import { getCloudJobDetail, fetchCloudOutputResponse } from "@/lib/comfy/comfyCloudClient";

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
  // GEN.SEEDANCE.1 — read-only addition, no change to polling/status logic.
  | "payloadSnapshot"
  // COMFY.PROVIDER.1 — the provider this job was queued against; read-only
  // here, never reassigned after creation.
  | "runtimeProvider"
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
    payloadSnapshot: job.payloadSnapshot ?? null,
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
      payloadSnapshot: generationJobs.payloadSnapshot,
      runtimeProvider: generationJobs.runtimeProvider,
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

/**
 * COMFY.PROVIDER.1 — Cloud equivalent of downloadAndSaveOutput above: same
 * local storage convention (outputs/jobs/<id>/output-<ts><ext>), same
 * relative-path contract, so a rehosted Cloud output reads through the
 * exact same generated-outputs route as a local one. Only the transport
 * differs (GET /api/view redirect -> signed URL, per comfyCloudClient.ts).
 *
 * Random suffix (same convention as the PLY path) guarantees two polls in
 * the same millisecond can never collide on the same local name — a
 * loser's compensation must only ever delete its own attempt's file.
 * Written to an exclusive temp file, then renamed atomically: no partial
 * file is ever left at a servable path.
 */
async function downloadAndSaveOutputFromCloud(
  jobId: number,
  cloudApiKey: string,
  file: { filename: string }
): Promise<{ relativePath: string; finalPath: string }> {
  const response = await fetchCloudOutputResponse({ filename: file.filename, cloudApiKey });
  if (!response.ok) {
    throw new Error(`Comfy Cloud output download responded ${response.status} for ${file.filename}`);
  }

  const buffer = await response.arrayBuffer();

  const ext = path.extname(file.filename) || ".bin";
  const localFilename = `output-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  const outputDir = path.join(process.cwd(), "public", "outputs", "jobs", String(jobId));
  const finalPath = path.join(outputDir, localFilename);
  const tmpPath = `${finalPath}.tmp`;

  await fs.mkdir(outputDir, { recursive: true });
  try {
    await fs.writeFile(tmpPath, Buffer.from(buffer), { flag: "wx" });
    await fs.rename(tmpPath, finalPath);
  } catch (err) {
    // Honest cleanup: collect every failed removal with its path — never a
    // silent .catch(() => {}) that could hide a stray file behind a clean-
    // looking error (same discipline as the PLY path's own compensation).
    const cleanupFailures: string[] = [];
    for (const p of [tmpPath, finalPath]) {
      try {
        await fs.unlink(p);
      } catch (rmErr) {
        const rmCode = (rmErr as NodeJS.ErrnoException)?.code;
        if (rmCode !== "ENOENT") {
          cleanupFailures.push(`"${p}": ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`);
        }
      }
    }
    const baseMsg = err instanceof Error ? err.message : String(err);
    const suffix = cleanupFailures.length > 0
      ? ` Additionally, cleanup failed and stray file(s) may remain — ${cleanupFailures.join("; ")}.`
      : "";
    throw new Error(`${baseMsg}${suffix}`);
  }

  return { relativePath: `outputs/jobs/${jobId}/${localFilename}`, finalPath };
}

// ---------------------------------------------------------------------------
// PLY output download (CAMLAB.PLY.1)
// ---------------------------------------------------------------------------

/**
 * Streams an already-fetched PLY `Response` (local or Cloud — the caller
 * resolved the transport) into the job's output directory. Enforces the 512
 * MiB cap during streaming (never trusting Content-Length alone), writes to
 * a temp file, validates the PLY header and size, then renames atomically.
 * Any failure cleans up this attempt's files and throws — the caller fails
 * the job. Shared by downloadAndSavePlyOutput (local) and its Cloud sibling
 * below so the validation/cap/atomic-publish discipline can never diverge
 * between providers.
 */
async function streamResponseToPlyFile(
  jobId: number,
  response: Response
): Promise<{ relativePath: string; finalPath: string }> {
  if (!response.ok || !response.body) {
    throw new Error(`PLY output download responded ${response.status}.`);
  }

  const contentLength = parseInt(
    response.headers.get("content-length") ?? "",
    10
  );
  if (Number.isFinite(contentLength) && contentLength > PLY_MAX_BYTES) {
    throw new Error(
      `PLY output exceeds the ${PLY_MAX_BYTES} byte limit (Content-Length ${contentLength}).`
    );
  }

  // Random suffix guarantees concurrent polls can never collide on the same
  // local name — a loser's compensation must only ever delete its own file.
  const localFilename = `output-${Date.now()}-${randomUUID().slice(0, 8)}.ply`;
  const outputDir = path.join(
    process.cwd(),
    "public",
    "outputs",
    "jobs",
    String(jobId)
  );
  const finalPath = path.join(outputDir, localFilename);
  const tmpPath = `${finalPath}.tmp`;

  await fs.mkdir(outputDir, { recursive: true });

  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(tmpPath, "wx");
    const reader = response.body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > PLY_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(
          `PLY output exceeds the ${PLY_MAX_BYTES} byte limit while streaming.`
        );
      }
      await handle.write(value);
    }
    await handle.close();
    handle = null;

    const validation = await validatePlyFile(tmpPath);
    if (!validation.ok) {
      throw new Error(`Downloaded PLY failed validation: ${validation.reason}`);
    }

    await fs.rename(tmpPath, finalPath);
  } catch (err) {
    await handle?.close().catch(() => {});
    await fs.unlink(tmpPath).catch(() => {});
    await fs.unlink(finalPath).catch(() => {});
    throw err;
  }

  // Relative path from public/ — same convention as image/video outputs.
  // finalPath is returned so the caller can compensate (delete the file)
  // if the DB publication fails or loses a concurrent race.
  return {
    relativePath: `outputs/jobs/${jobId}/${localFilename}`,
    finalPath,
  };
}

/** Local ComfyUI transport for streamResponseToPlyFile — unchanged behavior. */
async function downloadAndSavePlyOutput(
  jobId: number,
  baseUrl: string,
  comfyFilename: string
): Promise<{ relativePath: string; finalPath: string }> {
  const url = buildComfyPlyViewUrl({ baseUrl, filename: comfyFilename });
  const response = await fetch(url);
  return streamResponseToPlyFile(jobId, response);
}

/** COMFY.PROVIDER.1 — Cloud transport for streamResponseToPlyFile: resolves the /api/view redirect to a signed URL first (see comfyCloudClient.ts), then streams identically to the local path. */
async function downloadAndSavePlyOutputFromCloud(
  jobId: number,
  cloudApiKey: string,
  comfyFilename: string
): Promise<{ relativePath: string; finalPath: string }> {
  const response = await fetchCloudOutputResponse({ filename: comfyFilename, cloudApiKey });
  return streamResponseToPlyFile(jobId, response);
}

/**
 * Atomically publishes any downloaded output (PLY, or — COMFY.PROVIDER.1 —
 * a Cloud image/video/gif) on the job row: the transition only succeeds if
 * the job is still `running` with no outputPath, so exactly one concurrent
 * poll can win. Returns the updated row on win, null on loss.
 */
async function publishOutputIfStillRunning(
  jobId: number,
  outputPath: string
): Promise<JobRow | null> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(generationJobs)
    .set({
      status: "done",
      outputPath,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(generationJobs.id, jobId),
        eq(generationJobs.status, "running"),
        isNull(generationJobs.outputPath)
      )
    )
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
      payloadSnapshot: generationJobs.payloadSnapshot,
      runtimeProvider: generationJobs.runtimeProvider,
    });
  return updated ?? null;
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
      payloadSnapshot: generationJobs.payloadSnapshot,
      runtimeProvider: generationJobs.runtimeProvider,
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

    // Mark as running only if still queued — conditional so a stale poll
    // that read `queued` long ago can never downgrade a job another poll
    // has already completed (done/failed/timeout) in the meantime.
    if (job.status === "queued") {
      const now = new Date().toISOString();
      const [transitioned] = await db
        .update(generationJobs)
        .set({ status: "running", updatedAt: now })
        .where(
          and(eq(generationJobs.id, jobId), eq(generationJobs.status, "queued"))
        )
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
          payloadSnapshot: generationJobs.payloadSnapshot,
      runtimeProvider: generationJobs.runtimeProvider,
        });

      if (!transitioned) {
        // Another poll changed the status since our read — return the
        // current row untouched instead of overwriting it.
        const [fresh] = await db
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
            payloadSnapshot: generationJobs.payloadSnapshot,
      runtimeProvider: generationJobs.runtimeProvider,
          })
          .from(generationJobs)
          .where(eq(generationJobs.id, jobId));
        job = fresh ?? job;
        return NextResponse.json({ ok: true, job: serializeJob(job) });
      }

      job = transitioned;
    }

    // COMFY.PROVIDER.1 — Cloud gets its own poll, entirely separate from the
    // local block below (which stays byte-for-byte the pre-existing logic,
    // the non-regression reference). Every Cloud branch returns.
    if (job.runtimeProvider === "cloud") {
      try {
        const comfySettings = await getComfySettings();
        if (!comfySettings.hasCloudApiKey) {
          job = await failJob(jobId, "Comfy Cloud API key is not configured; cannot poll this job.");
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }
        const cloudApiKey = comfySettings.cloudApiKey;

        const detail = await getCloudJobDetail(promptId, cloudApiKey);

        if (detail.status === "failed" || detail.status === "cancelled") {
          const e = detail.executionError;
          const msg =
            detail.status === "cancelled"
              ? "Comfy Cloud job was cancelled."
              : e?.exceptionMessage
                ? `${e.nodeType ? `${e.nodeType}: ` : ""}${e.exceptionMessage}`
                : "Comfy Cloud execution error.";
          job = await failJob(jobId, msg.slice(0, 500));
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }

        if (detail.status !== "completed" || !detail.outputs) {
          // pending / in_progress — nothing to download yet
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }

        // Reuse the EXACT SAME priority extraction (videos -> gifs -> images)
        // and PLY detection as local, by wrapping Cloud's outputs dict into
        // the same shape getComfyHistory() would have returned.
        const historyLike: ComfyHistoryResponse = { [promptId]: { outputs: detail.outputs } };
        const outputFile = extractFirstComfyOutput(historyLike, promptId);

        if (!outputFile) {
          const plyResult = extractPlyComfyOutput(historyLike, promptId);

          if (plyResult.status === "invalid") {
            job = await failJob(jobId, `Invalid PLY output metadata: ${plyResult.reason}`);
            return NextResponse.json({ ok: true, job: serializeJob(job) });
          }

          if (plyResult.status === "found") {
            const { relativePath, finalPath } = await downloadAndSavePlyOutputFromCloud(
              jobId,
              cloudApiKey,
              plyResult.filename
            );

            let published: JobRow | null;
            try {
              published = await publishOutputIfStillRunning(jobId, relativePath);
            } catch (dbErr) {
              let cleanupNote = "";
              try {
                await fs.unlink(finalPath);
              } catch {
                cleanupNote = ` Cleanup of the cached PLY file also failed; a stray file may remain at outputs/jobs/${jobId}.`;
              }
              const dbMsg = dbErr instanceof Error ? dbErr.message : "Unknown DB error.";
              throw new Error(`Failed to record PLY output in the database: ${dbMsg}${cleanupNote}`);
            }

            if (!published) {
              try {
                await fs.unlink(finalPath);
              } catch (cleanupErr) {
                const msg = cleanupErr instanceof Error ? cleanupErr.message : "Unknown cleanup error.";
                return NextResponse.json(
                  {
                    ok: false,
                    error: `A concurrent poll already published this job's output, but cleanup of the duplicate PLY failed (${msg}). A stray file may remain in outputs/jobs/${jobId}.`,
                  },
                  { status: 500 }
                );
              }
              const [fresh] = await db
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
                  payloadSnapshot: generationJobs.payloadSnapshot,
                  runtimeProvider: generationJobs.runtimeProvider,
                })
                .from(generationJobs)
                .where(eq(generationJobs.id, jobId));
              job = fresh ?? job;
              return NextResponse.json({ ok: true, job: serializeJob(job) });
            }

            job = published;
            return NextResponse.json({ ok: true, job: serializeJob(job) });
          }

          // Completed on Cloud but no recognizable image/video/gif/PLY output.
          job = await failJob(jobId, "Comfy Cloud job completed but produced no recognizable output.");
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }

        const { relativePath, finalPath } = await downloadAndSaveOutputFromCloud(jobId, cloudApiKey, outputFile);

        let publishedGeneric: JobRow | null;
        try {
          publishedGeneric = await publishOutputIfStillRunning(jobId, relativePath);
        } catch (dbErr) {
          // DB failed after the file was written — compensate by removing
          // it so no orphan survives, and surface any cleanup failure
          // explicitly. Same discipline as the PLY path above.
          let cleanupNote = "";
          try {
            await fs.unlink(finalPath);
          } catch {
            cleanupNote = ` Cleanup of the cached output file also failed; a stray file may remain at outputs/jobs/${jobId}.`;
          }
          const dbMsg = dbErr instanceof Error ? dbErr.message : "Unknown DB error.";
          throw new Error(`Failed to record Comfy Cloud output in the database: ${dbMsg}${cleanupNote}`);
        }

        if (!publishedGeneric) {
          // A concurrent poll already published an output for this job.
          // Delete our duplicate, then return the winner's state. A failed
          // cleanup is an explicit error — never a silent success with a
          // stray file left behind.
          try {
            await fs.unlink(finalPath);
          } catch (cleanupErr) {
            const msg = cleanupErr instanceof Error ? cleanupErr.message : "Unknown cleanup error.";
            return NextResponse.json(
              {
                ok: false,
                error: `A concurrent poll already published this job's output, but cleanup of the duplicate file failed (${msg}). A stray file may remain in outputs/jobs/${jobId}.`,
              },
              { status: 500 }
            );
          }
          const [fresh] = await db
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
              payloadSnapshot: generationJobs.payloadSnapshot,
              runtimeProvider: generationJobs.runtimeProvider,
            })
            .from(generationJobs)
            .where(eq(generationJobs.id, jobId));
          job = fresh ?? job;
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }

        job = publishedGeneric;
        return NextResponse.json({ ok: true, job: serializeJob(job) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error checking Comfy Cloud.";
        job = await failJob(jobId, message);
        return NextResponse.json({ ok: true, job: serializeJob(job) });
      }
    }

    // Poll ComfyUI history — one check, no loop
    try {
      const history = await getComfyHistory(promptId);
      const entry = history[promptId];

      // Detect ComfyUI execution error recorded in history
      if (entry) {
        const status =
          typeof entry["status"] === "object" &&
          entry["status"] !== null &&
          !Array.isArray(entry["status"])
            ? (entry["status"] as Record<string, unknown>)
            : null;

        if (status?.["status_str"] === "error") {
          const messages = Array.isArray(status["messages"]) ? status["messages"] : [];
          const errorEvent = messages.find(
            (m): m is [string, Record<string, unknown>] =>
              Array.isArray(m) &&
              m[0] === "error" &&
              typeof m[1] === "object" &&
              m[1] !== null
          );
          const raw = errorEvent
            ? (errorEvent[1] as Record<string, unknown>)["exception_message"]
            : undefined;
          const msg =
            typeof raw === "string" && raw.trim()
              ? raw.trim()
              : "ComfyUI execution error.";
          job = await failJob(jobId, msg.slice(0, 500));
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }
      }

      const outputFile = extractFirstComfyOutput(history, promptId);

      // CAMLAB.PLY.1 — PLY artifact path, only when no image/video output
      // was recognized (priority videos -> gifs -> images is preserved).
      if (!outputFile) {
        const plyResult = extractPlyComfyOutput(history, promptId);

        if (plyResult.status === "invalid") {
          job = await failJob(
            jobId,
            `Invalid PLY output metadata: ${plyResult.reason}`
          );
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }

        if (plyResult.status === "found") {
          const baseUrl = await getConfiguredComfyBaseUrl();
          const { relativePath, finalPath } = await downloadAndSavePlyOutput(
            jobId,
            baseUrl,
            plyResult.filename
          );

          let published: JobRow | null;
          try {
            published = await publishOutputIfStillRunning(
              jobId,
              relativePath
            );
          } catch (dbErr) {
            // DB failed after the file was renamed into place — compensate
            // by removing the final file so no orphan survives, and surface
            // any cleanup failure explicitly.
            let cleanupNote = "";
            try {
              await fs.unlink(finalPath);
            } catch {
              cleanupNote = ` Cleanup of the cached PLY file also failed; a stray file may remain at outputs/jobs/${jobId}.`;
            }
            const dbMsg =
              dbErr instanceof Error ? dbErr.message : "Unknown DB error.";
            throw new Error(
              `Failed to record PLY output in the database: ${dbMsg}${cleanupNote}`
            );
          }

          if (!published) {
            // A concurrent poll already published an output for this job.
            // Delete our duplicate, then return the winner's state. A failed
            // cleanup is an explicit error — never a silent success with a
            // stray 66 MB file left behind.
            try {
              await fs.unlink(finalPath);
            } catch (cleanupErr) {
              const msg =
                cleanupErr instanceof Error
                  ? cleanupErr.message
                  : "Unknown cleanup error.";
              return NextResponse.json(
                {
                  ok: false,
                  error: `A concurrent poll already published this job's output, but cleanup of the duplicate PLY failed (${msg}). A stray file may remain in outputs/jobs/${jobId}.`,
                },
                { status: 500 }
              );
            }
            const [fresh] = await db
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
                payloadSnapshot: generationJobs.payloadSnapshot,
      runtimeProvider: generationJobs.runtimeProvider,
              })
              .from(generationJobs)
              .where(eq(generationJobs.id, jobId));
            job = fresh ?? job;
            return NextResponse.json({ ok: true, job: serializeJob(job) });
          }

          job = published;
          return NextResponse.json({ ok: true, job: serializeJob(job) });
        }
      }

      if (!outputFile) {
        // Detect orphaned job: not in history and not in ComfyUI queue
        if (!entry) {
          const inQueue = await isPromptInComfyQueue(promptId);
          if (!inQueue) {
            job = await failJob(
              jobId,
              "ComfyUI job was lost. The ComfyUI server may have restarted."
            );
            return NextResponse.json({ ok: true, job: serializeJob(job) });
          }
        }
        // Still in queue or history not yet available
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
