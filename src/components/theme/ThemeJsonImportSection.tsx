"use client";

import type { ChangeEvent } from "react";

type Props = {
  importBusy: boolean;
  importError: string | null;
  onImportFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  pasteJsonText: string;
  pasteJsonError: string | null;
  onPasteJsonTextChange: (value: string) => void;
  onPasteJsonApply: () => void;
  onPasteJsonClear: () => void;
};

/** Palette JSON file import + Paste JSON panel (IND.THEME.2). */
export default function ThemeJsonImportSection({
  importBusy,
  importError,
  onImportFileChange,
  pasteJsonText,
  pasteJsonError,
  onPasteJsonTextChange,
  onPasteJsonApply,
  onPasteJsonClear,
}: Props) {
  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-[#1e2124] pb-3">
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-[#6e767d] whitespace-nowrap">Import palette JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={onImportFileChange}
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
            onChange={(e) => onPasteJsonTextChange(e.target.value)}
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
              onClick={onPasteJsonApply}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Apply JSON
            </button>
            <button
              type="button"
              onClick={onPasteJsonClear}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Clear
            </button>
          </div>
          {pasteJsonError && <p className="text-[10px] text-[#cf7b6b]">{pasteJsonError}</p>}
        </div>
      </details>
    </>
  );
}
