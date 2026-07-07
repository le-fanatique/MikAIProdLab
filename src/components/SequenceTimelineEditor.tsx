"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { updateSequenceShotDurations } from "@/actions/shots";

const SHOT_PALETTE = ["#5b93d6", "#6aa6a0", "#9bb05a", "#cda24f", "#cf8b6b"];

// Editorial status colors
const COLOR_APPROVED = "#6b9e72";
const COLOR_NO_VIDEO = "#4b5158";
const COLOR_PLACEHOLDER = "#cda24f";

// Visual fallback so untimed shots stay visible as segments (editorial only)
const FALLBACK_SEGMENT_SECONDS = 1.0;

type ShotEntry = {
  id: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  // Editorial variant only — optional so Sequence Detail keeps its call as-is
  hasApprovedVideo?: boolean;
  isPlaceholder?: boolean;
  trimInSeconds?: number | null;
  trimOutSeconds?: number | null;
};

type Props = {
  shots: ShotEntry[];
  projectId: number;
  sequenceId: number;
  /** Optional redirect target after Apply — defaults to Sequence Detail. */
  returnTo?: string;
  /** "summary" (default) keeps the compact lane; "editorial" shows montage segments. */
  variant?: "summary" | "editorial";
};

function hasValidTrim(shot: ShotEntry): boolean {
  return (
    shot.trimInSeconds != null &&
    shot.trimOutSeconds != null &&
    shot.trimInSeconds >= 0 &&
    shot.trimOutSeconds > shot.trimInSeconds
  );
}

function statusColor(shot: ShotEntry): string {
  if (shot.isPlaceholder) return COLOR_PLACEHOLDER;
  if (shot.hasApprovedVideo) return COLOR_APPROVED;
  return COLOR_NO_VIDEO;
}

// Pick a tick step giving at most ~8 labeled graduations
function tickStep(total: number): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const step of candidates) {
    if (total / step <= 8) return step;
  }
  return 600;
}

type DragState = {
  shotId: number;
  pointerStartX: number;
  initialDur: number;
  initialTotalDur: number;
  trackWidth: number;
};

function parseRaw(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  if (isNaN(n) || n < 0) return null;
  return n;
}

function snap(value: number): number {
  return parseFloat((Math.round(value / 0.1) * 0.1).toFixed(1));
}

export default function SequenceTimelineEditor({ shots, projectId, sequenceId, returnTo, variant = "summary" }: Props) {
  const isEditorial = variant === "editorial";
  const [durations, setDurations] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const s of shots) {
      map[s.id] = s.durationSeconds?.toString() ?? "";
    }
    return map;
  });

  const dragRef = useRef<DragState | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const parsedDurations = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const s of shots) {
      map[s.id] = parseRaw(durations[s.id] ?? "");
    }
    return map;
  }, [shots, durations]);

  const timedShots = useMemo(
    () => shots.filter((s) => {
      const d = parsedDurations[s.id];
      return d !== null && d > 0;
    }),
    [shots, parsedDurations]
  );

  const totalDuration = useMemo(
    () => timedShots.reduce((sum, s) => sum + (parsedDurations[s.id] ?? 0), 0),
    [timedShots, parsedDurations]
  );

  const colorMap = useMemo(() => {
    const map = new Map<number, string>();
    let idx = 0;
    for (const s of shots) {
      const d = parsedDurations[s.id];
      if (d !== null && d > 0) {
        map.set(s.id, SHOT_PALETTE[idx % SHOT_PALETTE.length]);
        idx++;
      }
    }
    return map;
  }, [shots, parsedDurations]);

  // Effective duration drives editorial segment widths:
  // trim range if valid, else the (live-edited) target duration, else a
  // visual fallback so the segment never disappears
  const effectiveFor = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of shots) {
      if (hasValidTrim(s)) {
        map.set(s.id, s.trimOutSeconds! - s.trimInSeconds!);
      } else {
        const d = parsedDurations[s.id];
        map.set(s.id, d !== null && d > 0 ? d : FALLBACK_SEGMENT_SECONDS);
      }
    }
    return map;
  }, [shots, parsedDurations]);

  // Editorial lane shows every shot (holes included); summary keeps timed only
  const laneShots = isEditorial ? shots : timedShots;
  const laneDur = (shot: ShotEntry): number =>
    isEditorial
      ? effectiveFor.get(shot.id) ?? FALLBACK_SEGMENT_SECONDS
      : parsedDurations[shot.id] ?? 0;
  const laneTotal = isEditorial
    ? laneShots.reduce((sum, s) => sum + laneDur(s), 0)
    : totalDuration;

  const isDirty = useMemo(
    () => shots.some((s) => {
      const initial = s.durationSeconds?.toString() ?? "";
      return (durations[s.id] ?? "") !== initial;
    }),
    [shots, durations]
  );

  function handleReset() {
    const map: Record<number, string> = {};
    for (const s of shots) {
      map[s.id] = s.durationSeconds?.toString() ?? "";
    }
    setDurations(map);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragRef.current;
    if (!ds || ds.initialTotalDur <= 0) return;
    const deltaX = e.clientX - ds.pointerStartX;
    const deltaDur = (deltaX / ds.trackWidth) * ds.initialTotalDur;
    const newDur = Math.max(0.1, snap(ds.initialDur + deltaDur));
    setDurations((prev) => ({ ...prev, [ds.shotId]: newDur.toString() }));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    <form action={updateSequenceShotDurations}>
      <input type="hidden" name="projectId" value={String(projectId)} />
      <input type="hidden" name="sequenceId" value={String(sequenceId)} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#6e767d]">
            {isEditorial ? (
              <>
                Total <span className="font-mono">{laneTotal.toFixed(1)}s</span> effective
                {" · "}
                {timedShots.length} of {shots.length} shot{shots.length !== 1 ? "s" : ""} timed
              </>
            ) : (
              <>
                {timedShots.length} of {shots.length} shot{shots.length !== 1 ? "s" : ""} timed
                {totalDuration > 0 && (
                  <>
                    {" · "}
                    <span className="font-mono">{totalDuration.toFixed(1)}s</span>
                    {" total"}
                  </>
                )}
              </>
            )}
          </span>
          {isDirty && (
            <span className="text-[9px] font-mono text-[#cda24f]">unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty}
            className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={!isDirty}
            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── Lane preview ── */}
      {laneTotal > 0 && laneShots.length > 0 ? (
        <>
          <div
            ref={trackRef}
            className="flex rounded overflow-hidden border border-[#1a1d20] bg-[#0d0e10]"
            style={{ height: isEditorial ? "72px" : "56px" }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {laneShots.map((shot) => {
              const d = laneDur(shot);
              const widthPct = (d / laneTotal) * 100;
              const trimmed = hasValidTrim(shot);
              const color = isEditorial
                ? statusColor(shot)
                : colorMap.get(shot.id) ?? SHOT_PALETTE[0];
              const target = parsedDurations[shot.id];
              const mismatch =
                isEditorial &&
                trimmed &&
                target !== null &&
                Math.abs(target - d) > 0.05;
              const tooltipParts = [
                shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title,
              ];
              if (isEditorial) {
                if (trimmed) {
                  tooltipParts.push(
                    `Trim: ${shot.trimInSeconds!.toFixed(1)}s → ${shot.trimOutSeconds!.toFixed(1)}s`,
                    `Effective: ${d.toFixed(1)}s`
                  );
                }
                if (mismatch) tooltipParts.push(`Target: ${target!.toFixed(1)}s`);
                if (shot.isPlaceholder) tooltipParts.push("Placeholder");
                else if (!shot.hasApprovedVideo) tooltipParts.push("No video");
              }
              // The drag handle edits the target duration — on trimmed segments
              // the width follows the trim instead, so the handle is hidden
              const showHandle = !isEditorial || !trimmed;
              return (
                <div
                  key={shot.id}
                  style={{
                    width: `${widthPct}%`,
                    minWidth: isEditorial ? "48px" : undefined,
                  }}
                  className="relative flex border-r border-r-[#1a1d20] last:border-r-0 shrink-0"
                >
                  <Link
                    href={`/projects/${projectId}/sequences/${sequenceId}/shots/${shot.id}`}
                    style={{
                      borderLeftColor: color,
                      backgroundColor: isEditorial && shot.isPlaceholder
                        ? "rgba(205, 162, 79, 0.06)"
                        : undefined,
                    }}
                    className="flex-1 min-w-0 flex flex-col justify-between px-1.5 py-1.5 border-l-2 hover:bg-white/[0.03] transition-colors overflow-hidden h-full"
                    title={tooltipParts.join("\n")}
                  >
                    <span
                      className="text-[9px] font-mono truncate leading-none"
                      style={{ color }}
                    >
                      {shot.shotCode ?? shot.title}
                    </span>
                    {isEditorial && (
                      <span className="text-[9px] text-[#4b5158] truncate leading-none">
                        {shot.title}
                      </span>
                    )}
                    <span className="text-[9px] font-mono tabular-nums leading-none truncate">
                      <span className="text-[#4b5158]">{d.toFixed(1)}s</span>
                      {isEditorial && trimmed && (
                        <span className="text-[#5b93d6]"> · Trimmed</span>
                      )}
                      {mismatch && (
                        <span className="text-[#cda24f]"> · Target {target!.toFixed(1)}s</span>
                      )}
                    </span>
                  </Link>
                  {/* Right drag handle — edits the target duration */}
                  {showHandle && (
                    <div
                      className="absolute right-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10"
                      style={{ width: "10px" }}
                      onPointerDown={(e) => {
                        const dur = parsedDurations[shot.id];
                        if (dur === null || !trackRef.current) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dragRef.current = {
                          shotId: shot.id,
                          pointerStartX: e.clientX,
                          initialDur: dur,
                          initialTotalDur: laneTotal,
                          trackWidth: trackRef.current.clientWidth,
                        };
                      }}
                    >
                      <div className="w-0.5 h-4 rounded-full bg-white/25" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {isEditorial ? (
            /* Timeline scale — labeled graduations */
            <div className="relative mt-1" style={{ height: "14px" }}>
              {(() => {
                const step = tickStep(laneTotal);
                const ticks: number[] = [];
                for (let t = 0; t <= laneTotal + 0.001; t += step) ticks.push(t);
                return ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute text-[9px] font-mono text-[#3a4046] -translate-x-1/2 first:translate-x-0"
                    style={{ left: `${Math.min((t / laneTotal) * 100, 100)}%` }}
                  >
                    {t.toFixed(0)}s
                  </span>
                ));
              })()}
              <span
                className="absolute right-0 text-[9px] font-mono text-[#4b5158]"
              >
                {laneTotal.toFixed(1)}s
              </span>
            </div>
          ) : (
            <div className="flex justify-between mt-1">
              <span className="text-[9px] font-mono text-[#3a4046]">0s</span>
              <span className="text-[9px] font-mono text-[#3a4046]">
                {laneTotal.toFixed(1)}s
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-[#4b5158]">
          No shot durations set. Enter durations below to preview the timeline.
        </p>
      )}

      {/* ── Inputs per shot ── */}
      {isEditorial && (
        <p className="mt-4 text-[9px] uppercase tracking-wider text-[#4b5158]">
          Target durations (seconds) — narrative intent, never changed by trims
        </p>
      )}
      <div className={isEditorial ? "mt-1.5 flex flex-col gap-1.5" : "mt-4 flex flex-col gap-1.5"}>
        {shots.map((shot, i) => {
          const color = colorMap.get(shot.id);
          return (
            <div key={shot.id} className="flex items-center gap-2.5">
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: "6px",
                  height: "6px",
                  backgroundColor: color ?? "#3a4046",
                }}
              />
              <span className="text-[10px] font-mono text-[#6e767d] shrink-0 w-14 truncate">
                {shot.shotCode ?? `S${i + 1}`}
              </span>
              <span className="text-xs text-[#a4abb2] flex-1 min-w-0 truncate">
                {shot.title}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  name={`duration_${shot.id}`}
                  step="0.1"
                  min="0"
                  value={durations[shot.id] ?? ""}
                  onChange={(e) =>
                    setDurations((prev) => ({ ...prev, [shot.id]: e.target.value }))
                  }
                  placeholder="—"
                  className="w-20 rounded bg-[#0d0e10] border border-[#2c3035] px-2 py-1 text-xs text-[#e7e9ec] placeholder-[#3a4046] text-right focus:outline-none focus:border-[#3a4046] transition-colors tabular-nums font-mono"
                />
                <span className="text-[10px] text-[#4b5158] w-3">s</span>
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
