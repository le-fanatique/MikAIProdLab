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
 *
 * `options.sequenceIds` (FILM.EXPORT.SELECT.CORE.1) is an optional ordered
 * selection of sequence ids to include:
 *   - absent (undefined) → identical to today's behavior: every sequence
 *     of the project is a candidate, in project order. This is the most
 *     important safety property of the option — every existing caller that
 *     passes nothing must keep getting exactly the manifest it got before;
 *   - present → only these sequences are candidates, and `sequences[]`
 *     places the selected ones in the order given here (project order for
 *     the rest, appended after). The selection RESTRICTS, it never FORCES:
 *     a selected sequence with no active Sequence Result still comes back
 *     `included: false`, with its `missingReason` and warning intact — the
 *     author asked for it and it could not make it in, and must be told.
 *     A sequence left OUT of the selection is a choice, not a gap: no
 *     warning, no missingReason, only the `deselected` flag;
 *   - an id that isn't one of the project's sequences is an error
 *     (FilmResultManifestError), not a silent drop;
 *   - an empty selection is accepted and yields a manifest with nothing
 *     included — rendering it fails downstream with its own existing
 *     message, which is the correct behavior here.
 */
export async function buildFilmResultManifest(
  projectId: number,
  options: { now?: () => string; sequenceIds?: number[] } = {}
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

  const projectOrderIndexById = new Map(seqList.map((seq, i) => [seq.id, i] as const));

  let orderedSeqList = seqList;
  const deselectedIds = new Set<number>();
  if (options.sequenceIds) {
    const seqById = new Map(seqList.map((seq) => [seq.id, seq] as const));
    for (const id of options.sequenceIds) {
      if (!seqById.has(id)) {
        throw new FilmResultManifestError(`Sequence ${id} does not belong to project ${projectId}.`);
      }
    }
    const selectedIds = new Set(options.sequenceIds);
    const selected = options.sequenceIds.map((id) => seqById.get(id)!);
    const rest = seqList.filter((seq) => !selectedIds.has(seq.id));
    for (const seq of rest) deselectedIds.add(seq.id);
    orderedSeqList = [...selected, ...rest];
  }

  const warnings: string[] = [];
  const manifestSequences: FilmResultManifestSequence[] = [];

  for (const seq of orderedSeqList) {
    const orderIndex = projectOrderIndexById.get(seq.id)!;
    const isDeselected = deselectedIds.has(seq.id);

    const results = await db
      .select()
      .from(sequenceResults)
      .where(eq(sequenceResults.sequenceId, seq.id))
      .orderBy(desc(sequenceResults.createdAt));
    const active = results.find((r) => r.status === "active") ?? null;
    const mostRecent = results[0] ?? null; // already ordered createdAt desc

    if (isDeselected) {
      // A deselected sequence is a choice, not a gap — never included, even
      // if it has an active Sequence Result (the selection RESTRICTS, it
      // never FORCES an unlisted sequence in either): no missingReason, no
      // warning.
      manifestSequences.push({
        sequenceId: seq.id,
        sequenceTitle: seq.title,
        orderIndex,
        sequenceResultId: (active ?? mostRecent)?.id ?? null,
        sequenceResultStatus: (active ?? mostRecent)?.status ?? null,
        sequenceResultSourceMode: (active ?? mostRecent)?.sourceMode ?? null,
        videoPath: null,
        durationSeconds: null,
        included: false,
        deselected: true,
      });
      continue;
    }

    if (active) {
      manifestSequences.push({
        sequenceId: seq.id,
        sequenceTitle: seq.title,
        orderIndex,
        sequenceResultId: active.id,
        sequenceResultStatus: active.status,
        sequenceResultSourceMode: active.sourceMode,
        videoPath: active.videoPath,
        durationSeconds: active.durationSeconds,
        included: true,
      });
      continue;
    }

    const missingReason = mostRecent
      ? mostRecent.status === "outdated"
        ? "Sequence Result is outdated."
        : `Sequence Result is ${mostRecent.status}, not active.`
      : "No Sequence Result has been published for this sequence.";

    warnings.push(`Sequence "${seq.title}" (id ${seq.id}): ${missingReason}`);

    manifestSequences.push({
      sequenceId: seq.id,
      sequenceTitle: seq.title,
      orderIndex,
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
