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
// shot have an approvedVideoPath at all) — whether that file still exists
// on disk is checked later, in the renderer, which is where a missing-file
// discovery can usefully downgrade to a placeholder with a warning right
// before the ffmpeg invocation that would otherwise fail.
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
 * Throws BasicCutManifestError if the project/sequence doesn't exist.
 */
export async function loadEditorialDocumentForSequence(
  projectId: number,
  sequenceId: number
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
  return { document, shotById };
}

/**
 * Builds a BasicCutManifest from the sequence's current DB state. Throws
 * BasicCutManifestError if the project/sequence doesn't exist, or if the
 * sequence has no shot-backed editorial items at all (nothing to render).
 */
export async function buildBasicCutManifest(
  projectId: number,
  sequenceId: number,
  options: { now?: () => string; preloaded?: EditorialDocumentForSequence } = {}
): Promise<BasicCutManifest> {
  const now = options.now ?? (() => new Date().toISOString());

  const { document, shotById } = options.preloaded ?? (await loadEditorialDocumentForSequence(projectId, sequenceId));
  const emptySpaces = deriveEmptySpaces(document);

  const warnings: string[] = [];
  const items: BasicCutManifestItem[] = [];

  for (const track of document.tracks) {
    for (const docItem of track.items) {
      if (docItem.sourceType !== "shot" || docItem.shotId == null) continue;

      const shot = shotById.get(docItem.shotId);
      const sourceVideoPath = shot?.approvedVideoPath ?? null;
      const hasVideo = sourceVideoPath !== null && !docItem.isPlaceholder;

      let placeholderReason: string | undefined;
      if (!hasVideo) {
        placeholderReason = shot ? "No approved video for this shot." : "Shot not found — editorial item is orphaned.";
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
    items,
    emptySpaces: emptySpaces.map((s) => ({ startSeconds: s.start, durationSeconds: s.duration })),
    warnings,
  };
}
