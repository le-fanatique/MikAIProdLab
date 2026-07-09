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
// Shot-backed actions are movable (PHASEC.NLE.C.M1 — non-ripple move);
// every action stays flexible: false (no resize/duration-edit from this
// prototype). minStart/maxEnd bound a move to the nearest shot-only
// neighbor on the same track.
//
// Legacy "gap" rows in the DB are never turned into actions here — see
// PHASEC.NLE.C.M1.R1: once startSeconds exists, a gap row is
// technical-only data. Empty space is instead rendered as synthetic,
// non-movable actions derived purely from shot positions
// (editorialDocument.deriveEmptySpaces), so a move can never leave a
// stale gap visually overlapping the timeline.
// ---------------------------------------------------------------------------

import {
  deriveEmptySpaces,
  getEmptySpacePreviewItemId,
  type EditorialDocument,
  type EditorialDocumentItem,
} from "./editorialDocument";

export type TimelineEditorActionLike = {
  id: string;
  start: number;
  end: number;
  effectId: string;
  movable?: boolean;
  flexible?: boolean;
  disable?: boolean;
  minStart?: number;
  maxEnd?: number;
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
  "empty-space": "Empty space",
  "shot-approved": "Approved shot",
  "shot-placeholder": "Placeholder shot",
  "shot-missing": "Missing shot",
  shot: "Shot",
};

/** shot -> "shot-<status>" (approved/placeholder/missing); a shot item with no status ever set falls back to the generic "shot". */
function deriveEffectId(item: EditorialDocumentItem): string {
  if (item.status) return `shot-${item.status}`;
  return "shot";
}

export function toTimelineEditorData(
  document: EditorialDocument
): TimelineEditorData {
  const itemByActionId = new Map<string, EditorialDocumentItem>();
  const effects: Record<string, TimelineEditorEffectLike> = {};

  function ensureEffect(effectId: string) {
    if (!effects[effectId]) {
      effects[effectId] = {
        id: effectId,
        name: EFFECT_LABELS[effectId] ?? effectId,
      };
    }
  }

  const emptySpacesByTrack = new Map<number, ReturnType<typeof deriveEmptySpaces>>();
  for (const space of deriveEmptySpaces(document)) {
    const bucket = emptySpacesByTrack.get(space.trackIndex);
    if (bucket) bucket.push(space);
    else emptySpacesByTrack.set(space.trackIndex, [space]);
  }

  const rows: TimelineEditorRowLike[] = document.tracks.map((track) => {
    // Shot-only, sorted by start — this is both the render list and the
    // neighbor list for minStart/maxEnd (legacy gap rows never appear here).
    const shotItems = track.items
      .filter((it) => it.sourceType === "shot")
      .slice()
      .sort((a, b) => (a.start !== b.start ? a.start - b.start : a.id - b.id));

    const actions: TimelineEditorActionLike[] = [];

    shotItems.forEach((item, idx) => {
      const effectId = deriveEffectId(item);
      ensureEffect(effectId);

      const actionId = String(item.id);
      itemByActionId.set(actionId, item);

      const previous = idx > 0 ? shotItems[idx - 1] : undefined;
      const next = idx < shotItems.length - 1 ? shotItems[idx + 1] : undefined;
      const minStart = previous ? previous.start + previous.duration : 0;
      const maxEnd = next ? next.start : Infinity;

      actions.push({
        id: actionId,
        start: item.start,
        end: item.start + item.duration,
        effectId,
        movable: true,
        // No resize/duration-edit from this prototype.
        flexible: false,
        disable: true,
        minStart,
        maxEnd,
      });
    });

    for (const space of emptySpacesByTrack.get(track.id) ?? []) {
      ensureEffect("empty-space");
      actions.push({
        // Shared with previewItems/scrubber — same synthetic id for the
        // same space everywhere, never the legacy gap row's DB id.
        id: String(getEmptySpacePreviewItemId(space)),
        start: space.start,
        end: space.start + space.duration,
        effectId: "empty-space",
        movable: false,
        flexible: false,
        disable: true,
      });
    }

    return {
      id: String(track.id),
      actions,
    };
  });

  return { rows, effects, itemByActionId };
}
