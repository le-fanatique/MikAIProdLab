"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { updatePromptSegmentTimings } from "@/actions/promptSegments";

const SEGMENT_PALETTE = ["#5b93d6", "#6aa6a0", "#9bb05a", "#cda24f", "#cf8b6b"];
const TOLERANCE = 0.001;
const TRACK_HEIGHT = 64;

type SegmentEntry = {
  id: number;
  label: string;
  promptText: string;
  startSeconds: number | null;
  durationSeconds: number | null;
};

type SegmentTiming = {
  startSeconds: number | null;
  durationSeconds: number | null;
};

type DraftEntry = {
  draftId: string;
  startSeconds: number;
  durationSeconds: number;
  promptText: string;
};

type DragState =
  | {
      kind: "segment";
      segId: number;
      handle: "left" | "right" | "body";
      pointerStartX: number;
      initialStart: number;
      initialDur: number;
      trackWidth: number;
    }
  | {
      kind: "draft";
      draftId: string;
      handle: "left" | "right" | "body";
      pointerStartX: number;
      initialStart: number;
      initialDur: number;
      trackWidth: number;
    };

type Props = {
  segments: SegmentEntry[];
  shotDurationSeconds: number | null;
  projectId: number;
  sequenceId: number;
  shotId: number;
};

function snap(value: number, step = 0.1): number {
  return parseFloat((Math.round(value / step) * step).toFixed(1));
}

function promptExcerpt(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length === 0) return "";
  return t.length > maxLen ? t.slice(0, maxLen).trimEnd() + "…" : t;
}

type TimedEntry = SegmentEntry & { startSeconds: number; durationSeconds: number };

function getTimelineWarnings(
  entries: Array<{ startSeconds: number; durationSeconds: number }>,
  untimedCount: number,
  shotDurationSeconds: number
): string[] {
  const warnings: string[] = [];

  if (untimedCount > 0) {
    warnings.push(
      `Missing timing on ${untimedCount} segment${untimedCount !== 1 ? "s" : ""}`
    );
  }

  const invalidDurCount = entries.filter((s) => s.durationSeconds <= 0).length;
  if (invalidDurCount > 0) {
    warnings.push(
      `Invalid duration on ${invalidDurCount} segment${invalidDurCount !== 1 ? "s" : ""}`
    );
  }

  if (entries.length === 0) return warnings;

  const sorted = [...entries].sort((a, b) => a.startSeconds - b.startSeconds);

  if (sorted[0].startSeconds > TOLERANCE) {
    warnings.push(
      `Timeline starts at ${sorted[0].startSeconds.toFixed(1)}s, not 0s`
    );
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const endPrev = prev.startSeconds + prev.durationSeconds;
    if (next.startSeconds > endPrev + TOLERANCE) {
      warnings.push(`Gap from ${endPrev.toFixed(1)}s to ${next.startSeconds.toFixed(1)}s`);
    } else if (next.startSeconds < endPrev - TOLERANCE) {
      warnings.push(`Overlap near ${next.startSeconds.toFixed(1)}s`);
    }
  }

  const last = sorted[sorted.length - 1];
  const lastEnd = last.startSeconds + last.durationSeconds;

  if (lastEnd < shotDurationSeconds - TOLERANCE) {
    warnings.push(
      `Timeline ends at ${lastEnd.toFixed(1)}s, shot duration is ${shotDurationSeconds.toFixed(1)}s`
    );
  } else if (lastEnd > shotDurationSeconds + TOLERANCE) {
    warnings.push(
      `Timeline exceeds shot duration by ${(lastEnd - shotDurationSeconds).toFixed(1)}s`
    );
  }

  return warnings;
}

export default function PromptSegmentsTimelineEditor({
  segments,
  shotDurationSeconds,
  projectId,
  sequenceId,
  shotId,
}: Props) {
  const [timings, setTimings] = useState<Record<number, SegmentTiming>>(() => {
    const map: Record<number, SegmentTiming> = {};
    for (const s of segments) {
      map[s.id] = { startSeconds: s.startSeconds, durationSeconds: s.durationSeconds };
    }
    return map;
  });

  const [drafts, setDrafts] = useState<DraftEntry[]>([]);

  const [promptTexts, setPromptTexts] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const s of segments) {
      map[s.id] = s.promptText;
    }
    return map;
  });

  const dragRef = useRef<DragState | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const hasValidShotDuration =
    shotDurationSeconds != null && shotDurationSeconds > 0;

  const timedEntries = useMemo<TimedEntry[]>(
    () =>
      segments
        .filter((s) => {
          const t = timings[s.id];
          return (
            t !== undefined &&
            t.startSeconds !== null &&
            t.durationSeconds !== null
          );
        })
        .map((s) => ({
          ...s,
          startSeconds: timings[s.id].startSeconds as number,
          durationSeconds: timings[s.id].durationSeconds as number,
        }))
        .sort((a, b) => a.startSeconds - b.startSeconds),
    [segments, timings]
  );

  const untimedCount = segments.length - timedEntries.length;

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    timedEntries.forEach((s, i) => {
      map.set(`seg_${s.id}`, SEGMENT_PALETTE[i % SEGMENT_PALETTE.length]);
    });
    drafts.forEach((d, i) => {
      map.set(
        `draft_${d.draftId}`,
        SEGMENT_PALETTE[(timedEntries.length + i) % SEGMENT_PALETTE.length]
      );
    });
    return map;
  }, [timedEntries, drafts]);

  const allTimedRanges = useMemo(
    () =>
      [
        ...timedEntries.map((s) => ({
          start: s.startSeconds,
          end: s.startSeconds + s.durationSeconds,
        })),
        ...drafts.map((d) => ({
          start: d.startSeconds,
          end: d.startSeconds + d.durationSeconds,
        })),
      ].sort((a, b) => a.start - b.start),
    [timedEntries, drafts]
  );

  const { warnings, coveredSeconds, allOk } = useMemo(() => {
    if (!hasValidShotDuration) {
      return { warnings: [] as string[], coveredSeconds: 0, allOk: false };
    }
    const allEntries = [
      ...timedEntries.map((s) => ({
        startSeconds: s.startSeconds,
        durationSeconds: s.durationSeconds,
      })),
      ...drafts.map((d) => ({
        startSeconds: d.startSeconds,
        durationSeconds: d.durationSeconds,
      })),
    ];
    const w = getTimelineWarnings(allEntries, untimedCount, shotDurationSeconds!);
    const covered = timedEntries.reduce((sum, s) => sum + s.durationSeconds, 0);
    return {
      warnings: w,
      coveredSeconds: covered,
      allOk: w.length === 0 && timedEntries.length > 0 && drafts.length === 0,
    };
  }, [timedEntries, drafts, untimedCount, hasValidShotDuration, shotDurationSeconds]);

  const isDirty = useMemo(
    () =>
      drafts.length > 0 ||
      segments.some((s) => {
        const t = timings[s.id];
        return (
          t?.startSeconds !== s.startSeconds ||
          t?.durationSeconds !== s.durationSeconds ||
          (promptTexts[s.id] ?? s.promptText) !== s.promptText
        );
      }),
    [segments, timings, drafts, promptTexts]
  );

  function handleReset() {
    const timingMap: Record<number, SegmentTiming> = {};
    const ptMap: Record<number, string> = {};
    for (const s of segments) {
      timingMap[s.id] = { startSeconds: s.startSeconds, durationSeconds: s.durationSeconds };
      ptMap[s.id] = s.promptText;
    }
    setTimings(timingMap);
    setPromptTexts(ptMap);
    setDrafts([]);
  }

  function applyDragDelta(
    ds: DragState,
    clientX: number
  ): { newStart: number; newDur: number } {
    const deltaTime =
      ((clientX - ds.pointerStartX) / ds.trackWidth) * shotDurationSeconds!;
    let newStart = ds.initialStart;
    let newDur = ds.initialDur;

    if (ds.handle === "left") {
      const oldEnd = ds.initialStart + ds.initialDur;
      const snapped = snap(ds.initialStart + deltaTime);
      newStart = Math.max(0, Math.min(oldEnd - 0.1, snapped));
      newDur = parseFloat((oldEnd - newStart).toFixed(1));
    } else if (ds.handle === "right") {
      const maxDur = shotDurationSeconds! - ds.initialStart;
      newDur = Math.max(0.1, Math.min(maxDur, snap(ds.initialDur + deltaTime)));
    } else {
      newStart = Math.max(
        0,
        Math.min(
          shotDurationSeconds! - ds.initialDur,
          snap(ds.initialStart + deltaTime)
        )
      );
    }

    return { newStart, newDur };
  }

  function handleSegPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    segId: number,
    handle: "left" | "right" | "body"
  ) {
    const t = timings[segId];
    if (!t || t.startSeconds === null || t.durationSeconds === null || !hasValidShotDuration) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: "segment",
      segId,
      handle,
      pointerStartX: e.clientX,
      initialStart: t.startSeconds,
      initialDur: t.durationSeconds,
      trackWidth: Math.max(1, trackRef.current?.clientWidth ?? 1),
    };
  }

  function handleDraftPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    draftId: string,
    handle: "left" | "right" | "body"
  ) {
    const draft = drafts.find((d) => d.draftId === draftId);
    if (!draft || !hasValidShotDuration) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: "draft",
      draftId,
      handle,
      pointerStartX: e.clientX,
      initialStart: draft.startSeconds,
      initialDur: draft.durationSeconds,
      trackWidth: Math.max(1, trackRef.current?.clientWidth ?? 1),
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragRef.current;
    if (!ds || !hasValidShotDuration) return;
    const { newStart, newDur } = applyDragDelta(ds, e.clientX);
    if (ds.kind === "segment") {
      setTimings((prev) => ({
        ...prev,
        [ds.segId]: { startSeconds: newStart, durationSeconds: newDur },
      }));
    } else {
      setDrafts((prev) =>
        prev.map((d) =>
          d.draftId === ds.draftId
            ? { ...d, startSeconds: newStart, durationSeconds: newDur }
            : d
        )
      );
    }
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleTrackDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!hasValidShotDuration || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickTime = ((e.clientX - rect.left) / rect.width) * shotDurationSeconds!;

    const isOccupied = allTimedRanges.some(
      (r) => clickTime >= r.start - TOLERANCE && clickTime <= r.end + TOLERANCE
    );
    if (isOccupied) return;

    let gapStart = 0;
    let gapEnd = shotDurationSeconds!;
    for (const range of allTimedRanges) {
      if (clickTime < range.start - TOLERANCE) {
        gapEnd = range.start;
        break;
      }
      gapStart = range.end;
    }

    const dur = parseFloat((gapEnd - gapStart).toFixed(1));
    if (dur <= 0) return;

    setDrafts((prev) => [
      ...prev,
      {
        draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        startSeconds: parseFloat(gapStart.toFixed(1)),
        durationSeconds: dur,
        promptText: "",
      },
    ]);
  }

  function handleInputChange(
    segId: number,
    field: "startSeconds" | "durationSeconds",
    raw: string
  ) {
    const trimmed = raw.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      const n = parseFloat(trimmed);
      if (!isNaN(n) && n >= 0) value = n;
    }
    setTimings((prev) => ({
      ...prev,
      [segId]: {
        ...(prev[segId] ?? { startSeconds: null, durationSeconds: null }),
        [field]: value,
      },
    }));
  }

  const handleClasses = {
    div: "shrink-0 h-full relative flex items-center justify-center cursor-ew-resize select-none touch-none",
    line: "absolute inset-y-0 w-0.5",
    grip: "w-0.5 h-4 rounded-full bg-white/20",
  };

  const bodyClasses =
    "flex-1 min-w-0 h-full flex flex-col justify-between px-1 py-1.5 cursor-grab active:cursor-grabbing select-none touch-none overflow-hidden";

  const hasLaneContent = timedEntries.length > 0 || drafts.length > 0;

  return (
    <form action={updatePromptSegmentTimings}>
      <input type="hidden" name="projectId" value={String(projectId)} />
      <input type="hidden" name="sequenceId" value={String(sequenceId)} />
      <input type="hidden" name="shotId" value={String(shotId)} />
      <input type="hidden" name="draftCount" value={String(drafts.length)} />

      {segments.map((seg) => {
        const t = timings[seg.id] ?? { startSeconds: null, durationSeconds: null };
        return (
          <Fragment key={seg.id}>
            <input type="hidden" name={`start_${seg.id}`} value={t.startSeconds?.toString() ?? ""} />
            <input type="hidden" name={`dur_${seg.id}`} value={t.durationSeconds?.toString() ?? ""} />
            <input type="hidden" name={`promptText_${seg.id}`} value={promptTexts[seg.id] ?? ""} />
          </Fragment>
        );
      })}

      {drafts.map((d, i) => (
        <Fragment key={d.draftId}>
          <input type="hidden" name={`new_${i}_start`} value={d.startSeconds.toString()} />
          <input type="hidden" name={`new_${i}_dur`} value={d.durationSeconds.toString()} />
          <input type="hidden" name={`new_${i}_promptText`} value={d.promptText} />
        </Fragment>
      ))}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-xs text-[#6e767d]">
            {timedEntries.length} of {segments.length} segment
            {segments.length !== 1 ? "s" : ""} timed
            {drafts.length > 0 && (
              <>
                {" · "}
                <span className="text-[#cda24f]">
                  {drafts.length} unsaved draft{drafts.length !== 1 ? "s" : ""}
                </span>
              </>
            )}
            {hasValidShotDuration && coveredSeconds > 0 && (
              <>
                {" · "}
                <span className="font-mono">{coveredSeconds.toFixed(1)}s</span>
                {" / "}
                <span className="font-mono">{shotDurationSeconds!.toFixed(1)}s</span>
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

      {/* ── Missing timing hint ── */}
      {untimedCount > 0 && (
        <p className="text-[10px] text-[#4b5158] mb-3">
          {untimedCount} of {segments.length} segment
          {untimedCount !== 1 ? "s" : ""} missing timing — set start and duration below to show{" "}
          {untimedCount !== 1 ? "them" : "it"} in the timeline.
        </p>
      )}

      {/* ── Coverage + warnings ── */}
      {hasValidShotDuration && timedEntries.length > 0 && (
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-[#4b5158]">Coverage</span>
            <span
              className={`text-[10px] font-mono ${
                allOk ? "text-[#5fa37a]" : "text-[#cda24f]"
              }`}
            >
              {coveredSeconds.toFixed(1)}s / {shotDurationSeconds!.toFixed(1)}s
            </span>
            {allOk && (
              <span className="text-[9px] text-[#5fa37a]">✓ Timeline looks complete</span>
            )}
          </div>
          {warnings.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {warnings.map((w, i) => (
                <span key={i} className="text-[10px] text-[#cda24f]">
                  · {w}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lane ── */}
      {hasValidShotDuration ? (
        <div className="mb-3">
          <div
            ref={trackRef}
            className="relative rounded border border-[#1a1d20] bg-[#0d0e10] overflow-hidden cursor-crosshair"
            style={{ height: `${TRACK_HEIGHT}px` }}
            onDoubleClick={handleTrackDoubleClick}
          >
            {!hasLaneContent && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] text-[#3a4046]">
                  Double-click to add a segment
                </span>
              </div>
            )}

            {/* Real timed segments */}
            {timedEntries.map((seg) => {
              const rawLeft = (seg.startSeconds / shotDurationSeconds!) * 100;
              const rawRight =
                ((seg.startSeconds + seg.durationSeconds) / shotDurationSeconds!) * 100;
              const visualLeft = Math.max(0, Math.min(100, rawLeft));
              const visualRight = Math.max(0, Math.min(100, rawRight));
              const visualWidth = Math.max(0, visualRight - visualLeft);
              if (visualWidth <= 0) return null;

              const color = colorMap.get(`seg_${seg.id}`) ?? SEGMENT_PALETTE[0];
              const display =
                promptExcerpt(promptTexts[seg.id] ?? seg.promptText, 30) || seg.label;

              return (
                <div
                  key={`s-${seg.id}`}
                  className="absolute top-0 flex overflow-hidden"
                  style={{
                    left: `${visualLeft}%`,
                    width: `${visualWidth}%`,
                    height: `${TRACK_HEIGHT}px`,
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {/* Left handle */}
                  <div
                    className={handleClasses.div}
                    style={{ width: "12px" }}
                    onPointerDown={(e) => handleSegPointerDown(e, seg.id, "left")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div
                      className={`${handleClasses.line} left-0`}
                      style={{ backgroundColor: color }}
                    />
                    <div className={handleClasses.grip} />
                  </div>

                  {/* Body */}
                  <div
                    className={bodyClasses}
                    style={{ borderTop: `2px solid ${color}` }}
                    onPointerDown={(e) => handleSegPointerDown(e, seg.id, "body")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <span
                      className="text-[9px] font-mono truncate leading-none"
                      style={{ color }}
                    >
                      {display}
                    </span>
                    <span className="text-[9px] font-mono text-[#4b5158] tabular-nums leading-none truncate">
                      {seg.startSeconds.toFixed(1)}–{(seg.startSeconds + seg.durationSeconds).toFixed(1)}s
                    </span>
                  </div>

                  {/* Right handle */}
                  <div
                    className={handleClasses.div}
                    style={{ width: "12px" }}
                    onPointerDown={(e) => handleSegPointerDown(e, seg.id, "right")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div
                      className={`${handleClasses.line} right-0`}
                      style={{ backgroundColor: color }}
                    />
                    <div className={handleClasses.grip} />
                  </div>
                </div>
              );
            })}

            {/* Draft segments */}
            {drafts.map((draft) => {
              const rawLeft = (draft.startSeconds / shotDurationSeconds!) * 100;
              const rawRight =
                ((draft.startSeconds + draft.durationSeconds) / shotDurationSeconds!) * 100;
              const visualLeft = Math.max(0, Math.min(100, rawLeft));
              const visualRight = Math.max(0, Math.min(100, rawRight));
              const visualWidth = Math.max(0, visualRight - visualLeft);
              if (visualWidth <= 0) return null;

              const color = colorMap.get(`draft_${draft.draftId}`) ?? SEGMENT_PALETTE[0];
              const draftDisplay = promptExcerpt(draft.promptText, 30) || "New Segment";

              return (
                <div
                  key={`d-${draft.draftId}`}
                  className="absolute top-0 flex overflow-hidden"
                  style={{
                    left: `${visualLeft}%`,
                    width: `${visualWidth}%`,
                    height: `${TRACK_HEIGHT}px`,
                    opacity: 0.7,
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {/* Left handle */}
                  <div
                    className={handleClasses.div}
                    style={{ width: "12px" }}
                    onPointerDown={(e) => handleDraftPointerDown(e, draft.draftId, "left")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div
                      className={`${handleClasses.line} left-0`}
                      style={{ backgroundColor: color }}
                    />
                    <div className={handleClasses.grip} />
                  </div>

                  {/* Body */}
                  <div
                    className={bodyClasses}
                    style={{ borderTop: `2px dashed ${color}` }}
                    onPointerDown={(e) => handleDraftPointerDown(e, draft.draftId, "body")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <span
                      className="text-[9px] font-mono truncate leading-none"
                      style={{ color }}
                    >
                      {draftDisplay}
                    </span>
                    <span className="text-[9px] font-mono text-[#4b5158] tabular-nums leading-none truncate">
                      {draft.startSeconds.toFixed(1)}–{(draft.startSeconds + draft.durationSeconds).toFixed(1)}s
                    </span>
                  </div>

                  {/* Right handle */}
                  <div
                    className={handleClasses.div}
                    style={{ width: "12px" }}
                    onPointerDown={(e) => handleDraftPointerDown(e, draft.draftId, "right")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div
                      className={`${handleClasses.line} right-0`}
                      style={{ backgroundColor: color }}
                    />
                    <div className={handleClasses.grip} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ruler */}
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] font-mono text-[#3a4046]">0s</span>
            <span className="text-[9px] font-mono text-[#3a4046]">
              {shotDurationSeconds!.toFixed(1)}s
            </span>
          </div>
          {hasLaneContent && (
            <p className="text-[9px] text-[#3a4046] mt-0.5">
              Double-click an empty space to add a new segment.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[#4b5158] mb-3">
          Set a shot duration to edit the prompt timeline.
        </p>
      )}

      {/* ── Inputs table ── */}
      {(segments.length > 0 || drafts.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 pb-1 border-b border-[#1a1d20]">
            <span className="shrink-0" style={{ width: "6px" }} />
            <span className="flex-1 min-w-0 text-[9px] font-mono text-[#3a4046] uppercase tracking-widest">
              Prompt Text
            </span>
            <span className="text-[9px] font-mono text-[#3a4046] uppercase tracking-widest shrink-0 w-16 text-right">
              Start
            </span>
            <span className="text-[9px] font-mono text-[#3a4046] uppercase tracking-widest shrink-0 w-16 text-right">
              Dur
            </span>
            <span className="text-[9px] font-mono text-[#3a4046] uppercase tracking-widest shrink-0 w-14 text-right">
              End
            </span>
          </div>

          {/* Existing segments */}
          {segments.map((seg) => {
            const t = timings[seg.id] ?? { startSeconds: null, durationSeconds: null };
            const color = colorMap.get(`seg_${seg.id}`);
            const endVal =
              t.startSeconds !== null && t.durationSeconds !== null
                ? `${(t.startSeconds + t.durationSeconds).toFixed(1)}s`
                : "—";
            return (
              <div key={seg.id} className="flex items-start gap-2">
                <span
                  className="shrink-0 rounded-full mt-[7px]"
                  style={{
                    width: "6px",
                    height: "6px",
                    backgroundColor: color ?? "#3a4046",
                  }}
                />
                <textarea
                  rows={2}
                  value={promptTexts[seg.id] ?? ""}
                  onChange={(e) =>
                    setPromptTexts((prev) => ({ ...prev, [seg.id]: e.target.value }))
                  }
                  placeholder="No prompt text"
                  className="flex-1 min-w-0 rounded bg-[#0d0e10] border border-[#2c3035] px-1.5 py-1 text-[10px] text-[#e7e9ec] placeholder-[#4b5158] focus:outline-none focus:border-[#3a4046] transition-colors resize-none font-mono leading-snug"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={t.startSeconds ?? ""}
                  onChange={(e) => handleInputChange(seg.id, "startSeconds", e.target.value)}
                  placeholder="—"
                  className="w-16 rounded bg-[#0d0e10] border border-[#2c3035] px-1.5 py-1 text-[10px] text-[#e7e9ec] placeholder-[#3a4046] text-right focus:outline-none focus:border-[#3a4046] transition-colors tabular-nums font-mono shrink-0 mt-px"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={t.durationSeconds ?? ""}
                  onChange={(e) =>
                    handleInputChange(seg.id, "durationSeconds", e.target.value)
                  }
                  placeholder="—"
                  className="w-16 rounded bg-[#0d0e10] border border-[#2c3035] px-1.5 py-1 text-[10px] text-[#e7e9ec] placeholder-[#3a4046] text-right focus:outline-none focus:border-[#3a4046] transition-colors tabular-nums font-mono shrink-0 mt-px"
                />
                <span className="text-[10px] font-mono text-[#4b5158] shrink-0 w-14 text-right mt-[7px]">
                  {endVal}
                </span>
              </div>
            );
          })}

          {/* Draft segments */}
          {drafts.map((draft, i) => {
            const color = colorMap.get(`draft_${draft.draftId}`);
            return (
              <div key={draft.draftId} className="flex items-start gap-2 opacity-70">
                <span
                  className="shrink-0 rounded-full border border-dashed mt-[7px]"
                  style={{
                    width: "6px",
                    height: "6px",
                    borderColor: color ?? "#3a4046",
                    backgroundColor: "transparent",
                  }}
                />
                <textarea
                  rows={2}
                  value={draft.promptText}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDrafts((prev) =>
                      prev.map((d) =>
                        d.draftId === draft.draftId ? { ...d, promptText: v } : d
                      )
                    );
                  }}
                  placeholder={`New Segment ${segments.length + i + 1} — add prompt text`}
                  className="flex-1 min-w-0 rounded bg-[#0d0e10] border border-[#2c3035] px-1.5 py-1 text-[10px] text-[#e7e9ec] placeholder-[#4b5158] focus:outline-none focus:border-[#3a4046] transition-colors resize-none font-mono leading-snug"
                />
                <span className="w-16 text-right text-[10px] font-mono text-[#6e767d] shrink-0 tabular-nums mt-[7px]">
                  {draft.startSeconds.toFixed(1)}
                </span>
                <span className="w-16 text-right text-[10px] font-mono text-[#6e767d] shrink-0 tabular-nums mt-[7px]">
                  {draft.durationSeconds.toFixed(1)}
                </span>
                <span className="text-[10px] font-mono text-[#4b5158] shrink-0 w-14 text-right mt-[7px]">
                  {(draft.startSeconds + draft.durationSeconds).toFixed(1)}s
                </span>
              </div>
            );
          })}
        </div>
      )}
    </form>
  );
}
