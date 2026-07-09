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
    tracks,
    emptySpaces,
  };
}
