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
import type { VideoSourceMode, SourceProvenance } from "./videoSourceModeShared";
import type { CompactRealDurationResult } from "./compactRealDurationTiming";

export const COMPACT_REAL_DURATION_TIMING_BASIS = "compact-real-duration" as const;

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
   * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — additive: which video source mode
   * resolved every item's `mediaUrl` below (`approvedVideoPath` is ALWAYS
   * the real approval, regardless of this value). Absent on any export
   * built before this field existed, or when the caller never asked for a
   * specific mode — always treat a missing value as `"approved-only"`.
   */
  videoSourceMode?: VideoSourceMode;
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
  /**
   * EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1 /
   * EDITORIAL.APPROVED.REAL.DURATIONS.1 — additive: present ONLY when this
   * export's `startSeconds`/`durationSeconds` are the real, compact,
   * decodable-media timings computed by `computeCompactRealDurationPositions`
   * — exclusive to an EXPLICITLY requested `videoSourceMode` (either
   * `"latest-generation"` or `"approved-only"`) — rather than the planned
   * production timeline. A consumer that doesn't understand this field can
   * safely ignore it — but a write-back path (Validate/Apply Timing Patch,
   * Push Duration, or any other action whose meaning depends on
   * `startSeconds`/`durationSeconds` being production-accurate) MUST refuse
   * to act on an export carrying this field rather than writing compact
   * positions back as if they were production ones. Absent on every export
   * that predates this field, on an IMPLICIT/absent `videoSourceMode`
   * (including the legacy no-param export), and on any other mode — all
   * stay byte-identical to before this ticket.
   */
  timingBasis?: typeof COMPACT_REAL_DURATION_TIMING_BASIS;
  /**
   * EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1 — additive, present only
   * alongside `timingBasis`. One bounded, human-readable entry per shot
   * item omitted from the compact timeline because its resolved source had
   * no valid real media duration (see `computeCompactRealDurationPositions`).
   * An empty array is a real, honest "no omissions" — never absent when
   * `timingBasis` is present.
   */
  timingWarnings?: string[];
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
      /** EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — additive: the exact durable candidate that produced `mediaUrl` under the requested `videoSourceMode`. Absent when there is none, or when the caller never asked for a resolved mode. */
      provenance?: SourceProvenance;
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
 *
 * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — `videoSourceMode`/`resolvedMediaByShotId`
 * are additive and OPTIONAL. When given, they OVERRIDE each item's
 * `mediaUrl`/`provenance` only — `approvedVideoPath` (the real approval),
 * `status`, and the `editorialSnapshot` (built from `document` exactly as
 * before, untouched by these two params) are NEVER affected. This is
 * deliberate: `document`'s own `status`/fingerprint inputs must stay
 * approved-only-derived regardless of the requested export mode, so a
 * fresh Latest-generation OpenReel session never trips a false "stale"
 * 409 from `editorial-timing-patch` (which always recomputes its own
 * snapshot the same, approved-only way) just because its media isn't
 * approved. Omitted entirely, behavior is byte-identical to before this
 * ticket.
 */
export function buildEditorialExport(args: {
  project: { id: number; name: string };
  sequence: { id: number; title: string };
  document: EditorialDocument;
  shotExtrasById: Map<number, EditorialExportShotExtra>;
  exportedAt?: string;
  videoSourceMode?: VideoSourceMode;
  resolvedMediaByShotId?: Map<number, { mediaUrl: string | null; provenance: SourceProvenance | null }>;
  /**
   * EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1 — additive and OPTIONAL.
   * When given, every item's `startSeconds`/`durationSeconds` below are
   * OVERRIDDEN with the compact, real-media positions it carries, an item
   * with no computed position is OMITTED entirely from `tracks[].items`
   * (never "stretched" to its planned slot), and the export carries
   * `timingBasis`/`timingWarnings`. `document` itself — and therefore
   * `editorialSnapshot`, built from `document` below exactly as before —
   * is NEVER touched by this: the snapshot stays the planned/production
   * fingerprint regardless of this option (Product Decision, contract 5).
   * Omitted entirely, behavior is byte-identical to before this ticket.
   */
  compactTiming?: CompactRealDurationResult;
}): MikAIEditorialExportV1 {
  const { project, sequence, document, shotExtrasById, resolvedMediaByShotId, compactTiming } = args;

  const tracks = document.tracks.map((track) => {
    const items = track.items
      .filter((item) => item.sourceType === "shot" && item.shotId != null)
      .filter((item) => !compactTiming || compactTiming.positions.has(item.id))
      .map((item) => {
        const extra = shotExtrasById.get(item.shotId!);
        const resolved = resolvedMediaByShotId?.get(item.shotId!);
        const compactPosition = compactTiming?.positions.get(item.id);
        return {
          id: item.id,
          shotId: item.shotId!,
          shotCode: item.shotCode ?? null,
          title: item.title ?? null,
          status: item.status ?? "missing",
          startSeconds: compactPosition ? compactPosition.startSeconds : item.start,
          durationSeconds: compactPosition ? compactPosition.durationSeconds : item.duration,
          trimInSeconds: item.trimIn ?? null,
          trimOutSeconds: item.trimOut ?? null,
          approvedVideoPath: extra?.approvedVideoPath ?? null,
          mediaUrl: resolved ? resolved.mediaUrl : (item.mediaUrl ?? null),
          prompt: extra?.prompt ?? null,
          description: extra?.description ?? null,
          ...(resolved?.provenance ? { provenance: resolved.provenance } : {}),
        };
      });

    return { trackIndex: track.id, items };
  });

  // Compact positions are contiguous by construction (no gap ever survives
  // compaction — see computeCompactRealDurationPositions) — the planned
  // document's own empty spaces describe PRODUCTION gaps and would be
  // meaningless (and misleading) against compact startSeconds values, so a
  // compact export always reports zero empty spaces rather than borrowing
  // the production document's.
  const emptySpaces = compactTiming
    ? []
    : deriveEmptySpaces(document).map((space) => ({
        trackIndex: space.trackIndex,
        startSeconds: space.start,
        durationSeconds: space.duration,
        previousItemId: space.previousItemId,
        nextItemId: space.nextItemId,
      }));

  const compactSequenceDurationSeconds = compactTiming
    ? Math.max(0, ...[...compactTiming.trackDurationsSeconds.values()])
    : undefined;

  return {
    schemaVersion: MIKAI_EDITORIAL_EXPORT_SCHEMA_VERSION,
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    project: { id: project.id, name: project.name },
    sequence: {
      id: sequence.id,
      title: sequence.title,
      durationSeconds: compactSequenceDurationSeconds ?? document.durationSeconds,
    },
    ...(args.videoSourceMode ? { videoSourceMode: args.videoSourceMode } : {}),
    ...(compactTiming
      ? { timingBasis: COMPACT_REAL_DURATION_TIMING_BASIS, timingWarnings: compactTiming.warnings }
      : {}),
    editorialSnapshot: buildEditorialSnapshot({ sequenceId: sequence.id, document }),
    tracks,
    emptySpaces,
  };
}
