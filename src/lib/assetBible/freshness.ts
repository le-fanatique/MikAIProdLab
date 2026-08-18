// ---------------------------------------------------------------------------
// freshness.ts — SCHEMA.BIBLE_FRESHNESS.1 (S1b)
//
// Deterministic fingerprint of an Asset's `description`/`notes`, captured at
// the moment its Asset Bible (`visualIdentity`/`usageRules`/
// `forbiddenVariations`) is written, and a pure reader that compares the
// stored fingerprint against the Asset's live `description`/`notes` to
// answer "is this Bible still current".
//
// Deliberate sibling of `computeAssetContentFingerprint`
// (`src/lib/projectStyle/assetAlignment/fingerprint.ts`), not an extension of
// it: that function hashes five fields in a fixed order and its output is
// already stored, unmodifiable, in `asset_style_alignments` rows — widening
// it to a sixth field or a different order would change every fingerprint it
// has ever produced, silently marking every already-reviewed Asset as
// desynced from the Project Style. This module reuses only the *model*
// (`createHash("sha256")` over a canonical JSON array, fixed and declared
// field order, `null` distinct from `""`) with its own two-field order,
// declared once below and never derived from `Object.keys`.
//
// Same discipline as that sibling: informative only, never the source of
// truth of `description`/`notes`, never a gate on any write.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

const BIBLE_SOURCE_FINGERPRINT_FIELD_ORDER = ["description", "notes"] as const;

export type AssetBibleSourceFields = {
  description: string | null;
  notes: string | null;
};

/** Fixed field order (`BIBLE_SOURCE_FINGERPRINT_FIELD_ORDER`) — never derived from `Object.keys`. `JSON.stringify` already tells `null` apart from `""` and escapes any delimiter-colliding character in either field. */
export function computeBibleSourceFingerprint(fields: AssetBibleSourceFields): string {
  const ordered = BIBLE_SOURCE_FINGERPRINT_FIELD_ORDER.map((field) => fields[field]);
  const canonical = JSON.stringify(ordered);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type AssetBibleFreshness = "no-bible" | "current" | "stale";

export type AssetBibleFreshnessInput = AssetBibleSourceFields & {
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
  bibleSourceFingerprint: string | null;
};

/**
 * Pure read model, no DB/network/clock. Three states:
 * - `"no-bible"` — all three Bible fields are null: nothing to warn about.
 * - `"current"` — a Bible exists and the stored fingerprint matches the live
 *   `description`/`notes`.
 * - `"stale"` — a Bible exists and either the fingerprint no longer matches
 *   the live `description`/`notes`, or no fingerprint was ever stored (every
 *   Asset Bible written before this column existed). A doubtful state always
 *   resolves to `"stale"`, never to silent `"current"`.
 */
export function readAssetBibleFreshness(input: AssetBibleFreshnessInput): AssetBibleFreshness {
  const hasBible = input.visualIdentity != null || input.usageRules != null || input.forbiddenVariations != null;
  if (!hasBible) return "no-bible";

  if (input.bibleSourceFingerprint == null) return "stale";

  const live = computeBibleSourceFingerprint({ description: input.description, notes: input.notes });
  return live === input.bibleSourceFingerprint ? "current" : "stale";
}
