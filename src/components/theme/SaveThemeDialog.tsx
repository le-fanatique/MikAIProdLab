"use client";

type Props = {
  saveNameOpen: boolean;
  onOpen: () => void;
  saveName: string;
  onSaveNameChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveError: string | null;
  saveDisabled: boolean;
  presetSyncPending: boolean;
  isEditingTheme: boolean;
};

/** "Save as custom" / "Update theme" name field + confirm/cancel (IND.THEME.2). */
export default function SaveThemeDialog({
  saveNameOpen,
  onOpen,
  saveName,
  onSaveNameChange,
  onSave,
  onCancel,
  saveError,
  saveDisabled,
  presetSyncPending,
  isEditingTheme,
}: Props) {
  return (
    <div className="border-t border-[#1e2124] pt-3">
      {!saveNameOpen ? (
        <button
          type="button"
          onClick={onOpen}
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
              onChange={(e) => onSaveNameChange(e.target.value)}
              placeholder="e.g. My Mikros"
              className="flex-1 rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#4b5158] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
              className="rounded border border-[#9079F2]/50 text-[#9079F2] px-3 py-1.5 text-xs hover:border-[#9079F2] hover:bg-[#9079F2]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              {presetSyncPending ? "Saving…" : isEditingTheme ? "Update theme" : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Cancel
            </button>
          </div>
          {saveError && <p className="text-xs text-[#cf7b6b]">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
