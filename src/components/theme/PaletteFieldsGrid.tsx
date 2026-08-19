"use client";

import {
  MIKROS_TOKEN_KEYS,
  MIKROS_TOKEN_LABELS,
  type MikrosPalette,
  type MikrosTokenKey,
} from "@/lib/mikrosTheme";

type Props = {
  draftPalette: MikrosPalette;
  rawHex: Partial<Record<MikrosTokenKey, string>>;
  hexErrors: Partial<Record<MikrosTokenKey, string>>;
  onColorPickerChange: (key: MikrosTokenKey, value: string) => void;
  onHexTextChange: (key: MikrosTokenKey, value: string) => void;
  draftTopBarColor: string;
  rawTopBarColorHex: string | undefined;
  topBarColorError: string | undefined;
  onTopBarColorPickerChange: (value: string) => void;
  onTopBarColorTextChange: (value: string) => void;
};

/** The 8 editable palette tokens + the 9th Top bar color field, each with its picker/hex-text/error trio (IND.THEME.2). */
export default function PaletteFieldsGrid({
  draftPalette,
  rawHex,
  hexErrors,
  onColorPickerChange,
  onHexTextChange,
  draftTopBarColor,
  rawTopBarColorHex,
  topBarColorError,
  onTopBarColorPickerChange,
  onTopBarColorTextChange,
}: Props) {
  return (
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
                onChange={(e) => onColorPickerChange(key, e.target.value)}
                className="w-8 h-8 rounded border border-[#2c3035] bg-transparent cursor-pointer shrink-0"
                aria-label={`${MIKROS_TOKEN_LABELS[key]} color picker`}
              />
              <input
                type="text"
                value={rawHex[key] ?? draftPalette[key]}
                onChange={(e) => onHexTextChange(key, e.target.value)}
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
            onChange={(e) => onTopBarColorPickerChange(e.target.value)}
            className="w-8 h-8 rounded border border-[#2c3035] bg-transparent cursor-pointer shrink-0"
            aria-label="Top bar color picker"
          />
          <input
            type="text"
            value={rawTopBarColorHex ?? draftTopBarColor}
            onChange={(e) => onTopBarColorTextChange(e.target.value)}
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
  );
}
