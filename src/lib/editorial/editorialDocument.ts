// ---------------------------------------------------------------------------
// EditorialDocument adapter
//
// This adapter is read-only and UI-agnostic. It converts already-loaded
// editorial items (sequence_editorial_items + their joined shot, if any)
// into a plain EditorialDocument — a format independent of any specific
// timeline UI, future export step, or external NLE integration.
//
// Starts are derived by cumulative duration and are not stored in the
// database (no startTimeSeconds column — see src/db/schema.ts).
// sequence_editorial_items.id is the stable editorial item id; shotId is
// not unique (the same shot can appear as several occurrences).
//
// No DB access, no side effects, no input mutation.
// ---------------------------------------------------------------------------

export type EditorialSourceType = "shot" | "gap";

export type EditorialItemStatus = "approved" | "placeholder" | "missing";

export type EditorialDocument = {
  projectId: number;
  sequenceId: number;
  tracks: EditorialTrack[];
  durationSeconds: number;
};

export type EditorialTrack = {
  id: number;
  kind: "video";
  items: EditorialDocumentItem[];
  durationSeconds: number;
};

export type EditorialDocumentItem = {
  id: number;
  sourceType: EditorialSourceType;
  shotId: number | null;
  trackIndex: number;
  orderIndex: number;
  start: number;
  duration: number;
  trimIn?: number;
  trimOut?: number;
  mediaUrl?: string | null;
  // Gap items carry no status — "missing" would not mean "missing media"
  // for a gap, so the field is simply absent rather than overloaded.
  status?: EditorialItemStatus;
  title?: string | null;
  shotCode?: string | null;
  isPlaceholder?: boolean;
};

/**
 * Builder input — decoupled from Drizzle's inferred row types so the
 * adapter can be called from a page, a future server action, or a test
 * fixture without depending on the DB layer.
 *
 * mediaUrl must be resolved by the caller (e.g. via refImageUrl on the
 * server/page side) — this module never imports web/server-only helpers.
 */
export type EditorialDocumentInputItem = {
  id: number;
  sequenceId: number;
  type: "shot" | "gap";
  shotId: number | null;
  orderIndex: number;
  trackIndex: number;
  durationSeconds: number | null;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  shot?: {
    id: number;
    shotCode: string | null;
    title: string | null;
    approvedVideoPath: string | null;
    isPlaceholder: boolean;
  } | null;
  mediaUrl?: string | null;
  /**
   * Absolute position in seconds, once backfilled (sequence_editorial_items
   * .start_seconds). Null/undefined falls back to cumulative derivation —
   * the only behavior available before a caller starts passing this field.
   */
  startSeconds?: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const PLACEHOLDER_SHOT_FALLBACK_SECONDS = 1.0;

function hasValidTrim(item: EditorialDocumentInputItem): boolean {
  return (
    item.trimInSeconds !== null &&
    item.trimOutSeconds !== null &&
    item.trimInSeconds >= 0 &&
    item.trimOutSeconds > item.trimInSeconds
  );
}

/**
 * Effective playback duration of one editorial item.
 *
 * - gap: durationSeconds if positive, else 0.
 * - shot with a valid trim range: trimOut - trimIn.
 * - shot without a valid trim: durationSeconds if positive, else a 1.0s
 *   fallback (keeps the item visible/orderable even with no data yet).
 *
 * Never reads real video duration (client-only metadata) and never uses
 * startTimeSeconds — there is none.
 */
export function getEditorialItemEffectiveDuration(
  item: EditorialDocumentInputItem
): number {
  // A gap item never carries a trim, regardless of what shotId holds.
  if (item.type === "gap") {
    return item.durationSeconds !== null && item.durationSeconds > 0
      ? item.durationSeconds
      : 0;
  }

  if (hasValidTrim(item)) {
    return item.trimOutSeconds! - item.trimInSeconds!;
  }

  if (item.durationSeconds !== null && item.durationSeconds > 0) {
    return item.durationSeconds;
  }

  return PLACEHOLDER_SHOT_FALLBACK_SECONDS;
}

/**
 * Status of a "shot" editorial item. Gap items have no status (see
 * EditorialDocumentItem.status) — callers should treat an absent status
 * as "not applicable", not as "missing media".
 */
export function getEditorialItemStatus(
  item: EditorialDocumentInputItem
): EditorialItemStatus {
  if (item.shot?.isPlaceholder) return "placeholder";
  if (item.mediaUrl || item.shot?.approvedVideoPath) return "approved";
  return "missing";
}

function toDocumentItem(
  item: EditorialDocumentInputItem,
  start: number,
  duration: number
): EditorialDocumentItem {
  // A gap always wins on sourceType, even if shotId was left non-null —
  // defensive against inconsistent input, never thrown on.
  if (item.type === "gap") {
    return {
      id: item.id,
      sourceType: "gap",
      shotId: null,
      trackIndex: item.trackIndex ?? 0,
      orderIndex: item.orderIndex,
      start,
      duration,
      mediaUrl: null,
    };
  }

  const doc: EditorialDocumentItem = {
    id: item.id,
    sourceType: "shot",
    shotId: item.shotId,
    trackIndex: item.trackIndex ?? 0,
    orderIndex: item.orderIndex,
    start,
    duration,
    mediaUrl: item.mediaUrl ?? item.shot?.approvedVideoPath ?? null,
    status: getEditorialItemStatus(item),
    title: item.shot?.title ?? null,
    shotCode: item.shot?.shotCode ?? null,
    isPlaceholder: item.shot?.isPlaceholder ?? false,
  };

  if (hasValidTrim(item)) {
    doc.trimIn = item.trimInSeconds!;
    doc.trimOut = item.trimOutSeconds!;
  }

  return doc;
}

/**
 * Converts already-loaded editorial items into an EditorialDocument.
 * Groups by trackIndex, orders each track by orderIndex (id as a stable
 * tie-breaker), and derives start times by cumulating effective durations.
 * Pure — does not mutate `args.items` or any nested object.
 */
export function buildEditorialDocument(args: {
  projectId: number;
  sequenceId: number;
  items: EditorialDocumentInputItem[];
}): EditorialDocument {
  const { projectId, sequenceId, items } = args;

  const byTrack = new Map<number, EditorialDocumentInputItem[]>();
  for (const item of items) {
    const trackIndex = item.trackIndex ?? 0;
    const bucket = byTrack.get(trackIndex);
    if (bucket) {
      bucket.push(item);
    } else {
      byTrack.set(trackIndex, [item]);
    }
  }

  const tracks: EditorialTrack[] = [];

  for (const [trackIndex, trackItems] of [...byTrack.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    const sorted = [...trackItems].sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return a.id - b.id; // stable fallback
    });

    let cursor = 0;
    const docItems: EditorialDocumentItem[] = [];
    for (const item of sorted) {
      const duration = getEditorialItemEffectiveDuration(item);
      // Prefer a backfilled startSeconds; fall back to the running
      // cumulative position otherwise (unchanged legacy behavior).
      const start = isFiniteNumber(item.startSeconds) ? item.startSeconds : cursor;
      docItems.push(toDocumentItem(item, start, duration));
      // Never move the cursor backwards — a stored start that creates an
      // empty space before the next item still advances the timeline
      // correctly; a not-yet-backfilled item after a backfilled one still
      // lands after everything that precedes it.
      cursor = Math.max(cursor, start + duration);
    }

    tracks.push({
      id: trackIndex,
      kind: "video",
      items: docItems,
      durationSeconds: cursor,
    });
  }

  const durationSeconds = tracks.reduce(
    (sum, track) => Math.max(sum, track.durationSeconds),
    0
  );

  return { projectId, sequenceId, tracks, durationSeconds };
}
