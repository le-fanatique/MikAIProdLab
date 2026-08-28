// ---------------------------------------------------------------------------
// FilmResult conceptual types + JSON field parse/serialize helpers
// (FILM.RESULT.1.A, see docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md)
//
// Mirrors src/types/sequenceResult.ts one level up: the DB row (src/db/
// schema.ts's filmResults) stores sequenceResultManifest/projectSnapshot/
// warnings as JSON-in-TEXT columns — these helpers are the single place
// that (de)serializes them.
// ---------------------------------------------------------------------------

export type FilmResultStatus = "draft" | "published" | "active" | "archived" | "outdated";

export const FILM_RESULT_MANIFEST_SCHEMA_VERSION = "mikai-film-result-manifest-v1";
export const FILM_PROJECT_SNAPSHOT_SCHEMA_VERSION = "mikai-film-project-snapshot-v1";

// `orderIndex` is always the sequence's position in the PROJECT (its
// sequences.orderIndex), never "position in the film" — even when a
// selection (FILM.EXPORT.SELECT.CORE.1) reorders `sequences[]`. The film's
// actual order is the array order: renderFilmResult.ts never reads
// orderIndex, it concatenates manifest.sequences in array order. Recycling
// orderIndex into "film order" would silently break that renderer for any
// caller who still relies on it meaning "project order".
export type FilmResultManifestSequence = {
  sequenceId: number;
  sequenceTitle?: string;
  orderIndex: number;
  sequenceResultId: number | null;
  sequenceResultStatus: string | null;
  sequenceResultSourceMode: "basic" | "advanced" | null;
  videoPath: string | null;
  durationSeconds: number | null;
  included: boolean;
  missingReason?: string;
  /** true when a selection (FILM.EXPORT.SELECT.CORE.1) was passed to
   * buildFilmResultManifest and this sequence was left out of it — a
   * deliberate choice, not a problem, so it carries no missingReason and no
   * warning. Absent entirely when no selection was used, or when the
   * sequence was part of the selection. */
  deselected?: boolean;
};

export type FilmResultManifest = {
  schemaVersion: "mikai-film-result-manifest-v1";
  projectId: number;
  createdAt: string;
  sourceMode: "active-sequence-results";
  sequences: FilmResultManifestSequence[];
  warnings: string[];
};

/** A fingerprint of which Sequence Results (by id/status) a Film Result was built from — lets a future staleness check detect "the active Sequence Results changed since this Film Result was drafted," analogous to OPENREEL.CONFLICT.1's editorialSnapshot. */
export type FilmProjectSnapshot = {
  schemaVersion: "mikai-film-project-snapshot-v1";
  projectId: number;
  generatedAt: string;
  fingerprint: string;
  sequenceCount: number;
};

/** Parses the `sequence_result_manifest` column. Returns null for a null/empty/malformed value rather than throwing — a result row should still be viewable even if its manifest is unreadable. */
export function parseFilmResultManifest(raw: string | null): FilmResultManifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.schemaVersion === FILM_RESULT_MANIFEST_SCHEMA_VERSION && Array.isArray(parsed.sequences)) {
      return parsed as FilmResultManifest;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeFilmResultManifest(manifest: FilmResultManifest): string {
  return JSON.stringify(manifest);
}

/** Parses the `project_snapshot` column. */
export function parseFilmProjectSnapshot(raw: string | null): FilmProjectSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.schemaVersion === FILM_PROJECT_SNAPSHOT_SCHEMA_VERSION && typeof parsed.fingerprint === "string") {
      return parsed as FilmProjectSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeFilmProjectSnapshot(snapshot: FilmProjectSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Parses the `warnings` column (JSON string array). Returns [] for null/malformed rather than throwing. */
export function parseFilmResultWarnings(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

export function serializeFilmResultWarnings(warnings: string[]): string {
  return JSON.stringify(warnings);
}

/** UI label for a Sequence Result's sourceMode as referenced from a Film Result manifest row. */
export function filmManifestSourceModeLabel(sourceMode: "basic" | "advanced" | null): string {
  if (sourceMode === "advanced") return "Advanced";
  if (sourceMode === "basic") return "Basic";
  return "—";
}
