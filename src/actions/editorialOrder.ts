"use server";

import { db } from "@/db";
import { sequences, sequenceEditorialItems } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getEditorialItemEffectiveDuration } from "@/lib/editorial/editorialDocument";

// ---------------------------------------------------------------------------
// moveEditorialItemOrder — swap orderIndex with the adjacent sibling on the
// same track (BASIC.EDITORIAL.2). Explicit Move up/down control — no drag,
// no ripple. Touches orderIndex only: durationSeconds, trims, shotId and
// trackIndex are all left untouched on both items.
// ---------------------------------------------------------------------------

export async function moveEditorialItemOrder(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const itemId = parseInt(formData.get("itemId") as string, 10);
  const direction = formData.get("direction") as string | null;
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/editorial`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(itemId) || itemId <= 0 ||
    (direction !== "up" && direction !== "down")
  ) {
    redirect(returnTo);
  }

  const now = new Date().toISOString();
  const result = db.transaction((tx) => {
    // Ownership: sequence → project
    const seqRows = tx
      .select({ id: sequences.id, projectId: sequences.projectId })
      .from(sequences)
      .where(eq(sequences.id, sequenceId))
      .all() as unknown as { id: number; projectId: number }[];
    const seq = seqRows[0];
    if (!seq || seq.projectId !== projectId) return { changed: false };

    const itemRows = tx
      .select({
        id: sequenceEditorialItems.id,
        sequenceId: sequenceEditorialItems.sequenceId,
        trackIndex: sequenceEditorialItems.trackIndex,
      })
      .from(sequenceEditorialItems)
      .where(eq(sequenceEditorialItems.id, itemId))
      .all() as unknown as { id: number; sequenceId: number; trackIndex: number }[];
    const item = itemRows[0];
    if (!item || item.sequenceId !== sequenceId) return { changed: false };

    // Siblings on the same track, ordered — the move is a pure adjacent swap
    const siblings = tx
      .select({
        id: sequenceEditorialItems.id,
        orderIndex: sequenceEditorialItems.orderIndex,
      })
      .from(sequenceEditorialItems)
      .where(
        and(
          eq(sequenceEditorialItems.sequenceId, sequenceId),
          eq(sequenceEditorialItems.trackIndex, item.trackIndex)
        )
      )
      .orderBy(asc(sequenceEditorialItems.orderIndex))
      .all() as unknown as { id: number; orderIndex: number }[];

    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx === -1) return { changed: false };
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return { changed: false };

    const a = siblings[idx];
    const b = siblings[targetIdx];

    tx.update(sequenceEditorialItems)
      .set({ orderIndex: b.orderIndex, updatedAt: now })
      .where(eq(sequenceEditorialItems.id, a.id))
      .run();
    tx.update(sequenceEditorialItems)
      .set({ orderIndex: a.orderIndex, updatedAt: now })
      .where(eq(sequenceEditorialItems.id, b.id))
      .run();

    return { changed: true };
  });

  if (result.changed) {
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);
  }

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// moveEditorialItem — non-ripple move of a shot-backed item (PHASEC.NLE.C.M1)
// Writes startSeconds only. Does not touch orderIndex, durationSeconds,
// trims, shotId, or trackIndex, and never creates/deletes a gap item —
// moving into an empty space is exactly the point, no bookkeeping needed
// beyond the moved item's own position.
// ---------------------------------------------------------------------------

/** Two intervals separated by less than this are treated as touching, not overlapping. */
const OVERLAP_EPSILON_SECONDS = 0.05;

/**
 * Moves a "shot" editorial item to a new absolute startSeconds.
 *
 * - Only shot-backed items (type === "shot", shotId set) can move.
 * - Non-pass-through (PHASEC.NLE.C.M1.R3): rejects (no write) unless the
 *   target position stays within the space bounded by the item's own
 *   immediate temporal neighbors (other shots only — gap items are never
 *   obstacles, see toTimelineEditorData's module doc for why). A shot can
 *   never cross or jump past another shot to land elsewhere — that is a
 *   reorder/intercalation, deliberately out of scope until a future ticket.
 * - orderIndex is intentionally left untouched; a future "sync order"
 *   ticket will reconcile it with the new temporal arrangement.
 */
export async function moveEditorialItem(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const itemId = parseInt(formData.get("itemId") as string, 10);
  const newStartRaw = parseFloat((formData.get("newStartSeconds") as string | null) ?? "");
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/nle-prototype`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(itemId) || itemId <= 0 ||
    !Number.isFinite(newStartRaw) || newStartRaw < 0
  ) {
    redirect(returnTo);
  }

  const now = new Date().toISOString();
  const result = db.transaction((tx) => {
    // Ownership: sequence → project
    const seqRows = tx
      .select({ id: sequences.id, projectId: sequences.projectId })
      .from(sequences)
      .where(eq(sequences.id, sequenceId))
      .all() as unknown as { id: number; projectId: number }[];
    const seq = seqRows[0];
    if (!seq || seq.projectId !== projectId) return { changed: false };

    // Item must exist, belong to the sequence, be a shot-backed item
    const itemRows = tx
      .select({
        id: sequenceEditorialItems.id,
        sequenceId: sequenceEditorialItems.sequenceId,
        type: sequenceEditorialItems.type,
        shotId: sequenceEditorialItems.shotId,
        trackIndex: sequenceEditorialItems.trackIndex,
        durationSeconds: sequenceEditorialItems.durationSeconds,
        trimInSeconds: sequenceEditorialItems.trimInSeconds,
        trimOutSeconds: sequenceEditorialItems.trimOutSeconds,
      })
      .from(sequenceEditorialItems)
      .where(eq(sequenceEditorialItems.id, itemId))
      .all() as unknown as {
        id: number; sequenceId: number; type: string; shotId: number | null;
        trackIndex: number; durationSeconds: number | null;
        trimInSeconds: number | null; trimOutSeconds: number | null;
      }[];
    const item = itemRows[0];
    if (!item || item.sequenceId !== sequenceId) return { changed: false };
    if (item.type !== "shot" || item.shotId == null) return { changed: false };

    const duration = getEditorialItemEffectiveDuration({
      type: "shot",
      durationSeconds: item.durationSeconds,
      trimInSeconds: item.trimInSeconds,
      trimOutSeconds: item.trimOutSeconds,
    } as unknown as Parameters<typeof getEditorialItemEffectiveDuration>[0]);
    if (duration <= 0) return { changed: false };

    const newStart = newStartRaw;

    // Non-pass-through (PHASEC.NLE.C.M1.R3): the item may only move within
    // the space bounded by its own immediate temporal neighbors on the
    // same track, computed from their CURRENT positions (before this
    // move) — never anywhere else on the timeline. This is strictly
    // stronger than a plain overlap check: it also blocks "jumping" past
    // a neighbor into a distant free slot (reorder/intercalation), which
    // is explicitly forbidden. Legacy gap rows are never neighbors.
    const shotRows = tx
      .select({
        id: sequenceEditorialItems.id,
        startSeconds: sequenceEditorialItems.startSeconds,
        durationSeconds: sequenceEditorialItems.durationSeconds,
        trimInSeconds: sequenceEditorialItems.trimInSeconds,
        trimOutSeconds: sequenceEditorialItems.trimOutSeconds,
      })
      .from(sequenceEditorialItems)
      .where(
        and(
          eq(sequenceEditorialItems.sequenceId, sequenceId),
          eq(sequenceEditorialItems.trackIndex, item.trackIndex),
          eq(sequenceEditorialItems.type, "shot")
        )
      )
      .all() as unknown as {
        id: number; startSeconds: number | null;
        durationSeconds: number | null; trimInSeconds: number | null;
        trimOutSeconds: number | null;
      }[];

    const shotSiblings = shotRows
      .filter((s) => s.startSeconds != null)
      .map((s) => ({
        id: s.id,
        start: s.startSeconds!,
        duration: getEditorialItemEffectiveDuration({
          type: "shot",
          durationSeconds: s.durationSeconds,
          trimInSeconds: s.trimInSeconds,
          trimOutSeconds: s.trimOutSeconds,
        } as unknown as Parameters<typeof getEditorialItemEffectiveDuration>[0]),
      }))
      .sort((a, b) => a.start - b.start);

    const currentIdx = shotSiblings.findIndex((s) => s.id === itemId);
    const previous = currentIdx > 0 ? shotSiblings[currentIdx - 1] : undefined;
    const next =
      currentIdx >= 0 && currentIdx < shotSiblings.length - 1
        ? shotSiblings[currentIdx + 1]
        : undefined;

    const allowedStartMin = previous ? previous.start + previous.duration : 0;
    const allowedStartMax = next ? next.start - duration : Infinity;

    if (
      newStart < allowedStartMin - OVERLAP_EPSILON_SECONDS ||
      newStart > allowedStartMax + OVERLAP_EPSILON_SECONDS
    ) {
      return { changed: false };
    }

    tx.update(sequenceEditorialItems)
      .set({ startSeconds: newStart, updatedAt: now })
      .where(eq(sequenceEditorialItems.id, itemId))
      .run();

    return { changed: true };
  });

  if (result.changed) {
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/nle-prototype`);
  }

  redirect(returnTo);
}
