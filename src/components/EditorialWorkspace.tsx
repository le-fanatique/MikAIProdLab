"use client";

import { useState } from "react";
import Card from "@/components/Card";
import EditorialTimeline, { type EditorialTimelineShot } from "@/components/EditorialTimeline";
import SequencePreviewPlayer from "@/components/SequencePreviewPlayer";

export type EditorialWorkspaceShot = EditorialTimelineShot;

type Props = {
  shots: EditorialWorkspaceShot[];
  projectId: number;
  sequenceId: number;
  returnTo: string;
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4 flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

/**
 * Client container for the editorial page: owns the shared shot selection so
 * the timeline and the preview player stay synchronized.
 */
export default function EditorialWorkspace({
  shots,
  projectId,
  sequenceId,
  returnTo,
}: Props) {
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);

  return (
    <>
      {/* ── Timeline ─────────────────────────────────────────────── */}
      <SectionLabel label="Timeline" />
      <Card>
        <EditorialTimeline
          shots={shots}
          projectId={projectId}
          sequenceId={sequenceId}
          returnTo={returnTo}
          selectedShotId={selectedShotId}
          onSelectShot={setSelectedShotId}
        />
      </Card>

      {/* ── Sequence Preview ─────────────────────────────────────── */}
      <SectionLabel label="Sequence Preview" />
      <Card>
        <SequencePreviewPlayer
          shots={shots.map((s) => ({
            id: s.id,
            shotCode: s.shotCode,
            title: s.title,
            durationSeconds: s.durationSeconds,
            videoUrl: s.videoUrl,
            isPlaceholder: s.isPlaceholder,
            trimInSeconds: s.trimInSeconds,
            trimOutSeconds: s.trimOutSeconds,
          }))}
          projectId={projectId}
          sequenceId={sequenceId}
          selectedShotId={selectedShotId}
          onShotSelect={setSelectedShotId}
        />
      </Card>
    </>
  );
}
