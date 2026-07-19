// ---------------------------------------------------------------------------
// shotVideoExport.ts — SHOT.VIDEO.LIBRARY.1, Lot D
//
// Pure builder for a Shot-local, read-only, multi-video OpenReel export:
// reuses the existing `MikAIEditorialExportV1` shape verbatim (never a
// second protocol), tagged with the additive `sourceMode: "shot-videos"`
// and `shot` fields (see editorialExport.ts's own doc comments on both).
// NOT backed by `sequence_editorial_items` — deliberately, so this can
// never be mistaken for (or misapplied as) a real Sequence timing patch:
// each item's `id` is the selected `shot_videos.id`, not an editorial item
// id, and no `editorialSnapshot` is fabricated for a structure that has no
// real sequence-timeline fingerprint to take.
// ---------------------------------------------------------------------------

import { MIKAI_EDITORIAL_EXPORT_SCHEMA_VERSION, type MikAIEditorialExportV1 } from "./editorialExport";

export type ShotVideoExportEntry = {
  /** `shot_videos.id` — the item's stable identity, in the exact selection order the caller wants preserved. */
  id: number;
  videoPath: string;
  durationSeconds: number;
};

/**
 * Builds the export document for `entries` (already in the caller's
 * chosen, deterministic order) — a single track, sequential fake timeline
 * positions (each entry starts where the previous one ends), every item
 * tagged with the same Shot. `durationSeconds` must already be a real,
 * positive, known duration for every entry — the caller is responsible for
 * refusing an empty selection or a missing file before calling this (pure
 * function, no filesystem access here).
 */
export function buildShotVideoLibraryExport(args: {
  project: { id: number; name: string };
  sequence: { id: number; title: string };
  shot: { id: number; title: string };
  entries: ShotVideoExportEntry[];
  mediaUrlFor: (videoPath: string) => string;
  exportedAt?: string;
}): MikAIEditorialExportV1 {
  let cursor = 0;
  const items = args.entries.map((entry) => {
    const item = {
      id: entry.id,
      shotId: args.shot.id,
      shotCode: null,
      title: args.shot.title,
      status: "approved" as const,
      startSeconds: cursor,
      durationSeconds: entry.durationSeconds,
      trimInSeconds: null,
      trimOutSeconds: null,
      approvedVideoPath: entry.videoPath,
      mediaUrl: args.mediaUrlFor(entry.videoPath),
      prompt: null,
      description: null,
    };
    cursor += entry.durationSeconds;
    return item;
  });

  return {
    schemaVersion: MIKAI_EDITORIAL_EXPORT_SCHEMA_VERSION,
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    project: { id: args.project.id, name: args.project.name },
    sequence: { id: args.sequence.id, title: args.sequence.title, durationSeconds: cursor },
    sourceMode: "shot-videos",
    shot: { id: args.shot.id, title: args.shot.title },
    tracks: [{ trackIndex: 0, items }],
    emptySpaces: [],
  };
}
