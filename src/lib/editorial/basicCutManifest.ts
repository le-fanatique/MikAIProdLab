// ---------------------------------------------------------------------------
// Basic cut manifest builder (BASIC.EDITORIAL.1.B)
//
// Reads a sequence's current editorial state (same read path as
// editorial-export/editorial-timing-patch routes: buildEditorialDocument +
// deriveEmptySpaces) and produces a mikai-basic-cut-manifest-v1 — the
// blueprint renderBasicSequenceResult.ts turns into an actual MP4.
//
// Deliberately DB-reading (unlike editorialSnapshot.ts's pure
// document-in/fingerprint-out shape) — this is the one place that needs
// both the EditorialDocument (status/order/timing/trim) AND each shot's
// raw approvedVideoPath (a DB-relative "uploads/..." string, not the
// resolved /api/uploads/... URL EditorialDocumentItem.mediaUrl carries —
// the renderer needs a real filesystem path, not a URL).
//
// "video" vs "placeholder" status here is a DB-only judgment (does this
// shot have a resolved video source at all under the requested
// videoSourceMode) — whether that file still exists on disk is checked
// later, in the renderer, which is where a missing-file discovery can
// usefully downgrade to a placeholder with a warning right before the
// ffmpeg invocation that would otherwise fail.
//
// EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — source resolution itself (which
// exact path represents each Shot) is delegated to
// videoSourceMode.ts's resolveVideoSourcesForShotList, the one place both
// this builder and the Editorial page agree on what a given mode means.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems, type Shot } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  buildEditorialDocument,
  deriveEmptySpaces,
  type EditorialDocument,
  type EditorialDocumentInputItem,
} from "./editorialDocument";
import {
  resolveVideoSourcesForShotList,
  DEFAULT_VIDEO_SOURCE_MODE,
  type VideoSourceMode,
  type ResolvedShotSource,
  type SourceProvenance,
} from "./videoSourceMode";

export const BASIC_CUT_MANIFEST_SCHEMA_VERSION = "mikai-basic-cut-manifest-v1";

export type BasicCutManifestItem = {
  itemId: number;
  shotId: number;
  orderIndex: number;
  sourceVideoPath: string | null;
  startSeconds: number;
  durationSeconds: number;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  status: "video" | "placeholder";
  placeholderReason?: string;
  /**
   * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — additive: which exact durable
   * source produced `sourceVideoPath`. Absent (never `null`) on any item
   * with no resolved source, so a manifest predating this field, or an item
   * with none, are both indistinguishable "no provenance" — never a new
   * required field older readers must migrate for.
   */
  provenance?: SourceProvenance;
};

export type BasicCutManifestEmptySpace = {
  startSeconds: number;
  durationSeconds: number;
};

export type BasicCutManifest = {
  schemaVersion: "mikai-basic-cut-manifest-v1";
  projectId: number;
  sequenceId: number;
  createdAt: string;
  sourceMode: "basic";
  /**
   * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — additive top-level field: which
   * video source mode produced every item's `sourceVideoPath` below.
   * Absent on every manifest published before this field existed — always
   * treat a missing value as `"approved-only"` (the only mode that existed
   * then), never as an error.
   */
  videoSourceMode?: VideoSourceMode;
  items: BasicCutManifestItem[];
  emptySpaces: BasicCutManifestEmptySpace[];
  warnings: string[];
};

export class BasicCutManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasicCutManifestError";
  }
}

const MIN_ITEM_DURATION_SECONDS = 0.05;

export type EditorialDocumentForSequence = {
  document: EditorialDocument;
  shotById: Map<number, Shot>;
  /**
   * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — additive: the resolved video
   * source per Shot under whichever `videoSourceMode` this load requested
   * (defaults to `"approved-only"`, which resolves to exactly
   * `shot.approvedVideoPath` — byte-identical to this module's pre-existing
   * behavior, so every caller that never passes the option is unaffected).
   */
  videoSources: Map<number, ResolvedShotSource>;
  /**
   * The EXACT mode `videoSources` above was resolved under — carried on the
   * object itself (not just the caller's own local variable) so
   * `buildBasicCutManifest` can derive the manifest's `videoSourceMode` from
   * `preloaded` directly, structurally, rather than trusting a SEPARATE
   * `options.videoSourceMode` that could silently diverge from what this
   * `preloaded` object was actually built with.
   */
  videoSourceMode: VideoSourceMode;
};

/**
 * Loads a sequence's current editorial state as an EditorialDocument, plus
 * a shotId->Shot lookup (needed for raw approvedVideoPath — see this
 * module's header comment for why EditorialDocumentItem.mediaUrl alone
 * isn't enough). Shared by buildBasicCutManifest below and by
 * publishBasicSequenceResult (src/actions/basicEditorial.ts), which needs
 * the same EditorialDocument to compute this publish's editorialSnapshot
 * (OPENREEL.CONFLICT.1) without re-deriving it from scratch.
 *
 * `videoSourceMode` (default `"approved-only"`) only changes `videoSources`
 * on the returned object — the EditorialDocument/shotById themselves are
 * built exactly as before, since every OTHER caller (editorial-export,
 * editorial-timing-patch, editorial-insert-shot, editorial-push-duration,
 * nle-prototype) reads only those two fields and must keep behaving
 * identically to before this ticket.
 *
 * Throws BasicCutManifestError if the project/sequence doesn't exist.
 */
export async function loadEditorialDocumentForSequence(
  projectId: number,
  sequenceId: number,
  options: { videoSourceMode?: VideoSourceMode } = {}
): Promise<EditorialDocumentForSequence> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new BasicCutManifestError(`Project ${projectId} not found.`);

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    throw new BasicCutManifestError(`Sequence ${sequenceId} not found in project ${projectId}.`);
  }

  const shotList = await db.select().from(shots).where(eq(shots.sequenceId, sequenceId));
  const shotById = new Map(shotList.map((s) => [s.id, s]));

  const itemRows = await db
    .select()
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sequenceId))
    .orderBy(asc(sequenceEditorialItems.trackIndex), asc(sequenceEditorialItems.orderIndex));

  const inputItems: EditorialDocumentInputItem[] = itemRows.map((item) => {
    const shot = item.shotId !== null ? shotById.get(item.shotId) : undefined;
    return {
      id: item.id,
      sequenceId: item.sequenceId,
      type: item.type,
      shotId: item.shotId,
      orderIndex: item.orderIndex,
      trackIndex: item.trackIndex,
      durationSeconds: item.durationSeconds,
      trimInSeconds: item.trimInSeconds,
      trimOutSeconds: item.trimOutSeconds,
      startSeconds: item.startSeconds,
      shot: shot
        ? {
            id: shot.id,
            shotCode: shot.shotCode,
            title: shot.title,
            approvedVideoPath: shot.approvedVideoPath,
            isPlaceholder: shot.title === "Placeholder",
          }
        : null,
    };
  });

  const document = buildEditorialDocument({ projectId, sequenceId, items: inputItems });

  const mode = options.videoSourceMode ?? DEFAULT_VIDEO_SOURCE_MODE;
  const videoSources = await resolveVideoSourcesForShotList(shotList, mode);

  return { document, shotById, videoSources, videoSourceMode: mode };
}

/**
 * Builds a BasicCutManifest from the sequence's current DB state. Throws
 * BasicCutManifestError if the project/sequence doesn't exist, or if the
 * sequence has no shot-backed editorial items at all (nothing to render).
 */
export async function buildBasicCutManifest(
  projectId: number,
  sequenceId: number,
  options: {
    now?: () => string;
    preloaded?: EditorialDocumentForSequence;
    /**
     * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — default `"approved-only"`,
     * unchanged behavior. Meaningless (and checked, never silently ignored)
     * when `preloaded` is given: the manifest's mode is then derived
     * STRUCTURALLY from `preloaded.videoSourceMode` — the only value that
     * can possibly be true, since that's what `preloaded.videoSources` was
     * actually resolved under. Passing a DIFFERENT mode alongside a
     * `preloaded` is a caller bug (two sources of truth that could
     * silently diverge), not a runtime input to tolerate — it throws.
     */
    videoSourceMode?: VideoSourceMode;
  } = {}
): Promise<BasicCutManifest> {
  const now = options.now ?? (() => new Date().toISOString());

  if (options.preloaded && options.videoSourceMode !== undefined && options.videoSourceMode !== options.preloaded.videoSourceMode) {
    throw new BasicCutManifestError(
      `buildBasicCutManifest: options.videoSourceMode ("${options.videoSourceMode}") does not match preloaded.videoSourceMode ("${options.preloaded.videoSourceMode}") — caller bug, refusing to guess which one is authoritative.`
    );
  }

  const videoSourceMode = options.preloaded?.videoSourceMode ?? options.videoSourceMode ?? DEFAULT_VIDEO_SOURCE_MODE;

  const { document, shotById, videoSources } =
    options.preloaded ?? (await loadEditorialDocumentForSequence(projectId, sequenceId, { videoSourceMode }));
  const emptySpaces = deriveEmptySpaces(document);

  const warnings: string[] = [];
  const items: BasicCutManifestItem[] = [];

  for (const track of document.tracks) {
    for (const docItem of track.items) {
      if (docItem.sourceType !== "shot" || docItem.shotId == null) continue;

      const shot = shotById.get(docItem.shotId);
      const resolved = videoSources.get(docItem.shotId);
      const sourceVideoPath = resolved?.videoPath ?? null;
      const hasVideo = sourceVideoPath !== null && !docItem.isPlaceholder;

      let placeholderReason: string | undefined;
      if (!hasVideo) {
        placeholderReason = !shot
          ? "Shot not found — editorial item is orphaned."
          : resolved?.unavailableReason
            ? resolved.unavailableReason
            : videoSourceMode === "latest-generation"
              ? "No durable Shot Video Library entry for this shot."
              : "No approved video for this shot.";
      }

      if (docItem.duration < MIN_ITEM_DURATION_SECONDS) {
        warnings.push(
          `Item ${docItem.id} (shot ${docItem.shotId}) has a suspiciously short duration (${docItem.duration.toFixed(3)}s) — rendered anyway.`
        );
      }

      if (
        docItem.trimIn !== undefined &&
        docItem.trimOut !== undefined &&
        (docItem.trimIn < 0 || docItem.trimOut <= docItem.trimIn)
      ) {
        warnings.push(
          `Item ${docItem.id} (shot ${docItem.shotId}) has an invalid trim range (${docItem.trimIn}-${docItem.trimOut}) — ignored, using full duration.`
        );
      }

      items.push({
        itemId: docItem.id,
        shotId: docItem.shotId,
        orderIndex: docItem.orderIndex,
        sourceVideoPath: hasVideo ? sourceVideoPath : null,
        startSeconds: docItem.start,
        durationSeconds: docItem.duration,
        trimInSeconds: docItem.trimIn ?? null,
        trimOutSeconds: docItem.trimOut ?? null,
        status: hasVideo ? "video" : "placeholder",
        ...(placeholderReason ? { placeholderReason } : {}),
        // Kept even when the candidate was REJECTED (hasVideo === false but
        // resolved.provenance !== null) — explains WHY a Shot has no usable
        // video without ever presenting that candidate as one that was
        // actually used (status stays "placeholder" regardless).
        ...(resolved?.provenance ? { provenance: resolved.provenance } : {}),
      });
    }
  }

  if (items.length === 0) {
    throw new BasicCutManifestError(`Sequence ${sequenceId} has no shot-backed editorial items — nothing to render.`);
  }

  return {
    schemaVersion: BASIC_CUT_MANIFEST_SCHEMA_VERSION,
    projectId,
    sequenceId,
    createdAt: now(),
    sourceMode: "basic",
    videoSourceMode,
    items,
    emptySpaces: emptySpaces.map((s) => ({ startSeconds: s.start, durationSeconds: s.duration })),
    warnings,
  };
}
