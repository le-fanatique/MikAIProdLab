import type { EditorialItemView, TrimRange } from "@/components/editorial/EditorialTimeline";

type Props = {
  item: EditorialItemView;
  d: number;
  widthPct: number;
  color: string;
  trimmed: boolean;
  itemDraft: TrimRange | undefined;
  itemTrimEnabled: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onStartTrimDrag: (e: React.PointerEvent<HTMLDivElement>, item: EditorialItemView, edge: "in" | "out") => void;
};

/** One items-lane segment — gap (dashed placeholder) or shot item, with trim handles (IND.CLIENTSPLIT.1, moved verbatim from EditorialTimeline.tsx). All derived values (d, widthPct, color, trimmed, tooltip…) and both callbacks are computed/owned by the parent's own state — this component only renders. */
export default function EditorialItemSegment({
  item,
  d,
  widthPct,
  color,
  trimmed,
  itemDraft,
  itemTrimEnabled,
  isSelected,
  onSelect,
  onStartTrimDrag,
}: Props) {
  if (item.type === "gap") {
    return (
      <button
        type="button"
        onClick={onSelect}
        style={{
          width: `${widthPct}%`,
          minWidth: "36px",
          boxShadow: isSelected ? "inset 0 0 0 1px #5b93d6" : undefined,
        }}
        className="relative flex flex-col justify-between px-1.5 py-1.5 border-r border-r-[#1a1d20] last:border-r-0 border-l-2 border-l-[#2c3035] border-dashed shrink-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.02)_5px,rgba(255,255,255,0.02)_10px)] text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
        title={`Gap — ${d.toFixed(1)}s`}
      >
        <span className="text-[9px] font-mono text-[#4b5158] uppercase tracking-wider leading-none">
          Gap
        </span>
        <span className="text-[9px] font-mono text-[#3a4046] tabular-nums leading-none">
          {d.toFixed(1)}s
        </span>
      </button>
    );
  }

  const tooltipParts = [
    item.shotCode ? `${item.shotCode} — ${item.title ?? ""}` : item.title ?? "",
  ];
  if (trimmed) {
    tooltipParts.push(
      `Trim: ${item.trimInSeconds!.toFixed(1)}s → ${item.trimOutSeconds!.toFixed(1)}s`,
      `Effective: ${d.toFixed(1)}s`
    );
  }
  if (item.isPlaceholder) tooltipParts.push("Placeholder");
  else if (!item.hasVideo) tooltipParts.push("No video");

  return (
    <div
      style={{ width: `${widthPct}%`, minWidth: "48px" }}
      className="relative flex border-r border-r-[#1a1d20] last:border-r-0 shrink-0"
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          borderLeftColor: color,
          backgroundColor: item.isPlaceholder
            ? "rgba(205, 162, 79, 0.06)"
            : undefined,
          boxShadow: isSelected ? "inset 0 0 0 1px #5b93d6" : undefined,
        }}
        className="flex-1 min-w-0 flex flex-col justify-between px-1.5 py-1.5 border-l-2 hover:bg-white/[0.03] transition-colors overflow-hidden text-left cursor-pointer h-full"
        title={tooltipParts.join("\n")}
      >
        <span
          className="text-[9px] font-mono truncate leading-none"
          style={{ color }}
        >
          {item.shotCode ?? item.title}
        </span>
        <span className="text-[9px] text-[#4b5158] truncate leading-none">
          {item.title}
        </span>
        <span className="text-[9px] font-mono tabular-nums leading-none truncate">
          <span className="text-[#4b5158]">{d.toFixed(1)}s</span>
          {itemDraft ? (
            <span className="text-[#5b93d6]">
              {" "}· Trim {itemDraft.trimIn.toFixed(1)}s → {itemDraft.trimOut.toFixed(1)}s
            </span>
          ) : (
            trimmed && <span className="text-[#5b93d6]"> · Trimmed</span>
          )}
        </span>
      </button>

      {/* Item-level trim handles — shot items with a video only */}
      {item.videoUrl &&
        (itemTrimEnabled ? (
          <>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Trim in handle"
              title="Trim in"
              className="absolute left-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
              style={{ width: "10px" }}
              onPointerDown={(e) => onStartTrimDrag(e, item, "in")}
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
              onPointerDown={(e) => onStartTrimDrag(e, item, "out")}
            >
              <div className="w-0.5 h-5 rounded-full bg-[#5b93d6]/50 group-hover:bg-[#5b93d6] group-focus:bg-[#5b93d6] transition-colors" />
            </div>
          </>
        ) : (
          <div
            className="absolute right-0 top-0 h-full flex items-center justify-center select-none z-10 opacity-40"
            style={{ width: "10px" }}
            title="Video duration unavailable — trims can be set once the video loads."
          >
            <div className="w-0.5 h-5 rounded-full bg-[#4b5158]" />
          </div>
        ))}
    </div>
  );
}
