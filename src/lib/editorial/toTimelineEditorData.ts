// ---------------------------------------------------------------------------
// EditorialDocument → @xzdarcy/react-timeline-editor adapter
//
// Pure conversion, no DB access, no side effects. Kept separate from
// editorialDocument.ts so that module stays UI-agnostic — this file is the
// only place that knows about react-timeline-editor's data shape.
//
// The *Like types below are local, structural equivalents of
// @xzdarcy/timeline-engine's TimelineRow/TimelineAction/TimelineEffect —
// deliberately not imported from that package, since it is only a
// transitive dependency of @xzdarcy/react-timeline-editor and not declared
// directly in package.json. TypeScript's structural typing makes these
// values assignable to the library's own prop types without the import.
//
// Every produced action is non-interactive (movable: false, flexible: false)
// — this adapter only feeds a read-only prototype.
// ---------------------------------------------------------------------------

import type { EditorialDocument, EditorialDocumentItem } from "./editorialDocument";

export type TimelineEditorActionLike = {
  id: string;
  start: number;
  end: number;
  effectId: string;
  movable?: boolean;
  flexible?: boolean;
  disable?: boolean;
};

export type TimelineEditorRowLike = {
  id: string;
  actions: TimelineEditorActionLike[];
};

export type TimelineEditorEffectLike = {
  id: string;
  name: string;
};

export type TimelineEditorData = {
  rows: TimelineEditorRowLike[];
  effects: Record<string, TimelineEditorEffectLike>;
  itemByActionId: Map<string, EditorialDocumentItem>;
};

const EFFECT_LABELS: Record<string, string> = {
  gap: "Gap",
  "shot-approved": "Approved shot",
  "shot-placeholder": "Placeholder shot",
  "shot-missing": "Missing shot",
  shot: "Shot",
};

/**
 * gap -> "gap"; shot -> "shot-<status>" (approved/placeholder/missing);
 * a shot item with no status ever set falls back to the generic "shot".
 */
function deriveEffectId(item: EditorialDocumentItem): string {
  if (item.sourceType === "gap") return "gap";
  if (item.status) return `shot-${item.status}`;
  return "shot";
}

export function toTimelineEditorData(
  document: EditorialDocument
): TimelineEditorData {
  const itemByActionId = new Map<string, EditorialDocumentItem>();
  const effects: Record<string, TimelineEditorEffectLike> = {};

  const rows: TimelineEditorRowLike[] = document.tracks.map((track) => {
    const actions: TimelineEditorActionLike[] = track.items.map((item) => {
      const effectId = deriveEffectId(item);
      if (!effects[effectId]) {
        effects[effectId] = {
          id: effectId,
          name: EFFECT_LABELS[effectId] ?? effectId,
        };
      }

      const actionId = String(item.id);
      itemByActionId.set(actionId, item);

      return {
        id: actionId,
        start: item.start,
        end: item.start + item.duration,
        effectId,
        // Read-only prototype: no drag, no resize, no run.
        movable: false,
        flexible: false,
        disable: true,
      };
    });

    return {
      id: String(track.id),
      actions,
    };
  });

  return { rows, effects, itemByActionId };
}
