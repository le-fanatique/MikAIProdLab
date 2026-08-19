"use client";

import {
  CUSTOM_MODE_PREFIX,
  type CustomTheme,
  customModeValue,
  isConflictDisplayId,
} from "@/lib/mikrosTheme";

type Props = {
  mode: string;
  hasMounted: boolean;
  isMikros: boolean;
  activeCustomId: string | null;
  customThemes: CustomTheme[];
  onModeChange: (next: string) => void;
};

/** The "Default" / "Custom" / saved-theme radio group at the top of the appearance panel (IND.THEME.2). */
export default function ModeRadioGroup({ mode, hasMounted, isMikros, activeCustomId, customThemes, onModeChange }: Props) {
  return (
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
            onChange={() => onModeChange("default")}
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
            onChange={() => onModeChange("mikros")}
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
              onChange={() => onModeChange(customModeValue(theme.id))}
              className="accent-[#9079F2]"
            />
            {isConflictDisplayId(theme.id) ? `${theme.name} (Local, unsynced)` : theme.name}
          </label>
        ))}
      </div>
      <p className="text-[10px] text-[#4b5158]">
        Applies immediately, no reload needed. Which one is active stays local to this browser — presets themselves are saved on the server (see below).
      </p>
    </div>
  );
}
