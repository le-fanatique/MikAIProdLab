// ---------------------------------------------------------------------------
// Film Result manifest builder (FILM.RESULT.1.A)
//
// Reads a project's sequences (in order) and, for each, the active
// Sequence Result — a trace of what a Film Result *would* be assembled
// from, not a render. No FFmpeg, no file I/O, no video produced here; see
// docs/BASIC_EDITORIAL_1A_RENDERING_AUDIT.md-style deferral: rendering is
// FILM.RESULT.1.B's job.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences, sequenceResults } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  FILM_RESULT_MANIFEST_SCHEMA_VERSION,
  FILM_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  type FilmResultManifest,
  type FilmResultManifestSequence,
  type FilmProjectSnapshot,
} from "@/types/filmResult";

export class FilmResultManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilmResultManifestError";
  }
}

/**
 * Builds a FilmResultManifest from the project's current DB state. Throws
 * FilmResultManifestError if the project doesn't exist, or has no
 * sequences at all (nothing to include). A sequence with no active
 * Sequence Result is still listed (included: false, with a
 * missingReason) rather than silently skipped — the manifest's job is to
 * show the whole picture, not just the happy path.
 */
export async function buildFilmResultManifest(
  projectId: number,
  options: { now?: () => string } = {}
): Promise<FilmResultManifest> {
  const now = options.now ?? (() => new Date().toISOString());

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) throw new FilmResultManifestError(`Project ${projectId} not found.`);

  const seqList = await db
    .select()
    .from(sequences)
    .where(eq(sequences.projectId, projectId))
    .orderBy(asc(sequences.orderIndex));

  if (seqList.length === 0) {
    throw new FilmResultManifestError(`Project ${projectId} has no sequences — nothing to include in a Film Result.`);
  }

  const warnings: string[] = [];
  const manifestSequences: FilmResultManifestSequence[] = [];

  for (let i = 0; i < seqList.length; i++) {
    const seq = seqList[i];

    const results = await db
      .select()
      .from(sequenceResults)
      .where(eq(sequenceResults.sequenceId, seq.id))
      .orderBy(desc(sequenceResults.createdAt));
    const active = results.find((r) => r.status === "active") ?? null;

    if (active) {
      manifestSequences.push({
        sequenceId: seq.id,
        sequenceTitle: seq.title,
        orderIndex: i,
        sequenceResultId: active.id,
        sequenceResultStatus: active.status,
        sequenceResultSourceMode: active.sourceMode,
        videoPath: active.videoPath,
        durationSeconds: active.durationSeconds,
        included: true,
      });
      continue;
    }

    const mostRecent = results[0] ?? null; // already ordered createdAt desc
    const missingReason = mostRecent
      ? mostRecent.status === "outdated"
        ? "Sequence Result is outdated."
        : `Sequence Result is ${mostRecent.status}, not active.`
      : "No Sequence Result has been published for this sequence.";

    warnings.push(`Sequence "${seq.title}" (id ${seq.id}): ${missingReason}`);

    manifestSequences.push({
      sequenceId: seq.id,
      sequenceTitle: seq.title,
      orderIndex: i,
      sequenceResultId: mostRecent?.id ?? null,
      sequenceResultStatus: mostRecent?.status ?? null,
      sequenceResultSourceMode: mostRecent?.sourceMode ?? null,
      videoPath: null,
      durationSeconds: null,
      included: false,
      missingReason,
    });
  }

  return {
    schemaVersion: FILM_RESULT_MANIFEST_SCHEMA_VERSION,
    projectId,
    createdAt: now(),
    sourceMode: "active-sequence-results",
    sequences: manifestSequences,
    warnings,
  };
}

/** Sum of included sequences' durations — a theoretical total, not a rendered file's real duration (there is none yet). */
export function computeFilmResultTotalDuration(manifest: FilmResultManifest): number {
  return manifest.sequences.reduce(
    (sum, s) => sum + (s.included && s.durationSeconds != null ? s.durationSeconds : 0),
    0
  );
}

/**
 * Deterministic sha256 fingerprint of which Sequence Results (by
 * sequenceId/sequenceResultId/status) a manifest was built from —
 * intentionally excludes durations/paths/titles (text/volatile fields),
 * matching editorialSnapshot.ts's own exclusion philosophy (OPENREEL.CONFLICT.1).
 */
export function computeFilmProjectSnapshot(
  manifest: FilmResultManifest,
  options: { now?: () => string } = {}
): FilmProjectSnapshot {
  const now = options.now ?? (() => new Date().toISOString());
  const canonical = manifest.sequences
    .map((s) => [s.sequenceId, s.sequenceResultId, s.sequenceResultStatus] as const)
    .sort((a, b) => a[0] - b[0]);
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

  return {
    schemaVersion: FILM_PROJECT_SNAPSHOT_SCHEMA_VERSION,
    projectId: manifest.projectId,
    generatedAt: now(),
    fingerprint,
    sequenceCount: manifest.sequences.length,
  };
}
