/**
 * Pure custom-theme reconciliation/conflict logic extracted from
 * `ThemeModeToggle.tsx` (IND.THEME.1). Every function here is callable with
 * plain data — no DOM, no localStorage, no React — which is exactly the
 * criterion used to decide what moved here versus what stayed in the
 * component (see that ticket / `applyMode`, which stays put).
 *
 * No `server-only`: `ThemeModeToggle` is a client component and imports
 * these directly.
 */
import {
  MIKROS_TOKEN_KEYS,
  LOCAL_CONFLICT_ID_SUFFIX,
  isConflictDisplayId,
  stripConflictDisplaySuffix,
  customModeId,
  customModeValue,
  type CustomTheme,
} from "@/lib/mikrosTheme";

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
