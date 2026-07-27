// ---------------------------------------------------------------------------
// resolveSequenceStyle.ts — STYLE.1.D.CORE (retake Round 2)
//
// The one canonical Sequence Style resolver. Contract:
//   no override row   -> "inherited": resolves whatever Project Style
//                         version `project_style_active_pointers` currently
//                         points at, dynamically, on every call;
//   override row exists -> "override": resolves that row's own frozen
//                         content, forever, regardless of later Project
//                         publish/activate;
//   Project has no active version and no override -> "none".
// A Shot never has its own override — resolveShotStyle below only verifies
// Project -> Sequence -> Shot ownership and then delegates here. It must
// never re-implement this lookup.
//
// Atomicity (Codex Round 1 P1 #2): every read below — ownership, override,
// its source version, the active pointer, and the active version — happens
// inside ONE synchronous `db.transaction((tx) => {...})` callback. better-
// sqlite3 executes that whole callback on the stack with no `await` inside
// it, so no other request's publish/activate/customize can interleave
// between two of these reads. Without this, a publish landing between "read
// override" and "read active pointer" could make a read model report
// `resolved: inherited v1` next to `activeProjectVersion: v2` — a hybrid
// state this module must never produce.
//
// Project confinement (Codex Round 1 P1 #3): a version reached via the
// active pointer or via an override's provenance is only ever trusted after
// `version.projectId === projectId` is checked. A pointer or provenance
// link to a version from a different Project is a data-integrity fault —
// it fails explicitly (`ok: false`), it is never silently downgraded to
// `mode: "none"` and never exposed to the caller. `"none"` is reserved
// exclusively for the legitimate case of no pointer row / no active
// version at all.
//
// Every stored snapshot (Project version or Sequence override) is
// re-validated at read time via parseStyleSnapshotFromJson and its
// compiledText is re-derived and compared against the stored value — a
// corrupted or hand-edited DB row is refused explicitly rather than served.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  projectStyleVersions,
  projectStyleActivePointers,
  sequenceStyleOverrides,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { compileStyleSnapshot } from "./compileStyleSnapshot";
import { parseStyleSnapshotFromJson } from "./validateStyleSnapshot";
import { isValidId } from "./validation";
import type { StyleSnapshot } from "./styleSnapshot";

/** The exact transaction-callback parameter type `db.transaction` accepts — lets every sync read helper below share the one active transaction instead of opening its own. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResolvedSequenceStyle =
  | {
      mode: "none";
      projectId: number;
      sequenceId: number;
      snapshot: null;
      compiledText: "";
    }
  | {
      mode: "inherited";
      projectId: number;
      sequenceId: number;
      projectVersionId: number;
      projectVersionNumber: number;
      snapshot: StyleSnapshot;
      compiledText: string;
    }
  | {
      mode: "override";
      projectId: number;
      sequenceId: number;
      overrideId: number;
      revision: number;
      sourceProjectVersionId: number;
      sourceProjectVersionNumber: number;
      snapshot: StyleSnapshot;
      compiledText: string;
    };

export type ResolveSequenceStyleResult = { ok: true; result: ResolvedSequenceStyle } | { ok: false; error: string };

export type ActiveProjectVersionRef = { id: number; versionNumber: number };

export type ResolveSequenceStyleWithActiveVersionResult =
  | { ok: true; resolved: ResolvedSequenceStyle; activeProjectVersion: ActiveProjectVersionRef | null }
  | { ok: false; error: string };

/** Parses `contentSnapshot` and refuses if its recompiled text does not byte-match the stored `compiledText` — catches DB corruption or a hand-edited row instead of silently serving mismatched content. */
function parseAndVerify(contentSnapshot: string, storedCompiledText: string): { ok: true; snapshot: StyleSnapshot } | { ok: false; error: string } {
  const parsed = parseStyleSnapshotFromJson(contentSnapshot);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (compileStyleSnapshot(parsed.snapshot) !== storedCompiledText) {
    return { ok: false, error: "Stored Style content does not match its compiled text — refusing to resolve." };
  }
  return { ok: true, snapshot: parsed.snapshot };
}

/** Reads the Project's active pointer and, if one is set, its target version — confined to this Project. Returns `version: null` only for the legitimate "no pointer row" / "no active version set" case. A pointer that resolves to a version missing entirely, or belonging to a different Project, is refused explicitly (`ok: false`) — never silently treated as "no active version". */
function readActiveProjectVersionSync(
  tx: Tx,
  projectId: number
): { ok: true; version: (ActiveProjectVersionRef & { contentSnapshot: string; compiledText: string }) | null } | { ok: false; error: string } {
  const pointerRows = tx
    .select()
    .from(projectStyleActivePointers)
    .where(eq(projectStyleActivePointers.projectId, projectId))
    .all() as unknown as (typeof projectStyleActivePointers.$inferSelect)[];
  const pointer = pointerRows[0];
  if (!pointer || !pointer.activeVersionId) return { ok: true, version: null };

  const versionRows = tx
    .select()
    .from(projectStyleVersions)
    .where(eq(projectStyleVersions.id, pointer.activeVersionId))
    .all() as unknown as (typeof projectStyleVersions.$inferSelect)[];
  const version = versionRows[0];
  if (!version) return { ok: false, error: "The Project's active Style pointer references a version that no longer exists." };
  if (version.projectId !== projectId) {
    return { ok: false, error: "The Project's active Style pointer references a version belonging to a different Project." };
  }

  return {
    ok: true,
    version: { id: version.id, versionNumber: version.versionNumber, contentSnapshot: version.contentSnapshot, compiledText: version.compiledText },
  };
}

/** The one place that reads ownership, override, its source version, the active pointer, and the active version — all inside the caller's single transaction, so the result is always one coherent snapshot in time. */
function resolveSequenceStyleWithActiveVersionSync(tx: Tx, projectId: number, sequenceId: number): ResolveSequenceStyleWithActiveVersionResult {
  const projectRows = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).all() as unknown as { id: number }[];
  if (!projectRows[0]) return { ok: false, error: "Project not found." };

  const sequenceRows = tx
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId))
    .all() as unknown as { id: number; projectId: number }[];
  const sequence = sequenceRows[0];
  if (!sequence || sequence.projectId !== projectId) return { ok: false, error: "Sequence not found in this Project." };

  const activeVersionRead = readActiveProjectVersionSync(tx, projectId);
  // A corrupted/cross-Project active pointer is a real fault regardless of
  // whether this Sequence has an override — propagate it immediately,
  // before branching on the override, so it can never be silently masked
  // by an otherwise-valid override (Codex Round 2 P1 #1).
  if (!activeVersionRead.ok) return { ok: false, error: activeVersionRead.error };
  const activeProjectVersion: ActiveProjectVersionRef | null = activeVersionRead.version
    ? { id: activeVersionRead.version.id, versionNumber: activeVersionRead.version.versionNumber }
    : null;

  const overrideRows = tx
    .select()
    .from(sequenceStyleOverrides)
    .where(eq(sequenceStyleOverrides.sequenceId, sequenceId))
    .all() as unknown as (typeof sequenceStyleOverrides.$inferSelect)[];
  const override = overrideRows[0];

  if (override) {
    const verified = parseAndVerify(override.contentSnapshot, override.compiledText);
    if (!verified.ok) return { ok: false, error: verified.error };

    const sourceRows = tx
      .select({ id: projectStyleVersions.id, versionNumber: projectStyleVersions.versionNumber, projectId: projectStyleVersions.projectId })
      .from(projectStyleVersions)
      .where(eq(projectStyleVersions.id, override.sourceProjectStyleVersionId))
      .all() as unknown as { id: number; versionNumber: number; projectId: number }[];
    const sourceVersion = sourceRows[0];
    if (!sourceVersion) return { ok: false, error: "Override references a missing source Style version." };
    if (sourceVersion.projectId !== projectId) {
      return { ok: false, error: "Override references a source Style version belonging to a different Project." };
    }

    return {
      ok: true,
      resolved: {
        mode: "override",
        projectId,
        sequenceId,
        overrideId: override.id,
        revision: override.revision,
        sourceProjectVersionId: sourceVersion.id,
        sourceProjectVersionNumber: sourceVersion.versionNumber,
        snapshot: verified.snapshot,
        compiledText: override.compiledText,
      },
      activeProjectVersion,
    };
  }

  // No override: this Sequence inherits the active pointer read above. Its
  // fault case was already propagated before the override branch, so only
  // the legitimate "no active version" case reaches here.
  if (!activeVersionRead.version) {
    return { ok: true, resolved: { mode: "none", projectId, sequenceId, snapshot: null, compiledText: "" }, activeProjectVersion: null };
  }

  const verified = parseAndVerify(activeVersionRead.version.contentSnapshot, activeVersionRead.version.compiledText);
  if (!verified.ok) return { ok: false, error: verified.error };

  return {
    ok: true,
    resolved: {
      mode: "inherited",
      projectId,
      sequenceId,
      projectVersionId: activeVersionRead.version.id,
      projectVersionNumber: activeVersionRead.version.versionNumber,
      snapshot: verified.snapshot,
      compiledText: activeVersionRead.version.compiledText,
    },
    activeProjectVersion,
  };
}

/** Public atomic entry point: ownership + override + source + pointer + version, resolved from one single-transaction snapshot — the shared source of truth for resolveSequenceStyle, resolveShotStyle, and the read model in src/actions/sequenceStyle.ts (which must never re-derive `activeProjectVersion` from a second, separate query). */
export async function resolveSequenceStyleWithActiveVersion(
  projectId: number,
  sequenceId: number
): Promise<ResolveSequenceStyleWithActiveVersionResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(sequenceId)) return { ok: false, error: "Invalid sequence id." };

  return db.transaction((tx) => resolveSequenceStyleWithActiveVersionSync(tx, projectId, sequenceId));
}

export async function resolveSequenceStyle(projectId: number, sequenceId: number): Promise<ResolveSequenceStyleResult> {
  const core = await resolveSequenceStyleWithActiveVersion(projectId, sequenceId);
  if (!core.ok) return core;
  return { ok: true, result: core.resolved };
}

/** Verifies Project -> Sequence -> Shot ownership, then delegates entirely to the same atomic core — never re-implements override/inheritance logic, since a Shot has no Style of its own, and never produces a different snapshot-in-time than its Sequence. */
export async function resolveShotStyle(projectId: number, sequenceId: number, shotId: number): Promise<ResolveSequenceStyleResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(sequenceId)) return { ok: false, error: "Invalid sequence id." };
  if (!isValidId(shotId)) return { ok: false, error: "Invalid shot id." };

  return db.transaction((tx) => {
    const shotRows = tx
      .select({ id: shots.id, sequenceId: shots.sequenceId })
      .from(shots)
      .where(eq(shots.id, shotId))
      .all() as unknown as { id: number; sequenceId: number }[];
    const shot = shotRows[0];
    if (!shot || shot.sequenceId !== sequenceId) return { ok: false, error: "Shot not found in this Sequence." };

    const core = resolveSequenceStyleWithActiveVersionSync(tx, projectId, sequenceId);
    if (!core.ok) return core;
    return { ok: true, result: core.resolved };
  });
}

// ---------------------------------------------------------------------------
// STYLE.1.E.CORE.1 — canonical active Project Style resolver, for the
// `asset` generation consumer (Asset generation resolves the active
// published Project Style directly, never through a Sequence). This is
// NOT a second inheritance resolver: it reuses the exact same
// `readActiveProjectVersionSync` pointer/corruption-guard logic already
// defined above, inside its own single-transaction read, and is the only
// additive export this ticket adds to this file.
// ---------------------------------------------------------------------------

export type ResolvedProjectStyle =
  | { mode: "none"; projectId: number }
  | {
      mode: "active";
      projectId: number;
      versionId: number;
      versionNumber: number;
      snapshot: StyleSnapshot;
      compiledText: string;
    };

export type ResolveActiveProjectStyleResult = { ok: true; result: ResolvedProjectStyle } | { ok: false; error: string };

/** The canonical resolver for the `asset` generation consumer: the Project's currently active published Style version, or `mode: "none"` when no version is active. Never involves a Sequence, an override, or any inheritance branching — reuses the same pointer read and corruption guard as `resolveSequenceStyle` above. */
export async function resolveActiveProjectStyle(projectId: number): Promise<ResolveActiveProjectStyleResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };

  return db.transaction((tx) => {
    const projectRows = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).all() as unknown as { id: number }[];
    if (!projectRows[0]) return { ok: false, error: "Project not found." };

    const activeVersionRead = readActiveProjectVersionSync(tx, projectId);
    if (!activeVersionRead.ok) return { ok: false, error: activeVersionRead.error };
    if (!activeVersionRead.version) return { ok: true, result: { mode: "none", projectId } };

    const verified = parseAndVerify(activeVersionRead.version.contentSnapshot, activeVersionRead.version.compiledText);
    if (!verified.ok) return { ok: false, error: verified.error };

    return {
      ok: true,
      result: {
        mode: "active",
        projectId,
        versionId: activeVersionRead.version.id,
        versionNumber: activeVersionRead.version.versionNumber,
        snapshot: verified.snapshot,
        compiledText: activeVersionRead.version.compiledText,
      },
    };
  });
}
