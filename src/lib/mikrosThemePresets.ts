// UX.PRODUCTIVITY.POLISH.1 — Lot B. Pure parsing/normalization for the
// server-durable Custom Appearance presets document. No I/O. Reuses the
// pure validators (`isValidHexColor`, `isValidFontFamilyName`, etc.) and
// `CustomTheme` type from mikrosTheme.ts, but parses entries through its
// OWN strict entry parser (`parseCustomThemeEntryStrict` below) — see that
// function's comment for why this document intentionally does not reuse
// `parseCustomThemeEntry`'s tolerant defaulting behavior. Shared by the
// read model (src/lib/settings.ts), the Server Actions
// (src/actions/themePresets.ts) and the client UI
// (src/components/ThemeModeToggle.tsx).

import {
  isValidThemeId,
  isValidHexColor,
  isValidFontFamilyName,
  isValidLogoDataUrl,
  isValidFontWeight,
  isValidFontStyle,
  MIKROS_TOKEN_KEYS,
  MIKROS_DEFAULT_DISPLAY_FONT,
  MIKROS_DEFAULT_BODY_FONT,
  MIKROS_DEFAULT_TYPOGRAPHY_DETAILS,
  MIKROS_DISPLAY_FONT_SIZE_MIN_PX,
  MIKROS_DISPLAY_FONT_SIZE_MAX_PX,
  MIKROS_BODY_FONT_SIZE_MIN_PX,
  MIKROS_BODY_FONT_SIZE_MAX_PX,
  type CustomTheme,
  type MikrosPalette,
  type MikrosTypographyDetails,
} from "@/lib/mikrosTheme";

export const CUSTOM_THEME_PRESETS_SETTINGS_KEY = "mikros_custom_theme_presets_v1";

/** Bounds the number of themes durably stored — each theme may embed up to three ~512KB images, so this also bounds worst-case document size. */
export const CUSTOM_THEME_PRESETS_MAX_COUNT = 30;

/** Hard cap on the serialized document, independent of the per-theme image limits already enforced by mikrosTheme.ts — guards against a pathological write. */
export const CUSTOM_THEME_PRESETS_MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export interface CustomThemePresetsDocument {
  version: 1;
  revision: number;
  themes: CustomTheme[];
}

export function emptyCustomThemePresetsDocument(): CustomThemePresetsDocument {
  return { version: 1, revision: 0, themes: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const THEME_ENTRY_ALLOWED_KEYS = new Set([
  "id",
  "name",
  "tokens",
  "displayFont",
  "bodyFont",
  "typography",
  "logo",
  "topBarTexture",
  "previewTexture",
  "topBarColor",
]);

function isStrictTypography(value: unknown): value is MikrosTypographyDetails {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  const allowed = ["displayFontSizePx", "displayFontWeight", "displayFontStyle", "bodyFontSizePx", "bodyFontWeight", "bodyFontStyle"];
  if (keys.length !== allowed.length || !allowed.every((k) => Object.hasOwn(value, k))) return false;
  const d = value as Record<string, unknown>;
  if (typeof d.displayFontSizePx !== "number" || !Number.isInteger(d.displayFontSizePx)) return false;
  if (d.displayFontSizePx < MIKROS_DISPLAY_FONT_SIZE_MIN_PX || d.displayFontSizePx > MIKROS_DISPLAY_FONT_SIZE_MAX_PX) return false;
  if (!isValidFontWeight(d.displayFontWeight)) return false;
  if (!isValidFontStyle(d.displayFontStyle)) return false;
  if (typeof d.bodyFontSizePx !== "number" || !Number.isInteger(d.bodyFontSizePx)) return false;
  if (d.bodyFontSizePx < MIKROS_BODY_FONT_SIZE_MIN_PX || d.bodyFontSizePx > MIKROS_BODY_FONT_SIZE_MAX_PX) return false;
  if (!isValidFontWeight(d.bodyFontWeight)) return false;
  if (!isValidFontStyle(d.bodyFontStyle)) return false;
  return true;
}

/**
 * Strict entry parser for the DURABLE server document — deliberately
 * distinct from `parseCustomThemeEntry` (mikrosTheme.ts), which stays
 * tolerant on purpose for the per-browser localStorage cache (a legacy
 * theme missing a field added by a later ticket must still load there).
 * Here, a field that is ABSENT is backward-compatible (defaults applied,
 * matching pre-ticket documents that never had it) — but a field that IS
 * PRESENT and invalid rejects the WHOLE entry rather than being silently
 * replaced by a default. Also rejects unknown keys at the entry level.
 * Never throws; returns null for any rejection.
 */
function parseCustomThemeEntryStrict(raw: unknown): CustomTheme | null {
  if (!isPlainObject(raw)) return null;
  if (!Object.keys(raw).every((k) => THEME_ENTRY_ALLOWED_KEYS.has(k))) return null;
  if (!Object.hasOwn(raw, "id") || !Object.hasOwn(raw, "name") || !Object.hasOwn(raw, "tokens")) return null;

  if (!isValidThemeId(raw.id)) return null;
  if (typeof raw.name !== "string" || raw.name.trim().length === 0 || raw.name.length > CUSTOM_THEME_NAME_MAX_LENGTH) return null;

  if (!isPlainObject(raw.tokens)) return null;
  const tokenKeys = Object.keys(raw.tokens);
  if (tokenKeys.length !== MIKROS_TOKEN_KEYS.length || !MIKROS_TOKEN_KEYS.every((k) => Object.hasOwn(raw.tokens as object, k))) return null;
  const tokens = {} as MikrosPalette;
  for (const key of MIKROS_TOKEN_KEYS) {
    const v = (raw.tokens as Record<string, unknown>)[key];
    if (!isValidHexColor(v)) return null;
    tokens[key] = v;
  }

  let displayFont = MIKROS_DEFAULT_DISPLAY_FONT;
  if (Object.hasOwn(raw, "displayFont")) {
    if (typeof raw.displayFont !== "string" || !isValidFontFamilyName(raw.displayFont)) return null;
    displayFont = raw.displayFont.trim();
  }
  let bodyFont = MIKROS_DEFAULT_BODY_FONT;
  if (Object.hasOwn(raw, "bodyFont")) {
    if (typeof raw.bodyFont !== "string" || !isValidFontFamilyName(raw.bodyFont)) return null;
    bodyFont = raw.bodyFont.trim();
  }

  let typography: MikrosTypographyDetails = MIKROS_DEFAULT_TYPOGRAPHY_DETAILS;
  if (Object.hasOwn(raw, "typography")) {
    if (!isStrictTypography(raw.typography)) return null;
    typography = raw.typography;
  }

  let logo: string | null = null;
  if (Object.hasOwn(raw, "logo")) {
    if (raw.logo !== null && !isValidLogoDataUrl(raw.logo)) return null;
    logo = raw.logo as string | null;
  }
  let topBarTexture: string | null = null;
  if (Object.hasOwn(raw, "topBarTexture")) {
    if (raw.topBarTexture !== null && !isValidLogoDataUrl(raw.topBarTexture)) return null;
    topBarTexture = raw.topBarTexture as string | null;
  }
  let previewTexture: string | null = null;
  if (Object.hasOwn(raw, "previewTexture")) {
    if (raw.previewTexture !== null && !isValidLogoDataUrl(raw.previewTexture)) return null;
    previewTexture = raw.previewTexture as string | null;
  }
  let topBarColor: string | null = null;
  if (Object.hasOwn(raw, "topBarColor")) {
    if (raw.topBarColor !== null && !isValidHexColor(raw.topBarColor)) return null;
    topBarColor = raw.topBarColor as string | null;
  }

  return { id: raw.id, name: raw.name.trim(), tokens, displayFont, bodyFont, typography, logo, topBarTexture, previewTexture, topBarColor };
}

export type ParsedCustomThemePresetsResult =
  | { ok: true; document: CustomThemePresetsDocument }
  | { ok: false; error: string };

/**
 * Parses the raw `app_settings.value` string for
 * `CUSTOM_THEME_PRESETS_SETTINGS_KEY`. Never throws, but distinguishes two
 * very different situations:
 *
 * - the row simply doesn't exist yet (`raw` is null/undefined) — nothing has
 *   ever been saved, so this returns `{ok:true}` with an empty document;
 * - the row EXISTS but is corrupted in any way (broken JSON, wrong
 *   version/shape, a malformed entry, a duplicate id, or a collection over
 *   the cap) — this returns `{ok:false}` explicitly. Callers that mutate
 *   (`mutateCustomThemePresets`, `importLegacyCustomThemePresets`) MUST
 *   refuse the write on `ok:false` rather than silently canonicalizing a
 *   trimmed/deduped document and persisting it — the stored value must stay
 *   byte-identical until a human resolves the corruption.
 */
const DOCUMENT_ALLOWED_KEYS = new Set(["version", "revision", "themes"]);

export function parseCustomThemePresetsDocument(raw: string | null | undefined): ParsedCustomThemePresetsResult {
  // Only a truly ABSENT row (never saved) is "empty, nothing to migrate" —
  // a present-but-empty-string row is not valid JSON and falls through to
  // the JSON.parse failure below, explicitly corrupted rather than treated
  // as if nothing had ever been saved.
  if (raw === null || raw === undefined) return { ok: true, document: emptyCustomThemePresetsDocument() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Stored Custom Appearance presets are not valid JSON." };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Stored Custom Appearance presets have an invalid shape." };
  }
  if (!Object.keys(parsed).every((k) => DOCUMENT_ALLOWED_KEYS.has(k))) {
    return { ok: false, error: "Stored Custom Appearance presets contain an unknown field." };
  }
  if (!Object.hasOwn(parsed, "version") || parsed.version !== 1) {
    return { ok: false, error: "Stored Custom Appearance presets have an unsupported version." };
  }
  if (
    !Object.hasOwn(parsed, "revision") ||
    typeof parsed.revision !== "number" ||
    !Number.isInteger(parsed.revision) ||
    parsed.revision < 0
  ) {
    return { ok: false, error: "Stored Custom Appearance presets have an invalid revision." };
  }
  if (!Object.hasOwn(parsed, "themes") || !Array.isArray(parsed.themes)) {
    return { ok: false, error: "Stored Custom Appearance presets have an invalid collection." };
  }
  if (parsed.themes.length > CUSTOM_THEME_PRESETS_MAX_COUNT) {
    return { ok: false, error: "Stored Custom Appearance presets exceed the maximum allowed count." };
  }
  const themes: CustomTheme[] = [];
  const seenIds = new Set<string>();
  for (const entry of parsed.themes) {
    const theme = parseCustomThemeEntryStrict(entry);
    if (!theme) return { ok: false, error: "Stored Custom Appearance presets contain an invalid entry." };
    if (seenIds.has(theme.id)) return { ok: false, error: "Stored Custom Appearance presets contain a duplicate id." };
    seenIds.add(theme.id);
    themes.push(theme);
  }
  return { ok: true, document: { version: 1, revision: parsed.revision, themes } };
}

export function serializeCustomThemePresetsDocument(doc: CustomThemePresetsDocument): string {
  return JSON.stringify(doc);
}

export type ValidateThemeNameResult = { ok: true; name: string } | { ok: false; error: string };

export const CUSTOM_THEME_NAME_MAX_LENGTH = 60;

export function normalizeCustomThemeName(raw: string): ValidateThemeNameResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter a name for this theme." };
  if (trimmed.length > CUSTOM_THEME_NAME_MAX_LENGTH) {
    return { ok: false, error: `Theme name must be ${CUSTOM_THEME_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

export type SaveThemeInput = Omit<CustomTheme, "name"> & { name: string };

export type MutateThemesResult =
  | { ok: true; themes: CustomTheme[] }
  | { ok: false; error: string };

/**
 * Validates a candidate theme (already assembled client-side from the
 * editor drafts) end to end by round-tripping it through the STRICT
 * durable parser — any invalid field is refused outright rather than
 * silently replaced by a default, so a canonicalized/defaulted value is
 * never what actually gets persisted — then enforces the extra bounds
 * (name length, document byte budget) that only matter for durable
 * server storage.
 */
function validateCandidateTheme(
  candidate: SaveThemeInput,
  siblingThemes: CustomTheme[]
): { ok: true; theme: CustomTheme } | { ok: false; error: string } {
  const nameResult = normalizeCustomThemeName(candidate.name);
  if (!nameResult.ok) return nameResult;
  const parsed = parseCustomThemeEntryStrict({ ...candidate, name: nameResult.name });
  if (!parsed) return { ok: false, error: "This theme contains an invalid value." };
  const isDuplicateName = siblingThemes.some(
    (t) => t.id !== parsed.id && t.name.toLowerCase() === parsed.name.toLowerCase()
  );
  if (isDuplicateName) return { ok: false, error: "A custom theme with this name already exists." };
  return { ok: true, theme: parsed };
}

function documentByteLength(themes: CustomTheme[], revision: number): number {
  return Buffer.byteLength(
    serializeCustomThemePresetsDocument({ version: 1, revision, themes }),
    "utf8"
  );
}

export function addTheme(themes: CustomTheme[], candidate: SaveThemeInput, nextRevision: number): MutateThemesResult {
  if (themes.length >= CUSTOM_THEME_PRESETS_MAX_COUNT) {
    return { ok: false, error: `Maximum ${CUSTOM_THEME_PRESETS_MAX_COUNT} custom themes reached.` };
  }
  // The candidate's id is client-generated and carried in the request — a
  // forged/replayed "add" with an id that already exists must be refused
  // outright, never silently appended (which would leave the document with
  // two entries sharing an id until the next read silently drops one).
  if (themes.some((t) => t.id === candidate.id)) {
    return { ok: false, error: "A theme with this id already exists." };
  }
  const result = validateCandidateTheme(candidate, themes);
  if (!result.ok) return result;
  const next = [...themes, result.theme];
  if (documentByteLength(next, nextRevision) > CUSTOM_THEME_PRESETS_MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "This theme is too large to store (images too large or too many custom themes)." };
  }
  return { ok: true, themes: next };
}

export function editTheme(themes: CustomTheme[], candidate: SaveThemeInput, nextRevision: number): MutateThemesResult {
  const idx = themes.findIndex((t) => t.id === candidate.id);
  if (idx === -1) return { ok: false, error: "This theme no longer exists on the server. Reload presets." };
  const siblings = themes.filter((t) => t.id !== candidate.id);
  const result = validateCandidateTheme(candidate, siblings);
  if (!result.ok) return result;
  const next = [...themes];
  next[idx] = result.theme;
  if (documentByteLength(next, nextRevision) > CUSTOM_THEME_PRESETS_MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "This theme is too large to store (images too large or too many custom themes)." };
  }
  return { ok: true, themes: next };
}

export function deleteTheme(themes: CustomTheme[], id: string): MutateThemesResult {
  const next = themes.filter((t) => t.id !== id);
  if (next.length === themes.length) return { ok: false, error: "This theme no longer exists on the server." };
  return { ok: true, themes: next };
}

export interface ImportLegacyResult {
  themes: CustomTheme[];
  importedIds: string[];
  skipped: { id: string; name: string; reason: string }[];
}

/**
 * Idempotent merge of browser-only legacy themes into the server document:
 * a candidate whose id already exists server-side is always skipped
 * (never overwrites a server preset with the same id — "tout conflit doit
 * etre explique"), and a candidate whose *name* collides with a different
 * server theme is skipped too rather than silently saved under a
 * colliding name. Oversized/invalid candidates are dropped the same way
 * add() would drop them. Running this again with the same legacy input
 * after a first successful import is a no-op (every id is now already
 * present server-side).
 */
export function importLegacyThemes(
  serverThemes: CustomTheme[],
  legacyCandidates: CustomTheme[],
  nextRevision: number
): ImportLegacyResult {
  const existingIds = new Set(serverThemes.map((t) => t.id));
  const existingNames = new Set(serverThemes.map((t) => t.name.toLowerCase()));
  let next = [...serverThemes];
  const importedIds: string[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];

  for (const candidate of legacyCandidates) {
    if (existingIds.has(candidate.id)) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: "A server preset with this id already exists." });
      continue;
    }
    if (next.length >= CUSTOM_THEME_PRESETS_MAX_COUNT) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: "Server preset limit reached." });
      continue;
    }
    const nameResult = normalizeCustomThemeName(candidate.name);
    if (!nameResult.ok) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: nameResult.error });
      continue;
    }
    if (existingNames.has(nameResult.name.toLowerCase())) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: "A server preset with this name already exists." });
      continue;
    }
    const parsed = parseCustomThemeEntryStrict({ ...candidate, name: nameResult.name });
    if (!parsed) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: "Invalid theme data — could not migrate as-is." });
      continue;
    }
    const candidateNext = [...next, parsed];
    if (documentByteLength(candidateNext, nextRevision) > CUSTOM_THEME_PRESETS_MAX_DOCUMENT_BYTES) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: "Document size limit reached." });
      continue;
    }
    next = candidateNext;
    existingIds.add(parsed.id);
    existingNames.add(parsed.name.toLowerCase());
    importedIds.push(parsed.id);
  }

  return { themes: next, importedIds, skipped };
}
