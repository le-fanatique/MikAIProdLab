"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { updateSequenceShotDurations, updateShotTrim } from "@/actions/shots";

// Editorial status colors
const COLOR_APPROVED = "#6b9e72";
const COLOR_NO_VIDEO = "#4b5158";
const COLOR_PLACEHOLDER = "#cda24f";

// Visual fallback so untimed shots stay visible as segments
const FALLBACK_SEGMENT_SECONDS = 1.0;

// Minimum trim span so handles can never cross or collapse the segment
const MIN_TRIM_GAP = 0.2;

export type EditorialTimelineShot = {
  id: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  hasApprovedVideo: boolean;
  isPlaceholder: boolean;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  videoUrl: string | null;
};

type Props = {
  shots: EditorialTimelineShot[];
  projectId: number;
  sequenceId: number;
  returnTo: string;
  selectedShotId: number | null;
  onSelectShot: (shotId: number) => void;
};

type DragState = {
  shotId: number;
  pointerStartX: number;
  initialDur: number;
  initialTotalDur: number;
  trackWidth: number;
};

type TrimDragState = {
  shotId: number;
  edge: "in" | "out";
  pointerStartX: number;
  initialIn: number;
  initialOut: number;
  videoDuration: number;
  initialTotalDur: number;
  trackWidth: number;
};

type TrimRange = { trimIn: number; trimOut: number };

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

function round1(value: number): number {
  return parseFloat(value.toFixed(1));
}

function hasValidTrim(shot: EditorialTimelineShot): boolean {
  return (
    shot.trimInSeconds != null &&
    shot.trimOutSeconds != null &&
    shot.trimInSeconds >= 0 &&
    shot.trimOutSeconds > shot.trimInSeconds
  );
}

function statusColor(shot: EditorialTimelineShot): string {
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

/** Finite video duration from metadata, with a seekable fallback. */
function finiteVideoDuration(video: HTMLVideoElement): number {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  if (video.seekable.length > 0) {
    const end = video.seekable.end(video.seekable.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }
  return 0;
}

export default function EditorialTimeline({
  shots,
  projectId,
  sequenceId,
  returnTo,
  selectedShotId,
  onSelectShot,
}: Props) {
  const [durations, setDurations] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const s of shots) {
      map[s.id] = s.durationSeconds?.toString() ?? "";
    }
    return map;
  });

  const dragRef = useRef<DragState | null>(null);
  const trimDragRef = useRef<TrimDragState | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Real video durations read client-side from metadata
  const [videoDurations, setVideoDurations] = useState<Record<number, number>>({});
  // Local unsaved trim edits per shot — never written to DB during drag
  const [trimDrafts, setTrimDrafts] = useState<Record<number, TrimRange>>({});
  const [isSavingTrim, startTrimTransition] = useTransition();

  const parsedDurations = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const s of shots) {
      map[s.id] = parseRaw(durations[s.id] ?? "");
    }
    return map;
  }, [shots, durations]);

  const timedCount = useMemo(
    () =>
      shots.filter((s) => {
        const d = parsedDurations[s.id];
        return d !== null && d > 0;
      }).length,
    [shots, parsedDurations]
  );

  const isDurationsDirty = useMemo(
    () =>
      shots.some((s) => {
        const initial = s.durationSeconds?.toString() ?? "";
        return (durations[s.id] ?? "") !== initial;
      }),
    [shots, durations]
  );

  // Effective duration drives segment widths: draft trim (live preview) >
  // saved trim > live-edited target > visual fallback
  const effectiveFor = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of shots) {
      const draft = trimDrafts[s.id];
      if (draft) {
        map.set(s.id, draft.trimOut - draft.trimIn);
      } else if (hasValidTrim(s)) {
        map.set(s.id, s.trimOutSeconds! - s.trimInSeconds!);
      } else {
        const d = parsedDurations[s.id];
        map.set(s.id, d !== null && d > 0 ? d : FALLBACK_SEGMENT_SECONDS);
      }
    }
    return map;
  }, [shots, parsedDurations, trimDrafts]);

  const laneTotal = shots.reduce(
    (sum, s) => sum + (effectiveFor.get(s.id) ?? FALLBACK_SEGMENT_SECONDS),
    0
  );

  // ── Trim helpers ──────────────────────────────────────────────────

  function trimBaseline(shot: EditorialTimelineShot): TrimRange | null {
    if (hasValidTrim(shot)) {
      return { trimIn: round1(shot.trimInSeconds!), trimOut: round1(shot.trimOutSeconds!) };
    }
    const vd = videoDurations[shot.id];
    if (vd !== undefined && vd > 0) {
      return { trimIn: 0, trimOut: round1(vd) };
    }
    return null;
  }

  function trimCurrent(shot: EditorialTimelineShot): TrimRange | null {
    return trimDrafts[shot.id] ?? trimBaseline(shot);
  }

  function isTrimDirty(shot: EditorialTimelineShot): boolean {
    const draft = trimDrafts[shot.id];
    if (!draft) return false;
    const base = trimBaseline(shot);
    if (!base) return false;
    return (
      Math.abs(draft.trimIn - base.trimIn) > 0.001 ||
      Math.abs(draft.trimOut - base.trimOut) > 0.001
    );
  }

  function saveTrim(shot: EditorialTimelineShot) {
    const draft = trimDrafts[shot.id];
    if (!draft) return;
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("shotId", String(shot.id));
    fd.set("trimInSeconds", draft.trimIn.toFixed(1));
    fd.set("trimOutSeconds", draft.trimOut.toFixed(1));
    fd.set("returnTo", returnTo);
    startTrimTransition(() => {
      // No nested <form>: trim saves are imperative, the surrounding form
      // belongs to Apply Durations
      updateShotTrim(fd);
      setTrimDrafts((prev) => {
        const next = { ...prev };
        delete next[shot.id];
        return next;
      });
    });
  }

  function resetTrim(shotId: number) {
    setTrimDrafts((prev) => {
      const next = { ...prev };
      delete next[shotId];
      return next;
    });
  }

  // ── Pointer handlers ──────────────────────────────────────────────

  function handleDurationsReset() {
    const map: Record<number, string> = {};
    for (const s of shots) {
      map[s.id] = s.durationSeconds?.toString() ?? "";
    }
    setDurations(map);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Trim handle drag (shots with video)
    const ts = trimDragRef.current;
    if (ts && ts.initialTotalDur > 0) {
      const deltaSec =
        ((e.clientX - ts.pointerStartX) / ts.trackWidth) * ts.initialTotalDur;
      if (ts.edge === "in") {
        const raw = snap(ts.initialIn + deltaSec);
        const nextIn = round1(
          Math.min(Math.max(0, raw), ts.initialOut - MIN_TRIM_GAP)
        );
        setTrimDrafts((prev) => ({
          ...prev,
          [ts.shotId]: { trimIn: nextIn, trimOut: ts.initialOut },
        }));
      } else {
        const raw = snap(ts.initialOut + deltaSec);
        const nextOut = round1(
          Math.max(Math.min(ts.videoDuration, raw), ts.initialIn + MIN_TRIM_GAP)
        );
        setTrimDrafts((prev) => ({
          ...prev,
          [ts.shotId]: { trimIn: ts.initialIn, trimOut: nextOut },
        }));
      }
      return;
    }

    // Target duration drag (no-video / placeholder segments)
    const ds = dragRef.current;
    if (!ds || ds.initialTotalDur <= 0) return;
    const deltaX = e.clientX - ds.pointerStartX;
    const deltaDur = (deltaX / ds.trackWidth) * ds.initialTotalDur;
    const newDur = Math.max(0.1, snap(ds.initialDur + deltaDur));
    setDurations((prev) => ({ ...prev, [ds.shotId]: newDur.toString() }));
  }

  function handlePointerUp() {
    dragRef.current = null;
    trimDragRef.current = null;
  }

  function startTrimDrag(
    e: React.PointerEvent<HTMLDivElement>,
    shot: EditorialTimelineShot,
    edge: "in" | "out"
  ) {
    const vd = videoDurations[shot.id];
    const current = trimCurrent(shot);
    if (vd === undefined || vd <= 0 || !current || !trackRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    trimDragRef.current = {
      shotId: shot.id,
      edge,
      pointerStartX: e.clientX,
      initialIn: current.trimIn,
      initialOut: current.trimOut,
      videoDuration: round1(vd),
      initialTotalDur: laneTotal,
      trackWidth: trackRef.current.clientWidth,
    };
  }

  return (
    <form action={updateSequenceShotDurations}>
      <input type="hidden" name="projectId" value={String(projectId)} />
      <input type="hidden" name="sequenceId" value={String(sequenceId)} />
      <input type="hidden" name="returnTo" value={returnTo} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#6e767d]">
            Total <span className="font-mono">{laneTotal.toFixed(1)}s</span> effective
            {" · "}
            {timedCount} of {shots.length} shot{shots.length !== 1 ? "s" : ""} timed
          </span>
          {isDurationsDirty && (
            <span className="text-[9px] font-mono text-[#cda24f]">unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDurationsReset}
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
      </div>

      {/* ── Lane ── */}
      {shots.length > 0 && laneTotal > 0 ? (
        <>
          <div
            ref={trackRef}
            className="flex rounded overflow-hidden border border-[#1a1d20] bg-[#0d0e10]"
            style={{ height: "72px" }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {shots.map((shot) => {
              const d = effectiveFor.get(shot.id) ?? FALLBACK_SEGMENT_SECONDS;
              const widthPct = (d / laneTotal) * 100;
              const trimmed = hasValidTrim(shot);
              const color = statusColor(shot);
              const target = parsedDurations[shot.id];
              const mismatch =
                trimmed && target !== null && Math.abs(target - d) > 0.05;
              const isVideoShot = !!shot.videoUrl;
              const videoDuration = videoDurations[shot.id];
              const trimEnabled =
                isVideoShot && videoDuration !== undefined && videoDuration > 0;
              const draft = trimDrafts[shot.id];
              const isSelected = shot.id === selectedShotId;

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
              else if (!shot.hasApprovedVideo) tooltipParts.push("No video");

              return (
                <div
                  key={shot.id}
                  style={{ width: `${widthPct}%`, minWidth: "48px" }}
                  className="relative flex border-r border-r-[#1a1d20] last:border-r-0 shrink-0"
                >
                  {/* Segment body — click selects the shot (loads it in the viewer) */}
                  <button
                    type="button"
                    onClick={() => onSelectShot(shot.id)}
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
                          className="absolute left-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
                          style={{ width: "10px" }}
                          onPointerDown={(e) => startTrimDrag(e, shot, "in")}
                        >
                          <div className="w-0.5 h-5 rounded-full bg-[#5b93d6]/50 group-hover:bg-[#5b93d6] group-focus:bg-[#5b93d6] transition-colors" />
                        </div>
                        <div
                          role="slider"
                          tabIndex={0}
                          aria-label="Trim out handle"
                          className="absolute right-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
                          style={{ width: "10px" }}
                          onPointerDown={(e) => startTrimDrag(e, shot, "out")}
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

          {/* Timeline scale — labeled graduations */}
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
            <span className="absolute right-0 text-[9px] font-mono text-[#4b5158]">
              {laneTotal.toFixed(1)}s
            </span>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#4b5158]">
          No shots yet. Add a placeholder shot below to start blocking the rhythm.
        </p>
      )}

      {/* ── Unsaved trim edits — Save Trim / Reset per shot ── */}
      {shots
        .filter((s) => isTrimDirty(s))
        .map((shot) => {
          const draft = trimDrafts[shot.id]!;
          return (
            <div
              key={`trim-${shot.id}`}
              className="mt-2 flex items-center gap-2 flex-wrap"
            >
              <span className="text-[10px] font-mono text-[#6e767d] w-16 truncate shrink-0">
                {shot.shotCode ?? shot.title}
              </span>
              <span className="text-[10px] font-mono text-[#5b93d6]">
                Trim {draft.trimIn.toFixed(1)}s → {draft.trimOut.toFixed(1)}s
              </span>
              <span className="text-[9px] font-mono text-[#cda24f]">unsaved</span>
              <button
                type="button"
                onClick={() => saveTrim(shot)}
                disabled={isSavingTrim}
                className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-2 py-0.5 text-[10px] hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingTrim ? "Saving..." : "Save Trim"}
              </button>
              <button
                type="button"
                onClick={() => resetTrim(shot.id)}
                disabled={isSavingTrim}
                className="text-[10px] text-[#4b5158] hover:text-[#6e767d] disabled:opacity-40 transition-colors"
              >
                Reset
              </button>
            </div>
          );
        })}

      {/* ── Hidden metadata probes — read real video durations client-side ── */}
      {shots
        .filter((s) => s.videoUrl)
        .map((s) => (
          <video
            key={`meta-${s.id}`}
            src={s.videoUrl!}
            preload="metadata"
            muted
            className="hidden"
            onLoadedMetadata={(e) => {
              const d = finiteVideoDuration(e.currentTarget);
              if (d > 0) {
                setVideoDurations((prev) =>
                  prev[s.id] === d ? prev : { ...prev, [s.id]: d }
                );
              }
            }}
          />
        ))}

      {/* ── Target duration inputs ── */}
      <p className="mt-4 text-[9px] uppercase tracking-wider text-[#4b5158]">
        Target durations (seconds) — narrative intent, never changed by trims
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {shots.map((shot, i) => {
          const color = statusColor(shot);
          return (
            <div key={shot.id} className="flex items-center gap-2.5">
              <span
                className="shrink-0 rounded-full"
                style={{ width: "6px", height: "6px", backgroundColor: color }}
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
