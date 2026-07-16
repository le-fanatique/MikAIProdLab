"use client";

// ---------------------------------------------------------------------------
// RegionCropBox.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX2
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
};

const MIN_SIZE_PX = 8;

function borderColorClass(status: Props["status"]): string {
  switch (status) {
    case "extracted":
      return "border-[#6b9e72]";
    case "skipped":
      return "border-[#4b5158]";
    case "assigned":
      return "border-[#5b93d6]";
    default:
      return "border-[#cda24f]";
  }
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
  } | null>(null);

  const writeFieldsToDom = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      (["x", "y", "width", "height"] as const).forEach((field) => {
        const el = document.getElementById(`region-${regionId}-${field}`) as HTMLInputElement | null;
        if (el) el.value = String(next[field]);
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

      const next = { ...state.startBox };
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
      }

      const clamped = clamp(next);
      setBox(clamped);
      writeFieldsToDom(clamped);
    },
    [clamp, writeFieldsToDom]
  );

  const endDrag = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  const startDrag = useCallback(
    (mode: "move" | "resize", corner?: Corner) => (e: React.PointerEvent<HTMLElement>) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const container = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-crop-container]");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      dragState.current = {
        mode,
        corner,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startBox: { ...box },
        scaleX: sourceWidth / rect.width,
        scaleY: sourceHeight / rect.height,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [editable, box, sourceWidth, sourceHeight, onPointerMove, endDrag]
  );

  const left = (box.x / sourceWidth) * 100;
  const top = (box.y / sourceHeight) * 100;
  const w = (box.width / sourceWidth) * 100;
  const h = (box.height / sourceHeight) * 100;
  const borderStyle = detectionMode === "grid-fallback" ? "border-dashed" : "border-solid";

  return (
    <div
      className={`absolute border-2 ${borderStyle} ${borderColorClass(status)} ${editable ? "cursor-move" : "pointer-events-none"}`}
      style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` }}
      onPointerDown={editable ? startDrag("move") : undefined}
    >
      <span className="absolute top-0.5 left-0.5 text-[9px] font-mono bg-[#0d0e10]/85 text-[#e7e9ec] rounded px-1 py-px pointer-events-none select-none">
        {index + 1} · {Math.round(confidence * 100)}%{detectionMode === "grid-fallback" ? " · grid" : ""}
      </span>
      {editable &&
        (Object.keys(HANDLE_POSITION) as Corner[]).map((corner) => (
          <div
            key={corner}
            onPointerDown={startDrag("resize", corner)}
            className={`absolute w-3 h-3 bg-[#e7e9ec] border border-[#0d0e10] rounded-sm ${HANDLE_POSITION[corner]}`}
          />
        ))}
    </div>
  );
}
