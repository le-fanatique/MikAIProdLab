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

/**
 * Typography pairing (THEME.MIKROS.4). Fonts are stored as plain family
 * names (never a URL, never raw CSS) and only ever reach the DOM through
 * style.setProperty() on a known custom property — there is no dynamic
 * <style>/innerHTML injection anywhere in this module or in the anti-flash
 * script, so a family name can never execute arbitrary CSS or fetch a
 * remote resource.
 */
export const MIKROS_DEFAULT_DISPLAY_FONT = "Londrina Solid";
export const MIKROS_DEFAULT_BODY_FONT = "Poppins";

export const MIKROS_FONT_CHOICES = [
  "Londrina Solid",
  "Poppins",
  "IBM Plex Sans",
  "Arial",
  "Georgia",
  "system-ui",
] as const;

/** Reliable stacks for the curated choices — reuse the webfonts already self-hosted by next/font where available, with sane system fallbacks otherwise. */
const KNOWN_FONT_STACKS: Record<string, string> = {
  "Londrina Solid": 'var(--font-londrina-solid), Impact, "Arial Narrow", sans-serif',
  Poppins: "var(--font-poppins), var(--font-sans), Arial, Helvetica, sans-serif",
  "IBM Plex Sans": "var(--font-sans), Arial, Helvetica, sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  Georgia: 'Georgia, "Times New Roman", serif',
  "system-ui": 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

/** Letters, digits, spaces and hyphens only — enough for every real font name (curated or locally installed), never CSS syntax, quotes or a URL. */
const FONT_NAME_RE = /^[A-Za-z0-9 -]{1,40}$/;

export function isValidFontFamilyName(value: unknown): value is string {
  return typeof value === "string" && FONT_NAME_RE.test(value.trim());
}

/**
 * Resolves a stored/selected font name to a full CSS font-family value.
 * Curated names reuse their self-hosted webfont; anything else is treated
 * as a font the user has installed locally — quoted as a plain family name
 * (charset restricted by isValidFontFamilyName, so this can never break out
 * into other CSS or reference a URL) with a generic system fallback.
 */
export function fontFamilyStack(name: string): string {
  return KNOWN_FONT_STACKS[name] ?? `"${name}", system-ui, sans-serif`;
}

/**
 * Custom logo (THEME.MIKROS.5). Stored as a validated data: URL, never a
 * remote URL and never SVG (no active/scriptable content). The only DOM
 * write site is a CSS custom property consumed by a plain background-image
 * declaration in globals.css — never innerHTML, never a <style> tag, so a
 * malformed or hostile value can at worst fail to render, never execute.
 */
export const THEME_LOGO_CLASS = "theme-mikros-logo";
export const MIKROS_LOGO_ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const MIKROS_LOGO_MAX_BYTES = 512 * 1024; // 512 KB, matches the ticket's documented limit
export const MIKROS_LOGO_MAX_DIMENSION_PX = 512;

/** data:image/(png|jpeg|webp);base64,<payload> — strict prefix, base64 alphabet only, capped length (accounts for base64's ~1.37x inflation over MIKROS_LOGO_MAX_BYTES, plus slack for the prefix). Syntactic only — see isValidLogoDataUrl for the real content check. */
const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=?=?)$/;
const LOGO_DATA_URL_MAX_LENGTH = Math.ceil((MIKROS_LOGO_MAX_BYTES * 4) / 3) + 100;

/**
 * Sniffs the real image format from its leading bytes — independent of the
 * (spoofable) File.type reported by the browser/OS. Returns null for
 * anything else, including SVG (which has no binary magic number and is
 * never accepted regardless).
 */
export function sniffImageMimeFromBytes(bytes: Uint8Array): (typeof MIKROS_LOGO_ACCEPTED_MIME)[number] | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Decodes only the leading base64 characters of a payload into raw bytes —
 * enough for sniffImageMimeFromBytes's longest check (WebP, 12 bytes) — via
 * the browser's native atob(). A prefix slice on a multiple of 4 characters
 * is always independently valid base64 (padding, if any, only ever appears
 * at the very end of the *full* payload, never inside this leading chunk),
 * so this never needs the rest of a potentially ~700 KB string decoded just
 * to check a handful of header bytes. Returns null if the payload is too
 * short to contain a real image header, or isn't valid base64 at all.
 */
const LOGO_SNIFF_BASE64_CHARS = 16; // 16 base64 chars -> 12 decoded bytes
function decodeBase64Prefix(base64Payload: string): Uint8Array | null {
  if (base64Payload.length < LOGO_SNIFF_BASE64_CHARS) return null;
  try {
    const binary = atob(base64Payload.slice(0, LOGO_SNIFF_BASE64_CHARS));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Full validation of a stored/uploaded logo value: syntactic data: URL
 * shape AND actual decoded content. A syntactically valid but non-image
 * payload (e.g. "data:image/png;base64,AAAA", or any base64 blob that
 * simply isn't real PNG/JPEG/WebP bytes) is rejected here, not just at
 * upload time — this is the single check reused by loadCustomThemes(),
 * applyLogoToElement() and (as a hand-kept-in-sync copy) the anti-flash
 * script, so a corrupted localStorage value can never mask the "M" with a
 * blank/broken logo.
 */
export function isValidLogoDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > LOGO_DATA_URL_MAX_LENGTH) return false;
  const match = LOGO_DATA_URL_RE.exec(value);
  if (!match) return false;
  const declaredMime = `image/${match[1]}` as (typeof MIKROS_LOGO_ACCEPTED_MIME)[number];
  const payload = match[2];
  const bytes = decodeBase64Prefix(payload);
  if (!bytes) return false;
  const sniffed = sniffImageMimeFromBytes(bytes);
  return sniffed !== null && sniffed === declaredMime;
}

export function applyLogoToElement(el: HTMLElement, logo: string | null): void {
  if (logo && isValidLogoDataUrl(logo)) {
    el.style.setProperty("--mikros-logo-url", `url("${logo}")`);
    el.classList.add(THEME_LOGO_CLASS);
  } else {
    el.style.removeProperty("--mikros-logo-url");
    el.classList.remove(THEME_LOGO_CLASS);
  }
}

/**
 * Optional decorative textures (THEME.CUSTOM.IMPORT.1 retake) — the Top bar
 * brush accent and the Appearance preview background are no longer applied
 * automatically by globals.css. Same validated-data-URL-gated-class
 * mechanism as applyLogoToElement/THEME_LOGO_CLASS above, reusing the exact
 * same accepted formats/size/dimension limits and magic-byte sniffing as
 * the logo ("comme le logo"), so this never introduces a second image
 * validation path. Each texture has its own class/property and is applied
 * independently — resetting one never touches the other.
 */
export const THEME_TOPBAR_TEXTURE_CLASS = "theme-mikros-topbar-texture";
export const THEME_PREVIEW_TEXTURE_CLASS = "theme-mikros-preview-texture";

export function applyTopBarTextureToElement(el: HTMLElement, texture: string | null): void {
  if (texture && isValidLogoDataUrl(texture)) {
    el.style.setProperty("--mikros-topbar-texture-url", `url("${texture}")`);
    el.classList.add(THEME_TOPBAR_TEXTURE_CLASS);
  } else {
    el.style.removeProperty("--mikros-topbar-texture-url");
    el.classList.remove(THEME_TOPBAR_TEXTURE_CLASS);
  }
}

export function applyPreviewTextureToElement(el: HTMLElement, texture: string | null): void {
  if (texture && isValidLogoDataUrl(texture)) {
    el.style.setProperty("--mikros-preview-texture-url", `url("${texture}")`);
    el.classList.add(THEME_PREVIEW_TEXTURE_CLASS);
  } else {
    el.style.removeProperty("--mikros-preview-texture-url");
    el.classList.remove(THEME_PREVIEW_TEXTURE_CLASS);
  }
}

export type CustomTheme = {
  id: string;
  name: string;
  tokens: MikrosPalette;
  displayFont: string;
  bodyFont: string;
  /** null = no custom logo, falls back to the "M" mark. */
  logo: string | null;
  /** null = no custom Top bar texture — the bar renders with no background image. */
  topBarTexture: string | null;
  /** null = no custom Appearance preview texture — the card renders with no background image. */
  previewTexture: string | null;
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

/** Sets the two theme-scoped font custom properties (THEME.MIKROS.4) — same mechanism as applyPaletteToElement, kept separate since fonts are edited/previewed independently of colors. */
export function applyFontsToElement(el: HTMLElement, displayFont: string, bodyFont: string): void {
  el.style.setProperty("--mikros-font-display", fontFamilyStack(displayFont));
  el.style.setProperty("--mikros-font-sans", fontFamilyStack(bodyFont));
}

export function clearPaletteOverrides(el: HTMLElement): void {
  const props = [
    "--mikros-canvas", "--mikros-surface", "--mikros-raised", "--mikros-border",
    "--mikros-text-primary", "--mikros-text-secondary", "--mikros-accent", "--mikros-accent-hover",
    "--mikros-elevated", "--mikros-border-subtle", "--mikros-border-strong",
    "--mikros-text-tertiary", "--mikros-text-disabled",
    "--background", "--foreground",
    // THEME.MIKROS.4 — reset restores the official Londrina Solid / Poppins
    // stylesheet defaults for typography too, same "remove inline override"
    // mechanism as every color above.
    "--mikros-font-display", "--mikros-font-sans",
    // THEME.MIKROS.5 — reset also drops any custom logo back to the "M" mark.
    "--mikros-logo-url",
    // THEME.CUSTOM.IMPORT.1 retake — reset also drops both decorative
    // textures, so the official Custom preset (and Default) always render
    // texture-free, exactly like the logo above.
    "--mikros-topbar-texture-url", "--mikros-preview-texture-url",
  ];
  for (const prop of props) el.style.removeProperty(prop);
  el.classList.remove(THEME_LOGO_CLASS, THEME_TOPBAR_TEXTURE_CLASS, THEME_PREVIEW_TEXTURE_CLASS);
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
      // Fonts are additive (THEME.MIKROS.4): unlike hex tokens, a missing or
      // invalid font never rejects the whole theme — older custom themes
      // saved before this ticket simply fall back to the official pairing.
      const rawDisplayFont = (entry as { displayFont?: unknown }).displayFont;
      const rawBodyFont = (entry as { bodyFont?: unknown }).bodyFont;
      const displayFont = isValidFontFamilyName(rawDisplayFont) ? rawDisplayFont.trim() : MIKROS_DEFAULT_DISPLAY_FONT;
      const bodyFont = isValidFontFamilyName(rawBodyFont) ? rawBodyFont.trim() : MIKROS_DEFAULT_BODY_FONT;
      // Logo is additive too (THEME.MIKROS.5): a missing/invalid/corrupted
      // logo never rejects the theme, it just falls back to the "M" mark.
      const rawLogo = (entry as { logo?: unknown }).logo;
      const logo = isValidLogoDataUrl(rawLogo) ? rawLogo : null;
      // Both decorative textures are additive too (THEME.CUSTOM.IMPORT.1
      // retake): a missing/invalid/corrupted texture never rejects the
      // theme — older themes saved before this ticket simply fall back to
      // null (no texture), same as a fresh theme that never had one.
      const rawTopBarTexture = (entry as { topBarTexture?: unknown }).topBarTexture;
      const topBarTexture = isValidLogoDataUrl(rawTopBarTexture) ? rawTopBarTexture : null;
      const rawPreviewTexture = (entry as { previewTexture?: unknown }).previewTexture;
      const previewTexture = isValidLogoDataUrl(rawPreviewTexture) ? rawPreviewTexture : null;
      result.push({
        id: (entry as { id: string }).id,
        name: (entry as { name: string }).name,
        tokens,
        displayFont,
        bodyFont,
        logo,
        topBarTexture,
        previewTexture,
      });
    }
    return result;
  } catch {
    return [];
  }
}

/** Returns false (instead of throwing) when localStorage is unavailable or full — callers surface this to the user rather than pretending the save succeeded. */
export function saveCustomThemes(themes: CustomTheme[]): boolean {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
    return true;
  } catch {
    return false;
  }
}

export function generateThemeId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
