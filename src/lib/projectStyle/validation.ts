// ---------------------------------------------------------------------------
// validation.ts — STYLE.1.A retake (Codex P1)
//
// Runtime validators for every value a Server Action receives from the
// client. TypeScript's compile-time enum types (StylePillar,
// StyleRuleStrength, ...) give zero runtime protection — a Server Action
// endpoint is a real network boundary a forged request can hit directly
// with any JSON body, bypassing the TS type entirely. The Drizzle SQLite
// `text(..., { enum: [...] })` column type is also TS-only here: it does
// not emit a SQL `CHECK` constraint, so an unvalidated write can persist a
// value like `pillar: "other"` that then silently disappears from every
// snapshot (`buildStyleSnapshotFromRows` only recognizes "world"/"visual").
// Every Server Action in projectStyle.ts must run these checks BEFORE any
// DB write and refuse (english error, zero mutation) on failure.
// ---------------------------------------------------------------------------

import type { StylePillar, StyleRuleStrength } from "./styleSnapshot";

export const STYLE_PILLARS = ["world", "visual"] as const;
export const STYLE_RULE_STRENGTHS = ["Required", "Preferred", "Avoid"] as const;
export const REORDER_DIRECTIONS = ["up", "down"] as const;
export type ReorderDirection = (typeof REORDER_DIRECTIONS)[number];

const MAX_ID = 2_147_483_647;

export function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID;
}

/** A committed draft revision is always >= 1 (drafts are created at revision 1 and only ever incremented). */
export function isValidRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_ID;
}

/** `null` means "caller believes no draft exists yet" — the only other accepted shape is a real committed revision. */
export function isValidNullableExpectedRevision(value: unknown): value is number | null {
  return value === null || isValidRevision(value);
}

export function isValidPillar(value: unknown): value is StylePillar {
  return typeof value === "string" && (STYLE_PILLARS as readonly string[]).includes(value);
}

export function isValidNullablePillar(value: unknown): value is StylePillar | null {
  return value === null || isValidPillar(value);
}

export function isValidStrength(value: unknown): value is StyleRuleStrength {
  return typeof value === "string" && (STYLE_RULE_STRENGTHS as readonly string[]).includes(value);
}

export function isValidNullableStrength(value: unknown): value is StyleRuleStrength | null {
  return value === null || isValidStrength(value);
}

export function isValidReorderDirection(value: unknown): value is ReorderDirection {
  return value === "up" || value === "down";
}

/** A free-text optional field: either a real string (to be trimmed/normalized by the caller) or explicitly null — never any other type. */
export function isValidOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isValidRequiredText(value: unknown): value is string {
  return typeof value === "string";
}
