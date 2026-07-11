"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { updateSequenceShotDurations, updateShotTrim } from "@/actions/shots";
import {
  resizeEditorialItemRightEdge,
  updateEditorialItemTrim,
  resetAllEditorialItemTrims,
} from "@/actions/editorialTimeline";

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

/** Gap-aware editorial item (read-only rendering in this phase). */
export type EditorialItemView = {
  id: number;
  type: "shot" | "gap";
  orderIndex: number;
  trackIndex: number;
  durationSeconds: number | null;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  shotId: number | null;
  shotCode: string | null;
  title: string | null;
  hasApprovedVideo: boolean;
  isPlaceholder: boolean;
  videoUrl: string | null;
};

type Props = {
  shots: EditorialTimelineShot[];
  projectId: number;
  sequenceId: number;
  returnTo: string;
  selectedShotId: number | null;
  onSelectShot: (shotId: number) => void;
  /** When present and non-empty, the lane renders these items (read-only). */
  items?: EditorialItemView[];
  /** Item-mode selection — the selected editorial item (shot or gap). */
  selectedItemId?: number | null;
  onSelectItem?: (itemId: number) => void;
};

function itemHasValidTrim(item: EditorialItemView): boolean {
  return (
    item.trimInSeconds != null &&
    item.trimOutSeconds != null &&
    item.trimInSeconds >= 0 &&
    item.trimOutSeconds > item.trimInSeconds
  );
}

function itemEffectiveDuration(item: EditorialItemView): number {
  if (itemHasValidTrim(item)) return item.trimOutSeconds! - item.trimInSeconds!;
  if (item.durationSeconds !== null && item.durationSeconds > 0) {
    return item.durationSeconds;
  }
  return FALLBACK_SEGMENT_SECONDS;
}

function itemStatusColor(item: EditorialItemView): string {
  if (item.type === "gap") return COLOR_NO_VIDEO;
  if (item.isPlaceholder) return COLOR_PLACEHOLDER;
  if (item.hasApprovedVideo) return COLOR_APPROVED;
  return COLOR_NO_VIDEO;
}

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

/** Right-edge non-ripple resize drag state (items mode, shot with video). */
type RightResizeDragState = {
  itemId: number;
  pointerStartX: number;
  trimIn: number;
  trimOut: number;
  videoDuration: number;
  nextGapDuration: number | null; // null = no gap after (extend blocked)
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
  items,
  selectedItemId,
  onSelectItem,
}: Props) {
  // Items mode: the lane is driven by the gap-aware editorial layer.
  // Trims are edited per item; shot-based duration/trim controls are legacy.
  const itemsMode = items !== undefined && items.length > 0;
  const [durations, setDurations] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const s of shots) {
      map[s.id] = s.durationSeconds?.toString() ?? "";
    }
    return map;
  });

  const dragRef = useRef<DragState | null>(null);
  const trimDragRef = useRef<TrimDragState | null>(null);
  const rightResizeRef = useRef<RightResizeDragState | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Ghost gap preview: shown during right-edge drag in items mode
  const [ghostRightResize, setGhostRightResize] = useState<{
    itemId: number;
    gapSeconds: number; // positive = creates gap, negative = consumes gap
  } | null>(null);

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

  // No nested <form>: this lives inside the Apply Durations form, so the
  // call stays imperative like the other trim saves.
  function resetAllTrims() {
    if (!window.confirm("Reset all trims on this timeline? Gaps are kept.")) return;
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("returnTo", returnTo);
    startTrimTransition(() => {
      resetAllEditorialItemTrims(fd);
    });
  }

  function resetTrim(shotId: number) {
    setTrimDrafts((prev) => {
      const next = { ...prev };
      delete next[shotId];
      return next;
    });
  }

  // ── Item-level trim helpers (items mode — drafts/durations keyed by itemId) ──

  function itemTrimBaseline(item: EditorialItemView): TrimRange | null {
    if (itemHasValidTrim(item)) {
      return {
        trimIn: round1(item.trimInSeconds!),
        trimOut: round1(item.trimOutSeconds!),
      };
    }
    const vd = videoDurations[item.id];
    if (vd !== undefined && vd > 0) {
      return { trimIn: 0, trimOut: round1(vd) };
    }
    return null;
  }

  function itemTrimCurrent(item: EditorialItemView): TrimRange | null {
    return trimDrafts[item.id] ?? itemTrimBaseline(item);
  }

  function isItemTrimDirty(item: EditorialItemView): boolean {
    const draft = trimDrafts[item.id];
    if (!draft) return false;
    const base = itemTrimBaseline(item);
    if (!base) return false;
    return (
      Math.abs(draft.trimIn - base.trimIn) > 0.001 ||
      Math.abs(draft.trimOut - base.trimOut) > 0.001
    );
  }

  function saveItemTrim(item: EditorialItemView) {
    const draft = trimDrafts[item.id];
    if (!draft) return;
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("itemId", String(item.id));
    fd.set("trimInSeconds", draft.trimIn.toFixed(1));
    fd.set("trimOutSeconds", draft.trimOut.toFixed(1));
    fd.set("returnTo", returnTo);
    startTrimTransition(() => {
      // No nested <form>: trim saves stay imperative
      updateEditorialItemTrim(fd);
      setTrimDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    });
  }

  function startItemTrimDrag(
    e: React.PointerEvent<HTMLDivElement>,
    item: EditorialItemView,
    edge: "in" | "out"
  ) {
    const vd = videoDurations[item.id];
    const current = itemTrimCurrent(item);
    if (vd === undefined || vd <= 0 || !current || !trackRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    // shotId field carries the draft key — itemId in items mode
    trimDragRef.current = {
      shotId: item.id,
      edge,
      pointerStartX: e.clientX,
      initialIn: current.trimIn,
      initialOut: current.trimOut,
      videoDuration: round1(vd),
      initialTotalDur: itemsTotal,
      trackWidth: trackRef.current.clientWidth,
    };
  }

  /** Right-edge non-ripple resize: start drag on the right handle of an item shot with video. */
  function startItemRightResize(
    e: React.PointerEvent<HTMLDivElement>,
    item: EditorialItemView
  ) {
    const vd = videoDurations[item.id];
    const current = itemTrimCurrent(item);
    if (vd === undefined || vd <= 0 || !current || !trackRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    // Find next item gap duration
    const itemIndex = items!.indexOf(item);
    const nextItem = items![itemIndex + 1];
    const nextGapDuration =
      nextItem && nextItem.type === "gap"
        ? (nextItem.durationSeconds ?? itemEffectiveDuration(nextItem))
        : null;

    rightResizeRef.current = {
      itemId: item.id,
      pointerStartX: e.clientX,
      trimIn: current.trimIn,
      trimOut: current.trimOut,
      videoDuration: round1(vd),
      nextGapDuration,
      initialTotalDur: itemsTotal,
      trackWidth: trackRef.current.clientWidth,
    };
    setGhostRightResize(null);
  }

  // Effective item duration, draft-aware for live width preview during drag
  const itemEff = (item: EditorialItemView): number => {
    const draft = trimDrafts[item.id];
    if (draft) return draft.trimOut - draft.trimIn;
    return itemEffectiveDuration(item);
  };

  const itemsTotal = itemsMode
    ? items!.reduce((sum, it) => sum + itemEff(it), 0)
    : 0;

  // Editorial summary counts (BASIC.EDITORIAL.2) — derived from the same
  // items already loaded for the lane, no new source of truth.
  const videoReadyCount = itemsMode
    ? items!.filter((it) => it.type === "shot" && it.hasApprovedVideo && !it.isPlaceholder).length
    : 0;
  const missingVideoCount = itemsMode
    ? items!.filter((it) => it.type === "shot" && (it.isPlaceholder || !it.hasApprovedVideo)).length
    : 0;
  const hasAnyItemTrim = itemsMode ? items!.some((it) => itemHasValidTrim(it)) : false;

  // ── Pointer handlers ──────────────────────────────────────────────

  function handleDurationsReset() {
    const map: Record<number, string> = {};
    for (const s of shots) {
      map[s.id] = s.durationSeconds?.toString() ?? "";
    }
    setDurations(map);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // ── Right-edge non-ripple resize (items mode) ──
    const rs = rightResizeRef.current;
    if (rs && rs.initialTotalDur > 0) {
      const deltaSec =
        ((e.clientX - rs.pointerStartX) / rs.trackWidth) * rs.initialTotalDur;
      const rawTrimOut = snap(rs.trimOut + deltaSec);

      // Clamp: left side — trimIn + MIN_TRIM_GAP
      let clampedOut = Math.max(rawTrimOut, rs.trimIn + MIN_TRIM_GAP);
      // Clamp: right side — videoDuration
      clampedOut = Math.min(clampedOut, rs.videoDuration);

      // Extend blocked by gap boundary
      if (rs.nextGapDuration !== null) {
        // Max extension = old trimOut + nextGapDuration
        const maxExtend = rs.trimOut + rs.nextGapDuration;
        clampedOut = Math.min(clampedOut, maxExtend);
      } else {
        // No gap after: cannot extend beyond original trimOut
        clampedOut = Math.min(clampedOut, rs.trimOut);
      }

      clampedOut = round1(clampedOut);

      // Show ghost gap
      const deltaGap = rs.trimOut - clampedOut; // positive = shrink (creates gap), negative = extend (consumes)
      if (Math.abs(deltaGap) > 0.05) {
        setGhostRightResize({ itemId: rs.itemId, gapSeconds: deltaGap });
      } else {
        setGhostRightResize(null);
      }

      return;
    }

    // Trim handle drag (shots with video) — legacy / left-edge items mode
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
    // ── Save right-edge resize ──
    const rs = rightResizeRef.current;
    if (rs && trackRef.current) {
      // Recalculate final trimOut from current ghost state
      const gapSec = ghostRightResize?.itemId === rs.itemId ? ghostRightResize.gapSeconds : 0;
      const newTrimOut = round1(rs.trimOut - gapSec);

      if (Math.abs(newTrimOut - rs.trimOut) > 0.1) {
        const fd = new FormData();
        fd.set("projectId", String(projectId));
        fd.set("sequenceId", String(sequenceId));
        fd.set("itemId", String(rs.itemId));
        fd.set("newTrimOutSeconds", newTrimOut.toString());
        fd.set("returnTo", returnTo);
        startTrimTransition(() => {
          resizeEditorialItemRightEdge(fd);
        });
      }
    }
    setGhostRightResize(null);
    dragRef.current = null;
    trimDragRef.current = null;
    rightResizeRef.current = null;
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
            Total{" "}
            <span className="font-mono">
              {(itemsMode ? itemsTotal : laneTotal).toFixed(1)}s
            </span>{" "}
            effective
            {" · "}
            {itemsMode ? (
              <>
                {items!.length} editorial item{items!.length !== 1 ? "s" : ""}
                {" · "}
                {videoReadyCount} with video
                {" · "}
                {missingVideoCount} placeholder/no video
              </>
            ) : (
              <>
                {timedCount} of {shots.length} shot{shots.length !== 1 ? "s" : ""} timed
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
              onClick={resetAllTrims}
              disabled={!hasAnyItemTrim || isSavingTrim}
              className="text-xs text-[#4b5158] hover:text-[#cf7b6b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset all trims
            </button>
          </div>
        )}
        {!itemsMode && (
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
        )}
      </div>

      {/* ── Items lane — gap-aware editorial layer (read-only phase) ── */}
      {itemsMode ? (
        <>
          <div
            ref={trackRef}
            className="flex rounded overflow-hidden border border-[#1a1d20] bg-[#0d0e10]"
            style={{ height: "72px" }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {items!.map((item) => {
              const d = itemEff(item);
              const widthPct = itemsTotal > 0 ? (d / itemsTotal) * 100 : 0;
              const color = itemStatusColor(item);
              const trimmed = itemHasValidTrim(item);
              const itemDraft = trimDrafts[item.id];
              const itemVideoDuration = videoDurations[item.id];
              const itemTrimEnabled =
                item.videoUrl !== null &&
                itemVideoDuration !== undefined &&
                itemVideoDuration > 0;
              // Item-mode selection wins when wired; legacy shot compare as fallback
              const isSelected =
                onSelectItem !== undefined
                  ? item.id === selectedItemId
                  : item.type === "shot" &&
                    item.shotId !== null &&
                    item.shotId === selectedShotId;

              const selectItem = () => {
                if (onSelectItem) {
                  onSelectItem(item.id);
                } else if (item.shotId !== null) {
                  onSelectShot(item.shotId);
                }
              };

              if (item.type === "gap") {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={selectItem}
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
              else if (!item.hasApprovedVideo) tooltipParts.push("No video");

              return (
                <div
                  key={item.id}
                  style={{ width: `${widthPct}%`, minWidth: "48px" }}
                  className="relative flex border-r border-r-[#1a1d20] last:border-r-0 shrink-0"
                >
                  <button
                    type="button"
                    onClick={selectItem}
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
                          className="absolute left-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
                          style={{ width: "10px" }}
                          onPointerDown={(e) => startItemTrimDrag(e, item, "in")}
                        >
                          <div className="w-0.5 h-5 rounded-full bg-[#5b93d6]/50 group-hover:bg-[#5b93d6] group-focus:bg-[#5b93d6] transition-colors" />
                        </div>
                        <div
                          role="slider"
                          tabIndex={0}
                          aria-label="Resize right edge"
                          className="absolute right-0 top-0 h-full flex items-center justify-center cursor-ew-resize select-none touch-none z-10 group"
                          style={{ width: "10px" }}
                          onPointerDown={(e) => startItemRightResize(e, item)}
                          title={
                            (() => {
                              const idx = items!.indexOf(item);
                              const nxt = items![idx + 1];
                              if (nxt && nxt.type === "gap") return "Resize right edge — consumes gap";
                              return "Resize right edge — creates gap";
                            })()
                          }
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

                  {/* Ghost gap overlay when dragging right edge of previous item */}
                  {ghostRightResize?.itemId === item.id && (
                    <div
                      className="absolute right-0 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none z-20"
                      style={{
                        width: `${Math.max(Math.abs(ghostRightResize.gapSeconds) / itemsTotal * 100, 2)}%`,
                        right: "-1px",
                        backgroundColor: ghostRightResize.gapSeconds > 0
                          ? "rgba(75, 81, 88, 0.35)"
                          : "rgba(91, 147, 214, 0.15)",
                      }}
                    >
                      <span className="text-[9px] font-mono text-[#a4abb2] leading-none">
                        {ghostRightResize.gapSeconds > 0
                          ? `Creates ${ghostRightResize.gapSeconds.toFixed(1)}s gap`
                          : `Consumes ${Math.abs(ghostRightResize.gapSeconds).toFixed(1)}s gap`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Timeline scale for items */}
          <div className="relative mt-1" style={{ height: "14px" }}>
            {(() => {
              const step = tickStep(itemsTotal);
              const ticks: number[] = [];
              for (let t = 0; t <= itemsTotal + 0.001; t += step) ticks.push(t);
              return ticks.map((t) => (
                <span
                  key={t}
                  className="absolute text-[9px] font-mono text-[#3a4046] -translate-x-1/2 first:translate-x-0"
                  style={{ left: `${Math.min((t / itemsTotal) * 100, 100)}%` }}
                >
                  {t.toFixed(0)}s
                </span>
              ));
            })()}
            <span className="absolute right-0 text-[9px] font-mono text-[#4b5158]">
              {itemsTotal.toFixed(1)}s
            </span>
          </div>
        </>
      ) : shots.length > 0 && laneTotal > 0 ? (
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

      {/* ── Unsaved item trim edits — Save Trim / Reset per item (items mode) ── */}
      {itemsMode &&
        items!
          .filter((it) => isItemTrimDirty(it))
          .map((item) => {
            const draft = trimDrafts[item.id]!;
            return (
              <div
                key={`item-trim-${item.id}`}
                className="mt-2 flex items-center gap-2 flex-wrap"
              >
                <span className="text-[10px] font-mono text-[#6e767d] w-16 truncate shrink-0">
                  {item.shotCode ?? item.title ?? "—"}
                </span>
                <span className="text-[10px] font-mono text-[#5b93d6]">
                  Trim {draft.trimIn.toFixed(1)}s → {draft.trimOut.toFixed(1)}s
                </span>
                <span className="text-[9px] font-mono text-[#cda24f]">unsaved</span>
                <button
                  type="button"
                  onClick={() => saveItemTrim(item)}
                  disabled={isSavingTrim}
                  className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-2 py-0.5 text-[10px] hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingTrim ? "Saving..." : "Save Trim"}
                </button>
                <button
                  type="button"
                  onClick={() => resetTrim(item.id)}
                  disabled={isSavingTrim}
                  className="text-[10px] text-[#4b5158] hover:text-[#6e767d] disabled:opacity-40 transition-colors"
                >
                  Reset
                </button>
              </div>
            );
          })}

      {/* ── Hidden metadata probes — items mode ── */}
      {itemsMode &&
        items!
          .filter((it) => it.videoUrl)
          .map((it) => (
            <video
              key={`meta-item-${it.id}`}
              src={it.videoUrl!}
              preload="metadata"
              muted
              className="hidden"
              onLoadedMetadata={(e) => {
                const d = finiteVideoDuration(e.currentTarget);
                if (d > 0) {
                  setVideoDurations((prev) =>
                    prev[it.id] === d ? prev : { ...prev, [it.id]: d }
                  );
                }
              }}
            />
          ))}

      {/* ── Unsaved trim edits — Save Trim / Reset per shot (legacy lane only) ── */}
      {!itemsMode && shots
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

      {/* ── Hidden metadata probes — legacy lane only ── */}
      {!itemsMode && shots
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

      {/* ── Target duration inputs — legacy lane only; item durations will be
             edited on the editorial layer in a later phase ── */}
      {!itemsMode && (
      <>
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
      </>
      )}
    </form>
  );
}
