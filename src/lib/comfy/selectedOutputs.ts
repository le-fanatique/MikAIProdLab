import "server-only";

import fs from "fs/promises";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { generationJobOutputs } from "@/db/schema";

/**
 * GEN.MULTIOUT.1 — turn a user's checkbox selection into a list of validated,
 * repository-relative output paths.
 *
 * Every path is checked **individually**, exactly as the single-output path
 * did before: expected prefix, allowed extension, confinement under
 * `public/outputs/jobs/`, and presence on disk. There is deliberately no
 * shortcut of the form "the job is valid, therefore its files are" — the rows
 * are written by the poller, but the extension and the file on disk are facts
 * to re-check at the moment of use, not claims to trust.
 *
 * An empty selection means "the primary output", which is what every caller
 * did before this ticket and what a form without checkboxes still posts.
 */

export type ResolveSelectedOutputsResult =
  | { ok: true; paths: string[] }
  | { ok: false; error: string };

export async function resolveSelectedOutputPaths(args: {
  jobId: number;
  /** `generation_jobs.output_path` — used when nothing was explicitly selected. */
  fallbackPath: string | null;
  /** `output_index` values the user ticked. Empty means "the primary". */
  requestedIndexes: number[];
  allowedExts: Set<string>;
}): Promise<ResolveSelectedOutputsResult> {
  const { jobId, fallbackPath, requestedIndexes, allowedExts } = args;

  let candidates: string[];

  if (requestedIndexes.length === 0) {
    if (!fallbackPath) return { ok: false, error: "Output path is missing." };
    candidates = [fallbackPath];
  } else {
    const rows = await db
      .select({ outputIndex: generationJobOutputs.outputIndex, path: generationJobOutputs.path })
      .from(generationJobOutputs)
      .where(
        and(
          eq(generationJobOutputs.jobId, jobId),
          inArray(generationJobOutputs.outputIndex, requestedIndexes)
        )
      )
      .orderBy(generationJobOutputs.outputIndex);

    // Scoping by jobId in the query is what stops a tampered form from
    // attaching another job's file: an index that does not belong to this job
    // simply does not come back.
    if (rows.length !== requestedIndexes.length) {
      return { ok: false, error: "Some selected outputs no longer exist for this job." };
    }
    candidates = rows.map((r) => r.path);
  }

  const publicRoot = path.join(process.cwd(), "public");
  const allowedOutputsRoot = path.join(publicRoot, "outputs", "jobs");
  const validated: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.startsWith("outputs/jobs/")) {
      return { ok: false, error: "Output path is not in the expected location." };
    }

    const ext = path.extname(candidate).toLowerCase();
    if (!allowedExts.has(ext)) {
      return {
        ok: false,
        error: `Only image outputs (${[...allowedExts].sort().join(", ")}) can be attached as references.`,
      };
    }

    const absolute = path.resolve(publicRoot, candidate);
    if (
      !absolute.startsWith(allowedOutputsRoot + path.sep) &&
      absolute !== allowedOutputsRoot
    ) {
      return { ok: false, error: "Output path is not in the expected location." };
    }

    try {
      await fs.access(absolute);
    } catch {
      return { ok: false, error: "Output file not found on disk." };
    }

    validated.push(candidate);
  }

  return { ok: true, paths: validated };
}

/** `outputIndex` checkbox values, parsed strictly. Anything malformed is refused. */
export function parseRequestedIndexes(raw: FormDataEntryValue[]): number[] | null {
  const indexes: number[] = [];
  for (const value of raw) {
    if (typeof value !== "string") return null;
    // `Number("")` is 0 and `Number(" 2 ")` is 2 — both would turn malformed
    // input into a valid index. Match the digits explicitly instead.
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    if (!indexes.includes(parsed)) indexes.push(parsed);
  }
  return indexes.sort((a, b) => a - b);
}
