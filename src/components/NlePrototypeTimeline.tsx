"use client";

import { useEffect, useMemo, useState } from "react";
import { Timeline } from "@xzdarcy/react-timeline-editor";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import type { EditorialDocument, EditorialDocumentItem } from "@/lib/editorial/editorialDocument";
import {
  toTimelineEditorData,
  type TimelineEditorActionLike,
} from "@/lib/editorial/toTimelineEditorData";

type Props = {
  document: EditorialDocument;
  /** Optional controlled selection — when provided (even null), the component follows it instead of tracking its own. */
  selectedItemId?: number | null;
  onSelectedItemChange?: (itemId: number | null) => void;
};

const EFFECT_COLOR: Record<string, string> = {
  "shot-approved": "#6b9e72",
  "shot-placeholder": "#cda24f",
  "shot-missing": "#cf7b6b",
  shot: "#a4abb2",
  gap: "#4b5158",
};

// Subtle status tint behind each shot chip — reinforces the status color
// without competing with the selected-state glow.
const EFFECT_BG: Record<string, string> = {
  "shot-approved": "rgba(107,158,114,0.08)",
  "shot-placeholder": "rgba(205,162,79,0.08)",
  "shot-missing": "rgba(207,123,107,0.08)",
  shot: "rgba(164,171,178,0.05)",
};

// Full label — used in the Selected item panel, where there's room.
const EFFECT_LABEL: Record<string, string> = {
  "shot-approved": "Approved shot",
  "shot-placeholder": "Placeholder shot",
  "shot-missing": "Missing shot",
  shot: "Shot",
  gap: "Gap",
};

// Short label — used inside the timeline chip itself, where space is tight.
const EFFECT_LABEL_SHORT: Record<string, string> = {
  "shot-approved": "Approved",
  "shot-placeholder": "Placeholder",
  "shot-missing": "Missing",
  shot: "Shot",
};

function ActionBox({
  action,
  item,
  isSelected,
}: {
  action: TimelineEditorActionLike;
  item: EditorialDocumentItem | undefined;
  isSelected: boolean;
}) {
  const isGap = action.effectId === "gap";
  const color = EFFECT_COLOR[action.effectId] ?? "#a4abb2";
  const duration = action.end - action.start;
  const trimmed = item?.trimIn !== undefined && item?.trimOut !== undefined;

  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden rounded-sm px-2"
      style={{
        borderLeft: isGap ? `2px dashed ${color}` : `2px solid ${color}`,
        background: isGap
          ? "repeating-linear-gradient(45deg, rgba(75,81,88,0.15), rgba(75,81,88,0.15) 4px, transparent 4px, transparent 8px)"
          : EFFECT_BG[action.effectId] ?? "rgba(255,255,255,0.02)",
        boxShadow: isSelected
          ? "0 0 0 1.5px #5b93d6, 0 0 10px rgba(91,147,214,0.4)"
          : undefined,
      }}
    >
      {isGap ? (
        <>
          <span className="truncate text-[9px] font-mono leading-none" style={{ color }}>
            Gap
          </span>
          <span className="truncate text-[9px] font-mono text-[#6e767d] leading-none tabular-nums">
            {duration.toFixed(1)}s
          </span>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 overflow-hidden">
            <span
              className="shrink-0 truncate text-[9px] font-mono leading-none"
              style={{ color }}
            >
              {item?.shotCode ?? "Shot"}
            </span>
            {item?.title && (
              <span className="min-w-0 flex-1 truncate text-[9px] text-[#4b5158] leading-none">
                {item.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className="shrink-0 text-[9px] uppercase tracking-wide leading-none"
              style={{ color }}
            >
              {EFFECT_LABEL_SHORT[action.effectId] ?? "Shot"}
            </span>
            {trimmed && (
              <span className="shrink-0 text-[9px] text-[#5b93d6] leading-none">
                Trimmed
              </span>
            )}
            <span className="ml-auto shrink-0 text-[9px] font-mono text-[#6e767d] leading-none tabular-nums">
              {duration.toFixed(1)}s
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function NlePrototypeTimeline({
  document,
  selectedItemId,
  onSelectedItemChange,
}: Props) {
  const { rows, effects, itemByActionId } = useMemo(
    () => toTimelineEditorData(document),
    [document]
  );

  // Simple tick-spacing heuristic — picks a readable seconds-per-tick value
  // from the document's total duration (no iterative/complex fitting).
  const { tickSeconds, tickCount } = useMemo(() => {
    const totalSeconds = Math.max(document.durationSeconds, 1);
    const seconds =
      totalSeconds <= 20 ? 2 : totalSeconds <= 60 ? 5 : totalSeconds <= 180 ? 15 : 30;
    const count = Math.max(Math.ceil(totalSeconds / seconds) + 1, 5);
    return { tickSeconds: seconds, tickCount: count };
  }, [document.durationSeconds]);

  // Controlled when the parent passes selectedItemId (undefined = uncontrolled fallback).
  const isControlled = selectedItemId !== undefined;
  const [localSelectedActionId, setLocalSelectedActionId] = useState<string | null>(null);
  const selectedActionId = isControlled
    ? selectedItemId !== null
      ? String(selectedItemId)
      : null
    : localSelectedActionId;

  const selectedItem: EditorialDocumentItem | null = selectedActionId
    ? itemByActionId.get(selectedActionId) ?? null
    : null;

  // react-timeline-editor measures its grid via the DOM (react-virtualized)
  // on the client — rendering it during SSR/first hydration produces a
  // width/height mismatch. Mount it only once the client has taken over.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-[#6e767d]">
          Read-only timeline prototype
        </span>
        <span className="text-[9px] uppercase tracking-wider text-[#cda24f] border border-[#3d3423] rounded px-1.5 py-px">
          Editing is disabled in this prototype
        </span>
      </div>

      <div className="rounded border border-[#232629] bg-[#0d0e10] overflow-hidden">
        {isMounted ? (
          <Timeline
            editorData={rows}
            effects={effects}
            style={{ width: "100%", height: 240 }}
            autoScroll
            disableDrag
            gridSnap={false}
            dragLine={false}
            hideCursor
            rowHeight={52}
            scale={tickSeconds}
            scaleWidth={64}
            minScaleCount={tickCount}
            getScaleRender={(scale) => (
              <span className="text-[9px] font-mono text-[#4b5158] tabular-nums">
                {scale}s
              </span>
            )}
            getActionRender={(action) => (
              <ActionBox
                action={action}
                item={itemByActionId.get(action.id)}
                isSelected={action.id === selectedActionId}
              />
            )}
            onClickAction={(_e, { action }) => {
              const itemId = Number(action.id);
              onSelectedItemChange?.(Number.isNaN(itemId) ? null : itemId);
              if (!isControlled) {
                setLocalSelectedActionId(action.id);
              }
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ width: "100%", height: 240 }}
          >
            <span className="text-xs text-[#4b5158]">
              Loading timeline prototype…
            </span>
          </div>
        )}
      </div>

      {/* ── Selected item details ── */}
      <div className="rounded border border-[#232629] bg-[#0d0e10] px-3 py-2">
        <span className="text-[9px] uppercase tracking-wider text-[#4b5158] block mb-2">
          Selected item
        </span>
        {selectedItem ? (
          <div className="flex flex-col gap-1 text-xs text-[#a4abb2]">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[9px] uppercase tracking-wider border rounded px-1.5 py-px shrink-0"
                style={{
                  color: EFFECT_COLOR[
                    selectedItem.sourceType === "gap"
                      ? "gap"
                      : `shot-${selectedItem.status ?? "missing"}`
                  ],
                  borderColor: "#2c3035",
                }}
              >
                {selectedItem.sourceType === "gap"
                  ? "Gap"
                  : EFFECT_LABEL[`shot-${selectedItem.status ?? "missing"}`]}
              </span>
              {selectedItem.shotCode && (
                <span className="font-mono text-[#6e767d]">{selectedItem.shotCode}</span>
              )}
              {selectedItem.title && <span>{selectedItem.title}</span>}
            </div>
            <div className="flex items-center gap-4 flex-wrap font-mono tabular-nums text-[10px] text-[#6e767d]">
              <span>Start {selectedItem.start.toFixed(1)}s</span>
              <span>Duration {selectedItem.duration.toFixed(1)}s</span>
              {selectedItem.trimIn !== undefined && selectedItem.trimOut !== undefined && (
                <span>
                  Trim {selectedItem.trimIn.toFixed(1)}s → {selectedItem.trimOut.toFixed(1)}s
                </span>
              )}
              {selectedItem.mediaUrl && <span>Media available</span>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#4b5158]">No item selected</p>
        )}
      </div>

      {/* ── EditorialDocument debug ── */}
      <details className="rounded border border-[#232629] bg-[#0d0e10] px-3 py-2">
        <summary className="text-[9px] uppercase tracking-wider text-[#4b5158] cursor-pointer">
          EditorialDocument debug
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto text-[10px] text-[#6e767d] font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(document, null, 2)}
        </pre>
      </details>
    </div>
  );
}
