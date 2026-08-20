"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { updateSequenceShotDurations, updateShotTrim } from "@/actions/shots";
import {
  updateEditorialItemTrim,
  resetAllEditorialItemTrims,
} from "@/actions/editorialTrim";
import TimelineHeader from "@/components/editorial/TimelineHeader";
import TimelineScale from "@/components/editorial/TimelineScale";
import UnsavedTrimEditRow from "@/components/editorial/UnsavedTrimEditRow";
import EditorialItemSegment from "@/components/editorial/EditorialItemSegment";
import EditorialShotSegment from "@/components/editorial/EditorialShotSegment";

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
  /**
   * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — video AVAILABILITY UNDER THE
   * CURRENT videoSourceMode, already existence-verified (approved-only:
   * identical to real DB approval, unchanged; latest-generation: a
   * resolved, on-disk-confirmed Shot Video Library entry). Never rendered
   * as literal text in this component (only used for color/tooltip "no
   * video"/summary counts) — see `videoSourceKind` for the one field that
   * actually decides user-visible "Approved"/"Latest" wording elsewhere.
   */
  hasVideo: boolean;
  /** Which kind of source `videoUrl` below actually is, for callers that render mode-aware badge text (e.g. EditorialShotList/EditorialWorkspace) — null when there is no resolved source at all. */
  videoSourceKind: "approved" | "latest" | null;
  /** TRUE `shots.approvedVideoPath !== null` — unaffected by videoSourceMode. The only field legacy Trim editing (approval-scoped, out of this ticket's scope) may gate on. */
  isApproved: boolean;
  isPlaceholder: boolean;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  /** The resolved video URL under the current videoSourceMode — approved-only: identical to before this ticket. */
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
  /** EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — see EditorialTimelineShot's own doc comment: mode-resolved availability, not literal DB approval. */
  hasVideo: boolean;
  videoSourceKind: "approved" | "latest" | null;
  isApproved: boolean;
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
  if (item.hasVideo) return COLOR_APPROVED;
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

export type TrimRange = { trimIn: number; trimOut: number };

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
  if (shot.hasVideo) return COLOR_APPROVED;
  return COLOR_NO_VIDEO;
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
    ? items!.filter((it) => it.type === "shot" && it.hasVideo && !it.isPlaceholder).length
    : 0;
  const missingVideoCount = itemsMode
    ? items!.filter((it) => it.type === "shot" && (it.isPlaceholder || !it.hasVideo)).length
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
    // Trim handle drag (shots with video) — both edges, legacy lane and
    // items mode alike. No gap is ever created, extended, consumed or
    // deleted from a trim drag (BASIC.EDITORIAL.5) — trimOut/trimIn are
    // the only fields touched, bounded by videoDuration and MIN_TRIM_GAP.
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

  // IND.CLIENTSPLIT.1 — named (was an inline arrow in the "Target duration
  // resize" handle's onPointerDown) so it can be passed as a prop to
  // EditorialShotSegment; same body, unchanged.
  function startDurationDrag(e: React.PointerEvent<HTMLDivElement>, shot: EditorialTimelineShot) {
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
  }

  return (
    <form action={updateSequenceShotDurations}>
      <input type="hidden" name="projectId" value={String(projectId)} />
      <input type="hidden" name="sequenceId" value={String(sequenceId)} />
      <input type="hidden" name="returnTo" value={returnTo} />

      {/* ── Header ── */}
      <TimelineHeader
        itemsMode={itemsMode}
        effectiveTotal={itemsMode ? itemsTotal : laneTotal}
        itemsLength={itemsMode ? items!.length : 0}
        videoReadyCount={videoReadyCount}
        missingVideoCount={missingVideoCount}
        shotsLength={shots.length}
        timedCount={timedCount}
        isDurationsDirty={isDurationsDirty}
        hasAnyItemTrim={hasAnyItemTrim}
        isSavingTrim={isSavingTrim}
        onResetAllTrims={resetAllTrims}
        onDurationsReset={handleDurationsReset}
      />

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

              return (
                <EditorialItemSegment
                  key={item.id}
                  item={item}
                  d={d}
                  widthPct={widthPct}
                  color={color}
                  trimmed={trimmed}
                  itemDraft={itemDraft}
                  itemTrimEnabled={itemTrimEnabled}
                  isSelected={isSelected}
                  onSelect={selectItem}
                  onStartTrimDrag={startItemTrimDrag}
                />
              );
            })}
          </div>

          {/* Timeline scale for items */}
          <TimelineScale total={itemsTotal} />
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

              return (
                <EditorialShotSegment
                  key={shot.id}
                  shot={shot}
                  d={d}
                  widthPct={widthPct}
                  color={color}
                  trimmed={trimmed}
                  target={target}
                  mismatch={mismatch}
                  isVideoShot={isVideoShot}
                  trimEnabled={trimEnabled}
                  draft={draft}
                  isSelected={isSelected}
                  onSelect={() => onSelectShot(shot.id)}
                  onStartTrimDrag={startTrimDrag}
                  onStartDurationDrag={startDurationDrag}
                />
              );
            })}
          </div>

          {/* Timeline scale — labeled graduations */}
          <TimelineScale total={laneTotal} />
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
              <UnsavedTrimEditRow
                key={`item-trim-${item.id}`}
                label={item.shotCode ?? item.title ?? "—"}
                trimIn={draft.trimIn}
                trimOut={draft.trimOut}
                isSavingTrim={isSavingTrim}
                onSave={() => saveItemTrim(item)}
                onReset={() => resetTrim(item.id)}
              />
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
            <UnsavedTrimEditRow
              key={`trim-${shot.id}`}
              label={shot.shotCode ?? shot.title}
              trimIn={draft.trimIn}
              trimOut={draft.trimOut}
              isSavingTrim={isSavingTrim}
              onSave={() => saveTrim(shot)}
              onReset={() => resetTrim(shot.id)}
            />
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
