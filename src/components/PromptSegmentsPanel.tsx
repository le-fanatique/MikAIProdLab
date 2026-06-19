import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import SegmentTypeBadge from "@/components/SegmentTypeBadge";

type SegmentRow = {
  id: number;
  label: string;
  promptText: string;
  startSeconds: number | null;
  durationSeconds: number | null;
  segmentType: string | null;
  editHref: string;
  deleteAction: () => Promise<void>;
  moveUpAction: (() => Promise<void>) | null;
  moveDownAction: (() => Promise<void>) | null;
};

type Props = {
  segments: SegmentRow[];
  addHref: string;
};

function fmtSec(s: number): string {
  return `${parseFloat(s.toFixed(1))}s`;
}

function timingChip(s: number | null, d: number | null): string | null {
  if (s !== null && d !== null) return `@ ${fmtSec(s)} · ${fmtSec(d)} → ${fmtSec(s + d)}`;
  if (s !== null) return `@ ${fmtSec(s)}`;
  if (d !== null) return fmtSec(d);
  return null;
}

export default function PromptSegmentsPanel({ segments, addHref }: Props) {
  if (segments.length === 0) {
    return (
      <EmptyState
        title="No prompt segments yet."
        description="Build the generative timeline for this shot."
        action={
          <Link
            href={addHref}
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            + Add Segment
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {segments.map((seg, index) => {
          const timing = timingChip(seg.startSeconds, seg.durationSeconds);
          return (
            <div
              key={seg.id}
              className="border-b border-[#1a1d20] last:border-0 py-2.5 flex items-start gap-3"
            >
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                <span className="text-[11px] font-mono text-[#4b5158] tabular-nums w-4 text-right">
                  {index + 1}
                </span>
                <SegmentTypeBadge type={seg.segmentType} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e7e9ec]">{seg.label}</p>
                <p className="text-xs text-[#6e767d] mt-0.5 truncate">{seg.promptText}</p>
                {timing !== null ? (
                  <span className="inline-block mt-1 rounded border border-[#2c3035] px-1.5 py-0.5 text-[10px] font-mono text-[#6e767d]">
                    {timing}
                  </span>
                ) : (
                  <span className="inline-block mt-1 rounded border border-dashed border-[#2c3035] px-1.5 py-0.5 text-[10px] font-mono text-[#4b5158]">
                    no timing
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                <div className="flex items-center gap-1">
                  {seg.moveUpAction !== null ? (
                    <form action={seg.moveUpAction}>
                      <button
                        type="submit"
                        className="text-[11px] text-[#4b5158] hover:text-[#a4abb2] transition-colors leading-none"
                      >
                        ↑
                      </button>
                    </form>
                  ) : (
                    <span className="text-[11px] text-[#3a4046] leading-none">↑</span>
                  )}
                  {seg.moveDownAction !== null ? (
                    <form action={seg.moveDownAction}>
                      <button
                        type="submit"
                        className="text-[11px] text-[#4b5158] hover:text-[#a4abb2] transition-colors leading-none"
                      >
                        ↓
                      </button>
                    </form>
                  ) : (
                    <span className="text-[11px] text-[#3a4046] leading-none">↓</span>
                  )}
                </div>
                <Link
                  href={seg.editHref}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Edit
                </Link>
                <DeleteButton
                  action={seg.deleteAction}
                  confirm="Delete this segment?"
                  label="Del"
                  className="text-xs text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors"
                />
              </div>
            </div>
          );
        })}
      </div>
      <Link
        href={addHref}
        className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
      >
        + Add Segment
      </Link>
    </div>
  );
}
