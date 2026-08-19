"use client";

import type { ChangeEvent } from "react";
import { MIKROS_LOGO_MAX_BYTES, MIKROS_LOGO_MAX_DIMENSION_PX } from "@/lib/mikrosTheme";

type Props = {
  draftLogo: string | null;
  logoBusy: boolean;
  logoError: string | null;
  onReset: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

/** Custom logo upload/preview/reset (IND.THEME.2). */
export default function LogoSection({ draftLogo, logoBusy, logoError, onReset, onFileChange }: Props) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Custom logo</span>
        {draftLogo && (
          <button
            type="button"
            onClick={onReset}
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
            onChange={onFileChange}
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
  );
}
