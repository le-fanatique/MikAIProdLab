"use client";

import { useState } from "react";
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
export default function NlePrototypeWorkspace({
  projectId,
  sequenceId,
  previewShots,
  previewItems,
  document,
}: Props) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

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
        />
      </Card>

      <SectionLabel label="Timeline" />
      <Card>
        <NlePrototypeTimeline
          document={document}
          selectedItemId={selectedItemId}
          onSelectedItemChange={setSelectedItemId}
        />
      </Card>
    </>
  );
}
