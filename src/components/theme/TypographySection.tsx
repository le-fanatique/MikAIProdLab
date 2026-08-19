"use client";

import {
  MIKROS_FONT_CHOICES,
  MIKROS_FONT_WEIGHTS,
  MIKROS_FONT_STYLES,
  MIKROS_DISPLAY_FONT_SIZE_MIN_PX,
  MIKROS_DISPLAY_FONT_SIZE_MAX_PX,
  MIKROS_BODY_FONT_SIZE_MIN_PX,
  MIKROS_BODY_FONT_SIZE_MAX_PX,
  type MikrosTypographyDetails,
  type MikrosFontWeight,
  type MikrosFontStyle,
} from "@/lib/mikrosTheme";

const FONT_OTHER = "__other__";
type FontRole = "display" | "body";

type Props = {
  draftDisplayFont: string;
  draftBodyFont: string;
  displayFontIsOther: boolean;
  bodyFontIsOther: boolean;
  otherFontText: Record<FontRole, string>;
  fontErrors: Partial<Record<FontRole, string>>;
  onFontSelectChange: (role: FontRole, value: string) => void;
  onFontTextChange: (role: FontRole, value: string) => void;
  draftTypography: MikrosTypographyDetails;
  onDisplaySizeChange: (raw: string) => void;
  onBodySizeChange: (raw: string) => void;
  onTypographyFieldChange: (field: keyof MikrosTypographyDetails, value: number | MikrosFontWeight | MikrosFontStyle) => void;
};

/** Display/body font pickers + bounded size/weight/style controls (IND.THEME.2). */
export default function TypographySection({
  draftDisplayFont,
  draftBodyFont,
  displayFontIsOther,
  bodyFontIsOther,
  otherFontText,
  fontErrors,
  onFontSelectChange,
  onFontTextChange,
  draftTypography,
  onDisplaySizeChange,
  onBodySizeChange,
  onTypographyFieldChange,
}: Props) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
      <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Typography</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-font-display" className="text-[10px] text-[#6e767d]">
            Display font
          </label>
          <select
            id="mikros-font-display"
            value={displayFontIsOther ? FONT_OTHER : draftDisplayFont}
            onChange={(e) => onFontSelectChange("display", e.target.value)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {MIKROS_FONT_CHOICES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value={FONT_OTHER}>Other (installed font)…</option>
          </select>
          {displayFontIsOther && (
            <input
              type="text"
              value={otherFontText.display}
              onChange={(e) => onFontTextChange("display", e.target.value)}
              placeholder="e.g. Helvetica Neue"
              aria-label="Display font family name"
              aria-invalid={fontErrors.display !== undefined}
              className={`rounded border bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none ${
                fontErrors.display
                  ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                  : "border-[#2c3035] focus:border-[#3a4046]"
              }`}
            />
          )}
          {fontErrors.display && <p className="text-[10px] text-[#cf7b6b]">{fontErrors.display}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-font-body" className="text-[10px] text-[#6e767d]">
            Body font
          </label>
          <select
            id="mikros-font-body"
            value={bodyFontIsOther ? FONT_OTHER : draftBodyFont}
            onChange={(e) => onFontSelectChange("body", e.target.value)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {MIKROS_FONT_CHOICES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value={FONT_OTHER}>Other (installed font)…</option>
          </select>
          {bodyFontIsOther && (
            <input
              type="text"
              value={otherFontText.body}
              onChange={(e) => onFontTextChange("body", e.target.value)}
              placeholder="e.g. Helvetica Neue"
              aria-label="Body font family name"
              aria-invalid={fontErrors.body !== undefined}
              className={`rounded border bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none ${
                fontErrors.body
                  ? "border-[#cf7b6b] focus:border-[#cf7b6b]"
                  : "border-[#2c3035] focus:border-[#3a4046]"
              }`}
            />
          )}
          {fontErrors.body && <p className="text-[10px] text-[#cf7b6b]">{fontErrors.body}</p>}
        </div>
      </div>
      <p className="text-[10px] text-[#4b5158]">
        A font not installed on this device falls back to the system default automatically.
        ↺ Reset Custom palette also restores the official fonts.
      </p>

      {/* Bounded size/weight/style controls (FB-20260715-006) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-display-size" className="text-[10px] text-[#6e767d]">
            Display size ({MIKROS_DISPLAY_FONT_SIZE_MIN_PX}–{MIKROS_DISPLAY_FONT_SIZE_MAX_PX}px)
          </label>
          <input
            id="mikros-display-size"
            type="number"
            min={MIKROS_DISPLAY_FONT_SIZE_MIN_PX}
            max={MIKROS_DISPLAY_FONT_SIZE_MAX_PX}
            step={1}
            value={draftTypography.displayFontSizePx}
            onChange={(e) => onDisplaySizeChange(e.target.value)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-body-size" className="text-[10px] text-[#6e767d]">
            Body/UI size ({MIKROS_BODY_FONT_SIZE_MIN_PX}–{MIKROS_BODY_FONT_SIZE_MAX_PX}px)
          </label>
          <input
            id="mikros-body-size"
            type="number"
            min={MIKROS_BODY_FONT_SIZE_MIN_PX}
            max={MIKROS_BODY_FONT_SIZE_MAX_PX}
            step={1}
            value={draftTypography.bodyFontSizePx}
            onChange={(e) => onBodySizeChange(e.target.value)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-display-weight" className="text-[10px] text-[#6e767d]">
            Display weight
          </label>
          <select
            id="mikros-display-weight"
            value={draftTypography.displayFontWeight}
            onChange={(e) => onTypographyFieldChange("displayFontWeight", Number(e.target.value) as MikrosFontWeight)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {MIKROS_FONT_WEIGHTS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-body-weight" className="text-[10px] text-[#6e767d]">
            Body/UI weight
          </label>
          <select
            id="mikros-body-weight"
            value={draftTypography.bodyFontWeight}
            onChange={(e) => onTypographyFieldChange("bodyFontWeight", Number(e.target.value) as MikrosFontWeight)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {MIKROS_FONT_WEIGHTS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-display-style" className="text-[10px] text-[#6e767d]">
            Display style
          </label>
          <select
            id="mikros-display-style"
            value={draftTypography.displayFontStyle}
            onChange={(e) => onTypographyFieldChange("displayFontStyle", e.target.value as MikrosFontStyle)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {MIKROS_FONT_STYLES.map((s) => (
              <option key={s} value={s}>{s === "normal" ? "Normal" : "Italic"}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="mikros-body-style" className="text-[10px] text-[#6e767d]">
            Body/UI style
          </label>
          <select
            id="mikros-body-style"
            value={draftTypography.bodyFontStyle}
            onChange={(e) => onTypographyFieldChange("bodyFontStyle", e.target.value as MikrosFontStyle)}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {MIKROS_FONT_STYLES.map((s) => (
              <option key={s} value={s}>{s === "normal" ? "Normal" : "Italic"}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
