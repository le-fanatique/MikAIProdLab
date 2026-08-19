"use client";

import { type CustomTheme, isConflictDisplayId } from "@/lib/mikrosTheme";

type Props = {
  customThemes: CustomTheme[];
  presetSyncPending: boolean;
  presetsCorrupted: boolean;
  legacyImportNotice: string | null;
  presetSyncError: string | null;
  deleteError: string | null;
  onReloadPresets: () => void;
  onEditTheme: (theme: CustomTheme) => void;
  onDeleteCustom: (id: string) => void;
  onDiscardConflictedLocal: (displayId: string) => void;
};

/** Saved custom themes list — reload / edit / delete / discard-local-conflict (IND.THEME.2). */
export default function CustomThemesList({
  customThemes,
  presetSyncPending,
  presetsCorrupted,
  legacyImportNotice,
  presetSyncError,
  deleteError,
  onReloadPresets,
  onEditTheme,
  onDeleteCustom,
  onDiscardConflictedLocal,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">
          Custom themes
        </span>
        <button
          type="button"
          onClick={onReloadPresets}
          disabled={presetSyncPending}
          className="text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors disabled:opacity-40"
        >
          Reload presets
        </button>
      </div>
      <p className="text-[10px] text-[#4b5158]">
        Saved on the server — available after a restart and from any browser. The active choice above stays local to this browser.
      </p>
      {presetsCorrupted && (
        <p className="text-xs text-[#cf7b6b]">
          Stored presets could not be read (corrupted data). Saving, editing and deleting are disabled until this
          is resolved — your currently applied theme is unaffected.
        </p>
      )}
      {legacyImportNotice && <p className="text-xs text-[#cda24f]">{legacyImportNotice}</p>}
      {presetSyncError && <p className="text-xs text-[#cf7b6b]">{presetSyncError}</p>}
      {deleteError && <p className="text-xs text-[#cf7b6b]">{deleteError}</p>}
      {customThemes.length > 0 && (
        <div className="flex flex-col gap-1">
          {customThemes.map((theme) => (
            <div key={theme.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#a4abb2]">
                {theme.name}
                {isConflictDisplayId(theme.id) && (
                  <span className="ml-1.5 text-[10px] text-[#cda24f]">(local, unsynced)</span>
                )}
              </span>
              <div className="flex items-center gap-3">
                {isConflictDisplayId(theme.id) ? (
                  <button
                    type="button"
                    onClick={() => onDiscardConflictedLocal(theme.id)}
                    className="text-[#4b5158] hover:text-[#cf7b6b] transition-colors"
                  >
                    Discard local copy
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditTheme(theme)}
                      disabled={presetSyncPending}
                      className="text-[#4b5158] hover:text-[#a4abb2] transition-colors disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCustom(theme.id)}
                      disabled={presetSyncPending || presetsCorrupted}
                      className="text-[#4b5158] hover:text-[#cf7b6b] transition-colors disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
