/**
 * Mikros theme palette — shared types, defaults and helpers
 * (THEME.MIKROS.2). Client-only, no server persistence.
 *
 * Architecture: the 8 tokens below are the only ones an artist can edit.
 * The 5 extra CSS custom properties already declared in globals.css under
 * html.theme-mikros (--mikros-elevated, --mikros-border-subtle,
 * --mikros-border-strong, --mikros-text-tertiary, --mikros-text-disabled)
 * stay untouched there as the exact original Mikros charter values — reset
 * simply removes any inline override, so "official Mikros" always falls
 * straight back to those literal stylesheet defaults, never a
 * recomputation. deriveFullPalette() below is only used to keep those 5
 * shades visually coherent while PREVIEWING an edit or a custom theme
 * (both are, by definition, user variations — an approximation is
 * expected there, not a regression of the official preset).
 */

export const MIKROS_TOKEN_KEYS = [
  "canvas",
  "surface",
  "raised",
  "border",
  "textPrimary",
  "textSecondary",
  "accent",
  "accentHover",
] as const;

export type MikrosTokenKey = (typeof MIKROS_TOKEN_KEYS)[number];

export type MikrosPalette = Record<MikrosTokenKey, string>;

export const MIKROS_TOKEN_LABELS: Record<MikrosTokenKey, string> = {
  canvas: "Canvas / main background",
  surface: "Surface / panels",
  raised: "Surface raised",
  border: "Border",
  textPrimary: "Text primary",
  textSecondary: "Text secondary",
  accent: "Accent",
  accentHover: "Accent hover",
};

/** Exact original Mikros charter values — matches globals.css's html.theme-mikros defaults byte for byte. */
export const MIKROS_DEFAULT_PALETTE: MikrosPalette = {
  canvas: "#150f22",
  surface: "#1e1733",
  raised: "#271f40",
  border: "#453a68",
  textPrimary: "#ffffff",
  textSecondary: "#d3c9f0",
  accent: "#9079f2",
  accentHover: "#b3a3f7",
};

export const THEME_MODE_STORAGE_KEY = "mikai.themeMode";
export const CUSTOM_THEMES_STORAGE_KEY = "mikai.customThemes";
export const THEME_CLASS = "theme-mikros";

export type CustomTheme = {
  id: string;
  name: string;
  tokens: MikrosPalette;
};

/** "default" | "mikros" | "custom:<id>" */
export type ThemeModeValue = string;

export const CUSTOM_MODE_PREFIX = "custom:";

export function customModeId(mode: ThemeModeValue): string | null {
  return mode.startsWith(CUSTOM_MODE_PREFIX) ? mode.slice(CUSTOM_MODE_PREFIX.length) : null;
}

export function customModeValue(id: string): string {
  return `${CUSTOM_MODE_PREFIX}${id}`;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
  return `#${h.toString(16).padStart(6, "0")}`;
}

/** Linear-interpolates two hex colors — weightA in [0,1] is how much of `a` to keep. */
export function mixHex(a: string, b: string, weightA: number): string {
  if (!isValidHexColor(a) || !isValidHexColor(b)) return a;
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const w = Math.max(0, Math.min(1, weightA));
  return rgbToHex(
    ar * w + br * (1 - w),
    ag * w + bg * (1 - w),
    ab * w + bb * (1 - w)
  );
}

/**
 * Derives the 5 non-editable shades from the 8 editable tokens — used only
 * for live preview / custom theme application, never for the official
 * Mikros reset path (which just removes inline overrides).
 */
export function deriveFullPalette(base: MikrosPalette): Record<string, string> {
  return {
    "--mikros-canvas": base.canvas,
    "--mikros-surface": base.surface,
    "--mikros-raised": base.raised,
    "--mikros-border": base.border,
    "--mikros-text-primary": base.textPrimary,
    "--mikros-text-secondary": base.textSecondary,
    "--mikros-accent": base.accent,
    "--mikros-accent-hover": base.accentHover,
    "--mikros-elevated": mixHex(base.raised, base.border, 0.6),
    "--mikros-border-subtle": mixHex(base.border, base.canvas, 0.55),
    "--mikros-border-strong": mixHex(base.border, base.textPrimary, 0.55),
    "--mikros-text-tertiary": mixHex(base.textSecondary, base.canvas, 0.7),
    "--mikros-text-disabled": mixHex(base.textSecondary, base.canvas, 0.45),
    // body{} reads these two root tokens directly
    "--background": base.canvas,
    "--foreground": base.textPrimary,
  };
}

export function applyPaletteToElement(el: HTMLElement, base: MikrosPalette): void {
  const full = deriveFullPalette(base);
  for (const [prop, value] of Object.entries(full)) {
    el.style.setProperty(prop, value);
  }
}

export function clearPaletteOverrides(el: HTMLElement): void {
  const props = [
    "--mikros-canvas", "--mikros-surface", "--mikros-raised", "--mikros-border",
    "--mikros-text-primary", "--mikros-text-secondary", "--mikros-accent", "--mikros-accent-hover",
    "--mikros-elevated", "--mikros-border-subtle", "--mikros-border-strong",
    "--mikros-text-tertiary", "--mikros-text-disabled",
    "--background", "--foreground",
  ];
  for (const prop of props) el.style.removeProperty(prop);
}

/** Defensive parse — drops malformed entries instead of throwing, never crashes the caller. */
export function loadCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: CustomTheme[] = [];
    for (const entry of parsed) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as { id?: unknown }).id !== "string" ||
        typeof (entry as { name?: unknown }).name !== "string" ||
        typeof (entry as { tokens?: unknown }).tokens !== "object" ||
        (entry as { tokens?: unknown }).tokens === null
      ) {
        continue;
      }
      const tokensRaw = (entry as { tokens: Record<string, unknown> }).tokens;
      const tokens = {} as MikrosPalette;
      let valid = true;
      for (const key of MIKROS_TOKEN_KEYS) {
        const v = tokensRaw[key];
        if (!isValidHexColor(v)) {
          valid = false;
          break;
        }
        tokens[key] = v;
      }
      if (!valid) continue;
      result.push({ id: (entry as { id: string }).id, name: (entry as { name: string }).name, tokens });
    }
    return result;
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: CustomTheme[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // localStorage unavailable or full — the in-memory list still works for this page view
  }
}

export function generateThemeId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
