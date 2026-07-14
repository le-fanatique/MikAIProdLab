/**
 * Custom palette JSON import (THEME.CUSTOM.IMPORT.1). Pure parser — no DOM,
 * no localStorage, no server persistence. Reuses MIKROS_TOKEN_KEYS and
 * isValidHexColor from mikrosTheme.ts as the single source of truth for
 * which tokens exist and what a valid value looks like.
 */

import { MIKROS_TOKEN_KEYS, isValidHexColor, type MikrosPalette } from "@/lib/mikrosTheme";

export type MikrosThemeImportResult =
  | { ok: true; tokens: MikrosPalette; name: string | null; topBarColor: string | null }
  | { ok: false; error: string };

// Generous cap against pathological input — a real 8-token file is a few
// hundred bytes.
const MAX_IMPORT_TEXT_LENGTH = 20_000;
const MAX_IMPORT_NAME_LENGTH = 80;

/**
 * Parses and validates a Custom palette JSON import. Never uses eval or any
 * dynamic code execution — JSON.parse only. Only the eight known token keys
 * (read via Object.hasOwn, never a bare property access that could resolve
 * through the prototype chain) ever reach the returned palette, so an
 * unknown key or a prototype-polluting key (e.g. "__proto__") can never
 * leak into the draft.
 */
export function parseMikrosThemeImportJson(rawText: string): MikrosThemeImportResult {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (rawText.length > MAX_IMPORT_TEXT_LENGTH) {
    return { ok: false, error: "The file is too large to be a palette." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "The JSON root must be an object." };
  }
  const root = parsed as Record<string, unknown>;

  const tokensRaw = Object.hasOwn(root, "tokens") ? root.tokens : undefined;
  if (typeof tokensRaw !== "object" || tokensRaw === null || Array.isArray(tokensRaw)) {
    return { ok: false, error: 'The JSON must include a "tokens" object.' };
  }
  const tokensObj = tokensRaw as Record<string, unknown>;

  const tokens = {} as MikrosPalette;
  for (const key of MIKROS_TOKEN_KEYS) {
    const value = Object.hasOwn(tokensObj, key) ? tokensObj[key] : undefined;
    if (!isValidHexColor(value)) {
      return { ok: false, error: `"tokens.${key}" must be a 6-digit hex color, e.g. #9079f2.` };
    }
    tokens[key] = value;
  }

  let name: string | null = null;
  if (Object.hasOwn(root, "name") && root.name !== undefined) {
    if (typeof root.name !== "string") {
      return { ok: false, error: '"name" must be text.' };
    }
    const trimmed = root.name.trim();
    name = trimmed.length > 0 ? trimmed.slice(0, MAX_IMPORT_NAME_LENGTH) : null;
  }

  // Top bar color (THEME.TOPBAR.MASK.1) is an optional 9th field, deliberately
  // outside MIKROS_TOKEN_KEYS: absent means "no override" (falls back to
  // Surface elsewhere), exactly like an older JSON file that predates this
  // token. If present, it must still be a valid hex — same per-field error
  // contract as the eight required tokens.
  let topBarColor: string | null = null;
  if (Object.hasOwn(tokensObj, "topBar") && tokensObj.topBar !== undefined) {
    if (!isValidHexColor(tokensObj.topBar)) {
      return { ok: false, error: '"tokens.topBar" must be a 6-digit hex color, e.g. #9079f2.' };
    }
    topBarColor = tokensObj.topBar;
  }

  return { ok: true, tokens, name, topBarColor };
}
