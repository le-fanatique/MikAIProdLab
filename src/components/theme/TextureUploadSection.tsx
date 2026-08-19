"use client";

import type { ChangeEvent, ReactNode } from "react";

type Props = {
  title: string;
  resetLabel: string;
  fileInputSrLabel: string;
  value: string | null;
  busy: boolean;
  error: string | null;
  onReset: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  description: ReactNode;
};

/**
 * Decorative texture upload/preview/reset block (IND.THEME.2). Reused for
 * both the Top bar texture and the Appearance preview texture — the two
 * blocks were structurally identical in the pre-split JSX, differing only in
 * title, labels, handlers and description text.
 */
export default function TextureUploadSection({
  title,
  resetLabel,
  fileInputSrLabel,
  value,
  busy,
  error,
  onReset,
  onFileChange,
  description,
}: Props) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">{title}</span>
        {value && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-[#cda24f] hover:text-[#e0bc72] transition-colors"
          >
            {resetLabel}
          </button>
        )}
      </div>
      <label className="flex-1">
        <span className="sr-only">{fileInputSrLabel}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileChange}
          disabled={busy}
          className="w-full text-xs text-[#a4abb2] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#0e1013] file:text-[#a4abb2] file:text-xs file:px-2 file:py-1 file:cursor-pointer hover:file:border-[#3a4046] disabled:opacity-50"
        />
      </label>
      {error && <p className="text-[10px] text-[#cf7b6b]">{error}</p>}
      <p className="text-[10px] text-[#4b5158]">{description}</p>
    </div>
  );
}
