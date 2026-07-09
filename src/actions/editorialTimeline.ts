"use server";

import { db } from "@/db";
import { sequences, sequenceEditorialItems, NewSequenceEditorialItem } from "@/db/schema";
import { eq, asc, and, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getEditorialItemEffectiveDuration } from "@/lib/editorial/editorialDocument";

const MAX_TRIM_SECONDS = 36000; // generic server bound — video duration is client-side only
/** Epsilon: gap durations ≤ this are treated as zero and removed. */
const GAP_EPSILON_SECONDS = 0.05;

// ---------------------------------------------------------------------------
// updateEditorialItemTrim — per-item non-destructive trim (editorial layer)
// ---------------------------------------------------------------------------

/**
 * Sets or clears the trim of a "shot" editorial item. Trims live on the item
 * (per occurrence), never on the shot — shots.trim* is legacy and untouched.
 * Gap items are rejected without writing.
 */
export async function updateEditorialItemTrim(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const itemId = parseInt(formData.get("itemId") as string, 10);
  const clearTrim = formData.get("clearTrim") === "1";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/editorial`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(itemId) || itemId <= 0
  ) {
    return;
  }

  // Ownership: sequence → project
  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  // Item must belong to the sequence and be a shot item — gaps carry no trim
  const [item] = await db
    .select({
      id: sequenceEditorialItems.id,
      sequenceId: sequenceEditorialItems.sequenceId,
      type: sequenceEditorialItems.type,
    })
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.id, itemId));
  if (!item || item.sequenceId !== sequenceId) return;
  if (item.type !== "shot") return;

  let trimInSeconds: number | null = null;
  let trimOutSeconds: number | null = null;

  if (!clearTrim) {
    const trimIn = parseFloat((formData.get("trimInSeconds") as string | null) ?? "");
    const trimOut = parseFloat((formData.get("trimOutSeconds") as string | null) ?? "");
    if (
      !Number.isFinite(trimIn) ||
      !Number.isFinite(trimOut) ||
      trimIn < 0 ||
      trimOut <= trimIn ||
      trimOut > MAX_TRIM_SECONDS
    ) {
      // Invalid values — no write, return to the page unchanged
      redirect(returnTo);
    }
    trimInSeconds = trimIn;
    trimOutSeconds = trimOut;
  }

  await db
    .update(sequenceEditorialItems)
    .set({ trimInSeconds, trimOutSeconds, updatedAt: new Date().toISOString() })
    .where(eq(sequenceEditorialItems.id, itemId));

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// resizeEditorialItemRightEdge — non-ripple right-edge resize (editorial)
// Shrink → create/extend next gap ; Extend → consume next gap
// Shot items with video only. Left handle untouched.
// ---------------------------------------------------------------------------

/**
 * Resize the right edge of a shot editorial item without rippling.
 *
 * - Shrink: item shorter → gap created or extended after it.
 * - Extend: item longer → gap after it consumed (deleted if empty).
 * - No gap after item → extend blocked (no write).
 * - Server recalculates delta from DB; client values trusted only for direction.
 */
export async function resizeEditorialItemRightEdge(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const itemId = parseInt(formData.get("itemId") as string, 10);
  const newTrimOutRaw = parseFloat((formData.get("newTrimOutSeconds") as string | null) ?? "");
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/editorial`;

  // ── Basic validation (no DB) ──
  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(itemId) || itemId <= 0 ||
    !Number.isFinite(newTrimOutRaw) || newTrimOutRaw <= 0 || newTrimOutRaw > MAX_TRIM_SECONDS
  ) {
    redirect(returnTo);
  }

  // ── Transaction: strictly sync callback (better-sqlite3) ──
  // No await, no redirect, no revalidatePath inside.
  const now = new Date().toISOString();
  const result = db.transaction((tx) => {
    // Ownership: sequence → project
    const seqRows = tx
      .select({ id: sequences.id, projectId: sequences.projectId })
      .from(sequences)
      .where(eq(sequences.id, sequenceId)) as unknown as { id: number; projectId: number }[];
    const seq = seqRows[0];
    if (!seq || seq.projectId !== projectId) return { changed: false };

    // Item must exist, belong to sequence, be a shot
    const itemRows = tx
      .select({
        id: sequenceEditorialItems.id,
        sequenceId: sequenceEditorialItems.sequenceId,
        type: sequenceEditorialItems.type,
        shotId: sequenceEditorialItems.shotId,
        trimInSeconds: sequenceEditorialItems.trimInSeconds,
        trimOutSeconds: sequenceEditorialItems.trimOutSeconds,
        durationSeconds: sequenceEditorialItems.durationSeconds,
        orderIndex: sequenceEditorialItems.orderIndex,
        trackIndex: sequenceEditorialItems.trackIndex,
      })
      .from(sequenceEditorialItems)
      .where(eq(sequenceEditorialItems.id, itemId)) as unknown as {
        id: number; sequenceId: number; type: string; shotId: number | null;
        trimInSeconds: number | null; trimOutSeconds: number | null;
        durationSeconds: number | null; orderIndex: number; trackIndex: number;
      }[];
    const item = itemRows[0];
    if (!item || item.sequenceId !== sequenceId) return { changed: false };
    if (item.type !== "shot") return { changed: false };
    if (item.shotId == null) return { changed: false };

    const trimIn = item.trimInSeconds ?? 0;

    // newTrimOut must be > trimIn and leave ≥ 0.2 s
    if (newTrimOutRaw <= trimIn || (newTrimOutRaw - trimIn) < 0.2) {
      return { changed: false };
    }

    // Compute old duration from DB
    const oldTrimOutValid =
      item.trimOutSeconds != null &&
      item.trimInSeconds != null &&
      item.trimOutSeconds > item.trimInSeconds;

    let oldDuration: number;
    if (oldTrimOutValid) {
      oldDuration = item.trimOutSeconds! - (item.trimInSeconds ?? 0);
    } else if (item.durationSeconds != null && item.durationSeconds > 0) {
      oldDuration = item.durationSeconds;
    } else {
      oldDuration = 1.0;
    }

    const newDuration = newTrimOutRaw - trimIn;

    // No-op: same duration (within 1 ms)
    if (Math.abs(newDuration - oldDuration) < 0.001) {
      return { changed: false };
    }

    const trackIndex = item.trackIndex ?? 0;

    // Load immediate next item
    const nextItemRows = tx
      .select({
        id: sequenceEditorialItems.id,
        type: sequenceEditorialItems.type,
        durationSeconds: sequenceEditorialItems.durationSeconds,
        orderIndex: sequenceEditorialItems.orderIndex,
      })
      .from(sequenceEditorialItems)
      .where(
        and(
          eq(sequenceEditorialItems.sequenceId, sequenceId),
          eq(sequenceEditorialItems.trackIndex, trackIndex),
          gt(sequenceEditorialItems.orderIndex, item.orderIndex)
        )
      )
      .orderBy(asc(sequenceEditorialItems.orderIndex))
      .limit(1) as unknown as { id: number; type: string; durationSeconds: number | null; orderIndex: number }[];
    const nextItem = nextItemRows[0] ?? null;

    if (newDuration < oldDuration) {
      // ─── SHRINK: create or extend gap ───
      const delta = oldDuration - newDuration;

      tx.update(sequenceEditorialItems)
        .set({ trimOutSeconds: newTrimOutRaw, updatedAt: now })
        .where(eq(sequenceEditorialItems.id, itemId));

      if (nextItem && nextItem.type === "gap") {
        const newGapDur = (nextItem.durationSeconds ?? 0) + delta;
        tx.update(sequenceEditorialItems)
          .set({ durationSeconds: newGapDur, updatedAt: now })
          .where(eq(sequenceEditorialItems.id, nextItem.id));
      } else {
        // Shift orderIndex +1 for items after this one
        const allAfter = tx
          .select({ id: sequenceEditorialItems.id, orderIndex: sequenceEditorialItems.orderIndex })
          .from(sequenceEditorialItems)
          .where(
            and(
              eq(sequenceEditorialItems.sequenceId, sequenceId),
              gt(sequenceEditorialItems.orderIndex, item.orderIndex)
            )
          ) as unknown as { id: number; orderIndex: number }[];

        for (const row of allAfter) {
          tx.update(sequenceEditorialItems)
            .set({ orderIndex: row.orderIndex + 1 })
            .where(eq(sequenceEditorialItems.id, row.id));
        }

        tx.insert(sequenceEditorialItems).values({
          sequenceId,
          type: "gap",
          shotId: null,
          orderIndex: item.orderIndex + 1,
          durationSeconds: delta,
          trimInSeconds: null,
          trimOutSeconds: null,
          trackIndex,
          createdAt: now,
          updatedAt: now,
        } as const);
      }
    } else {
      // ─── EXTEND: consume next gap ───
      if (!nextItem || nextItem.type !== "gap") {
        return { changed: false };
      }

      const gapDuration = nextItem.durationSeconds ?? 0;
      const deltaRequested = newDuration - oldDuration;
      const deltaApplied = Math.min(deltaRequested, gapDuration);
      const appliedTrimOut = trimIn + oldDuration + deltaApplied;

      tx.update(sequenceEditorialItems)
        .set({ trimOutSeconds: appliedTrimOut, updatedAt: now })
        .where(eq(sequenceEditorialItems.id, itemId));

      const newGapDuration = gapDuration - deltaApplied;

      if (newGapDuration <= GAP_EPSILON_SECONDS) {
        tx.delete(sequenceEditorialItems)
          .where(eq(sequenceEditorialItems.id, nextItem.id));
      } else {
        tx.update(sequenceEditorialItems)
          .set({ durationSeconds: newGapDuration, updatedAt: now })
          .where(eq(sequenceEditorialItems.id, nextItem.id));
      }
    }

    // ── Normalize orderIndex 0..n-1 per track ──
    const allItems = tx
      .select({
        id: sequenceEditorialItems.id,
        orderIndex: sequenceEditorialItems.orderIndex,
        trackIndex: sequenceEditorialItems.trackIndex,
      })
      .from(sequenceEditorialItems)
      .where(eq(sequenceEditorialItems.sequenceId, sequenceId))
      .orderBy(asc(sequenceEditorialItems.orderIndex)) as unknown as { id: number; orderIndex: number; trackIndex: number }[];

    const trackMap = new Map<number, { id: number; orderIndex: number; trackIndex: number }[]>();
    for (const row of allItems) {
      const ti = row.trackIndex ?? 0;
      if (!trackMap.has(ti)) trackMap.set(ti, []);
      trackMap.get(ti)!.push(row);
    }

    for (const [, rows] of trackMap) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].orderIndex !== i) {
          tx.update(sequenceEditorialItems)
            .set({ orderIndex: i })
            .where(eq(sequenceEditorialItems.id, rows[i].id));
        }
      }
    }

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
 * - Rejects (no write) if the target position is invalid or overlaps
 *   another shot item on the same track — gap items are never obstacles,
 *   see toTimelineEditorData's module doc for why.
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
      .where(eq(sequences.id, sequenceId)) as unknown as { id: number; projectId: number }[];
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
      .where(eq(sequenceEditorialItems.id, itemId)) as unknown as {
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
    const newEnd = newStart + duration;

    // Overlap check against other shot items on the same track only —
    // gap items are transparent to movement, never obstacles.
    const siblingRows = tx
      .select({
        id: sequenceEditorialItems.id,
        type: sequenceEditorialItems.type,
        startSeconds: sequenceEditorialItems.startSeconds,
        durationSeconds: sequenceEditorialItems.durationSeconds,
        trimInSeconds: sequenceEditorialItems.trimInSeconds,
        trimOutSeconds: sequenceEditorialItems.trimOutSeconds,
      })
      .from(sequenceEditorialItems)
      .where(
        and(
          eq(sequenceEditorialItems.sequenceId, sequenceId),
          eq(sequenceEditorialItems.trackIndex, item.trackIndex)
        )
      ) as unknown as {
        id: number; type: string; startSeconds: number | null;
        durationSeconds: number | null; trimInSeconds: number | null;
        trimOutSeconds: number | null;
      }[];

    for (const sibling of siblingRows) {
      if (sibling.id === itemId) continue;
      if (sibling.type !== "shot") continue;
      if (sibling.startSeconds == null) continue; // not backfilled — ignore defensively

      const siblingDuration = getEditorialItemEffectiveDuration({
        type: "shot",
        durationSeconds: sibling.durationSeconds,
        trimInSeconds: sibling.trimInSeconds,
        trimOutSeconds: sibling.trimOutSeconds,
      } as unknown as Parameters<typeof getEditorialItemEffectiveDuration>[0]);
      const siblingStart = sibling.startSeconds;
      const siblingEnd = siblingStart + siblingDuration;

      const overlaps =
        newStart < siblingEnd - OVERLAP_EPSILON_SECONDS &&
        newEnd > siblingStart + OVERLAP_EPSILON_SECONDS;
      if (overlaps) return { changed: false };
    }

    tx.update(sequenceEditorialItems)
      .set({ startSeconds: newStart, updatedAt: now })
      .where(eq(sequenceEditorialItems.id, itemId));

    return { changed: true };
  });

  if (result.changed) {
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/nle-prototype`);
  }

  redirect(returnTo);
}
