import "server-only";

import { db } from "@/db";
import { generationJobOutputs } from "@/db/schema";
import type { ComfyOutputFileWithKind } from "@/lib/comfy/comfyServerClient";

/**
 * GEN.MULTIOUT.1 — download a job's remaining files and record every one of
 * them in `generation_job_outputs`.
 *
 * Called only by the poll that WON the publish race. `generation_jobs` still
 * carries the primary output in `output_path`, and that column, its concurrency
 * guard and all twenty of its readers are untouched: this runs after the
 * publish, and adds rows beside it.
 *
 * The download itself is injected. The local and Cloud transports differ
 * (`/view` versus a signed redirect from `/api/view`), and passing the
 * downloader in means this orchestration is provable without a network — the
 * same discipline the deployment orchestrator uses for its command runner.
 */

export type JobOutputDownload = (
  file: ComfyOutputFileWithKind,
  index: number
) => Promise<string>;

export type RecordJobOutputsResult = {
  /** Rows written, primary included. */
  recorded: number;
  /** Files ComfyUI listed that could not be fetched. Never fatal — see below. */
  failures: Array<{ index: number; filename: string; error: string }>;
};

export async function downloadAndRecordJobOutputs(args: {
  jobId: number;
  /** Every file the prompt produced, in ComfyUI's own order. */
  files: ComfyOutputFileWithKind[];
  /** Relative path of index 0, already downloaded and published by the caller. */
  primaryPath: string;
  download: JobOutputDownload;
}): Promise<RecordJobOutputsResult> {
  const { jobId, files, primaryPath, download } = args;
  if (files.length === 0) return { recorded: 0, failures: [] };

  const rows: Array<typeof generationJobOutputs.$inferInsert> = [
    {
      jobId,
      outputIndex: 0,
      path: primaryPath,
      kind: files[0].kind,
      sourceFilename: files[0].filename,
    },
  ];
  const failures: RecordJobOutputsResult["failures"] = [];

  for (let index = 1; index < files.length; index += 1) {
    const file = files[index];
    try {
      const relativePath = await download(file, index);
      rows.push({
        jobId,
        outputIndex: index,
        path: relativePath,
        kind: file.kind,
        sourceFilename: file.filename,
      });
    } catch (err) {
      // A sibling that cannot be fetched must NEVER fail the job: the primary
      // output is already downloaded, published and usable, and marking the
      // job failed would take a valid result away from the user over a
      // secondary file.
      //
      // The row is simply not written, which leaves a GAP in `output_index` —
      // 0, 1, 3 when index 2 failed. That gap is the durable trace of the
      // failure, and it is why indexes are never compacted: renumbering would
      // erase the evidence and silently claim the batch was complete.
      failures.push({
        index,
        filename: file.filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // `onConflictDoNothing` on (job_id, output_index): two concurrent polls that
  // both reach this point write the same rows, and the loser is a no-op rather
  // than a crash. The unique index is what makes that safe.
  await db.insert(generationJobOutputs).values(rows).onConflictDoNothing();

  return { recorded: rows.length, failures };
}
