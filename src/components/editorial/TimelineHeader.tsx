type Props = {
  itemsMode: boolean;
  effectiveTotal: number;
  itemsLength: number;
  videoReadyCount: number;
  missingVideoCount: number;
  shotsLength: number;
  timedCount: number;
  isDurationsDirty: boolean;
  hasAnyItemTrim: boolean;
  isSavingTrim: boolean;
  onResetAllTrims: () => void;
  onDurationsReset: () => void;
};

/** Timeline header: total/summary line, "Reset all trims" (items mode) or "Reset"/"Apply" (legacy lane) (IND.CLIENTSPLIT.1, moved verbatim from EditorialTimeline.tsx). */
export default function TimelineHeader({
  itemsMode,
  effectiveTotal,
  itemsLength,
  videoReadyCount,
  missingVideoCount,
  shotsLength,
  timedCount,
  isDurationsDirty,
  hasAnyItemTrim,
  isSavingTrim,
  onResetAllTrims,
  onDurationsReset,
}: Props) {
  return (
    <div className="flex items-center justify-between mb-3 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-[#6e767d]">
          Total{" "}
          <span className="font-mono">
            {effectiveTotal.toFixed(1)}s
          </span>{" "}
          effective
          {" · "}
          {itemsMode ? (
            <>
              {itemsLength} editorial item{itemsLength !== 1 ? "s" : ""}
              {" · "}
              {videoReadyCount} with video
              {" · "}
              {missingVideoCount} placeholder/no video
            </>
          ) : (
            <>
              {timedCount} of {shotsLength} shot{shotsLength !== 1 ? "s" : ""} timed
            </>
          )}
        </span>
        {!itemsMode && isDurationsDirty && (
          <span className="text-[9px] font-mono text-[#cda24f]">unsaved</span>
        )}
      </div>
      {itemsMode && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onResetAllTrims}
            disabled={!hasAnyItemTrim || isSavingTrim}
            title="Reset all trims on this timeline. Gaps are kept."
            className="rounded border border-[#3d3423] text-[#cda24f] px-2.5 py-1 text-xs hover:border-[#cda24f] hover:bg-[#cda24f]/10 transition-colors disabled:opacity-60 disabled:border-[#2c3035] disabled:text-[#6e767d] disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            ↺ Reset all trims
          </button>
        </div>
      )}
      {!itemsMode && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDurationsReset}
            disabled={!isDurationsDirty}
            className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={!isDurationsDirty}
            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
