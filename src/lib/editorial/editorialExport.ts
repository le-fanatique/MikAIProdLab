// ---------------------------------------------------------------------------
// EditorialDocument → MikAIEditorialExportV1 export contract (NLE.BRIDGE.1)
//
// Pure conversion, no DB access, no side effects. Produces a stable,
// versioned, external-consumer-facing JSON shape from an already-built
// EditorialDocument plus a small shot-metadata lookup (prompt/description/
// raw approvedVideoPath — fields the adapter layer deliberately does not
// carry, see editorialDocument.ts's EditorialDocumentItem).
//
// Legacy "gap" rows are never exported as items — only shot-backed items
// (sourceType === "shot") appear under tracks[].items. Empty space is
// exported exclusively via deriveEmptySpaces, consistent with how
// /nle-prototype and /editorial already treat empty space as derived,
// not stored (see PHASEC.NLE.C.M1.R1).
// ---------------------------------------------------------------------------

import {
  deriveEmptySpaces,
  type EditorialDocument,
} from "./editorialDocument";
import { buildEditorialSnapshot, type EditorialSnapshot } from "./editorialSnapshot";

export const MIKAI_EDITORIAL_EXPORT_SCHEMA_VERSION = "mikai-editorial-export-v1";

export type MikAIEditorialExportV1 = {
  schemaVersion: "mikai-editorial-export-v1";
  exportedAt: string;
  project: {
    id: number;
    name: string;
  };
  sequence: {
    id: number;
    title: string;
    durationSeconds: number;
  };
  /**
   * SHOT.VIDEO.LIBRARY.1, Lot D — additive. Absent/undefined means the
   * established full-sequence-timeline export (unchanged, current
   * behavior). `"shot-videos"` marks a Shot-local, read-only, multi-video
   * export built by `buildShotVideoLibraryExport`
   * (src/lib/editorial/shotVideoExport.ts) — NOT backed by real
   * `sequence_editorial_items` rows, so its `tracks[].items[].id` values
   * are `shot_videos.id`, never an editorial item id. The OpenReel sidecar
   * MUST refuse any write-back action (Validate/Apply Patch, Publish
   * Sequence Result, Push Duration, Insert Shot) for a project tagged with
   * this mode — see the sidecar's own `openReelToMikaiPatch.ts` guard.
   */
  sourceMode?: "shot-videos";
  /** SHOT.VIDEO.LIBRARY.1, Lot D — present only when `sourceMode === "shot-videos"`; every item in every track then belongs to this one Shot. */
  shot?: { id: number; title: string };
  /**
   * Structural fingerprint of the sequence's editorial state at export
   * time (OPENREEL.CONFLICT.1) — additive field, existing consumers that
   * don't know about it are unaffected. A patch built from this export
   * should echo it back so MikAI can detect staleness before applying
   * editorial decisions. See src/lib/editorial/editorialSnapshot.ts.
   * Omitted (never fabricated) for a `sourceMode: "shot-videos"` export,
   * which has no real sequence-timeline structure to fingerprint.
   */
  editorialSnapshot?: EditorialSnapshot;
  tracks: Array<{
    trackIndex: number;
    items: Array<{
      id: number;
      shotId: number;
      shotCode?: string | null;
      title?: string | null;
      status: "approved" | "missing" | "placeholder";
      startSeconds: number;
      durationSeconds: number;
      trimInSeconds?: number | null;
      trimOutSeconds?: number | null;
      approvedVideoPath?: string | null;
      mediaUrl?: string | null;
      prompt?: string | null;
      description?: string | null;
    }>;
  }>;
  emptySpaces: Array<{
    trackIndex: number;
    startSeconds: number;
    durationSeconds: number;
    previousItemId?: number | null;
    nextItemId?: number | null;
  }>;
};

/** Shot metadata not carried by EditorialDocumentItem, keyed by shots.id. */
export type EditorialExportShotExtra = {
  approvedVideoPath: string | null;
  prompt: string | null;
  description: string | null;
};

/**
 * Builds a MikAIEditorialExportV1 from an already-built EditorialDocument.
 * Pure — does not mutate its inputs, no DB access, no side effects.
 */
export function buildEditorialExport(args: {
  project: { id: number; name: string };
  sequence: { id: number; title: string };
  document: EditorialDocument;
  shotExtrasById: Map<number, EditorialExportShotExtra>;
  exportedAt?: string;
}): MikAIEditorialExportV1 {
  const { project, sequence, document, shotExtrasById } = args;

  const tracks = document.tracks.map((track) => {
    const items = track.items
      .filter((item) => item.sourceType === "shot" && item.shotId != null)
      .map((item) => {
        const extra = shotExtrasById.get(item.shotId!);
        return {
          id: item.id,
          shotId: item.shotId!,
          shotCode: item.shotCode ?? null,
          title: item.title ?? null,
          status: item.status ?? "missing",
          startSeconds: item.start,
          durationSeconds: item.duration,
          trimInSeconds: item.trimIn ?? null,
          trimOutSeconds: item.trimOut ?? null,
          approvedVideoPath: extra?.approvedVideoPath ?? null,
          mediaUrl: item.mediaUrl ?? null,
          prompt: extra?.prompt ?? null,
          description: extra?.description ?? null,
        };
      });

    return { trackIndex: track.id, items };
  });

  const emptySpaces = deriveEmptySpaces(document).map((space) => ({
    trackIndex: space.trackIndex,
    startSeconds: space.start,
    durationSeconds: space.duration,
    previousItemId: space.previousItemId,
    nextItemId: space.nextItemId,
  }));

  return {
    schemaVersion: MIKAI_EDITORIAL_EXPORT_SCHEMA_VERSION,
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    project: { id: project.id, name: project.name },
    sequence: {
      id: sequence.id,
      title: sequence.title,
      durationSeconds: document.durationSeconds,
    },
    editorialSnapshot: buildEditorialSnapshot({ sequenceId: sequence.id, document }),
    tracks,
    emptySpaces,
  };
}
