"use client";

import { useState } from "react";
import Link from "next/link";
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

function shotStatusBadge(shot: EditorialWorkspaceShot) {
  if (shot.isPlaceholder) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#cda24f] border border-[#3d3423] rounded px-1.5 py-px">
        Placeholder
      </span>
    );
  }
  if (shot.hasApprovedVideo) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#6b9e72] border border-[#2a3d2e] rounded px-1.5 py-px">
        Approved video
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#4b5158] border border-[#232629] rounded px-1.5 py-px">
      No video
    </span>
  );
}

/**
 * Client container for the editorial page: owns the shared shot selection so
 * the viewer and the timeline stay synchronized. NLE-like vertical layout:
 * viewer on top, selected-shot strip, timeline below.
 */
export default function EditorialWorkspace({
  shots,
  projectId,
  sequenceId,
  returnTo,
}: Props) {
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);

  const selectedShot =
    selectedShotId !== null
      ? shots.find((s) => s.id === selectedShotId) ?? null
      : null;

  const selectedHasTrim =
    selectedShot !== null &&
    selectedShot.trimInSeconds != null &&
    selectedShot.trimOutSeconds != null &&
    selectedShot.trimOutSeconds > selectedShot.trimInSeconds;

  const selectedEffective = selectedShot
    ? selectedHasTrim
      ? selectedShot.trimOutSeconds! - selectedShot.trimInSeconds!
      : selectedShot.durationSeconds
    : null;

  return (
    <>
      {/* ── Sequence Viewer — dominant, on top ───────────────────── */}
      <SectionLabel label="Sequence Viewer" />
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

      {/* ── Selected Shot — lightweight read-only strip ──────────── */}
      {selectedShot && (
        <div className="mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap rounded border border-[#232629] bg-[#0d0e10] px-3 py-2">
          <span className="text-[9px] uppercase tracking-wider text-[#4b5158] shrink-0">
            Selected
          </span>
          <span className="text-[10px] font-mono text-[#6e767d] shrink-0">
            {selectedShot.shotCode ?? "—"}
          </span>
          <span className="text-xs text-[#a4abb2] truncate min-w-0 max-w-[240px]">
            {selectedShot.title}
          </span>
          {shotStatusBadge(selectedShot)}
          {selectedShot.durationSeconds !== null && (
            <span className="text-[10px] font-mono text-[#6e767d]">
              Target {selectedShot.durationSeconds.toFixed(1)}s
            </span>
          )}
          {selectedEffective !== null && (
            <span className="text-[10px] font-mono text-[#5b93d6]">
              Effective {selectedEffective.toFixed(1)}s
            </span>
          )}
          {selectedHasTrim && (
            <span className="text-[10px] font-mono text-[#5b93d6]">
              Trim {selectedShot.trimInSeconds!.toFixed(1)}s → {selectedShot.trimOutSeconds!.toFixed(1)}s
            </span>
          )}
          <Link
            href={`/projects/${projectId}/sequences/${sequenceId}/shots/${selectedShot.id}`}
            className="ml-auto shrink-0 text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Open Shot Detail →
          </Link>
        </div>
      )}

      {/* ── Editorial Timeline — central editing surface ─────────── */}
      <SectionLabel label="Editorial Timeline" />
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
    </>
  );
}
