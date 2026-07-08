"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/Card";
import SequencePreviewPlayer, {
  type PreviewShot,
  type PreviewItem,
} from "@/components/SequencePreviewPlayer";
import NlePrototypeTimeline from "@/components/NlePrototypeTimeline";
import type { EditorialDocument } from "@/lib/editorial/editorialDocument";

type Props = {
  projectId: number;
  sequenceId: number;
  previewShots: PreviewShot[];
  previewItems: PreviewItem[];
  document: EditorialDocument;
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

/**
 * Client container that shares a single selectedItemId between the
 * read-only preview player and the react-timeline-editor prototype —
 * no persistence, no server actions, purely local UI state.
 */
type SeekRequest = { itemKey: number; localSeconds: number; requestId: number };

export default function NlePrototypeWorkspace({
  projectId,
  sequenceId,
  previewShots,
  previewItems,
  document,
}: Props) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // Time local to whatever entry SequencePreviewPlayer currently has loaded
  // (never a global position — see SequencePreviewPlayer's onTimeUpdate doc).
  const [localTimeSeconds, setLocalTimeSeconds] = useState(0);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const seekRequestIdRef = useRef(0);

  // Reset the local clock whenever the selection changes — avoids showing a
  // stale offset from the previous entry before the new one reports in.
  useEffect(() => {
    setLocalTimeSeconds(0);
  }, [selectedItemId]);

  const itemStartById = useMemo(() => {
    const map = new Map<number, number>();
    for (const track of document.tracks) {
      for (const item of track.items) {
        map.set(item.id, item.start);
      }
    }
    return map;
  }, [document]);

  const currentTimeSeconds =
    selectedItemId !== null && itemStartById.has(selectedItemId)
      ? itemStartById.get(selectedItemId)! + localTimeSeconds
      : null;

  function handleSeek(itemId: number, localSeconds: number) {
    setSelectedItemId(itemId);
    seekRequestIdRef.current += 1;
    setSeekRequest({ itemKey: itemId, localSeconds, requestId: seekRequestIdRef.current });
  }

  return (
    <>
      <SectionLabel label="Preview" />
      <Card>
        <SequencePreviewPlayer
          shots={previewShots}
          projectId={projectId}
          sequenceId={sequenceId}
          items={previewItems}
          selectedItemId={selectedItemId}
          onItemSelect={setSelectedItemId}
          onTimeUpdate={setLocalTimeSeconds}
          seekRequest={seekRequest}
        />
      </Card>

      <SectionLabel label="Timeline" />
      <Card>
        <NlePrototypeTimeline
          document={document}
          selectedItemId={selectedItemId}
          onSelectedItemChange={setSelectedItemId}
          currentTimeSeconds={currentTimeSeconds}
          onSeek={handleSeek}
        />
      </Card>
    </>
  );
}
