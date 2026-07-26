"use server";

// ---------------------------------------------------------------------------
// sequenceStyle.ts — STYLE.1.D.CORE (retake Round 2)
//
// Server Actions and read model for the Sequence Style override: Customize
// (full replace from the Project's currently active version), Update (edit
// the override's own content), and Reset (delete the override row, letting
// the Sequence resolve the Project's active version dynamically again).
//
// Ownership re-check inside the transaction (Codex Round 1 P1 #1): every
// mutation below validates pure, untrusted input (ids, expectedRevision,
// snapshot shape) BEFORE any DB access, then re-reads Project -> Sequence
// ownership as the FIRST statement inside its own `db.transaction((tx) =>
// {...})` — never before it. A Sequence deleted or reassigned to another
// Project between an earlier read and this transaction is caught here, not
// assumed from a stale outer check. No `await` ever runs inside a
// transaction body (same idiom as src/actions/projectStyle.ts), so nothing
// can interleave between the ownership re-check and the write that follows
// it.
//
// Project confinement (Codex Round 1 P1 #3): the active pointer's target
// version and an override's source version are both re-checked here for
// `version.projectId === projectId` — a cross-Project link fails explicitly
// (a distinct error), it is never treated as "no active version".
//
// Real concurrency on Customize (Codex Round 1 P1 #4): the insert uses
// `onConflictDoNothing({ target: sequenceStyleOverrides.sequenceId })` —
// the DB's own unique index is the sole authority for "did this Sequence
// already get an override", not a SELECT-then-INSERT race. Two genuinely
// concurrent connections both attempt the INSERT; SQLite's constraint
// resolves the winner atomically, and the loser's `.run().changes === 0`
// is read back as a structured "already-exists" refusal.
//
// Structured error boundary (Codex Round 2 P1 #2): the exact unique
// conflict this ticket cares about is data (`changes === 0`), never a
// thrown exception — but every OTHER DB fault (SQLITE_BUSY, an FK
// violation, a fault-injected UPDATE/DELETE) is a real thrown exception
// from better-sqlite3, and `db.transaction(...)` already rolls it back.
// `runMutationTx` below is the one place all three mutations route that
// transaction through, so any such fault is caught and returned as
// `{ ok: false, error }` — a sanitized, generic English message, never the
// raw driver exception, and never confused with the specific
// "already-exists" unique-conflict case, which is decided entirely inside
// the transaction body before this boundary ever sees it.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  sequences,
  projectStyleVersions,
  projectStyleActivePointers,
  sequenceStyleOverrides,
  type SequenceStyleOverride,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import { parseStyleSnapshot, parseStyleSnapshotFromJson } from "@/lib/projectStyle/validateStyleSnapshot";
import { isValidId, isValidRevision } from "@/lib/projectStyle/validation";
import { resolveSequenceStyleWithActiveVersion, type ResolvedSequenceStyle } from "@/lib/projectStyle/resolveSequenceStyle";

/** The exact transaction-callback parameter type `db.transaction` accepts — shared by every mutation below. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Read model — powers the future UI (STYLE.1.D.UI). No mutation. Delegates
// entirely to the resolver's atomic core so `resolved` and
// `activeProjectVersion` always come from the same single-transaction
// snapshot — never re-derived from a second, separate query here.
// ---------------------------------------------------------------------------

export type SequenceStyleState = {
  resolved: ResolvedSequenceStyle;
  hasOverride: boolean;
  activeProjectVersion: { id: number; versionNumber: number } | null;
};

export type GetSequenceStyleStateResult = { ok: true; state: SequenceStyleState } | { ok: false; error: string };

export async function getSequenceStyleState(projectId: number, sequenceId: number): Promise<GetSequenceStyleStateResult> {
  const core = await resolveSequenceStyleWithActiveVersion(projectId, sequenceId);
  if (!core.ok) return { ok: false, error: core.error };

  return {
    ok: true,
    state: { resolved: core.resolved, hasOverride: core.resolved.mode === "override", activeProjectVersion: core.activeProjectVersion },
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type SequenceStyleMutationResult =
  | { ok: true; revision: number }
  | { ok: false; error: string; currentRevision?: number };

function staleError(currentRevision: number): { ok: false; error: string; currentRevision: number } {
  return {
    ok: false,
    error: `This Sequence Style override was changed elsewhere (current revision ${currentRevision}). Reload and try again.`,
    currentRevision,
  };
}

/** A DB fault distinct from any of a mutation's own `kind` outcomes — never produced from inside a transaction body, only by `runMutationTx` catching a thrown exception around it. */
type DbFault = { kind: "db-fault" };

const GENERIC_DB_FAULT_ERROR = "A database error occurred while saving the Sequence Style. Please try again.";

/** The shared error boundary every mutation transaction runs through: the exact unique conflict Customize expects is plain returned data (`{ kind: "already-exists" }`), never an exception, so it is unaffected by this catch. Any OTHER thrown DB fault — SQLITE_BUSY, an FK violation, a fault-injected UPDATE/DELETE — is caught here and converted into a sanitized, generic structured result instead of rejecting the Server Action with a raw exception. `db.transaction` already rolled the failed transaction back before this catch runs, so this never masks a partial write. */
function runMutationTx<T>(fn: (tx: Tx) => T): T | DbFault {
  try {
    return db.transaction(fn);
  } catch {
    return { kind: "db-fault" };
  }
}

/** Re-reads Project -> Sequence ownership as the first statement of the caller's transaction — the single place every mutation below calls before touching anything else. */
function assertSequenceInProjectSync(tx: Tx, projectId: number, sequenceId: number): { ok: true } | { ok: false; error: string } {
  const sequenceRows = tx
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId))
    .all() as unknown as { id: number; projectId: number }[];
  const sequence = sequenceRows[0];
  if (!sequence || sequence.projectId !== projectId) return { ok: false, error: "Sequence not found in this Project." };
  return { ok: true };
}

export type CustomizeSequenceStyleResult =
  | { ok: true; overrideId: number; revision: number; sourceProjectVersionId: number; sourceProjectVersionNumber: number }
  | { ok: false; error: string };

type CustomizeOutcome =
  | { kind: "ownership"; error: string }
  | { kind: "no-active" }
  | { kind: "foreign-version"; error: string }
  | { kind: "corrupt-source" }
  | { kind: "already-exists" }
  | { kind: "ok"; overrideId: number; revision: number; sourceProjectVersionId: number; sourceProjectVersionNumber: number };

/** Creates a full-replace override, copying contentSnapshot/compiledText byte-exactly from the Project's currently active published version. Refuses (zero mutation) if no version is active, if the active pointer/provenance is corrupted or points cross-Project, or if an override already exists — this never overwrites one, and the DB unique constraint (not a prior SELECT) is what decides that under real concurrency. */
export async function customizeSequenceStyleAction(input: {
  projectId: number;
  sequenceId: number;
}): Promise<CustomizeSequenceStyleResult> {
  const { projectId, sequenceId } = input;
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(sequenceId)) return { ok: false, error: "Invalid sequence id." };

  const now = new Date().toISOString();
  const outcome: CustomizeOutcome | DbFault = runMutationTx((tx) => {
    const ownership = assertSequenceInProjectSync(tx, projectId, sequenceId);
    if (!ownership.ok) return { kind: "ownership", error: ownership.error };

    const pointerRows = tx
      .select()
      .from(projectStyleActivePointers)
      .where(eq(projectStyleActivePointers.projectId, projectId))
      .all() as unknown as (typeof projectStyleActivePointers.$inferSelect)[];
    const pointer = pointerRows[0];
    if (!pointer || !pointer.activeVersionId) return { kind: "no-active" };

    const versionRows = tx
      .select()
      .from(projectStyleVersions)
      .where(eq(projectStyleVersions.id, pointer.activeVersionId))
      .all() as unknown as (typeof projectStyleVersions.$inferSelect)[];
    const version = versionRows[0];
    if (!version) return { kind: "no-active" };
    if (version.projectId !== projectId) {
      return { kind: "foreign-version", error: "The Project's active Style pointer references a version belonging to a different Project." };
    }

    const parsed = parseStyleSnapshotFromJson(version.contentSnapshot);
    if (!parsed.ok) return { kind: "corrupt-source" };
    if (compileStyleSnapshot(parsed.snapshot) !== version.compiledText) return { kind: "corrupt-source" };

    // Atomic authority: the unique index on sequenceId, not a prior SELECT.
    // A genuinely concurrent connection's insert can only ever win or be
    // ignored here — never overwrite a row another connection just
    // committed.
    const inserted = tx
      .insert(sequenceStyleOverrides)
      .values({
        sequenceId,
        sourceProjectStyleVersionId: version.id,
        contentSnapshot: version.contentSnapshot,
        compiledText: version.compiledText,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: sequenceStyleOverrides.sequenceId })
      .run();

    if (inserted.changes === 0) return { kind: "already-exists" };

    return {
      kind: "ok",
      overrideId: Number(inserted.lastInsertRowid),
      revision: 1,
      sourceProjectVersionId: version.id,
      sourceProjectVersionNumber: version.versionNumber,
    };
  });

  if (outcome.kind === "db-fault") return { ok: false, error: GENERIC_DB_FAULT_ERROR };
  if (outcome.kind === "ownership") return { ok: false, error: outcome.error };
  if (outcome.kind === "no-active") return { ok: false, error: "There is no active published Project Style to customize from." };
  if (outcome.kind === "foreign-version") return { ok: false, error: outcome.error };
  if (outcome.kind === "corrupt-source") return { ok: false, error: "The active Project Style version is corrupted and cannot be copied." };
  if (outcome.kind === "already-exists") {
    return { ok: false, error: "A Sequence Style override already exists — reset it before customizing again." };
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  return {
    ok: true,
    overrideId: outcome.overrideId,
    revision: outcome.revision,
    sourceProjectVersionId: outcome.sourceProjectVersionId,
    sourceProjectVersionNumber: outcome.sourceProjectVersionNumber,
  };
}

/** Validates the received snapshot, recomputes compiledText server-side, and bumps revision by exactly 1 in the same transaction. Refuses (zero mutation) on invalid input, stale ownership/expectedRevision, or a missing override row. */
export async function updateSequenceStyleOverrideAction(input: {
  projectId: number;
  sequenceId: number;
  expectedRevision: number;
  snapshot: unknown;
}): Promise<SequenceStyleMutationResult> {
  const { projectId, sequenceId, expectedRevision } = input;
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(sequenceId)) return { ok: false, error: "Invalid sequence id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };

  const parsed = parseStyleSnapshot(input.snapshot);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const contentSnapshot = JSON.stringify(parsed.snapshot);
  const compiledText = compileStyleSnapshot(parsed.snapshot);

  const now = new Date().toISOString();
  const outcome = runMutationTx((tx) => {
    const ownership = assertSequenceInProjectSync(tx, projectId, sequenceId);
    if (!ownership.ok) return { kind: "ownership" as const, error: ownership.error };

    const rows = tx
      .select()
      .from(sequenceStyleOverrides)
      .where(eq(sequenceStyleOverrides.sequenceId, sequenceId))
      .all() as unknown as SequenceStyleOverride[];
    const override = rows[0];
    if (!override) return { kind: "not-found" as const };
    if (override.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: override.revision };

    tx.update(sequenceStyleOverrides)
      .set({ contentSnapshot, compiledText, revision: override.revision + 1, updatedAt: now })
      .where(eq(sequenceStyleOverrides.id, override.id))
      .run();

    return { kind: "ok" as const, revision: override.revision + 1 };
  });

  if (outcome.kind === "db-fault") return { ok: false, error: GENERIC_DB_FAULT_ERROR };
  if (outcome.kind === "ownership") return { ok: false, error: outcome.error };
  if (outcome.kind === "not-found") return { ok: false, error: "There is no Sequence Style override to update." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  return { ok: true, revision: outcome.revision };
}

export type ResetSequenceStyleOverrideResult = { ok: true } | { ok: false; error: string; currentRevision?: number };

/** Deletes the override row after a revision check — the Sequence then resolves the Project's active version dynamically again on its next read. Refuses (zero mutation) on invalid input, stale ownership/expectedRevision, or a missing override row. */
export async function resetSequenceStyleOverrideAction(input: {
  projectId: number;
  sequenceId: number;
  expectedRevision: number;
}): Promise<ResetSequenceStyleOverrideResult> {
  const { projectId, sequenceId, expectedRevision } = input;
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(sequenceId)) return { ok: false, error: "Invalid sequence id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };

  const outcome = runMutationTx((tx) => {
    const ownership = assertSequenceInProjectSync(tx, projectId, sequenceId);
    if (!ownership.ok) return { kind: "ownership" as const, error: ownership.error };

    const rows = tx
      .select()
      .from(sequenceStyleOverrides)
      .where(eq(sequenceStyleOverrides.sequenceId, sequenceId))
      .all() as unknown as SequenceStyleOverride[];
    const override = rows[0];
    if (!override) return { kind: "not-found" as const };
    if (override.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: override.revision };

    tx.delete(sequenceStyleOverrides).where(eq(sequenceStyleOverrides.id, override.id)).run();
    return { kind: "ok" as const };
  });

  if (outcome.kind === "db-fault") return { ok: false, error: GENERIC_DB_FAULT_ERROR };
  if (outcome.kind === "ownership") return { ok: false, error: outcome.error };
  if (outcome.kind === "not-found") return { ok: false, error: "There is no Sequence Style override to reset." };
  if (outcome.kind === "stale") {
    return {
      ok: false,
      error: `This Sequence Style override was changed elsewhere (current revision ${outcome.currentRevision}). Reload and try again.`,
      currentRevision: outcome.currentRevision,
    };
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  return { ok: true };
}
