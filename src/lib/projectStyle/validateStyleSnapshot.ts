// ---------------------------------------------------------------------------
// validateStyleSnapshot.ts — STYLE.1.D.CORE
//
// Pure, bounded runtime parser for `StyleSnapshot` (src/lib/projectStyle/
// styleSnapshot.ts). Two untrusted sources hit this boundary:
//   - `sequence_style_overrides.content_snapshot` read back from the DB
//     (a prior write, a manual DB edit, or DB corruption could all produce
//     something that no longer matches the type);
//   - a raw snapshot payload received by a Server Action from the network.
// Neither is a plain TS type check — this walks the actual value at runtime
// and rejects anything that does not match exactly:
//   - exact key sets only (no arbitrary/extra properties tolerated);
//   - exact types and exact enum members;
//   - bounded arrays and bounded strings (a forged or corrupted payload
//     cannot exhaust memory or storage through this parser);
//   - strict nullable handling (`null` accepted only where the type says
//     `| null`, never `undefined` standing in for it);
//   - no special prototype (`Object.create(null)` / class instances / a
//     `__proto__` payload key are all refused, not silently accepted).
// This module never mutates, never throws for a malformed value — every
// path returns a discriminated result.
// ---------------------------------------------------------------------------

import type {
  StylePillar,
  StylePillarSnapshot,
  StyleRuleSnapshot,
  StyleRuleStatus,
  StyleRuleStrength,
  StyleSectionSnapshot,
  StyleSnapshot,
} from "./styleSnapshot";

export const MAX_SHORT_TEXT_LENGTH = 500;
export const MAX_LONG_TEXT_LENGTH = 20_000;
export const MAX_SECTIONS_PER_PILLAR = 100;
export const MAX_RULES = 1_000;

export type ParseStyleSnapshotResult = { ok: true; snapshot: StyleSnapshot } | { ok: false; error: string };

const STYLE_PILLARS: readonly StylePillar[] = ["world", "visual"];
const STYLE_RULE_STRENGTHS: readonly StyleRuleStrength[] = ["Required", "Preferred", "Avoid"];
const STYLE_RULE_STATUSES: readonly StyleRuleStatus[] = ["approved", "disabled"];

/** A plain JSON object: no array, no null, no class instance, no null-prototype object, no `__proto__`-shaped payload. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

/** Refuses any object carrying a property outside the exact expected key set — the "no arbitrary properties" rule. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return actual.every((k) => keys.includes(k));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isBoundedNullableString(value: unknown, maxLength: number): value is string | null {
  return value === null || isBoundedString(value, maxLength);
}

function isEnumMember<T extends string>(value: unknown, members: readonly T[]): value is T {
  return typeof value === "string" && (members as readonly string[]).includes(value);
}

function isNullableEnumMember<T extends string>(value: unknown, members: readonly T[]): value is T | null {
  return value === null || isEnumMember(value, members);
}

const SECTION_KEYS = ["heading", "content"] as const;

function parseSection(value: unknown): StyleSectionSnapshot | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, SECTION_KEYS)) return null;
  if (!isBoundedString(value.heading, MAX_SHORT_TEXT_LENGTH)) return null;
  if (!isBoundedString(value.content, MAX_LONG_TEXT_LENGTH)) return null;
  return { heading: value.heading, content: value.content };
}

const PILLAR_SNAPSHOT_KEYS = ["generalDirection", "negativeConstraints", "sections"] as const;

function parsePillarSnapshot(value: unknown): StylePillarSnapshot | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, PILLAR_SNAPSHOT_KEYS)) return null;
  if (!isBoundedNullableString(value.generalDirection, MAX_LONG_TEXT_LENGTH)) return null;
  if (!isBoundedNullableString(value.negativeConstraints, MAX_LONG_TEXT_LENGTH)) return null;
  if (!Array.isArray(value.sections) || value.sections.length > MAX_SECTIONS_PER_PILLAR) return null;

  const sections: StyleSectionSnapshot[] = [];
  for (const raw of value.sections) {
    const section = parseSection(raw);
    if (!section) return null;
    sections.push(section);
  }
  return { generalDirection: value.generalDirection, negativeConstraints: value.negativeConstraints, sections };
}

const RULE_KEYS = [
  "instruction",
  "pillar",
  "section",
  "category",
  "strength",
  "applicability",
  "provenanceNotes",
  "status",
] as const;

function parseRule(value: unknown): StyleRuleSnapshot | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, RULE_KEYS)) return null;
  if (!isBoundedString(value.instruction, MAX_LONG_TEXT_LENGTH)) return null;
  if (!isNullableEnumMember(value.pillar, STYLE_PILLARS)) return null;
  if (!isBoundedNullableString(value.section, MAX_SHORT_TEXT_LENGTH)) return null;
  if (!isBoundedNullableString(value.category, MAX_SHORT_TEXT_LENGTH)) return null;
  if (!isNullableEnumMember(value.strength, STYLE_RULE_STRENGTHS)) return null;
  if (!isBoundedNullableString(value.applicability, MAX_SHORT_TEXT_LENGTH)) return null;
  if (!isBoundedNullableString(value.provenanceNotes, MAX_LONG_TEXT_LENGTH)) return null;
  if (!isEnumMember(value.status, STYLE_RULE_STATUSES)) return null;

  return {
    instruction: value.instruction,
    pillar: value.pillar,
    section: value.section,
    category: value.category,
    strength: value.strength,
    applicability: value.applicability,
    provenanceNotes: value.provenanceNotes,
    status: value.status,
  };
}

const SNAPSHOT_KEYS = ["directionBrief", "world", "visual", "rules"] as const;

/** Structural parse only — does not check the snapshot against any compiled text; see assertSnapshotMatchesCompiledText for that pairing. */
export function parseStyleSnapshot(value: unknown): ParseStyleSnapshotResult {
  if (!isPlainObject(value)) return { ok: false, error: "Style snapshot must be a plain JSON object." };
  if (!hasExactKeys(value, SNAPSHOT_KEYS)) return { ok: false, error: "Style snapshot has unexpected or missing keys." };
  if (!isBoundedNullableString(value.directionBrief, MAX_LONG_TEXT_LENGTH)) {
    return { ok: false, error: "Invalid directionBrief." };
  }

  const world = parsePillarSnapshot(value.world);
  if (!world) return { ok: false, error: "Invalid world pillar." };
  const visual = parsePillarSnapshot(value.visual);
  if (!visual) return { ok: false, error: "Invalid visual pillar." };

  if (!Array.isArray(value.rules) || value.rules.length > MAX_RULES) {
    return { ok: false, error: "Invalid or oversized rules array." };
  }
  const rules: StyleRuleSnapshot[] = [];
  for (const raw of value.rules) {
    const rule = parseRule(raw);
    if (!rule) return { ok: false, error: "Invalid rule entry." };
    rules.push(rule);
  }

  return { ok: true, snapshot: { directionBrief: value.directionBrief, world, visual, rules } };
}

/** Parses a JSON string (e.g. a DB `content_snapshot` column) into a validated StyleSnapshot — refuses malformed JSON and malformed snapshots alike, never throws. */
export function parseStyleSnapshotFromJson(json: string): ParseStyleSnapshotResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Stored Style snapshot is not valid JSON." };
  }
  return parseStyleSnapshot(parsed);
}
