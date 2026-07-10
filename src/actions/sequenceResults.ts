"use server";

// ---------------------------------------------------------------------------
// Sequence Result actions (SEQUENCE.RESULT.1)
//
// V1 scope: list/read/activate/archive an already-existing result, plus a
// minimal creation primitive for future publish tickets (BASIC.EDITORIAL.1,
// OPENREEL.PUBLISH.1) to call. This ticket adds no publish UI of its own —
// createSequenceResult exists so results can be seeded for manual testing
// and so those future tickets don't need to re-invent the write path.
//
// "At most one active result per sequence" is enforced applicatively, not
// via a DB constraint: setActiveSequenceResult runs inside a transaction
// that demotes any other row in the same sequence currently at status
// "active" to "published" before promoting the target. A SQLite partial
// unique index (`WHERE status = 'active'`) would also work, but Drizzle's
// schema builder has no first-class partial-index API as of this project's
// pinned drizzle-kit version — the transactional demote-then-promote gives
// the same practical guarantee (no code path outside this function ever
// writes status: "active") without hand-writing raw DDL outside the
// generated migration. Documented here as the V1 decision, not revisited
// unless a concrete correctness gap shows up.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { sequenceResults, sequences } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  SequenceResult,
  NewSequenceResult,
} from "@/db/schema";
import type {
  SequenceResultSourceMode,
  SequenceResultStatus,
} from "@/types/sequenceResult";
import type { EditorialSnapshot } from "@/lib/editorial/editorialSnapshot";
import {
  serializeResultEditorialSnapshot,
  serializeResultWarnings,
} from "@/types/sequenceResult";

async function assertSequenceOwnership(projectId: number, sequenceId: number): Promise<boolean> {
  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  return !!sequence && sequence.projectId === projectId;
}

/** All results for a sequence, most recent first. Empty array (not an error) if the sequence has none, or if ownership doesn't check out. */
export async function listSequenceResults(
  projectId: number,
  sequenceId: number
): Promise<SequenceResult[]> {
  if (!(await assertSequenceOwnership(projectId, sequenceId))) return [];
  return db
    .select()
    .from(sequenceResults)
    .where(and(eq(sequenceResults.sequenceId, sequenceId), eq(sequenceResults.projectId, projectId)))
    .orderBy(desc(sequenceResults.createdAt));
}

/** The sequence's current active result, or null if none (never published yet, or the active one was archived without a replacement). */
export async function getActiveSequenceResult(
  projectId: number,
  sequenceId: number
): Promise<SequenceResult | null> {
  if (!(await assertSequenceOwnership(projectId, sequenceId))) return null;
  const [row] = await db
    .select()
    .from(sequenceResults)
    .where(
      and(
        eq(sequenceResults.sequenceId, sequenceId),
        eq(sequenceResults.projectId, projectId),
        eq(sequenceResults.status, "active")
      )
    )
    .orderBy(desc(sequenceResults.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Promotes `resultId` to "active", demoting any other currently-active
 * result in the same sequence to "published" first. No-op-safe: promoting
 * an already-active result just re-confirms it (still a single UPDATE).
 */
export async function setActiveSequenceResult(
  projectId: number,
  sequenceId: number,
  resultId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertSequenceOwnership(projectId, sequenceId))) {
    return { ok: false, error: "Sequence not found." };
  }

  const now = new Date().toISOString();
  const result = db.transaction((tx) => {
    const targetRows = tx
      .select({ id: sequenceResults.id, sequenceId: sequenceResults.sequenceId, projectId: sequenceResults.projectId })
      .from(sequenceResults)
      .where(eq(sequenceResults.id, resultId))
      .all() as unknown as { id: number; sequenceId: number; projectId: number }[];
    const target = targetRows[0];
    if (!target || target.sequenceId !== sequenceId || target.projectId !== projectId) {
      return { changed: false };
    }

    const currentlyActiveRows = tx
      .select({ id: sequenceResults.id })
      .from(sequenceResults)
      .where(and(eq(sequenceResults.sequenceId, sequenceId), eq(sequenceResults.status, "active")))
      .all() as unknown as { id: number }[];

    for (const row of currentlyActiveRows) {
      if (row.id === resultId) continue;
      tx.update(sequenceResults)
        .set({ status: "published", updatedAt: now })
        .where(eq(sequenceResults.id, row.id))
        .run();
    }

    tx.update(sequenceResults)
      .set({ status: "active", updatedAt: now })
      .where(eq(sequenceResults.id, resultId))
      .run();

    return { changed: true };
  });

  if (!result.changed) {
    return { ok: false, error: "Result not found in this sequence." };
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  return { ok: true };
}

/** Archives a result. Does not auto-promote a replacement — a sequence can be left with no active result, surfaced as the viewer's empty state. */
export async function archiveSequenceResult(
  projectId: number,
  sequenceId: number,
  resultId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertSequenceOwnership(projectId, sequenceId))) {
    return { ok: false, error: "Sequence not found." };
  }

  const [existing] = await db
    .select({ id: sequenceResults.id })
    .from(sequenceResults)
    .where(
      and(
        eq(sequenceResults.id, resultId),
        eq(sequenceResults.sequenceId, sequenceId),
        eq(sequenceResults.projectId, projectId)
      )
    );
  if (!existing) return { ok: false, error: "Result not found in this sequence." };

  await db
    .update(sequenceResults)
    .set({ status: "archived", updatedAt: new Date().toISOString() })
    .where(eq(sequenceResults.id, resultId));

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  return { ok: true };
}

/**
 * Marks every non-terminal result (`active`/`published`) of a sequence as
 * `outdated` — called after a structural editorial change (EDITORIAL.INSERT.1's
 * shot insertion) that makes existing results no longer a faithful
 * representation of the sequence. Deliberately does NOT touch `draft` rows
 * (still in progress, not yet a claim about the sequence) or already
 * `archived`/`outdated` rows (nothing to demote further). Does not
 * auto-promote or delete anything — an outdated result stays visible and
 * playable in the viewer, just clearly flagged; the user re-publishes when
 * ready. Never throws — a missing/invalid sequence just outdates zero rows.
 */
export async function outdateSequenceResultsForSequence(
  projectId: number,
  sequenceId: number
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!(await assertSequenceOwnership(projectId, sequenceId))) {
    return { ok: false, error: "Sequence not found." };
  }

  const now = new Date().toISOString();
  const rows = await db
    .update(sequenceResults)
    .set({ status: "outdated", updatedAt: now })
    .where(
      and(
        eq(sequenceResults.sequenceId, sequenceId),
        eq(sequenceResults.projectId, projectId),
        inArray(sequenceResults.status, ["active", "published"])
      )
    )
    .returning({ id: sequenceResults.id });

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  return { ok: true, count: rows.length };
}

/**
 * Creation primitive for future publish tickets (BASIC.EDITORIAL.1,
 * OPENREEL.PUBLISH.1) — not wired to any UI in this ticket. New rows are
 * created as "draft" by default; callers decide whether/when to call
 * setActiveSequenceResult separately (publish and activate are
 * deliberately two steps — see docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md §11
 * open question on this).
 */
export async function createSequenceResult(input: {
  projectId: number;
  sequenceId: number;
  sourceMode: SequenceResultSourceMode;
  status?: SequenceResultStatus;
  videoPath?: string | null;
  durationSeconds?: number | null;
  /**
   * Stored verbatim as JSON — deliberately typed as `unknown` rather than
   * the narrower SequenceResultCutManifest (a generic, mode-agnostic
   * projection), since a real manifest (e.g. BasicCutManifest, richer than
   * that generic shape) is what publish actions actually produce. See
   * docs/SEQUENCE_RESULT_1_DATA_MODEL_VIEWER.md §5 / BASIC_EDITORIAL_1A's
   * note on this reconciliation.
   */
  cutManifest?: unknown;
  editorialSnapshot?: EditorialSnapshot | null;
  notes?: string | null;
  warnings?: string[];
  publishedAt?: string | null;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!(await assertSequenceOwnership(input.projectId, input.sequenceId))) {
    return { ok: false, error: "Sequence not found." };
  }

  const now = new Date().toISOString();
  const values: NewSequenceResult = {
    projectId: input.projectId,
    sequenceId: input.sequenceId,
    sourceMode: input.sourceMode,
    status: input.status ?? "draft",
    videoPath: input.videoPath ?? null,
    durationSeconds: input.durationSeconds ?? null,
    cutManifest: input.cutManifest !== undefined && input.cutManifest !== null ? JSON.stringify(input.cutManifest) : null,
    editorialSnapshot: input.editorialSnapshot ? serializeResultEditorialSnapshot(input.editorialSnapshot) : null,
    notes: input.notes ?? null,
    warnings: input.warnings ? serializeResultWarnings(input.warnings) : null,
    publishedAt: input.publishedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const [row] = await db.insert(sequenceResults).values(values).returning({ id: sequenceResults.id });

  revalidatePath(`/projects/${input.projectId}/sequences/${input.sequenceId}`);
  return { ok: true, id: row.id };
}
