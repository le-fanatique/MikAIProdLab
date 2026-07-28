// ---------------------------------------------------------------------------
// fingerprint.ts — STYLE.1.F.CORE
//
// Deterministic Asset content fingerprint over the five editable fields
// (ASSET_ALIGNMENT_EDITABLE_FIELDS). Pure: no DB, no clock, no randomness —
// the same five values always hash to the same string, on any machine.
//
// Used both as the "baseline fingerprint" returned alongside a temporary
// proposal (never persisted itself) and as the "post-review fingerprint"
// stored in the alignment marker row — the apply action recomputes this
// fresh from the DB inside its transaction and compares it against the
// caller-supplied baseline to detect a stale apply.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { ASSET_ALIGNMENT_EDITABLE_FIELDS } from "./contracts";

type AssetAlignmentEditableFieldKey = (typeof ASSET_ALIGNMENT_EDITABLE_FIELDS)[number];

/** SQLite `text` columns store `null` for "never set" — distinct from an explicit empty string. JSON.stringify already tells the two apart (`null` vs `""`), and escapes quotes/backslashes/control characters so no field value can forge a delimiter collision with a neighboring field. Always built from the exact values a caller is about to read from, or just wrote to, the DB — never from the free-form proposal's `""`-only field values directly (see `normalizeAlignmentFieldForStorage`). */
export type AssetAlignmentFingerprintInput = Record<AssetAlignmentEditableFieldKey, string | null>;

/** Fixed field order (ASSET_ALIGNMENT_EDITABLE_FIELDS) — never derived from `Object.keys`, whose iteration order for string keys is insertion order and must not be trusted as a hashing contract. */
export function computeAssetContentFingerprint(fields: AssetAlignmentFingerprintInput): string {
  const ordered = ASSET_ALIGNMENT_EDITABLE_FIELDS.map((field) => fields[field]);
  const canonical = JSON.stringify(ordered);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

/** A caller-supplied fingerprint is untrusted input crossing a Server Action boundary — validate its shape before ever comparing it. */
export function isWellFormedFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

/** Mirrors the existing `description.trim() || null` normalization already used by `updateAssetDetailsInline` (src/actions/assets.ts) — the apply action must fingerprint the exact value it writes, not a value that only resembles it. */
export function normalizeAlignmentFieldForStorage(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
