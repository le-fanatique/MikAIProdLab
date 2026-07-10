// ---------------------------------------------------------------------------
// SequenceResult conceptual types + JSON field parse/serialize helpers
// (SEQUENCE.RESULT.1, see docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md §4)
//
// The DB row (src/db/schema.ts's sequenceResults) stores cutManifest,
// editorialSnapshot, and warnings as JSON-in-TEXT columns — these helpers
// are the single place that (de)serializes them, so callers never
// JSON.parse/stringify ad hoc against a possibly-null column.
// ---------------------------------------------------------------------------

import type { EditorialSnapshot } from "@/lib/editorial/editorialSnapshot";

export type SequenceResultSourceMode = "basic" | "advanced";

export type SequenceResultStatus = "draft" | "published" | "active" | "archived" | "outdated";

/** One entry of a cut: which shot, what trim range, and the source file it was cut from — a description of how videoPath was (or should be) assembled. */
export type SequenceResultCutManifestItem = {
  shotId: number;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  sourcePath: string | null;
};

export type SequenceResultCutManifest = SequenceResultCutManifestItem[];

/** Parses the `cut_manifest` column. Returns null for a null/empty/malformed value rather than throwing — a result row should still be viewable even if its manifest is unreadable. */
export function parseCutManifest(raw: string | null): SequenceResultCutManifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SequenceResultCutManifest) : null;
  } catch {
    return null;
  }
}

export function serializeCutManifest(manifest: SequenceResultCutManifest): string {
  return JSON.stringify(manifest);
}

/** Parses the `editorial_snapshot` column — reuses the OPENREEL.CONFLICT.1 EditorialSnapshot shape. */
export function parseResultEditorialSnapshot(raw: string | null): EditorialSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.schemaVersion === "mikai-editorial-snapshot-v1" &&
      typeof parsed.fingerprint === "string"
    ) {
      return parsed as EditorialSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeResultEditorialSnapshot(snapshot: EditorialSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Parses the `warnings` column (JSON string array). Returns [] for null/malformed rather than throwing. */
export function parseResultWarnings(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

export function serializeResultWarnings(warnings: string[]): string {
  return JSON.stringify(warnings);
}

/** UI label for a sourceMode value — single place so the viewer and any future publish UI agree on wording. */
export function sequenceResultSourceModeLabel(sourceMode: SequenceResultSourceMode): string {
  return sourceMode === "advanced" ? "Advanced Editor" : "Basic Editorial";
}
