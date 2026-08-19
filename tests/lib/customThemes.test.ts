import { describe, expect, it } from "vitest";
import {
  customThemeEquals,
  reconcileLegacyThemes,
  toConflictDisplayTheme,
  stripConflictDisplayId,
  resolveModeAfterReconciliation,
} from "@/lib/theme/customThemes";
import { LOCAL_CONFLICT_ID_SUFFIX, customModeValue, type CustomTheme } from "@/lib/mikrosTheme";

// ---------------------------------------------------------------------------
// IND.THEME.1. These six functions lived inside ThemeModeToggle.tsx (1 835
// lines), exported for no consumer other than the file itself, and had no
// test — exactly the spot a reconciliation/conflict bug settles unnoticed.
// This is the filet the next ticket (splitting the component body) will
// stand on. Characterization tests: they describe the behavior AS IT IS,
// not as its name suggests. Any surprise found while writing them is noted
// in the executor report, never corrected here.
// ---------------------------------------------------------------------------

function makeTheme(overrides: Partial<CustomTheme> = {}): CustomTheme {
  return {
    id: "theme-1",
    name: "My Theme",
    tokens: {
      canvas: "#150f22",
      surface: "#1e1733",
      raised: "#271f40",
      border: "#453a68",
      textPrimary: "#ffffff",
      textSecondary: "#d3c9f0",
      accent: "#9079f2",
      accentHover: "#b3a3f7",
    },
    displayFont: "Londrina Solid",
    bodyFont: "Poppins",
    typography: {
      displayFontSizePx: 24,
      displayFontWeight: 400,
      displayFontStyle: "normal",
      bodyFontSizePx: 16,
      bodyFontWeight: 400,
      bodyFontStyle: "normal",
    },
    logo: null,
    topBarTexture: null,
    previewTexture: null,
    topBarColor: null,
    ...overrides,
  };
}

describe("customThemeEquals", () => {
  it("returns true for two structurally identical themes, even as distinct objects", () => {
    const a = makeTheme();
    const b = makeTheme();
    expect(a).not.toBe(b);
    expect(customThemeEquals(a, b)).toBe(true);
  });

  it("is insensitive to key order in the two objects (field-by-field, not JSON.stringify)", () => {
    const a = makeTheme();
    const b: CustomTheme = {
      topBarColor: null,
      previewTexture: null,
      topBarTexture: null,
      logo: null,
      typography: { ...a.typography },
      bodyFont: a.bodyFont,
      displayFont: a.displayFont,
      tokens: { ...a.tokens },
      name: a.name,
      id: a.id,
    };
    expect(customThemeEquals(a, b)).toBe(true);
  });

  it("detects a difference in a top-level scalar field", () => {
    expect(customThemeEquals(makeTheme(), makeTheme({ name: "Other Name" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ id: "theme-2" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ displayFont: "Arial" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ bodyFont: "Arial" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ logo: "data:image/png;base64,x" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ topBarTexture: "data:image/png;base64,x" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ previewTexture: "data:image/png;base64,x" }))).toBe(false);
    expect(customThemeEquals(makeTheme(), makeTheme({ topBarColor: "#000000" }))).toBe(false);
  });

  it("detects a difference in exactly one token", () => {
    const a = makeTheme();
    const b = makeTheme({ tokens: { ...a.tokens, accent: "#000000" } });
    expect(customThemeEquals(a, b)).toBe(false);
  });

  it("detects a difference in any single typography field", () => {
    const a = makeTheme();
    expect(customThemeEquals(a, makeTheme({ typography: { ...a.typography, displayFontSizePx: 30 } }))).toBe(false);
    expect(customThemeEquals(a, makeTheme({ typography: { ...a.typography, displayFontWeight: 700 } }))).toBe(false);
    expect(customThemeEquals(a, makeTheme({ typography: { ...a.typography, displayFontStyle: "italic" } }))).toBe(
      false
    );
    expect(customThemeEquals(a, makeTheme({ typography: { ...a.typography, bodyFontSizePx: 18 } }))).toBe(false);
    expect(customThemeEquals(a, makeTheme({ typography: { ...a.typography, bodyFontWeight: 600 } }))).toBe(false);
    expect(customThemeEquals(a, makeTheme({ typography: { ...a.typography, bodyFontStyle: "italic" } }))).toBe(
      false
    );
  });
});

describe("reconcileLegacyThemes", () => {
  it("returns two empty arrays when there is nothing to reconcile", () => {
    const result = reconcileLegacyThemes([], []);
    expect(result).toEqual({ stillPending: [], conflicted: [] });
  });

  it("keeps a candidate whose id is absent server-side as still pending", () => {
    const candidate = makeTheme({ id: "local-only" });
    const result = reconcileLegacyThemes([makeTheme({ id: "server-theme" })], [candidate]);
    expect(result.stillPending).toEqual([candidate]);
    expect(result.conflicted).toEqual([]);
  });

  it("drops a candidate whose id exists server-side with identical content (genuinely migrated)", () => {
    const candidate = makeTheme({ id: "same-id" });
    const serverMatch = makeTheme({ id: "same-id" });
    const result = reconcileLegacyThemes([serverMatch], [candidate]);
    expect(result.stillPending).toEqual([]);
    expect(result.conflicted).toEqual([]);
  });

  it("marks a candidate whose id exists server-side with DIFFERENT content as conflicted, keeping it byte-exact", () => {
    const candidate = makeTheme({ id: "same-id", name: "Local Version" });
    const serverMatch = makeTheme({ id: "same-id", name: "Server Version" });
    const result = reconcileLegacyThemes([serverMatch], [candidate]);
    expect(result.stillPending).toEqual([]);
    expect(result.conflicted).toEqual([candidate]);
    // Byte-exact: the conflicted candidate is returned unchanged, not merged
    // with the server theme in any way.
    expect(result.conflicted[0]).toBe(candidate);
  });

  it("sorts a mix of candidates into the correct bucket independently, preserving order", () => {
    const pendingA = makeTheme({ id: "pending-a" });
    const pendingB = makeTheme({ id: "pending-b" });
    const migrated = makeTheme({ id: "migrated" });
    const conflictedA = makeTheme({ id: "conflict-a", name: "Local A" });
    const serverThemes = [
      makeTheme({ id: "migrated" }),
      makeTheme({ id: "conflict-a", name: "Server A" }),
      makeTheme({ id: "unrelated-server-theme" }),
    ];
    const result = reconcileLegacyThemes(serverThemes, [pendingA, migrated, conflictedA, pendingB]);
    expect(result.stillPending).toEqual([pendingA, pendingB]);
    expect(result.conflicted).toEqual([conflictedA]);
  });
});

describe("toConflictDisplayTheme / stripConflictDisplayId round trip", () => {
  it("suffixes the id on the way out and the round trip restores the original theme", () => {
    const original = makeTheme({ id: "abc" });
    const displayed = toConflictDisplayTheme(original);
    expect(displayed.id).toBe(`abc${LOCAL_CONFLICT_ID_SUFFIX}`);
    // Every other field is untouched.
    expect(displayed).toEqual({ ...original, id: `abc${LOCAL_CONFLICT_ID_SUFFIX}` });

    const restored = stripConflictDisplayId(displayed);
    expect(restored).toEqual(original);
  });

  it("stripConflictDisplayId is a no-op for a theme that was never suffixed", () => {
    const original = makeTheme({ id: "never-suffixed" });
    expect(stripConflictDisplayId(original)).toEqual(original);
  });

  it("toConflictDisplayTheme does not de-duplicate a double application (each call appends the suffix again)", () => {
    // Characterization: the function has no guard against being called
    // twice. Documented here as-is, not corrected.
    const original = makeTheme({ id: "abc" });
    const twice = toConflictDisplayTheme(toConflictDisplayTheme(original));
    expect(twice.id).toBe(`abc${LOCAL_CONFLICT_ID_SUFFIX}${LOCAL_CONFLICT_ID_SUFFIX}`);
  });
});

describe("resolveModeAfterReconciliation", () => {
  it("returns null for a non-custom mode ('default' or 'mikros')", () => {
    expect(resolveModeAfterReconciliation("default", [])).toBeNull();
    expect(resolveModeAfterReconciliation("mikros", [makeTheme({ id: "x" })])).toBeNull();
  });

  it("returns null when a plain custom mode's id is not in the conflicted set (no transition needed)", () => {
    const mode = customModeValue("theme-a");
    expect(resolveModeAfterReconciliation(mode, [])).toBeNull();
    expect(resolveModeAfterReconciliation(mode, [makeTheme({ id: "theme-b" })])).toBeNull();
  });

  it("migrates a plain custom mode to the suffixed local identity when its id just became conflicted", () => {
    const mode = customModeValue("theme-a");
    const conflicted = [makeTheme({ id: "theme-a" })];
    expect(resolveModeAfterReconciliation(mode, conflicted)).toBe(
      customModeValue(`theme-a${LOCAL_CONFLICT_ID_SUFFIX}`)
    );
  });

  it("migrates a suffixed (conflicted-display) mode back to the plain id once it is no longer conflicted", () => {
    const mode = customModeValue(`theme-a${LOCAL_CONFLICT_ID_SUFFIX}`);
    expect(resolveModeAfterReconciliation(mode, [])).toBe(customModeValue("theme-a"));
    expect(resolveModeAfterReconciliation(mode, [makeTheme({ id: "theme-b" })])).toBe(customModeValue("theme-a"));
  });

  it("returns null for a suffixed mode whose base id is still conflicted (no change)", () => {
    const mode = customModeValue(`theme-a${LOCAL_CONFLICT_ID_SUFFIX}`);
    const conflicted = [makeTheme({ id: "theme-a" })];
    expect(resolveModeAfterReconciliation(mode, conflicted)).toBeNull();
  });
});
