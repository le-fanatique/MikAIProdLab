"use client";

// ---------------------------------------------------------------------------
// RegionCropBox.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX2 / -FIX5
//
// Interactive overlay rectangle for one extraction region: draggable body
// (move) plus four corner resize handles, rendered as an absolutely-
// positioned percentage box inside the Preview card's relative container
// (the container must carry `data-crop-container`).
//
// Never writes to the DB directly — dragging only updates this component's
// own visual position/size (local React state, initialized once from
// server props) and imperatively writes the same numbers into the sibling
// numeric <input id="region-{id}-{field}"> fields already rendered by the
// region's edit form below. The existing "Update" button still performs the
// actual submit through the existing resizeExtractionRegion server action —
// this component is purely an alternate, faster way to fill in those same
// fields, so there is no new client-side DB write path and no hydration
// mismatch (all DOM writes happen post-mount, in response to real pointer
// events, never during render).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { RATIO_VALUES, isRatioPreset } from "@/lib/storyboardExtraction/ratioCrop";

type Corner = "nw" | "ne" | "sw" | "se";

type Props = {
  regionId: number;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  status: "pending" | "assigned" | "skipped" | "extracted";
  detectionMode: string;
  confidence: number;
  editable: boolean;
  /** SEQGEN.STORYBOARD.EXTRACT.1-FIX3 — this region's identity color (getRegionColor), reused verbatim on the matching Regions list row's swatch. Never the sole way to identify a region: the numbered label below always carries the same "#N" as visible text. */
  color: string;
  /** FIX6 (Lot C) — id of this region's own "Lock ratio" checkbox and the shared ratio <select>, both read fresh from the DOM at the START of each drag (never cached across drags) so toggling either mid-session takes effect on the very next interaction. Omitted entirely keeps today's unconstrained free-resize behavior. */
  lockRatioFieldId?: string;
  ratioSelectId?: string;
};

const MIN_SIZE_PX = 8;

/** SEQGEN.STORYBOARD.EXTRACT.1-FIX5 — dispatched on `window` by ApplyToAllRegionsButton after it writes a region's new x/y/width/height into the region-{id}-{field} inputs, so this box's own visual preview refreshes in step with the batch content-crop preview, not just per-drag edits. Detail: { regionId: number; rect: { x, y, width, height } }. */
export const REGION_RECT_APPLIED_EVENT = "storyboard-region-rect-applied";

/**
 * REVISE (Codex finding #2) — computes a resize that stays STRICTLY within
 * [0, sourceWidth] x [0, sourceHeight] while preserving `ratio` exactly
 * (width/height), for the given corner's fixed anchor (the opposite
 * corner). The previous implementation derived height from width
 * (preserving ratio) but then let the generic `clamp()` shrink width and
 * height INDEPENDENTLY against the source bounds — near an edge this broke
 * the ratio and un-anchored the opposite corner. Here, width is capped
 * jointly against both the horizontal AND vertical available space
 * (`maxH * ratio`) BEFORE height is derived from it, so the final rect can
 * never need an independent post-hoc clamp: it is in-bounds and ratio-exact
 * by construction (up to integer rounding).
 */
export function computeLockedResizeRect(
  startBox: { x: number; y: number; width: number; height: number },
  corner: Corner,
  desiredWidthUnclamped: number,
  ratio: number,
  sourceWidth: number,
  sourceHeight: number
): { x: number; y: number; width: number; height: number } {
  const anchorX = corner.includes("w") ? startBox.x + startBox.width : startBox.x;
  const anchorY = corner.includes("n") ? startBox.y + startBox.height : startBox.y;
  const maxW = Math.max(1, corner.includes("w") ? anchorX : sourceWidth - anchorX);
  const maxH = Math.max(1, corner.includes("n") ? anchorY : sourceHeight - anchorY);

  const widthCap = Math.min(maxW, maxH * ratio);
  let width = Math.min(Math.max(MIN_SIZE_PX, desiredWidthUnclamped), widthCap);
  let height = width / ratio;

  width = Math.min(Math.round(width), Math.floor(maxW));
  height = Math.min(Math.round(height), Math.floor(maxH));
  width = Math.max(1, width);
  height = Math.max(1, height);

  const x = corner.includes("w") ? anchorX - width : anchorX;
  const y = corner.includes("n") ? anchorY - height : anchorY;
  return { x, y, width, height };
}

const HANDLE_POSITION: Record<Corner, string> = {
  nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
  ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  se: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
};

export default function RegionCropBox({
  regionId,
  index,
  x,
  y,
  width,
  height,
  sourceWidth,
  sourceHeight,
  status,
  detectionMode,
  confidence,
  editable,
  color,
  lockRatioFieldId,
  ratioSelectId,
}: Props) {
  const [box, setBox] = useState({ x, y, width, height });

  const dragState = useRef<{
    mode: "move" | "resize";
    corner?: Corner;
    startClientX: number;
    startClientY: number;
    startBox: { x: number; y: number; width: number; height: number };
    scaleX: number;
    scaleY: number;
    /** FIX6 (Lot C) — null unless "Lock ratio" was checked and a non-"free" ratio was selected at drag-start; resolved once here so a resize drag never re-reads the DOM mid-drag. */
    lockedRatioValue: number | null;
  } | null>(null);

  const writeFieldsToDom = useCallback(
    (next: { x: number; y: number; width: number; height: number }, isManualEdit: boolean) => {
      (["x", "y", "width", "height"] as const).forEach((field) => {
        const el = document.getElementById(`region-${regionId}-${field}`) as HTMLInputElement | null;
        if (el) el.value = String(next[field]);
        // REVISE (round 2, finding #1) — a real drag IS the user manually
        // repositioning the region, so it becomes the new stable base
        // `Apply Ratio All` uses for Manual mode (see
        // region-{id}-manual-base-{field}, rendered by the page). An
        // externally-applied rect (Apply to all regions / Apply Ratio All
        // itself, via REGION_RECT_APPLIED_EVENT) must NEVER count as a
        // manual edit — that would make the ratio pipeline's own output
        // become its next base, breaking idempotence exactly like the bug
        // this same field was introduced to fix.
        if (isManualEdit) {
          const baseEl = document.getElementById(`region-${regionId}-manual-base-${field}`) as HTMLInputElement | null;
          if (baseEl) baseEl.value = String(next[field]);
        }
      });
    },
    [regionId]
  );

  const clamp = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      let w = Math.max(MIN_SIZE_PX, Math.min(next.width, sourceWidth));
      let h = Math.max(MIN_SIZE_PX, Math.min(next.height, sourceHeight));
      let nx = Math.min(Math.max(0, next.x), sourceWidth - w);
      let ny = Math.min(Math.max(0, next.y), sourceHeight - h);
      w = Math.min(w, sourceWidth - nx);
      h = Math.min(h, sourceHeight - ny);
      return { x: Math.round(nx), y: Math.round(ny), width: Math.round(w), height: Math.round(h) };
    },
    [sourceWidth, sourceHeight]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const state = dragState.current;
      if (!state) return;
      const dx = (e.clientX - state.startClientX) * state.scaleX;
      const dy = (e.clientY - state.startClientY) * state.scaleY;

      let next = { ...state.startBox };
      if (state.mode === "move") {
        next.x = state.startBox.x + dx;
        next.y = state.startBox.y + dy;
      } else if (state.corner) {
        if (state.corner.includes("e")) next.width = state.startBox.width + dx;
        if (state.corner.includes("s")) next.height = state.startBox.height + dy;
        if (state.corner.includes("w")) {
          next.x = state.startBox.x + dx;
          next.width = state.startBox.width - dx;
        }
        if (state.corner.includes("n")) {
          next.y = state.startBox.y + dy;
          next.height = state.startBox.height - dy;
        }

        // REVISE (Codex finding #2) — a locked resize is computed by its
        // own bounds-aware, ratio-exact-by-construction function, never by
        // the generic `clamp()` below (which shrinks width/height
        // independently and would break the ratio and un-anchor the
        // opposite corner near a source edge). `next.width` here is only
        // used as the "desired" unclamped width the drag distance implies.
        if (state.lockedRatioValue) {
          next = computeLockedResizeRect(state.startBox, state.corner, next.width, state.lockedRatioValue, sourceWidth, sourceHeight);
        }
      }

      const clamped = state.mode === "resize" && state.corner && state.lockedRatioValue ? next : clamp(next);
      setBox(clamped);
      writeFieldsToDom(clamped, true);
    },
    [clamp, writeFieldsToDom, sourceWidth, sourceHeight]
  );

  const endDrag = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  useEffect(() => {
    function onExternalRectApplied(e: Event) {
      const detail = (e as CustomEvent<{ regionId: number; rect: { x: number; y: number; width: number; height: number } }>).detail;
      if (!detail || detail.regionId !== regionId) return;
      const clamped = clamp(detail.rect);
      setBox(clamped);
      writeFieldsToDom(clamped, false);
    }
    window.addEventListener(REGION_RECT_APPLIED_EVENT, onExternalRectApplied);
    return () => window.removeEventListener(REGION_RECT_APPLIED_EVENT, onExternalRectApplied);
  }, [regionId, clamp, writeFieldsToDom]);

  const startDrag = useCallback(
    (mode: "move" | "resize", corner?: Corner) => (e: React.PointerEvent<HTMLElement>) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const container = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-crop-container]");
      if (!container) return;
      const rect = container.getBoundingClientRect();

      // FIX6 (Lot C) — resolved once per drag, only relevant for a resize
      // (a plain move never changes width/height, so ratio locking is moot).
      let lockedRatioValue: number | null = null;
      if (mode === "resize" && lockRatioFieldId && ratioSelectId) {
        const lockEl = document.getElementById(lockRatioFieldId) as HTMLInputElement | null;
        const ratioEl = document.getElementById(ratioSelectId) as HTMLSelectElement | null;
        if (lockEl?.checked && ratioEl?.value && isRatioPreset(ratioEl.value) && ratioEl.value !== "free") {
          lockedRatioValue = RATIO_VALUES[ratioEl.value];
        }
      }

      dragState.current = {
        mode,
        corner,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startBox: { ...box },
        scaleX: sourceWidth / rect.width,
        scaleY: sourceHeight / rect.height,
        lockedRatioValue,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [editable, box, sourceWidth, sourceHeight, onPointerMove, endDrag, lockRatioFieldId, ratioSelectId]
  );

  const left = (box.x / sourceWidth) * 100;
  const top = (box.y / sourceHeight) * 100;
  const w = (box.width / sourceWidth) * 100;
  const h = (box.height / sourceHeight) * 100;
  const borderStyle = detectionMode === "grid-fallback" ? "border-dashed" : "border-solid";
  const opacity = status === "skipped" ? 0.55 : 1;

  return (
    <div
      role="img"
      aria-label={`Region ${index + 1}, status ${status}, ${Math.round(confidence * 100)}% confidence${detectionMode === "grid-fallback" ? ", grid fallback" : ""}`}
      className={`absolute border-2 ${borderStyle} ${editable ? "cursor-move" : "pointer-events-none"}`}
      style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%`, borderColor: color, opacity }}
      onPointerDown={editable ? startDrag("move") : undefined}
    >
      <span className="absolute top-0.5 left-0.5 flex items-center gap-1 text-[9px] font-mono bg-[#0d0e10]/85 text-[#e7e9ec] rounded px-1 py-px pointer-events-none select-none">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
        {index + 1} · {Math.round(confidence * 100)}%{detectionMode === "grid-fallback" ? " · grid" : ""}
      </span>
      {editable &&
        (Object.keys(HANDLE_POSITION) as Corner[]).map((corner) => (
          <div
            key={corner}
            onPointerDown={startDrag("resize", corner)}
            className={`absolute w-3 h-3 border border-[#0d0e10] rounded-sm ${HANDLE_POSITION[corner]}`}
            style={{ backgroundColor: color }}
          />
        ))}
    </div>
  );
}
