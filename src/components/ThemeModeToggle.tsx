"use client";

import { useEffect, useState } from "react";
import {
  MIKROS_TOKEN_KEYS,
  MIKROS_TOKEN_LABELS,
  MIKROS_DEFAULT_PALETTE,
  THEME_MODE_STORAGE_KEY,
  THEME_CLASS,
  CUSTOM_MODE_PREFIX,
  type MikrosPalette,
  type MikrosTokenKey,
  type CustomTheme,
  customModeId,
  customModeValue,
  applyPaletteToElement,
  clearPaletteOverrides,
  loadCustomThemes,
  saveCustomThemes,
  generateThemeId,
  isValidHexColor,
} from "@/lib/mikrosTheme";

function applyMode(mode: string, customThemes: CustomTheme[]) {
  const el = document.documentElement;
  const id = customModeId(mode);
  if (mode === "mikros") {
    el.classList.add(THEME_CLASS);
    clearPaletteOverrides(el); // official charter — no inline overrides
  } else if (id !== null) {
    const theme = customThemes.find((t) => t.id === id);
    if (theme) {
      el.classList.add(THEME_CLASS);
      applyPaletteToElement(el, theme.tokens);
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
 * Appearance toggle + editable Mikros palette + custom themes
 * (THEME.MIKROS.1 / THEME.MIKROS.2). Purely client-side — no schema, no
 * server persistence. Mode values: "default", "mikros", or "custom:<id>".
 * The anti-flash script in layout.tsx mirrors this exact read/apply logic
 * by hand (kept in sync manually, documented there) so first paint never
 * flashes the wrong theme.
 */
export default function ThemeModeToggle() {
  const [mode, setMode] = useState<string>("default");
  const [hasMounted, setHasMounted] = useState(false);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);

  // Live-edited palette — only meaningful while mode === "mikros". Always
  // valid: invalid text-field input is never written here (see
  // handleHexTextChange) — Save/preview can trust it unconditionally.
  const [draftPalette, setDraftPalette] = useState<MikrosPalette>(MIKROS_DEFAULT_PALETTE);
  // Raw text currently shown in each hex field — may be mid-edit/invalid;
  // undefined for a key means "display draftPalette's value".
  const [rawHex, setRawHex] = useState<Partial<Record<MikrosTokenKey, string>>>({});
  const [hexErrors, setHexErrors] = useState<Partial<Record<MikrosTokenKey, string>>>({});
  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let savedMode = "default";
    let themes: CustomTheme[] = [];
    try {
      savedMode = localStorage.getItem(THEME_MODE_STORAGE_KEY) ?? "default";
    } catch {
      // localStorage unavailable — stays on "default"
    }
    themes = loadCustomThemes();
    // A saved mode pointing at a since-deleted/corrupted custom theme falls back to Default
    const id = customModeId(savedMode);
    const resolvedMode =
      savedMode === "default" || savedMode === "mikros" || (id !== null && themes.some((t) => t.id === id))
        ? savedMode
        : "default";
    setMode(resolvedMode);
    setCustomThemes(themes);
    setHasMounted(true);
  }, []);

  function persistMode(next: string) {
    try {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — theme still applies for this page view
    }
  }

  function handleModeChange(next: string) {
    setMode(next);
    applyMode(next, customThemes);
    persistMode(next);
    setSaveNameOpen(false);
    setSaveError(null);
    if (next === "mikros") {
      setDraftPalette(MIKROS_DEFAULT_PALETTE);
      setRawHex({});
      setHexErrors({});
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

  function handleResetPalette() {
    setDraftPalette(MIKROS_DEFAULT_PALETTE);
    setRawHex({});
    setHexErrors({});
    clearPaletteOverrides(document.documentElement); // falls back to the exact stylesheet defaults
  }

  function handleSaveAsCustom() {
    const hasPendingInvalidHex = Object.values(hexErrors).some((e) => e !== undefined);
    if (hasPendingInvalidHex) {
      setSaveError("Fix the invalid color value(s) above before saving.");
      return;
    }
    const name = saveName.trim();
    if (!name) {
      setSaveError("Enter a name for this theme.");
      return;
    }
    const isDuplicate = customThemes.some((t) => t.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      setSaveError("A custom theme with this name already exists.");
      return;
    }
    const theme: CustomTheme = { id: generateThemeId(), name, tokens: draftPalette };
    const next = [...customThemes, theme];
    setCustomThemes(next);
    saveCustomThemes(next);
    setSaveNameOpen(false);
    setSaveName("");
    setSaveError(null);
    const nextMode = customModeValue(theme.id);
    setMode(nextMode);
    applyMode(nextMode, next);
    persistMode(nextMode);
  }

  function handleDeleteCustom(id: string) {
    if (!window.confirm("Delete this custom theme? This cannot be undone.")) return;
    setDeleteError(null);
    const next = customThemes.filter((t) => t.id !== id);
    setCustomThemes(next);
    saveCustomThemes(next);
    if (customModeId(mode) === id) {
      handleModeChange("mikros");
    }
  }

  const isMikros = mode === "mikros";
  const activeCustomId = customModeId(mode);

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
              {theme.name}
            </label>
          ))}
        </div>
        <p className="text-[10px] text-[#4b5158]">
          Saved on this browser only. Applies immediately, no reload needed.
        </p>
      </div>

      {customThemes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">
            Custom themes
          </span>
          {deleteError && <p className="text-xs text-[#cf7b6b]">{deleteError}</p>}
          <div className="flex flex-col gap-1">
            {customThemes.map((theme) => (
              <div key={theme.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[#a4abb2]">{theme.name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteCustom(theme.id)}
                  className="text-[#4b5158] hover:text-[#cf7b6b] transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMikros && (
        <div className="flex flex-col gap-3 rounded border border-[#2c3035] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">
              Custom palette
            </span>
            <button
              type="button"
              onClick={handleResetPalette}
              className="text-[10px] text-[#cda24f] hover:text-[#e0bc72] transition-colors"
            >
              ↺ Reset Custom palette
            </button>
          </div>

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
                    disabled={Object.values(hexErrors).some((e) => e !== undefined)}
                    className="rounded border border-[#9079F2]/50 text-[#9079F2] px-3 py-1.5 text-xs hover:border-[#9079F2] hover:bg-[#9079F2]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveNameOpen(false);
                      setSaveName("");
                      setSaveError(null);
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
