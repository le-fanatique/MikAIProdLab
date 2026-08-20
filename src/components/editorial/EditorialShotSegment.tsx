import type { EditorialTimelineShot, TrimRange } from "@/components/editorial/EditorialTimeline";

type Props = {
  shot: EditorialTimelineShot;
  d: number;
  widthPct: number;
  color: string;
  trimmed: boolean;
  target: number | null;
  mismatch: boolean;
  isVideoShot: boolean;
  trimEnabled: boolean;
  draft: TrimRange | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onStartTrimDrag: (e: React.PointerEvent<HTMLDivElement>, shot: EditorialTimelineShot, edge: "in" | "out") => void;
  onStartDurationDrag: (e: React.PointerEvent<HTMLDivElement>, shot: EditorialTimelineShot) => void;
};

/** One legacy-lane segment — a Shot with trim handles or a target-duration resize handle (IND.CLIENTSPLIT.1, moved verbatim from EditorialTimeline.tsx). All derived values (d, widthPct, color, trimmed, tooltip…) and all three callbacks are computed/owned by the parent's own state — this component only renders. */
export default function EditorialShotSegment({
  shot,
  d,
  widthPct,
  color,
  trimmed,
  target,
  mismatch,
  isVideoShot,
  trimEnabled,
  draft,
  isSelected,
  onSelect,
  onStartTrimDrag,
  onStartDurationDrag,
}: Props) {
  const tooltipParts = [
    shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title,
  ];
  if (trimmed) {
    tooltipParts.push(
      `Trim: ${shot.trimInSeconds!.toFixed(1)}s → ${shot.trimOutSeconds!.toFixed(1)}s`,
      `Effective: ${d.toFixed(1)}s`
    );
  }
  if (mismatch) tooltipParts.push(`Target: ${target!.toFixed(1)}s`);
  if (shot.isPlaceholder) tooltipParts.push("Placeholder");
  else if (!shot.hasVideo) tooltipParts.push("No video");

  return (
    <div
      style={{ width: `${widthPct}%`, minWidth: "48px" }}
      className="relative flex border-r border-r-[#1a1d20] last:border-r-0 shrink-0"
    >
      {/* Segment body — click selects the shot (loads it in the viewer) */}
      <button
        type="button"
        onClick={onSelect}
        style={{
          borderLeftColor: color,
          backgroundColor: shot.isPlaceholder
            ? "rgba(205, 162, 79, 0.06)"
            : undefined,
          boxShadow: isSelected
            ? "inset 0 0 0 1px #5b93d6"
            : undefined,
        }}
        className="flex-1 min-w-0 flex flex-col justify-between px-1.5 py-1.5 border-l-2 hover:bg-white/[0.03] transition-colors overflow-hidden h-full text-left cursor-pointer"
        title={tooltipParts.join("\n")}
      >
        <span
          className="text-[9px] font-mono truncate leading-none"
          style={{ color }}
        >
          {shot.shotCode ?? shot.title}
        </span>
        <span className="text-[9px] text-[#4b5158] truncate leading-none">
          {shot.title}
        </span>
        <span className="text-[9px] font-mono tabular-nums leading-none truncate">
          <span className="text-[#4b5158]">{d.toFixed(1)}s</span>
          {draft ? (
            <span className="text-[#5b93d6]">
              {" "}· Trim {draft.trimIn.toFixed(1)}s → {draft.trimOut.toFixed(1)}s
            </span>
          ) : (
            trimmed && <span className="text-[#5b93d6]"> · Trimmed</span>
          )}
          {mismatch && (
            <span className="text-[#cda24f]"> · Target {target!.toFixed(1)}s</span>
          )}
        </span>
      </button>

      {/* Trim handles — left = trim in, right = trim out */}
      {isVideoShot &&
        (trimEnabled ? (
          <>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Trim in handle"
              title="Trim in"
              className="absolute left-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
              style={{ width: "10px" }}
              onPointerDown={(e) => onStartTrimDrag(e, shot, "in")}
            >
              <div className="w-0.5 h-5 rounded-full bg-[#5b93d6]/50 group-hover:bg-[#5b93d6] group-focus:bg-[#5b93d6] transition-colors" />
            </div>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Trim out handle"
              title="Trim out"
              className="absolute right-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
              style={{ width: "10px" }}
              onPointerDown={(e) => onStartTrimDrag(e, shot, "out")}
            >
              <div className="w-0.5 h-5 rounded-full bg-[#5b93d6]/50 group-hover:bg-[#5b93d6] group-focus:bg-[#5b93d6] transition-colors" />
            </div>
          </>
        ) : (
          <div
            className="absolute right-0 top-0 h-full flex items-center justify-center select-none z-10 opacity-40"
            style={{ width: "10px" }}
            title="Video duration unavailable — use the trim inputs below."
          >
            <div className="w-0.5 h-5 rounded-full bg-[#4b5158]" />
          </div>
        ))}

      {/* Target duration resize — only for segments without video */}
      {!isVideoShot && (
        <div
          className="absolute right-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10"
          style={{ width: "10px" }}
          onPointerDown={(e) => onStartDurationDrag(e, shot)}
        >
          <div className="w-0.5 h-4 rounded-full bg-white/25" />
        </div>
      )}
    </div>
  );
}
