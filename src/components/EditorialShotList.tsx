"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateSequenceShotOrder, createPlaceholderShot } from "@/actions/shots";

type EditorialShot = {
  id: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  hasApprovedVideo: boolean;
};

type Props = {
  shots: EditorialShot[];
  projectId: number;
  sequenceId: number;
  returnTo: string;
};

function StatusBadge({ shot }: { shot: EditorialShot }) {
  if (shot.title === "Placeholder") {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#cda24f] border border-[#3d3423] rounded px-1.5 py-px">
        Placeholder
      </span>
    );
  }
  if (shot.hasApprovedVideo) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#6b9e72] border border-[#2a3d2e] rounded px-1.5 py-px">
        Approved video
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#4b5158] border border-[#232629] rounded px-1.5 py-px">
      No video
    </span>
  );
}

export default function EditorialShotList({
  shots,
  projectId,
  sequenceId,
  returnTo,
}: Props) {
  const initialOrder = useMemo(() => shots.map((s) => s.id), [shots]);
  const [order, setOrder] = useState<number[]>(initialOrder);

  const shotById = useMemo(() => {
    const map = new Map<number, EditorialShot>();
    for (const s of shots) map.set(s.id, s);
    return map;
  }, [shots]);

  const orderedShots = order
    .map((id) => shotById.get(id))
    .filter((s): s is EditorialShot => s !== undefined);

  const isDirty = useMemo(
    () => order.some((id, i) => id !== initialOrder[i]),
    [order, initialOrder]
  );

  const totalDuration = orderedShots.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0
  );

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Order header ── */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#6e767d]">
          {orderedShots.length} shot{orderedShots.length !== 1 ? "s" : ""}
          {totalDuration > 0 && (
            <>
              {" · "}
              <span className="font-mono">{totalDuration.toFixed(1)}s</span>
              {" total"}
            </>
          )}
          {isDirty && (
            <span className="ml-2 text-[9px] font-mono text-[#cda24f]">
              unsaved order
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOrder(initialOrder)}
            disabled={!isDirty}
            className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <form action={updateSequenceShotOrder}>
            <input type="hidden" name="projectId" value={String(projectId)} />
            <input type="hidden" name="sequenceId" value={String(sequenceId)} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderedIds" value={order.join(",")} />
            <button
              type="submit"
              disabled={!isDirty}
              className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Order
            </button>
          </form>
        </div>
      </div>

      {/* ── Shot rows ── */}
      <div className="flex flex-col divide-y divide-[#1a1d20]">
        {orderedShots.map((shot, index) => (
          <div key={shot.id} className="flex items-center gap-3 py-2">
            <span className="text-[10px] font-mono text-[#3a4046] w-6 shrink-0 text-right tabular-nums">
              {index + 1}
            </span>
            <span className="text-[10px] font-mono text-[#6e767d] w-16 shrink-0 truncate">
              {shot.shotCode ?? "—"}
            </span>
            <Link
              href={`/projects/${projectId}/sequences/${sequenceId}/shots/${shot.id}`}
              className="flex-1 min-w-0 text-xs text-[#a4abb2] hover:text-[#e7e9ec] transition-colors truncate"
            >
              {shot.title}
            </Link>
            <StatusBadge shot={shot} />
            <span className="text-[10px] font-mono text-[#6e767d] w-12 shrink-0 text-right tabular-nums">
              {shot.durationSeconds !== null
                ? `${shot.durationSeconds.toFixed(1)}s`
                : "—"}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                title="Move Up"
                aria-label="Move Up"
                className="rounded border border-[#232629] text-[#6e767d] w-6 h-6 text-xs hover:border-[#3a4046] hover:text-[#a4abb2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === orderedShots.length - 1}
                title="Move Down"
                aria-label="Move Down"
                className="rounded border border-[#232629] text-[#6e767d] w-6 h-6 text-xs hover:border-[#3a4046] hover:text-[#a4abb2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
        {orderedShots.length === 0 && (
          <p className="text-xs text-[#4b5158] py-2">No shots in this sequence yet.</p>
        )}
      </div>

      {/* ── Add placeholder ── */}
      <form
        action={createPlaceholderShot}
        className="flex items-center gap-2 border-t border-[#1a1d20] pt-3"
      >
        <input type="hidden" name="projectId" value={String(projectId)} />
        <input type="hidden" name="sequenceId" value={String(sequenceId)} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <span className="text-xs text-[#6e767d]">Add Placeholder Shot</span>
        <input
          type="number"
          name="durationSeconds"
          step="0.1"
          min="0.1"
          defaultValue="2.0"
          className="w-20 rounded bg-[#0d0e10] border border-[#2c3035] px-2 py-1 text-xs text-[#e7e9ec] text-right focus:outline-none focus:border-[#3a4046] transition-colors tabular-nums font-mono"
        />
        <span className="text-[10px] text-[#4b5158]">s</span>
        <button
          type="submit"
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Add
        </button>
      </form>
    </div>
  );
}
