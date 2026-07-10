// ---------------------------------------------------------------------------
// Editorial structural snapshot / fingerprint (OPENREEL.CONFLICT.1)
//
// Produces a deterministic fingerprint of a sequence's editorial structure
// at a point in time, and compares two fingerprints to detect staleness.
//
// Scope, per docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md §9: this is the shared
// mechanism meant to protect (1) the existing start-only timing patch,
// (2) a future publish-Sequence-Result flow, (3) a future insert-shot
// flow, and (4) a future push-duration-to-MikAI flow — from being applied
// against a sequence structure that has since changed elsewhere. This
// ticket only wires it into (1); the other three remain future work.
//
// Deliberately built from EditorialDocument (the same read model both the
// export route and the timing-patch route already build), not from the
// raw DB rows or the full mikai-editorial-export-v1 payload — this keeps
// the fingerprint's inputs identical at export time and at validate/apply
// time by construction, and naturally excludes fields EditorialDocumentItem
// never carries (prompt, description) without needing an explicit
// exclude-list.
//
// Included in the fingerprint: sequenceId, trackIndex, item id, shotId,
// startSeconds, durationSeconds, trimInSeconds, trimOutSeconds, status
// (which already reflects approved/missing/placeholder — i.e. media
// presence — see editorialDocument.ts's getEditorialItemStatus), and the
// items' relative order (encoded by array order itself, plus an explicit
// re-sort below so the fingerprint never depends on incidental iteration
// order).
//
// Deliberately excluded: exportedAt/generatedAt (this module's own
// timestamp is never hashed), title/shotCode (renaming a shot is not a
// structural change that should invalidate an in-flight patch), and
// updatedAt (a DB bookkeeping timestamp, not editorial structure — see
// OPENREEL.V1.USERTEST's finding that updatedAt is bumped on every applied
// item regardless of whether its value changed, which would make it a
// source of false-positive staleness if included here).
// ---------------------------------------------------------------------------

import { createHash } from "crypto";
import type { EditorialDocument } from "./editorialDocument";

export const EDITORIAL_SNAPSHOT_SCHEMA_VERSION = "mikai-editorial-snapshot-v1";

export type EditorialSnapshot = {
  schemaVersion: "mikai-editorial-snapshot-v1";
  fingerprint: string;
  itemCount: number;
  generatedAt: string;
};

/** Positional tuple, not an object — field order is the canonical order, so no key-ordering ambiguity in the hashed JSON. */
type CanonicalItem = [
  sequenceId: number,
  trackIndex: number,
  id: number,
  shotId: number | null,
  startSeconds: number,
  durationSeconds: number,
  trimInSeconds: number | null,
  trimOutSeconds: number | null,
  status: string | null,
];

/**
 * Deterministic sha256 fingerprint of a sequence's structurally-relevant
 * editorial state. Two calls with equivalent (sequenceId, document) content
 * always produce the same fingerprint, regardless of incidental iteration
 * order — the canonical item list is explicitly sorted before hashing.
 */
export function computeEditorialFingerprint(args: {
  sequenceId: number;
  document: EditorialDocument;
}): string {
  const { sequenceId, document } = args;
  const canonicalItems: CanonicalItem[] = [];

  for (const track of document.tracks) {
    for (const item of track.items) {
      // Gaps are derived, never stored/exported as their own entity (see
      // editorialDocument.ts's deriveEmptySpaces doc) — excluded here too,
      // consistent with the export contract only ever carrying shot items.
      if (item.sourceType !== "shot") continue;
      canonicalItems.push([
        sequenceId,
        item.trackIndex,
        item.id,
        item.shotId,
        item.start,
        item.duration,
        item.trimIn ?? null,
        item.trimOut ?? null,
        item.status ?? null,
      ]);
    }
  }

  canonicalItems.sort((a, b) => a[1] - b[1] || a[2] - b[2]); // trackIndex, then id

  const canonicalJson = JSON.stringify(canonicalItems);
  return createHash("sha256").update(canonicalJson).digest("hex");
}

/** itemCount mirrors computeEditorialFingerprint's own filtering (shot items only). */
function countShotItems(document: EditorialDocument): number {
  return document.tracks.reduce(
    (sum, track) => sum + track.items.filter((item) => item.sourceType === "shot").length,
    0
  );
}

/**
 * Builds a full EditorialSnapshot (fingerprint + bookkeeping fields) for a
 * sequence's current EditorialDocument. `generatedAt` is metadata only —
 * never part of the hashed input, see computeEditorialFingerprint.
 */
export function buildEditorialSnapshot(args: {
  sequenceId: number;
  document: EditorialDocument;
  generatedAt?: string;
}): EditorialSnapshot {
  return {
    schemaVersion: EDITORIAL_SNAPSHOT_SCHEMA_VERSION,
    fingerprint: computeEditorialFingerprint(args),
    itemCount: countShotItems(args.document),
    generatedAt: args.generatedAt ?? new Date().toISOString(),
  };
}

export type EditorialSnapshotMismatch = {
  message: string;
  expectedFingerprint: string;
  currentFingerprint: string;
  expectedItemCount: number;
  currentItemCount: number;
};

/**
 * Compares a patch's declared source snapshot against the sequence's
 * current snapshot. `ok: false` means the sequence's editorial structure
 * has changed since the source snapshot was taken — the caller should
 * refuse to apply (or even validate as passable) whatever decision was
 * built against the stale snapshot.
 */
export function compareEditorialSnapshot(args: {
  sourceSnapshot: EditorialSnapshot;
  currentSnapshot: EditorialSnapshot;
}): { ok: true } | { ok: false; mismatch: EditorialSnapshotMismatch } {
  const { sourceSnapshot, currentSnapshot } = args;
  if (sourceSnapshot.fingerprint === currentSnapshot.fingerprint) {
    return { ok: true };
  }
  return {
    ok: false,
    mismatch: {
      message:
        "Sequence has changed since it was opened in OpenReel. Reload the Advanced Editor before applying changes.",
      expectedFingerprint: sourceSnapshot.fingerprint,
      currentFingerprint: currentSnapshot.fingerprint,
      expectedItemCount: sourceSnapshot.itemCount,
      currentItemCount: currentSnapshot.itemCount,
    },
  };
}
