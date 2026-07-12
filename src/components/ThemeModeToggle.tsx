"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mikai.themeMode";
const THEME_CLASS = "theme-mikros";

type ThemeMode = "default" | "mikros";

function applyThemeClass(mode: ThemeMode) {
  document.documentElement.classList.toggle(THEME_CLASS, mode === "mikros");
}

/**
 * Appearance toggle for THEME.MIKROS.1. Purely client-side — no schema, no
 * server persistence (per ticket). The actual theme class read/write lives
 * here and in the tiny inline anti-flash script in layout.tsx; both read
 * the same localStorage key so they never disagree.
 */
export default function ThemeModeToggle() {
  const [mode, setMode] = useState<ThemeMode>("default");
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "mikros") setMode("mikros");
    } catch {
      // localStorage unavailable — stays on "default"
    }
    setHasMounted(true);
  }, []);

  function handleChange(next: ThemeMode) {
    setMode(next);
    applyThemeClass(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — theme still applies for this page view
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs text-[#6e767d] mb-1">
        Choose the visual appearance for MikAI. Default matches the current look exactly.
      </legend>
      <div role="radiogroup" aria-label="Visual mode" className="flex gap-3">
        <label
          className={`flex-1 flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer transition-colors ${
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
            onChange={() => handleChange("default")}
            className="accent-[#5b93d6]"
          />
          Default
        </label>
        <label
          className={`flex-1 flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer transition-colors ${
            mode === "mikros"
              ? "border-[#9079F2] text-[#e7e9ec] bg-[#9079F2]/10"
              : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]"
          }`}
        >
          <input
            type="radio"
            name="mikai-theme-mode"
            value="mikros"
            checked={hasMounted ? mode === "mikros" : false}
            onChange={() => handleChange("mikros")}
            className="accent-[#9079F2]"
          />
          Mikros
        </label>
      </div>
      <p className="text-[10px] text-[#4b5158]">
        Saved on this browser only. Applies immediately, no reload needed.
      </p>
    </fieldset>
  );
}
