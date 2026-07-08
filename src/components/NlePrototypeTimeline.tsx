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

const EFFECT_LABEL: Record<string, string> = {
  "shot-approved": "Approved shot",
  "shot-placeholder": "Placeholder shot",
  "shot-missing": "Missing shot",
  shot: "Shot",
  gap: "Gap",
};

function ActionBox({
  action,
  isSelected,
}: {
  action: TimelineEditorActionLike;
  isSelected: boolean;
}) {
  const color = EFFECT_COLOR[action.effectId] ?? "#a4abb2";
  const isGap = action.effectId === "gap";
  const duration = action.end - action.start;

  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden px-2"
      style={{
        borderLeft: `2px solid ${color}`,
        background: isGap
          ? "repeating-linear-gradient(45deg, rgba(75,81,88,0.15), rgba(75,81,88,0.15) 4px, transparent 4px, transparent 8px)"
          : "rgba(255,255,255,0.02)",
        boxShadow: isSelected ? "inset 0 0 0 1px #5b93d6" : undefined,
      }}
    >
      <span
        className="truncate text-[9px] font-mono leading-none"
        style={{ color }}
      >
        {EFFECT_LABEL[action.effectId] ?? action.effectId}
      </span>
      <span className="truncate text-[9px] font-mono text-[#6e767d] leading-none tabular-nums">
        {duration.toFixed(1)}s
      </span>
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
            style={{ width: "100%", height: 220 }}
            autoScroll
            disableDrag
            gridSnap={false}
            dragLine={false}
            hideCursor
            rowHeight={40}
            getActionRender={(action) => (
              <ActionBox action={action} isSelected={action.id === selectedActionId} />
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
            style={{ width: "100%", height: 220 }}
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
