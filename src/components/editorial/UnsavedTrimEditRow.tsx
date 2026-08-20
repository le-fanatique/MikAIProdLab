type Props = {
  label: string;
  trimIn: number;
  trimOut: number;
  isSavingTrim: boolean;
  onSave: () => void;
  onReset: () => void;
};

/** "Unsaved trim" row — Save Trim / Reset, identical for item-mode and legacy-lane trims (IND.CLIENTSPLIT.1, moved verbatim from EditorialTimeline.tsx, previously duplicated once per mode). The caller sets `key` on this component itself. */
export default function UnsavedTrimEditRow({
  label,
  trimIn,
  trimOut,
  isSavingTrim,
  onSave,
  onReset,
}: Props) {
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-mono text-[#6e767d] w-16 truncate shrink-0">{label}</span>
      <span className="text-[10px] font-mono text-[#5b93d6]">
        Trim {trimIn.toFixed(1)}s → {trimOut.toFixed(1)}s
      </span>
      <span className="text-[9px] font-mono text-[#cda24f]">unsaved</span>
      <button
        type="button"
        onClick={onSave}
        disabled={isSavingTrim}
        className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-2 py-0.5 text-[10px] hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isSavingTrim ? "Saving..." : "Save Trim"}
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isSavingTrim}
        className="text-[10px] text-[#4b5158] hover:text-[#6e767d] disabled:opacity-40 transition-colors"
      >
        Reset
      </button>
    </div>
  );
}
