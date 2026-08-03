"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  MIKROS_TOKEN_KEYS,
  MIKROS_TOKEN_LABELS,
  MIKROS_DEFAULT_PALETTE,
  MIKROS_DEFAULT_DISPLAY_FONT,
  MIKROS_DEFAULT_BODY_FONT,
  MIKROS_FONT_CHOICES,
  MIKROS_LOGO_ACCEPTED_MIME,
  MIKROS_LOGO_MAX_BYTES,
  MIKROS_LOGO_MAX_DIMENSION_PX,
  MIKROS_DISPLAY_FONT_SIZE_MIN_PX,
  MIKROS_DISPLAY_FONT_SIZE_MAX_PX,
  MIKROS_BODY_FONT_SIZE_MIN_PX,
  MIKROS_BODY_FONT_SIZE_MAX_PX,
  MIKROS_FONT_WEIGHTS,
  MIKROS_FONT_STYLES,
  MIKROS_DEFAULT_TYPOGRAPHY_DETAILS,
  THEME_MODE_STORAGE_KEY,
  THEME_CLASS,
  CUSTOM_MODE_PREFIX,
  type MikrosPalette,
  type MikrosTokenKey,
  type CustomTheme,
  type MikrosTypographyDetails,
  type MikrosFontWeight,
  type MikrosFontStyle,
  customModeId,
  customModeValue,
  applyPaletteToElement,
  applyFontsToElement,
  applyTypographyDetailsToElement,
  applyLogoToElement,
  applyTopBarTextureToElement,
  applyPreviewTextureToElement,
  applyTopBarColorToElement,
  resolveTopBarColor,
  clearPaletteOverrides,
  loadCustomThemes,
  saveCustomThemes,
  generateThemeId,
  isValidHexColor,
  isValidFontFamilyName,
  isValidLogoDataUrl,
  sniffImageMimeFromBytes,
  clampFontSizePx,
  LOCAL_CONFLICT_ID_SUFFIX,
  isConflictDisplayId,
  stripConflictDisplaySuffix,
} from "@/lib/mikrosTheme";
import { parseMikrosThemeImportJson, type MikrosThemeImportResult } from "@/lib/mikrosThemeImport";
import type { CustomThemePresetsDocument } from "@/lib/mikrosThemePresets";
import {
  mutateCustomThemePresets,
  getCustomThemePresetsAction,
  importLegacyCustomThemePresets,
} from "@/actions/themePresets";

const FONT_OTHER = "__other__";
type FontRole = "display" | "body";

function applyMode(mode: string, customThemes: CustomTheme[]) {
  const el = document.documentElement;
  const id = customModeId(mode);
  if (mode === "mikros") {
    el.classList.add(THEME_CLASS);
    clearPaletteOverrides(el); // official charter — no inline overrides (colors, fonts, logo)
  } else if (id !== null) {
    const theme = customThemes.find((t) => t.id === id);
    if (theme) {
      el.classList.add(THEME_CLASS);
      applyPaletteToElement(el, theme.tokens);
      applyFontsToElement(el, theme.displayFont, theme.bodyFont);
      applyTypographyDetailsToElement(el, theme.typography);
      applyLogoToElement(el, theme.logo);
      applyTopBarTextureToElement(el, theme.topBarTexture);
      applyPreviewTextureToElement(el, theme.previewTexture);
      applyTopBarColorToElement(el, theme.tokens, theme.topBarColor);
    } else {
      // Referenced theme no longer exists (deleted elsewhere/corrupted) — safest fallback
      el.classList.remove(THEME_CLASS);
      clearPaletteOverrides(el);
    }
  } else {
    el.classList.remove(THEME_CLASS);
    clearPaletteOverrides(el);
  }
}

/**
 * Structural equality for two CustomTheme objects — used to distinguish "this
 * legacy candidate was genuinely migrated to the server under its own id"
 * (server entry for that id is byte-for-byte what we tried to import) from
 * "a DIFFERENT theme now occupies that id" (a concurrent write from another
 * tab/session raced the import) — see `reconcileLegacyThemes` below. Field-
 * by-field on purpose (not JSON.stringify) so key order never matters.
 */
export function customThemeEquals(a: CustomTheme, b: CustomTheme): boolean {
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.displayFont !== b.displayFont ||
    a.bodyFont !== b.bodyFont ||
    a.logo !== b.logo ||
    a.topBarTexture !== b.topBarTexture ||
    a.previewTexture !== b.previewTexture ||
    a.topBarColor !== b.topBarColor
  ) {
    return false;
  }
  for (const key of MIKROS_TOKEN_KEYS) {
    if (a.tokens[key] !== b.tokens[key]) return false;
  }
  const ta = a.typography;
  const tb = b.typography;
  return (
    ta.displayFontSizePx === tb.displayFontSizePx &&
    ta.displayFontWeight === tb.displayFontWeight &&
    ta.displayFontStyle === tb.displayFontStyle &&
    ta.bodyFontSizePx === tb.bodyFontSizePx &&
    ta.bodyFontWeight === tb.bodyFontWeight &&
    ta.bodyFontStyle === tb.bodyFontStyle
  );
}

/**
 * Reconciles a set of local-only candidate themes (not yet confirmed
 * durable) against a fresh server document. Never relies on "the id now
 * exists server-side" alone to mean "migrated" — that is also true when a
 * DIFFERENT theme concurrently took the same id (the retake round 3 race).
 * Instead:
 * - id absent server-side -> still pending (unaffected, safe to keep as-is);
 * - id present AND content matches -> genuinely migrated, drop (the server
 *   copy already represents it — never duplicated);
 * - id present but content differs -> a concurrent write claimed this id;
 *   the local candidate is a `conflicted` local-only theme, kept fully
 *   intact (byte-exact) but never merged into the same list as the server
 *   theme sharing its id (that would create a duplicate React key and an
 *   ambiguous `custom:<id>` control).
 */
export function reconcileLegacyThemes(
  serverThemes: CustomTheme[],
  candidates: CustomTheme[]
): { stillPending: CustomTheme[]; conflicted: CustomTheme[] } {
  const serverById = new Map(serverThemes.map((t) => [t.id, t]));
  const stillPending: CustomTheme[] = [];
  const conflicted: CustomTheme[] = [];
  for (const candidate of candidates) {
    const serverMatch = serverById.get(candidate.id);
    if (!serverMatch) {
      stillPending.push(candidate);
    } else if (!customThemeEquals(serverMatch, candidate)) {
      conflicted.push(candidate);
    }
    // else: serverMatch exists and is identical — genuinely migrated, drop.
  }
  return { stillPending, conflicted };
}

/**
 * Retake round 4 — a `conflicted` theme (see `reconcileLegacyThemes`) must
 * be selectable as its OWN distinct, unambiguous control: sharing the
 * server theme's plain id would mean sharing its React key AND its
 * `custom:<id>` mode value, so the radiogroup could only ever show ONE
 * control for that id — exactly the "controle ambigu" the round 4 finding
 * flagged (the server's radio showing checked while the DOM actually
 * rendered the local theme). Suffixing the id for DISPLAY/cache purposes
 * gives the local copy its own stable identity, reusing the existing
 * `custom:<id>` mode machinery (and therefore the anti-flash script)
 * completely unchanged — no new mode prefix, no anti-flash edit needed.
 */
export { LOCAL_CONFLICT_ID_SUFFIX, isConflictDisplayId };

export function toConflictDisplayTheme(theme: CustomTheme): CustomTheme {
  return { ...theme, id: `${theme.id}${LOCAL_CONFLICT_ID_SUFFIX}` };
}

/** Reverses `toConflictDisplayTheme` — a no-op for a theme that was never suffixed. */
export function stripConflictDisplayId(theme: CustomTheme): CustomTheme {
  return { ...theme, id: stripConflictDisplaySuffix(theme.id) };
}

/**
 * Retake round 5 — pure decision of what the active `mode` must become
 * after a fresh reconciliation, given the id it currently points at (if
 * any) and the post-reconciliation `conflicted` set. Returns `null` when no
 * transition is needed (not a custom mode, or the same plain/suffixed
 * identity still applies). Kept separate from `reconcileAndApplyServerThemes`
 * (which also needs component state/refs) so the transition logic itself
 * can be exercised directly, without a DOM/React harness.
 *
 * - was suffixed (conflicted display) and no longer conflicted -> migrate to
 *   the plain id (genuinely migrated/identical, or resolved back to a plain
 *   pending local copy — both are represented unsuffixed).
 * - was plain and now conflicted -> migrate to the suffixed local identity,
 *   so the checked radio matches the local copy the DOM already renders.
 * - otherwise -> no change (still resolves to the same identity either way).
 */
export function resolveModeAfterReconciliation(currentMode: string, conflicted: CustomTheme[]): string | null {
  const activeId = customModeId(currentMode);
  if (activeId === null) return null;
  const wasSuffixed = isConflictDisplayId(activeId);
  const baseId = stripConflictDisplaySuffix(activeId);
  const isNowConflicted = conflicted.some((t) => t.id === baseId);
  if (wasSuffixed) {
    return isNowConflicted ? null : customModeValue(baseId);
  }
  return isNowConflicted ? customModeValue(`${baseId}${LOCAL_CONFLICT_ID_SUFFIX}`) : null;
}

/**
 * Appearance toggle + editable Mikros palette + custom themes
 * (THEME.MIKROS.1 / THEME.MIKROS.2). Purely client-side — no schema, no
 * server persistence. Mode values: "default", "mikros", or "custom:<id>".
 * The anti-flash script in layout.tsx mirrors this exact read/apply logic
 * by hand (kept in sync manually, documented there) so first paint never
 * flashes the wrong theme.
 */
type Props = {
  initialCustomThemePresets: CustomThemePresetsDocument;
  /** True when the stored presets row exists but failed validation — Save/Edit/Delete are disabled and this is shown explicitly rather than silently presenting an empty list. */
  initialCustomThemePresetsCorrupted: boolean;
};

export default function ThemeModeToggle({ initialCustomThemePresets, initialCustomThemePresetsCorrupted }: Props) {
  const [mode, setMode] = useState<string>("default");
  const [hasMounted, setHasMounted] = useState(false);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(initialCustomThemePresets.themes);

  // UX.PRODUCTIVITY.POLISH.1 — Lot B. The server is now the durable source
  // of truth for saved presets; `themeRevision` drives optimistic
  // concurrency on every save/edit/delete (see mutateCustomThemePresets).
  // localStorage remains a per-browser cache for the active-theme choice
  // and the anti-flash script — never the durable store.
  const [themeRevision, setThemeRevision] = useState(initialCustomThemePresets.revision);
  const [presetSyncError, setPresetSyncError] = useState<string | null>(null);
  const [presetSyncPending, setPresetSyncPending] = useState(false);
  const [presetsCorrupted, setPresetsCorrupted] = useState(initialCustomThemePresetsCorrupted);
  // Synchronous guard against a double-activation racing two mutations with
  // the same revision — `presetSyncPending` (React state) only reflects
  // reality after the next render, which is too late to stop a second
  // synchronous click handler invocation from starting a second request.
  const themeBusyRef = useRef(false);
  // Retake round 2/3/4 — themes that exist ONLY in this browser's
  // localStorage cache and have not (yet) been confirmed durable on the
  // server (`legacyPendingRef`), or whose id collides with a DIFFERENT
  // theme on the server (`legacyConflictedRef`, retake round 3 — a
  // concurrent write raced the import/reload). Plain refs, not state:
  // nothing renders these arrays directly — `customThemes` (which already
  // includes both, the conflicted ones under a distinct suffixed id, see
  // `toConflictDisplayTheme`) and `legacyImportNotice` are what the UI
  // actually reads. Refs also make `reconcileAndApplyServerThemes` always
  // reconcile against the truly-current set even when called again before
  // a re-render has committed (e.g. mount's initial call, immediately
  // followed by the legacy-import `.then()` a moment later) — a state
  // variable read in the same synchronous tick could still show the old
  // value.
  const legacyPendingRef = useRef<CustomTheme[]>([]);
  const legacyConflictedRef = useRef<CustomTheme[]>([]);
  // Retake round 5/6 — mirrors `mode` so `reconcileAndApplyServerThemes` can
  // always read the truly-current active mode, for the same reason as the
  // two refs above: the legacy-import `.then()` callback closes over
  // whatever `mode` was at mount time, which is stale the instant the user
  // changes the active theme while that request is still in flight.
  //
  // Retake round 6 — this ref is kept in sync SYNCHRONOUSLY by `commitMode`
  // (below), the single choke point every mode change now goes through.
  // The passive `useEffect` on `[mode]` is only a defensive backstop for any
  // path that somehow sets `mode` without going through `commitMode` — it
  // must never be the primary synchronization mechanism, since a held
  // request's response can resolve after `setMode(...)` but before React
  // has committed the render and run this effect, which was exactly the
  // round 6 finding (`modeRef` still showing the OLD mode at that instant).
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  // Explains a legacy-import conflict/corruption/skip to the user instead of
  // silently swallowing it — "tout conflit doit etre explique".
  const [legacyImportNotice, setLegacyImportNotice] = useState<string | null>(null);

  // Live-edited palette — only meaningful while mode === "mikros". Always
  // valid: invalid text-field input is never written here (see
  // handleHexTextChange) — Save/preview can trust it unconditionally.
  const [draftPalette, setDraftPalette] = useState<MikrosPalette>(MIKROS_DEFAULT_PALETTE);
  // Raw text currently shown in each hex field — may be mid-edit/invalid;
  // undefined for a key means "display draftPalette's value".
  const [rawHex, setRawHex] = useState<Partial<Record<MikrosTokenKey, string>>>({});
  const [hexErrors, setHexErrors] = useState<Partial<Record<MikrosTokenKey, string>>>({});

  // Typography (THEME.MIKROS.4) — same draft/raw/error split as the palette
  // above. draftDisplayFont/draftBodyFont are always a valid family name
  // (curated or free-text) and are what gets saved into a custom theme.
  const [draftDisplayFont, setDraftDisplayFont] = useState<string>(MIKROS_DEFAULT_DISPLAY_FONT);
  const [draftBodyFont, setDraftBodyFont] = useState<string>(MIKROS_DEFAULT_BODY_FONT);
  const [displayFontIsOther, setDisplayFontIsOther] = useState(false);
  const [bodyFontIsOther, setBodyFontIsOther] = useState(false);
  const [otherFontText, setOtherFontText] = useState<Record<FontRole, string>>({ display: "", body: "" });
  const [fontErrors, setFontErrors] = useState<Partial<Record<FontRole, string>>>({});

  // Bounded typography details (FB-20260715-006) — same draft/commit pattern
  // as the fonts above. Always a fully valid, in-bounds value (clamped on
  // every change), so Save/preview can trust it unconditionally like
  // draftPalette.
  const [draftTypography, setDraftTypography] = useState<MikrosTypographyDetails>(MIKROS_DEFAULT_TYPOGRAPHY_DETAILS);

  // Custom logo (THEME.MIKROS.5) — null means "no logo, fall back to the M
  // mark". Unlike hex/font drafts, there is no separate raw/committed split:
  // a rejected file never reaches draftLogo at all (see handleLogoFileChange).
  const [draftLogo, setDraftLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  // Decorative textures (THEME.CUSTOM.IMPORT.1 retake) — same null-means-
  // "no texture, render nothing" contract as draftLogo above. Each texture
  // has its own error/busy state so one field's upload never affects the
  // other's; neither is ever applied to the official Custom preset or
  // Default, and neither is persisted before "Save as custom".
  const [draftTopBarTexture, setDraftTopBarTexture] = useState<string | null>(null);
  const [topBarTextureError, setTopBarTextureError] = useState<string | null>(null);
  const [topBarTextureBusy, setTopBarTextureBusy] = useState(false);
  const [draftPreviewTexture, setDraftPreviewTexture] = useState<string | null>(null);
  const [previewTextureError, setPreviewTextureError] = useState<string | null>(null);
  const [previewTextureBusy, setPreviewTextureBusy] = useState(false);

  // Top bar color (THEME.TOPBAR.MASK.1) — a 9th editable color, edited with
  // the exact same color-picker/hex-text/error pattern as the 8 tokens
  // above, but kept as its own state trio since it lives outside
  // MIKROS_TOKEN_KEYS (optional at the JSON/storage level, always a
  // concrete valid hex string here in the draft). Seeded from the current
  // Surface value on reset/new-theme ("valeur officielle initiale egale a
  // surface"), then independently editable.
  const [draftTopBarColor, setDraftTopBarColor] = useState<string>(MIKROS_DEFAULT_PALETTE.surface);
  const [rawTopBarColorHex, setRawTopBarColorHex] = useState<string | undefined>(undefined);
  const [topBarColorError, setTopBarColorError] = useState<string | undefined>(undefined);

  // Palette JSON import (THEME.CUSTOM.IMPORT.1) — pre-fills draftPalette
  // (and, if provided, the not-yet-open save name) but never touches
  // fonts, logo or localStorage. Same "always allow re-selecting the same
  // file" pattern as the logo input below.
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // Paste JSON panel (THEME.CUSTOM.IMPORT.1 — Correction produit avant
  // commit) — same parser/rules as the file import above, applied only on
  // an explicit "Apply JSON" click. Always starts empty; nothing is ever
  // pre-filled into this textarea automatically.
  const [pasteJsonText, setPasteJsonText] = useState("");
  const [pasteJsonError, setPasteJsonError] = useState<string | null>(null);

  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Editing an existing saved theme (THEME.CUSTOM.IMPORT.1 retake — theme
  // editing) — null means "building a brand new theme" (existing
  // behavior). When set to a saved theme's id, Save as custom updates that
  // theme in place by id instead of appending a new one, and the editor
  // panel below is shown even though `mode` may not be the bare "mikros"
  // preset. Any mode switch away (handleModeChange) always clears this.
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);

  function persistMode(next: string) {
    try {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — theme still applies for this page view
    }
  }

  /**
   * Retake round 6 — the SINGLE choke point for every active-mode change.
   * Updates, in this exact order, so no later reader can observe a
   * half-migrated state:
   *
   * 1. `modeRef.current` — synchronously, so any reconciliation running in
   *    the same tick (or a `.then()` callback settling a moment later, even
   *    before React has re-rendered) reads the NEW mode, never the old one;
   * 2. React state (`setMode`) — so the UI (radio checked state) reflects it;
   * 3. `localStorage` — so a full reload restores the same choice;
   * 4. the DOM (`applyMode`) — so the painted theme always matches (3).
   *
   * Every call site that changes `mode` must go through this function
   * instead of calling `setMode`/`persistMode`/`applyMode` individually —
   * the previous approach (each site calling all three separately, plus a
   * passive `useEffect` on `[mode]` meant to keep `modeRef` in sync) left a
   * genuine gap: a held request's response can resolve after `setMode(...)`
   * runs but before React commits the render and runs that effect, so
   * `modeRef.current` — read by `reconcileAndApplyServerThemes` — could
   * still show the PREVIOUS mode at that exact instant (see
   * codex_review.md Round 6 finding).
   */
  function commitMode(next: string, themes: CustomTheme[]) {
    modeRef.current = next;
    setMode(next);
    persistMode(next);
    applyMode(next, themes);
  }

  /**
   * Retake round 4 — single centralized reconciliation point, used by
   * EVERY event that learns of a fresh server document (mount, legacy
   * import, Reload presets, Save, Delete). Previously only mount/import/
   * reload reconciled `legacyPendingThemes`/`legacyConflictedThemes`
   * against the new server state; a successful Save or Delete replaced
   * `customThemes`/the cache with the server-only document directly,
   * silently dropping any local-only legacy theme. Routing every one of
   * those call sites through this one function makes that impossible: a
   * local-only theme only ever disappears once `reconcileLegacyThemes`
   * confirms it (content-identical on the server) or the user explicitly
   * discards/deletes it.
   *
   * Reads the CURRENT pending/conflicted set from the ref mirrors (always
   * up to date, unlike reading the state variables directly, which could
   * still reflect a stale render if this is called twice in quick
   * succession — e.g. mount's own initial call immediately followed by
   * the legacy-import `.then()`).`extraCandidates` lets a caller fold in
   * candidates the refs don't know about yet (only mount needs this, for
   * the initial pass over the raw localStorage cache).
   *
   * Retake round 5 — the active MODE must transition atomically with the
   * list/cache above whenever the identity it points at changes status:
   * pending -> conflicted (a concurrent write just claimed the active id
   * while the import was in flight), conflicted -> migrated/identical, or
   * conflicted -> pending again (the competing server entry was deleted).
   * Leaving `mode` untouched here — as before this round — could leave it
   * pointing at a `custom:<id>` that now resolves to a DIFFERENT theme (the
   * server's), or at a `custom:<id>::localconflict` whose suffixed id no
   * longer exists anywhere once the conflict resolves: either way the
   * checked radio and the painted DOM would disagree (see
   * codex_review.md Round 4 finding). Computed generically from
   * before/after membership in `conflicted`/`stillPending`, so every caller
   * (mount, import, save, delete, reload) gets the same guarantee for free.
   */
  function reconcileAndApplyServerThemes(
    serverThemes: CustomTheme[],
    serverRevision: number,
    extraCandidates: CustomTheme[] = []
  ) {
    const candidates = [...legacyPendingRef.current, ...legacyConflictedRef.current, ...extraCandidates];
    const { stillPending, conflicted } = reconcileLegacyThemes(serverThemes, candidates);
    const displayConflicted = conflicted.map(toConflictDisplayTheme);
    const effectiveThemes = [...serverThemes, ...stillPending, ...displayConflicted];
    legacyPendingRef.current = stillPending;
    legacyConflictedRef.current = conflicted;

    const nextMode = resolveModeAfterReconciliation(modeRef.current, conflicted);
    if (nextMode !== null && nextMode !== modeRef.current) {
      commitMode(nextMode, effectiveThemes);
    } else {
      // No transition needed, but the theme this mode already points at may
      // have changed content (e.g. edited elsewhere) — repaint from the
      // latest data regardless.
      applyMode(modeRef.current, effectiveThemes);
    }

    setCustomThemes(effectiveThemes);
    setThemeRevision(serverRevision);
    // The cache is exactly `effectiveThemes` now — conflicted themes carry
    // their own suffixed, unique id (see `toConflictDisplayTheme`), so
    // there is no longer a need to write them separately "on top of" the
    // rendered list; a plain `loadCustomThemes()` next time will read them
    // back correctly and `reconcileLegacyThemes` will re-derive the same
    // stillPending/conflicted split after un-suffixing (see the mount effect).
    const cacheWriteOk = saveCustomThemes(effectiveThemes);

    if (conflicted.length > 0) {
      setLegacyImportNotice(
        `${conflicted.length} local theme(s) share an id with a different theme on the server. Select the "(Local, unsynced)" option to keep using yours, or the plain option to switch to the server's version: ` +
          conflicted.map((t) => `"${t.name}"`).join(", ")
      );
    } else if (candidates.length > 0) {
      // Everything that was pending/conflicted before this call is now
      // clear (migrated or no longer contested) — the earlier notice no
      // longer applies.
      setLegacyImportNotice(null);
    }

    return { effectiveThemes, stillPending, conflicted, cacheWriteOk };
  }

  useEffect(() => {
    // Mount-time hydration from browser storage/server props: localStorage
    // cannot be read during render (SSR has no access to it), so this must
    // run in an effect. It runs exactly once (empty deps) and never
    // re-triggers itself, so it is not a reactive synchronization loop.
    let savedMode = "default";
    try {
      savedMode = localStorage.getItem(THEME_MODE_STORAGE_KEY) ?? "default";
    } catch {
      // localStorage unavailable — stays on "default"
    }
    // Legacy per-browser cache read BEFORE it gets overwritten below — this
    // is the only place that can still see themes that only ever existed in
    // localStorage (never migrated to the server), INCLUDING any theme a
    // previous session already found `conflicted` (its cached copy carries
    // a suffixed id — see `stripConflictDisplayId` — so a full page reload
    // keeps re-detecting the same conflict from scratch every time, never
    // silently dropping it just because time passed).
    const legacyCache = loadCustomThemes().map(stripConflictDisplayId);
    const serverThemes = initialCustomThemePresets.themes;

    const { effectiveThemes, conflicted } = reconcileAndApplyServerThemes(
      serverThemes,
      initialCustomThemePresets.revision,
      legacyCache
    );

    // A saved mode pointing at a since-deleted/corrupted custom theme falls
    // back to Default — `effectiveThemes` already includes the suffixed
    // conflicted entries (see `reconcileAndApplyServerThemes`), so a saved
    // `custom:<id>::localconflict` mode resolves here exactly like any
    // other custom mode, no special-casing needed.
    const id = customModeId(savedMode);
    const naiveResolvedMode =
      savedMode === "default" || savedMode === "mikros" || (id !== null && effectiveThemes.some((t) => t.id === id))
        ? savedMode
        : "default";
    // Retake round 5 — a saved PLAIN `custom:<id>` mode from before this
    // load can now be ambiguous: `effectiveThemes.some(...)` above matches
    // it either way, because the SERVER's (different) theme under that same
    // id is what actually satisfies the check once a conflict is discovered
    // for the very first time at this exact mount (SSR already reflects the
    // race's resulting state — this reconcile call's `modeRefBefore` is
    // still "default", so it never had a chance to run its OWN mode
    // migration). Routing the naive result through the same transition
    // rule as every other reconciliation call resolves a plain-but-now-
    // conflicted saved mode to its suffixed local identity instead, so the
    // checked radio and the painted DOM agree from the very first render.
    const resolvedMode = resolveModeAfterReconciliation(naiveResolvedMode, conflicted) ?? naiveResolvedMode;
    // Retake round 6 — `commitMode` sets `modeRef.current` SYNCHRONOUSLY
    // (before React state/localStorage/DOM), which matters here specifically
    // because the legacy import fired a few lines below can — in principle —
    // resolve before this effect's render commits and the passive `[mode]`
    // effect runs; reading `modeRef.current` at that point must already see
    // `resolvedMode`, never the ref's initial "default" value.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage/server hydration on mount (empty deps, no reactive loop); localStorage cannot be read during render.
    commitMode(resolvedMode, effectiveThemes);
    setHasMounted(true);

    // One-time (idempotent) legacy import: any browser-only theme id not
    // yet present on the server gets migrated. Fire-and-forget — a
    // transient failure/conflict here is non-fatal: the theme stays fully
    // functional from `effectiveThemes` above (already displayed/applied),
    // nothing is lost, and the user can retry via "Reload presets" or by
    // re-saving. A *successful* run is naturally idempotent since the
    // migrated ids are now present server-side.
    const legacyExtrasForImport = legacyPendingRef.current;
    if (legacyExtrasForImport.length > 0) {
      importLegacyCustomThemePresets(legacyExtrasForImport, initialCustomThemePresets.revision)
        .then((res) => {
          if (!res.ok) {
            // Retake round 5 — a stale-revision conflict is the real
            // outcome of a concurrent write racing our own import request
            // (whichever commits second loses the optimistic-concurrency
            // check; two writes against the same base revision can never
            // both "succeed"). Even on this failure path, `res.document`
            // already carries the FRESH server state — including the
            // concurrent write that caused the conflict. Previously this
            // was discarded entirely: the active pending theme kept
            // pointing at its plain `custom:<id>` mode even though the id
            // it referenced now belongs to a different server theme,
            // exactly the ambiguous-control finding. Reconciling against it
            // here — as soon as this response arrives, no manual "Reload
            // presets" needed — lets the same pending -> conflicted mode
            // transition fire automatically for this genuinely-async race,
            // not only for a conflict pre-existing at mount.
            if (res.document) {
              reconcileAndApplyServerThemes(res.document.themes, res.document.revision);
            }
            // Conflict/corruption — the current state (already displayed/
            // applied) is untouched, nothing lost, but the user must be
            // told why these themes are still local-only rather than the
            // failure being swallowed.
            setLegacyImportNotice(
              res.conflict
                ? `Could not sync ${legacyExtrasForImport.length} local theme(s) to the server yet (list changed elsewhere). They remain available in this browser — try "Reload presets".`
                : `Could not sync ${legacyExtrasForImport.length} local theme(s) to the server: ${res.error} They remain available in this browser.`
            );
            return;
          }
          setPresetsCorrupted(false);
          reconcileAndApplyServerThemes(res.document.themes, res.document.revision);
          if (res.skipped.length > 0) {
            setLegacyImportNotice(
              (prev) =>
                `${res.skipped.length} local theme(s) could not be migrated to the server and remain local-only: ` +
                res.skipped.map((s) => `"${s.name}" (${s.reason})`).join("; ") +
                (prev ? ` ${prev}` : "")
            );
          }
          // Retake round 5 — if the currently active mode was this pending
          // theme's plain id and a concurrent write just claimed it (the
          // race this callback exists to handle), `reconcileAndApplyServerThemes`
          // above (here, or in the conflict branch further up) already
          // migrated `mode` to the suffixed local identity and repainted the
          // DOM from it — the checked radio and the painted DOM never
          // disagree, even though the initial synchronous `applyMode()` at
          // mount painted it before the conflict was known.
        })
        .catch(() => {
          // Non-fatal — legacy themes remain available in the cache/UI as
          // before, but still explained rather than silently swallowed.
          setLegacyImportNotice(
            `Could not sync ${legacyExtrasForImport.length} local theme(s) to the server (network error). They remain available in this browser.`
          );
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleModeChange(next: string) {
    commitMode(next, customThemes);
    setSaveNameOpen(false);
    setSaveError(null);
    // Switching to any radio option (Default, the official preset, or a
    // different saved theme) always abandons an in-progress edit — Cancel
    // reuses this same path by switching to "mikros".
    setEditingThemeId(null);
    if (next === "mikros") {
      setDraftPalette(MIKROS_DEFAULT_PALETTE);
      setRawHex({});
      setHexErrors({});
      setDraftDisplayFont(MIKROS_DEFAULT_DISPLAY_FONT);
      setDraftBodyFont(MIKROS_DEFAULT_BODY_FONT);
      setDisplayFontIsOther(false);
      setBodyFontIsOther(false);
      setOtherFontText({ display: "", body: "" });
      setFontErrors({});
      setDraftTypography(MIKROS_DEFAULT_TYPOGRAPHY_DETAILS);
      setDraftLogo(null);
      setLogoError(null);
      setDraftTopBarTexture(null);
      setTopBarTextureError(null);
      setDraftPreviewTexture(null);
      setPreviewTextureError(null);
      setDraftTopBarColor(MIKROS_DEFAULT_PALETTE.surface);
      setRawTopBarColorHex(undefined);
      setTopBarColorError(undefined);
    }
  }

  /** Commits a known-valid color (from the native picker, or a validated hex string) to the live palette + DOM. */
  function commitTokenChange(key: MikrosTokenKey, value: string) {
    const next = { ...draftPalette, [key]: value };
    setDraftPalette(next);
    applyPaletteToElement(document.documentElement, next);
  }

  /** Native color picker — the browser only ever emits a valid 6-digit hex. */
  function handleColorPickerChange(key: MikrosTokenKey, value: string) {
    commitTokenChange(key, value);
    setRawHex((prev) => ({ ...prev, [key]: undefined }));
    setHexErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  /**
   * Hex text field — may be mid-edit or outright invalid. An invalid value
   * is never applied to the DOM and never reaches draftPalette (so it can
   * never be saved into a custom theme either); it only updates what's
   * displayed in the field, plus a visible error, until corrected.
   */
  function handleHexTextChange(key: MikrosTokenKey, value: string) {
    setRawHex((prev) => ({ ...prev, [key]: value }));
    if (isValidHexColor(value)) {
      setHexErrors((prev) => ({ ...prev, [key]: undefined }));
      commitTokenChange(key, value);
    } else {
      setHexErrors((prev) => ({
        ...prev,
        [key]: "Enter a 6-digit hex color, e.g. #9079f2.",
      }));
    }
  }

  /** Commits a known-valid Top bar color (picker or validated hex string) to the live preview + DOM. */
  function commitTopBarColorChange(value: string) {
    setDraftTopBarColor(value);
    applyTopBarColorToElement(document.documentElement, draftPalette, value);
  }

  /** Native color picker — the browser only ever emits a valid 6-digit hex. */
  function handleTopBarColorPickerChange(value: string) {
    commitTopBarColorChange(value);
    setRawTopBarColorHex(undefined);
    setTopBarColorError(undefined);
  }

  /** Hex text field for Top bar color — same invalid-never-commits contract as handleHexTextChange. */
  function handleTopBarColorTextChange(value: string) {
    setRawTopBarColorHex(value);
    if (isValidHexColor(value)) {
      setTopBarColorError(undefined);
      commitTopBarColorChange(value);
    } else {
      setTopBarColorError("Enter a 6-digit hex color, e.g. #9079f2.");
    }
  }

  /** Commits a known-valid font family (curated choice, or a validated free-text name) to the live typography + DOM. */
  function commitFontChange(role: FontRole, value: string) {
    if (role === "display") {
      setDraftDisplayFont(value);
      applyFontsToElement(document.documentElement, value, draftBodyFont);
    } else {
      setDraftBodyFont(value);
      applyFontsToElement(document.documentElement, draftDisplayFont, value);
    }
  }

  /** Commits a bounded typography change (size clamped in-range, weight/style from their closed option sets) to the live draft + DOM. */
  function commitTypographyChange(field: keyof MikrosTypographyDetails, value: number | MikrosFontWeight | MikrosFontStyle) {
    const next = { ...draftTypography, [field]: value };
    setDraftTypography(next);
    applyTypographyDetailsToElement(document.documentElement, next);
  }

  function handleDisplaySizeChange(raw: string) {
    commitTypographyChange(
      "displayFontSizePx",
      clampFontSizePx(raw, MIKROS_DISPLAY_FONT_SIZE_MIN_PX, MIKROS_DISPLAY_FONT_SIZE_MAX_PX, draftTypography.displayFontSizePx)
    );
  }

  function handleBodySizeChange(raw: string) {
    commitTypographyChange(
      "bodyFontSizePx",
      clampFontSizePx(raw, MIKROS_BODY_FONT_SIZE_MIN_PX, MIKROS_BODY_FONT_SIZE_MAX_PX, draftTypography.bodyFontSizePx)
    );
  }

  /** Curated <select> — picking a real choice always commits immediately; picking "Other" just reveals the free-text field without changing the live font yet. */
  function handleFontSelectChange(role: FontRole, value: string) {
    if (value === FONT_OTHER) {
      if (role === "display") {
        setDisplayFontIsOther(true);
        setOtherFontText((prev) => ({ ...prev, display: draftDisplayFont }));
      } else {
        setBodyFontIsOther(true);
        setOtherFontText((prev) => ({ ...prev, body: draftBodyFont }));
      }
      return;
    }
    if (role === "display") setDisplayFontIsOther(false);
    else setBodyFontIsOther(false);
    setFontErrors((prev) => ({ ...prev, [role]: undefined }));
    commitFontChange(role, value);
  }

  /**
   * Free-text "installed locally" font field — mirrors handleHexTextChange:
   * an invalid name is never applied to the DOM/draft (so it can never be
   * saved either); it only updates what's displayed, plus a visible error,
   * until corrected. Never touches a <style> tag, innerHTML or a URL.
   */
  function handleFontTextChange(role: FontRole, value: string) {
    setOtherFontText((prev) => ({ ...prev, [role]: value }));
    if (isValidFontFamilyName(value)) {
      setFontErrors((prev) => ({ ...prev, [role]: undefined }));
      commitFontChange(role, value.trim());
    } else {
      setFontErrors((prev) => ({
        ...prev,
        [role]: "Use letters, numbers, spaces or hyphens only (max 40 characters).",
      }));
    }
  }

  /**
   * Reads a File as an ArrayBuffer, sniffs its real format from magic
   * bytes (independent of the browser-reported, spoofable File.type),
   * checks its pixel dimensions, and only then produces a validated
   * data: URL. Rejects anything that isn't genuinely PNG/JPEG/WebP
   * (SVG has no binary magic number and is always rejected here),
   * anything over the size/dimension limits, or anything unreadable.
   * Never touches innerHTML, a <style> tag or a remote URL.
   *
   * Shared by the logo upload and both decorative texture uploads — same
   * accepted formats and size/dimension limits for all three ("comme le
   * logo"), so there is only ever one image-validation implementation.
   */
  async function readAndValidateImageFile(file: File): Promise<string> {
    if (file.size > MIKROS_LOGO_MAX_BYTES) {
      throw new Error(`File is too large (max ${Math.round(MIKROS_LOGO_MAX_BYTES / 1024)} KB).`);
    }
    const buffer = await file.arrayBuffer();
    const sniffed = sniffImageMimeFromBytes(new Uint8Array(buffer));
    if (!sniffed || !(MIKROS_LOGO_ACCEPTED_MIME as readonly string[]).includes(sniffed)) {
      throw new Error("Only PNG, JPEG or WebP images are accepted (SVG is not supported).");
    }
    const blob = new Blob([buffer], { type: sniffed });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("This file could not be read."));
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("This image could not be decoded."));
      img.src = dataUrl;
    });
    if (dims.width > MIKROS_LOGO_MAX_DIMENSION_PX || dims.height > MIKROS_LOGO_MAX_DIMENSION_PX) {
      throw new Error(`Image is too large (max ${MIKROS_LOGO_MAX_DIMENSION_PX}×${MIKROS_LOGO_MAX_DIMENSION_PX}px).`);
    }
    if (!isValidLogoDataUrl(dataUrl)) {
      throw new Error("This image could not be processed.");
    }
    return dataUrl;
  }

  async function handleLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // always allow re-selecting the same file afterwards
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      const dataUrl = await readAndValidateImageFile(file);
      setDraftLogo(dataUrl);
      applyLogoToElement(document.documentElement, dataUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "This file could not be used.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleTopBarTextureFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // always allow re-selecting the same file afterwards
    if (!file) return;
    setTopBarTextureError(null);
    setTopBarTextureBusy(true);
    try {
      // No color processing here (THEME.TOPBAR.MASK.1): the texture is used
      // purely as an alpha mask by the CSS rule (mask-mode: alpha), so its
      // RGB content is inert — only validation (magic bytes, size,
      // dimensions) matters, same flow as the logo and the preview texture.
      const dataUrl = await readAndValidateImageFile(file);
      setDraftTopBarTexture(dataUrl);
      applyTopBarTextureToElement(document.documentElement, dataUrl);
    } catch (err) {
      setTopBarTextureError(err instanceof Error ? err.message : "This file could not be used.");
    } finally {
      setTopBarTextureBusy(false);
    }
  }

  function handleResetTopBarTexture() {
    setDraftTopBarTexture(null);
    setTopBarTextureError(null);
    applyTopBarTextureToElement(document.documentElement, null);
  }

  async function handlePreviewTextureFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // always allow re-selecting the same file afterwards
    if (!file) return;
    setPreviewTextureError(null);
    setPreviewTextureBusy(true);
    try {
      const dataUrl = await readAndValidateImageFile(file);
      setDraftPreviewTexture(dataUrl);
      applyPreviewTextureToElement(document.documentElement, dataUrl);
    } catch (err) {
      setPreviewTextureError(err instanceof Error ? err.message : "This file could not be used.");
    } finally {
      setPreviewTextureBusy(false);
    }
  }

  function handleResetPreviewTexture() {
    setDraftPreviewTexture(null);
    setPreviewTextureError(null);
    applyPreviewTextureToElement(document.documentElement, null);
  }

  /**
   * Shared success path for both the file import and the Paste JSON panel:
   * pre-fills the eight palette fields and applies them to the live
   * preview, exactly like a manual color-picker edit. Fonts, logo and both
   * textures are left untouched. Top bar color is always resolved on a
   * successful import — `result.topBarColor` if the JSON provided one,
   * otherwise the imported `tokens.surface` — so an older eight-token JSON
   * (no `tokens.topBar`) never leaves a stale/mismatched Top bar color from
   * a previous edit sitting on top of the newly-imported palette. Never
   * writes to localStorage; only "Save as custom" persists anything.
   */
  function applyImportedPalette(result: Extract<MikrosThemeImportResult, { ok: true }>) {
    setDraftPalette(result.tokens);
    setRawHex({});
    setHexErrors({});
    applyPaletteToElement(document.documentElement, result.tokens);
    if (result.name) {
      setSaveName((prev) => (prev.trim() ? prev : result.name!));
    }
    const importedTopBarColor = result.topBarColor ?? result.tokens.surface;
    setDraftTopBarColor(importedTopBarColor);
    setRawTopBarColorHex(undefined);
    setTopBarColorError(undefined);
    applyTopBarColorToElement(document.documentElement, result.tokens, importedTopBarColor);
  }

  /** Reads the selected file's text and parses it with the shared JSON parser. */
  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // always allow re-selecting the same file afterwards
    if (!file) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const text = await file.text();
      const result = parseMikrosThemeImportJson(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      applyImportedPalette(result);
    } catch {
      setImportError("This file could not be read.");
    } finally {
      setImportBusy(false);
    }
  }

  /** "Apply JSON" in the Paste JSON panel — applies nothing until this is clicked, and preserves the current draft on error. */
  function handlePasteJsonApply() {
    const result = parseMikrosThemeImportJson(pasteJsonText);
    if (!result.ok) {
      setPasteJsonError(result.error);
      return;
    }
    setPasteJsonError(null);
    applyImportedPalette(result);
  }

  function handlePasteJsonClear() {
    setPasteJsonText("");
    setPasteJsonError(null);
  }

  function handleResetLogo() {
    setDraftLogo(null);
    setLogoError(null);
    applyLogoToElement(document.documentElement, null);
  }

  function handleResetPalette() {
    setDraftPalette(MIKROS_DEFAULT_PALETTE);
    setRawHex({});
    setHexErrors({});
    setDraftDisplayFont(MIKROS_DEFAULT_DISPLAY_FONT);
    setDraftBodyFont(MIKROS_DEFAULT_BODY_FONT);
    setDisplayFontIsOther(false);
    setBodyFontIsOther(false);
    setOtherFontText({ display: "", body: "" });
    setFontErrors({});
    setDraftTypography(MIKROS_DEFAULT_TYPOGRAPHY_DETAILS);
    setDraftLogo(null);
    setLogoError(null);
    setDraftTopBarTexture(null);
    setTopBarTextureError(null);
    setDraftPreviewTexture(null);
    setPreviewTextureError(null);
    setDraftTopBarColor(MIKROS_DEFAULT_PALETTE.surface);
    setRawTopBarColorHex(undefined);
    setTopBarColorError(undefined);
    clearPaletteOverrides(document.documentElement); // falls back to the exact stylesheet defaults (colors + typography + logo + textures + topbar color)
  }

  async function handleSaveAsCustom() {
    if (themeBusyRef.current) return; // synchronous guard — blocks a second click before the first request even starts
    const hasPendingInvalidHex = Object.values(hexErrors).some((e) => e !== undefined);
    const hasPendingInvalidFont = Object.values(fontErrors).some((e) => e !== undefined);
    if (hasPendingInvalidHex || hasPendingInvalidFont) {
      setSaveError("Fix the invalid value(s) above before saving.");
      return;
    }
    const name = saveName.trim();
    if (!name) {
      setSaveError("Enter a name for this theme.");
      return;
    }
    // When editing, the theme keeps its own name from the duplicate check —
    // only a genuinely different existing theme sharing that name blocks the save.
    const isDuplicate = customThemes.some(
      (t) => t.id !== editingThemeId && t.name.toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
      setSaveError("A custom theme with this name already exists.");
      return;
    }
    if (topBarColorError !== undefined) {
      setSaveError("Fix the invalid value(s) above before saving.");
      return;
    }

    const themeInput: CustomTheme = {
      id: editingThemeId ?? generateThemeId(),
      name,
      tokens: draftPalette,
      displayFont: draftDisplayFont,
      bodyFont: draftBodyFont,
      typography: draftTypography,
      logo: draftLogo,
      topBarTexture: draftTopBarTexture,
      previewTexture: draftPreviewTexture,
      topBarColor: draftTopBarColor,
    };

    themeBusyRef.current = true;
    setPresetSyncPending(true);
    try {
      // Server save must succeed first — a failed/conflicting write must
      // never show a false success or touch the last-known-good cache.
      const res = await mutateCustomThemePresets(
        { type: editingThemeId ? "edit" : "add", theme: themeInput },
        themeRevision
      );
      if (!res.ok) {
        if (res.document) {
          // Conflict: refresh the known-good server state so a retry (or
          // "Reload presets") starts from the latest revision, but never
          // touch the user's still-open draft.
          setThemeRevision(res.document.revision);
        }
        setSaveError(res.error);
        return;
      }

      setPresetsCorrupted(false);
      // Retake round 4 — a nominal Save must never drop a legacy theme
      // this browser hasn't confirmed durable yet (or already knows is
      // `conflicted`) just because a DIFFERENT theme was mutated; route
      // through the same centralized reconciliation as mount/import/reload.
      const { effectiveThemes, cacheWriteOk } = reconcileAndApplyServerThemes(res.document.themes, res.document.revision);
      const nextMode = customModeValue(themeInput.id);
      commitMode(nextMode, effectiveThemes);
      setSaveNameOpen(false);
      setSaveName("");
      setEditingThemeId(null);
      setSaveError(cacheWriteOk ? null : "Saved on the server, but the local cache could not be updated.");
    } catch (err) {
      // Transport/network rejection — never leaves the UI silently stuck;
      // the still-open draft (name/palette/fonts/etc.) is untouched.
      setSaveError(err instanceof Error ? err.message : "Network error while saving this theme. Please try again.");
    } finally {
      themeBusyRef.current = false;
      setPresetSyncPending(false);
    }
  }

  async function handleDeleteCustom(id: string) {
    if (themeBusyRef.current) return; // synchronous guard — blocks a second click before the first request even starts
    if (!window.confirm("Delete this custom theme? This cannot be undone.")) return;
    themeBusyRef.current = true;
    setPresetSyncPending(true);
    try {
      const res = await mutateCustomThemePresets({ type: "delete", id }, themeRevision);
      if (!res.ok) {
        if (res.document) setThemeRevision(res.document.revision);
        setDeleteError(res.error);
        return;
      }
      setPresetsCorrupted(false);
      // Retake round 4 — same centralized reconciliation as Save: deleting
      // ONE server theme must never drop an unrelated legacy pending/
      // conflicted theme from the cache.
      const { cacheWriteOk, effectiveThemes } = reconcileAndApplyServerThemes(res.document.themes, res.document.revision);
      // `reconcileAndApplyServerThemes` already migrates the active mode if
      // it pointed at a theme whose conflict/pending status changed as a
      // side effect of this delete (retake round 5) — e.g. deleting the
      // server theme that raced a still-conflicted local copy moves `mode`
      // back to that copy's own plain (unsuffixed) id, which DOES still
      // resolve in `effectiveThemes`. The one case reconciliation does NOT
      // cover is the active id genuinely resolving to nothing afterward
      // (a plain server theme, never a legacy candidate, that was itself
      // the one just deleted) — checking against `effectiveThemes` here
      // (not `=== id`) tells the two cases apart correctly even when the
      // deleted server theme happened to share its id with a legacy
      // candidate that reconciliation just repointed `mode` at.
      const activeId = customModeId(modeRef.current);
      if (activeId !== null && !effectiveThemes.some((t) => t.id === activeId)) {
        handleModeChange("mikros");
      }
      setDeleteError(cacheWriteOk ? null : "Deleted on the server, but the local cache could not be updated.");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Network error while deleting this theme. Please try again.");
    } finally {
      themeBusyRef.current = false;
      setPresetSyncPending(false);
    }
  }

  /**
   * Explicit user resolution for a `conflicted` local-only theme (retake
   * round 4): removes it from the cache/state entirely. There is no
   * server call — it never existed there under this id, that's the whole
   * point of `conflicted` — so this is a pure local discard, not a
   * `mutateCustomThemePresets` delete.
   */
  function handleDiscardConflictedLocal(displayId: string) {
    if (!window.confirm("Discard this local-only theme? This cannot be undone.")) return;
    const originalId = displayId.slice(0, -LOCAL_CONFLICT_ID_SUFFIX.length);
    const nextConflicted = legacyConflictedRef.current.filter((t) => t.id !== originalId);
    legacyConflictedRef.current = nextConflicted;
    const nextCustomThemes = customThemes.filter((t) => t.id !== displayId);
    setCustomThemes(nextCustomThemes);
    saveCustomThemes(nextCustomThemes);
    if (customModeId(mode) === displayId) {
      handleModeChange("mikros");
    }
    if (nextConflicted.length === 0 && legacyPendingRef.current.length === 0) {
      setLegacyImportNotice(null);
    }
  }

  /** Non-destructive manual refresh: on failure, the current (last known-good) state and cache are left untouched. */
  async function handleReloadPresets() {
    if (themeBusyRef.current) return;
    themeBusyRef.current = true;
    setPresetSyncPending(true);
    setPresetSyncError(null);
    try {
      const result = await getCustomThemePresetsAction();
      if (result.corrupted) {
        setPresetSyncError(result.error ?? "Stored presets are corrupted on the server. Your current list is unchanged.");
        setPresetsCorrupted(true);
        return;
      }
      setPresetsCorrupted(false);
      // Reload must never drop a legacy theme that hasn't been confirmed
      // durable yet, and must never let a concurrent write silently replace
      // one just because it now shares an id with a different server theme
      // (retake round 3) — `reconcileAndApplyServerThemes` re-checks BOTH
      // the still-pending and the already-known-conflicted local themes
      // against this fresh read: a conflict can appear (another tab just
      // took the id) or resolve (the competing theme was since deleted)
      // between two reloads.
      // `reconcileAndApplyServerThemes` already reconciles the active mode
      // itself (retake round 5) and repaints the DOM from whatever mode it
      // resolves to — a second `applyMode(mode, ...)` here would use the
      // stale `mode` captured at this handler's invocation and could
      // silently undo that transition (e.g. repaint the server's homonym
      // right after the mode was migrated to the local conflicted id).
      reconcileAndApplyServerThemes(result.document.themes, result.document.revision);
    } catch {
      setPresetSyncError("Could not reload presets from the server. Your current list is unchanged.");
    } finally {
      themeBusyRef.current = false;
      setPresetSyncPending(false);
    }
  }

  /**
   * "Edit" on a saved theme — loads every one of its values (palette,
   * fonts, logo, both textures) into the same drafts the editor panel
   * already uses, selects it as the active mode (so the editor is visible
   * even though it isn't the bare official "mikros" preset), and opens the
   * name field pre-filled with its current name. Nothing is persisted
   * here — only Save as custom (now updating this id) writes anything.
   */
  function handleEditTheme(theme: CustomTheme) {
    setEditingThemeId(theme.id);
    setDraftPalette(theme.tokens);
    setRawHex({});
    setHexErrors({});
    const isCuratedDisplay = (MIKROS_FONT_CHOICES as readonly string[]).includes(theme.displayFont);
    const isCuratedBody = (MIKROS_FONT_CHOICES as readonly string[]).includes(theme.bodyFont);
    setDraftDisplayFont(theme.displayFont);
    setDraftBodyFont(theme.bodyFont);
    setDisplayFontIsOther(!isCuratedDisplay);
    setBodyFontIsOther(!isCuratedBody);
    setOtherFontText({
      display: isCuratedDisplay ? "" : theme.displayFont,
      body: isCuratedBody ? "" : theme.bodyFont,
    });
    setFontErrors({});
    setDraftTypography(theme.typography);
    setDraftLogo(theme.logo);
    setLogoError(null);
    setDraftTopBarTexture(theme.topBarTexture);
    setTopBarTextureError(null);
    setDraftPreviewTexture(theme.previewTexture);
    setPreviewTextureError(null);
    setDraftTopBarColor(resolveTopBarColor(theme.tokens, theme.topBarColor));
    setRawTopBarColorHex(undefined);
    setTopBarColorError(undefined);
    setSaveName(theme.name);
    setSaveError(null);
    setSaveNameOpen(true);
    const nextMode = customModeValue(theme.id);
    commitMode(nextMode, customThemes);
  }

  const isMikros = mode === "mikros";
  const activeCustomId = customModeId(mode);
  const isEditingTheme = editingThemeId !== null;
  const showEditor = isMikros || isEditingTheme;

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-xs text-[#6e767d] mb-1">
        Choose the visual appearance for MikAI. Default matches the current look exactly.
      </legend>
      <div className="flex flex-col gap-1">
        <div role="radiogroup" aria-label="Visual mode" className="flex flex-wrap gap-3">
          <label
            className={`flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer transition-colors ${
              mode === "default"
                ? "border-[#5b93d6] text-[#e7e9ec] bg-[#5b93d6]/10"
                : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]"
            }`}
          >
            <input
              type="radio"
              name="mikai-theme-mode"
              value="default"
              checked={hasMounted ? mode === "default" : true}
              onChange={() => handleModeChange("default")}
              className="accent-[#5b93d6]"
            />
            Default
          </label>
          <label
            className={`flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer transition-colors ${
              isMikros
                ? "border-[#9079F2] text-[#e7e9ec] bg-[#9079F2]/10"
                : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]"
            }`}
          >
            <input
              type="radio"
              name="mikai-theme-mode"
              value="mikros"
              checked={hasMounted ? isMikros : false}
              onChange={() => handleModeChange("mikros")}
              className="accent-[#9079F2]"
            />
            Custom
          </label>
          {customThemes.map((theme) => (
            <label
              key={theme.id}
              className={`flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer transition-colors ${
                activeCustomId === theme.id
                  ? "border-[#9079F2] text-[#e7e9ec] bg-[#9079F2]/10"
                  : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]"
              }`}
            >
              <input
                type="radio"
                name="mikai-theme-mode"
                value={`${CUSTOM_MODE_PREFIX}${theme.id}`}
                checked={hasMounted ? activeCustomId === theme.id : false}
                onChange={() => handleModeChange(customModeValue(theme.id))}
                className="accent-[#9079F2]"
              />
              {isConflictDisplayId(theme.id) ? `${theme.name} (Local, unsynced)` : theme.name}
            </label>
          ))}
        </div>
        <p className="text-[10px] text-[#4b5158]">
          Applies immediately, no reload needed. Which one is active stays local to this browser — presets themselves are saved on the server (see below).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">
            Custom themes
          </span>
          <button
            type="button"
            onClick={handleReloadPresets}
            disabled={presetSyncPending}
            className="text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors disabled:opacity-40"
          >
            Reload presets
          </button>
        </div>
        <p className="text-[10px] text-[#4b5158]">
          Saved on the server — available after a restart and from any browser. The active choice above stays local to this browser.
        </p>
        {presetsCorrupted && (
          <p className="text-xs text-[#cf7b6b]">
            Stored presets could not be read (corrupted data). Saving, editing and deleting are disabled until this
            is resolved — your currently applied theme is unaffected.
          </p>
        )}
        {legacyImportNotice && <p className="text-xs text-[#cda24f]">{legacyImportNotice}</p>}
        {presetSyncError && <p className="text-xs text-[#cf7b6b]">{presetSyncError}</p>}
        {deleteError && <p className="text-xs text-[#cf7b6b]">{deleteError}</p>}
        {customThemes.length > 0 && (
          <div className="flex flex-col gap-1">
            {customThemes.map((theme) => (
              <div key={theme.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[#a4abb2]">
                  {theme.name}
                  {isConflictDisplayId(theme.id) && (
                    <span className="ml-1.5 text-[10px] text-[#cda24f]">(local, unsynced)</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {isConflictDisplayId(theme.id) ? (
                    <button
                      type="button"
                      onClick={() => handleDiscardConflictedLocal(theme.id)}
                      className="text-[#4b5158] hover:text-[#cf7b6b] transition-colors"
                    >
                      Discard local copy
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEditTheme(theme)}
                        disabled={presetSyncPending}
                        className="text-[#4b5158] hover:text-[#a4abb2] transition-colors disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustom(theme.id)}
                        disabled={presetSyncPending || presetsCorrupted}
                        className="text-[#4b5158] hover:text-[#cf7b6b] transition-colors disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEditor && (
        <div className="flex flex-col gap-3 rounded border border-[#2c3035] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">
              {isEditingTheme ? `Editing “${saveName || "custom theme"}”` : "Custom palette"}
            </span>
            <button
              type="button"
              onClick={handleResetPalette}
              className="text-[10px] text-[#cda24f] hover:text-[#e0bc72] transition-colors"
            >
              ↺ Reset Custom palette
            </button>
          </div>

          <div className="flex flex-col gap-1.5 border-b border-[#1e2124] pb-3">
            <label className="flex items-center gap-2">
              <span className="text-[10px] text-[#6e767d] whitespace-nowrap">Import palette JSON</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImportFileChange}
                disabled={importBusy}
                aria-label="Import palette JSON"
                className="flex-1 text-xs text-[#a4abb2] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#0e1013] file:text-[#a4abb2] file:text-xs file:px-2 file:py-1 file:cursor-pointer hover:file:border-[#3a4046] disabled:opacity-50"
              />
            </label>
            {importError && <p className="text-[10px] text-[#cf7b6b]">{importError}</p>}
            <p className="text-[10px] text-[#4b5158]">
              Pre-fills the eight fields below from a JSON file — adjust them, then use Save as custom to keep it.
            </p>
          </div>

          <details className="flex flex-col gap-2 border-b border-[#1e2124] pb-3">
            <summary className="text-[10px] text-[#6e767d] cursor-pointer select-none hover:text-[#a4abb2] transition-colors">
              Paste JSON
            </summary>
            <div className="flex flex-col gap-2 pt-1">
              <label htmlFor="mikros-paste-json" className="sr-only">
                Palette JSON text
              </label>
              <textarea
                id="mikros-paste-json"
                value={pasteJsonText}
                onChange={(e) => {
                  setPasteJsonText(e.target.value);
                  setPasteJsonError(null);
                }}
                rows={6}
                placeholder='{"name": "Annecy Paper", "tokens": {"canvas": "#ECE5D8", ...}}'
                aria-label="Palette JSON text"
                aria-invalid={pasteJsonError !== null}
                className={`rounded border bg-[#0e1013] text-xs text-[#e7e9ec] font-mono px-2 py-1.5 focus:outline-none resize-y ${
                  pasteJsonError
                    ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                    : "border-[#2c3035] focus:border-[#3a4046]"
                }`}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteJsonApply}
                  className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                >
                  Apply JSON
                </button>
                <button
                  type="button"
                  onClick={handlePasteJsonClear}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Clear
                </button>
              </div>
              {pasteJsonError && <p className="text-[10px] text-[#cf7b6b]">{pasteJsonError}</p>}
            </div>
          </details>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MIKROS_TOKEN_KEYS.map((key) => {
              const error = hexErrors[key];
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label htmlFor={`mikros-token-${key}`} className="text-[10px] text-[#6e767d]">
                    {MIKROS_TOKEN_LABELS[key]}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`mikros-token-${key}`}
                      type="color"
                      value={draftPalette[key]}
                      onChange={(e) => handleColorPickerChange(key, e.target.value)}
                      className="w-8 h-8 rounded border border-[#2c3035] bg-transparent cursor-pointer shrink-0"
                      aria-label={`${MIKROS_TOKEN_LABELS[key]} color picker`}
                    />
                    <input
                      type="text"
                      value={rawHex[key] ?? draftPalette[key]}
                      onChange={(e) => handleHexTextChange(key, e.target.value)}
                      aria-label={`${MIKROS_TOKEN_LABELS[key]} hex value`}
                      aria-invalid={error !== undefined}
                      className={`flex-1 rounded border bg-[#0e1013] text-xs text-[#e7e9ec] font-mono px-2 py-1.5 focus:outline-none ${
                        error
                          ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                          : "border-[#2c3035] focus:border-[#3a4046]"
                      }`}
                    />
                  </div>
                  {error && <p className="text-[10px] text-[#cf7b6b]">{error}</p>}
                </div>
              );
            })}

            <div className="flex flex-col gap-1">
              <label htmlFor="mikros-topbar-color" className="text-[10px] text-[#6e767d]">
                Top bar color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="mikros-topbar-color"
                  type="color"
                  value={draftTopBarColor}
                  onChange={(e) => handleTopBarColorPickerChange(e.target.value)}
                  className="w-8 h-8 rounded border border-[#2c3035] bg-transparent cursor-pointer shrink-0"
                  aria-label="Top bar color picker"
                />
                <input
                  type="text"
                  value={rawTopBarColorHex ?? draftTopBarColor}
                  onChange={(e) => handleTopBarColorTextChange(e.target.value)}
                  aria-label="Top bar color hex value"
                  aria-invalid={topBarColorError !== undefined}
                  className={`flex-1 rounded border bg-[#0e1013] text-xs text-[#e7e9ec] font-mono px-2 py-1.5 focus:outline-none ${
                    topBarColorError
                      ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                      : "border-[#2c3035] focus:border-[#3a4046]"
                  }`}
                />
              </div>
              {topBarColorError && <p className="text-[10px] text-[#cf7b6b]">{topBarColorError}</p>}
              <p className="text-[10px] text-[#4b5158]">
                Fill color used behind a Top bar texture (opaque areas). Starts equal to Surface.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
            <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Typography</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-font-display" className="text-[10px] text-[#6e767d]">
                  Display font
                </label>
                <select
                  id="mikros-font-display"
                  value={displayFontIsOther ? FONT_OTHER : draftDisplayFont}
                  onChange={(e) => handleFontSelectChange("display", e.target.value)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                >
                  {MIKROS_FONT_CHOICES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value={FONT_OTHER}>Other (installed font)…</option>
                </select>
                {displayFontIsOther && (
                  <input
                    type="text"
                    value={otherFontText.display}
                    onChange={(e) => handleFontTextChange("display", e.target.value)}
                    placeholder="e.g. Helvetica Neue"
                    aria-label="Display font family name"
                    aria-invalid={fontErrors.display !== undefined}
                    className={`rounded border bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none ${
                      fontErrors.display
                        ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                        : "border-[#2c3035] focus:border-[#3a4046]"
                    }`}
                  />
                )}
                {fontErrors.display && <p className="text-[10px] text-[#cf7b6b]">{fontErrors.display}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-font-body" className="text-[10px] text-[#6e767d]">
                  Body font
                </label>
                <select
                  id="mikros-font-body"
                  value={bodyFontIsOther ? FONT_OTHER : draftBodyFont}
                  onChange={(e) => handleFontSelectChange("body", e.target.value)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                >
                  {MIKROS_FONT_CHOICES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value={FONT_OTHER}>Other (installed font)…</option>
                </select>
                {bodyFontIsOther && (
                  <input
                    type="text"
                    value={otherFontText.body}
                    onChange={(e) => handleFontTextChange("body", e.target.value)}
                    placeholder="e.g. Helvetica Neue"
                    aria-label="Body font family name"
                    aria-invalid={fontErrors.body !== undefined}
                    className={`rounded border bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none ${
                      fontErrors.body
                        ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                        : "border-[#2c3035] focus:border-[#3a4046]"
                    }`}
                  />
                )}
                {fontErrors.body && <p className="text-[10px] text-[#cf7b6b]">{fontErrors.body}</p>}
              </div>
            </div>
            <p className="text-[10px] text-[#4b5158]">
              A font not installed on this device falls back to the system default automatically.
              ↺ Reset Custom palette also restores the official fonts.
            </p>

            {/* Bounded size/weight/style controls (FB-20260715-006) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-display-size" className="text-[10px] text-[#6e767d]">
                  Display size ({MIKROS_DISPLAY_FONT_SIZE_MIN_PX}–{MIKROS_DISPLAY_FONT_SIZE_MAX_PX}px)
                </label>
                <input
                  id="mikros-display-size"
                  type="number"
                  min={MIKROS_DISPLAY_FONT_SIZE_MIN_PX}
                  max={MIKROS_DISPLAY_FONT_SIZE_MAX_PX}
                  step={1}
                  value={draftTypography.displayFontSizePx}
                  onChange={(e) => handleDisplaySizeChange(e.target.value)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-body-size" className="text-[10px] text-[#6e767d]">
                  Body/UI size ({MIKROS_BODY_FONT_SIZE_MIN_PX}–{MIKROS_BODY_FONT_SIZE_MAX_PX}px)
                </label>
                <input
                  id="mikros-body-size"
                  type="number"
                  min={MIKROS_BODY_FONT_SIZE_MIN_PX}
                  max={MIKROS_BODY_FONT_SIZE_MAX_PX}
                  step={1}
                  value={draftTypography.bodyFontSizePx}
                  onChange={(e) => handleBodySizeChange(e.target.value)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-display-weight" className="text-[10px] text-[#6e767d]">
                  Display weight
                </label>
                <select
                  id="mikros-display-weight"
                  value={draftTypography.displayFontWeight}
                  onChange={(e) => commitTypographyChange("displayFontWeight", Number(e.target.value) as MikrosFontWeight)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                >
                  {MIKROS_FONT_WEIGHTS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-body-weight" className="text-[10px] text-[#6e767d]">
                  Body/UI weight
                </label>
                <select
                  id="mikros-body-weight"
                  value={draftTypography.bodyFontWeight}
                  onChange={(e) => commitTypographyChange("bodyFontWeight", Number(e.target.value) as MikrosFontWeight)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                >
                  {MIKROS_FONT_WEIGHTS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-display-style" className="text-[10px] text-[#6e767d]">
                  Display style
                </label>
                <select
                  id="mikros-display-style"
                  value={draftTypography.displayFontStyle}
                  onChange={(e) => commitTypographyChange("displayFontStyle", e.target.value as MikrosFontStyle)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                >
                  {MIKROS_FONT_STYLES.map((s) => (
                    <option key={s} value={s}>{s === "normal" ? "Normal" : "Italic"}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="mikros-body-style" className="text-[10px] text-[#6e767d]">
                  Body/UI style
                </label>
                <select
                  id="mikros-body-style"
                  value={draftTypography.bodyFontStyle}
                  onChange={(e) => commitTypographyChange("bodyFontStyle", e.target.value as MikrosFontStyle)}
                  className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                >
                  {MIKROS_FONT_STYLES.map((s) => (
                    <option key={s} value={s}>{s === "normal" ? "Normal" : "Italic"}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Custom logo</span>
              {draftLogo && (
                <button
                  type="button"
                  onClick={handleResetLogo}
                  className="text-[10px] text-[#cda24f] hover:text-[#e0bc72] transition-colors"
                >
                  ↺ Reset custom logo
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md bg-[#5b93d6] flex items-center justify-center text-[10px] font-bold text-white leading-none select-none shrink-0 overflow-hidden bg-cover bg-center"
                style={draftLogo ? { backgroundImage: `url("${draftLogo}")`, color: "transparent" } : undefined}
                aria-hidden="true"
              >
                M
              </div>
              <label className="flex-1">
                <span className="sr-only">Upload a custom logo (PNG, JPEG or WebP)</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoFileChange}
                  disabled={logoBusy}
                  className="w-full text-xs text-[#a4abb2] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#0e1013] file:text-[#a4abb2] file:text-xs file:px-2 file:py-1 file:cursor-pointer hover:file:border-[#3a4046] disabled:opacity-50"
                />
              </label>
            </div>
            {logoError && <p className="text-[10px] text-[#cf7b6b]">{logoError}</p>}
            <p className="text-[10px] text-[#4b5158]">
              PNG, JPEG or WebP, max {Math.round(MIKROS_LOGO_MAX_BYTES / 1024)} KB and{" "}
              {MIKROS_LOGO_MAX_DIMENSION_PX}×{MIKROS_LOGO_MAX_DIMENSION_PX}px. SVG is not accepted. Replaces the “M”
              mark in the top bar for this theme only.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Top bar texture</span>
              {draftTopBarTexture && (
                <button
                  type="button"
                  onClick={handleResetTopBarTexture}
                  className="text-[10px] text-[#cda24f] hover:text-[#e0bc72] transition-colors"
                >
                  ↺ Reset Top bar texture
                </button>
              )}
            </div>
            <label className="flex-1">
              <span className="sr-only">Upload a Top bar texture (PNG, JPEG or WebP)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleTopBarTextureFileChange}
                disabled={topBarTextureBusy}
                className="w-full text-xs text-[#a4abb2] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#0e1013] file:text-[#a4abb2] file:text-xs file:px-2 file:py-1 file:cursor-pointer hover:file:border-[#3a4046] disabled:opacity-50"
              />
            </label>
            {topBarTextureError && <p className="text-[10px] text-[#cf7b6b]">{topBarTextureError}</p>}
            <p className="text-[10px] text-[#4b5158]">
              PNG, JPEG or WebP, max {Math.round(MIKROS_LOGO_MAX_BYTES / 1024)} KB and{" "}
              {MIKROS_LOGO_MAX_DIMENSION_PX}×{MIKROS_LOGO_MAX_DIMENSION_PX}px. SVG is not accepted. Used as a shape
              mask only — opaque areas show Top bar color, transparent areas show Canvas, the texture&apos;s own
              colors are ignored. Empty by default — no texture is applied unless a file is chosen here.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Appearance preview texture</span>
              {draftPreviewTexture && (
                <button
                  type="button"
                  onClick={handleResetPreviewTexture}
                  className="text-[10px] text-[#cda24f] hover:text-[#e0bc72] transition-colors"
                >
                  ↺ Reset Appearance preview texture
                </button>
              )}
            </div>
            <label className="flex-1">
              <span className="sr-only">Upload an Appearance preview texture (PNG, JPEG or WebP)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePreviewTextureFileChange}
                disabled={previewTextureBusy}
                className="w-full text-xs text-[#a4abb2] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#0e1013] file:text-[#a4abb2] file:text-xs file:px-2 file:py-1 file:cursor-pointer hover:file:border-[#3a4046] disabled:opacity-50"
              />
            </label>
            {previewTextureError && <p className="text-[10px] text-[#cf7b6b]">{previewTextureError}</p>}
            <p className="text-[10px] text-[#4b5158]">
              PNG, JPEG or WebP, max {Math.round(MIKROS_LOGO_MAX_BYTES / 1024)} KB and{" "}
              {MIKROS_LOGO_MAX_DIMENSION_PX}×{MIKROS_LOGO_MAX_DIMENSION_PX}px. SVG is not accepted. Empty by default —
              no texture is applied unless a file is chosen here.
            </p>
          </div>

          <div className="border-t border-[#1e2124] pt-3">
            {!saveNameOpen ? (
              <button
                type="button"
                onClick={() => setSaveNameOpen(true)}
                className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Save as custom
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="mikros-save-name" className="text-[10px] text-[#6e767d]">
                  Theme name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="mikros-save-name"
                    type="text"
                    value={saveName}
                    onChange={(e) => {
                      setSaveName(e.target.value);
                      setSaveError(null);
                    }}
                    placeholder="e.g. My Mikros"
                    className="flex-1 rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#4b5158] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAsCustom}
                    disabled={
                      presetSyncPending ||
                      presetsCorrupted ||
                      Object.values(hexErrors).some((e) => e !== undefined) ||
                      Object.values(fontErrors).some((e) => e !== undefined) ||
                      topBarColorError !== undefined
                    }
                    className="rounded border border-[#9079F2]/50 text-[#9079F2] px-3 py-1.5 text-xs hover:border-[#9079F2] hover:bg-[#9079F2]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    {presetSyncPending ? "Saving…" : isEditingTheme ? "Update theme" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingTheme) {
                        // Abandon the unsaved edit and return to the official
                        // Custom preset — same reset path as picking "Custom".
                        handleModeChange("mikros");
                      } else {
                        setSaveNameOpen(false);
                        setSaveName("");
                        setSaveError(null);
                      }
                    }}
                    className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {saveError && <p className="text-xs text-[#cf7b6b]">{saveError}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}
