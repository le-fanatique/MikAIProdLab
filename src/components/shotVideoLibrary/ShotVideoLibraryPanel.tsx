"use client";

// ---------------------------------------------------------------------------
// ShotVideoLibraryPanel.tsx — SHOT.VIDEO.LIBRARY.1 (Lot B)
//
// Unified "Shot Videos" section: one `VideoFrameReviewPlayer` for the
// selected entry, a compact newest-first list covering BOTH sources
// (Generation Content saves and Split-pushed clips), explicit per-row
// Approve/Delete, and an explicit multi-select checkbox column feeding
// "Open Selected in OpenReel" (Lot D). Radiogroup/radio selection pattern,
// roving tabIndex, and the "radio wraps only plain text, every action is a
// SIBLING control" discipline are all reused verbatim from
// `ShotVideoCandidatesPanel.tsx` (SEQGEN.PUSH.1) — the exact same
// keyboard-interception bug it already fixed would otherwise reappear here.
// ---------------------------------------------------------------------------

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import VideoFrameReviewPlayer from "@/components/VideoFrameReviewPlayer";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { approveShotVideo, deleteShotVideo } from "@/actions/shotVideoLibrary";

export type ShotVideoLibraryRow = {
  id: number;
  videoUrl: string;
  source: "generation" | "sequence_split";
  durationSeconds: number | null;
  /** Preformatted server-side with an explicit, fixed time zone — never computed client-side (SSR/hydration parity). */
  createdAtLabel: string;
  isApproved: boolean;
  splitRunId: number | null;
  splitSegmentOrderIndex: number | null;
  splitWorkspaceHref: string | null;
};

function provenanceLabel(row: ShotVideoLibraryRow): string {
  if (row.source === "sequence_split") {
    return `Split Run #${row.splitRunId}${row.splitSegmentOrderIndex !== null ? ` · Segment #${row.splitSegmentOrderIndex + 1}` : ""}`;
  }
  return "Generation Content";
}

export default function ShotVideoLibraryPanel({
  entries,
  shotId,
  sequenceId,
  projectId,
  returnTo,
  openReelExportHref,
}: {
  entries: ShotVideoLibraryRow[];
  shotId: number;
  sequenceId: number;
  projectId: number;
  returnTo: string;
  /**
   * GET route that redirects to the OpenReel sidecar with this Shot's
   * export loaded (Lot D) — a native GET form (not a Server Action) so
   * `target="_blank"` opens a real new tab via a plain HTTP redirect,
   * exactly mirroring "Open in Advanced Editor"'s own plain-link mechanism.
   * Omitted entirely (no form rendered) if the export route isn't wired.
   */
  openReelExportHref?: string;
}) {
  const [selectedId, setSelectedId] = useState<number>(entries[0]?.id ?? -1);
  const selected = entries.find((e) => e.id === selectedId) ?? entries[0];
  const radioRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Ordered by SELECTION order (array push order), never row order — Lot D
  // requires the export to preserve the order the user picked videos in.
  const [checkedIds, setCheckedIds] = useState<number[]>([]);

  if (entries.length === 0) return null;

  function focusAndSelect(id: number) {
    setSelectedId(id);
    radioRefs.current.get(id)?.focus();
  }

  function onRadioKeyDown(e: KeyboardEvent<HTMLDivElement>, index: number) {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        focusAndSelect(entries[index].id);
        return;
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(entries[(index + 1) % entries.length].id);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(entries[(index - 1 + entries.length) % entries.length].id);
        return;
      case "Home":
        e.preventDefault();
        focusAndSelect(entries[0].id);
        return;
      case "End":
        e.preventDefault();
        focusAndSelect(entries[entries.length - 1].id);
        return;
    }
  }

  function toggleChecked(id: number) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="flex flex-col gap-3">
      {selected && (
        <VideoFrameReviewPlayer src={selected.videoUrl} projectId={projectId} sequenceId={sequenceId} shotId={shotId} defaultFps={24} captureDestinations={[]} />
      )}

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Shot Videos">
        {entries.map((row, index) => {
          const isSelected = row.id === selected?.id;
          const isChecked = checkedIds.includes(row.id);
          return (
            <div
              key={row.id}
              className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs transition-colors ${
                isSelected ? "border-[#5b93d6]/60 bg-[#5b93d6]/10" : "border-[#232629] bg-[#141618] hover:border-[#3a4046]"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleChecked(row.id)}
                  aria-label={`Select ${provenanceLabel(row)} for OpenReel export`}
                  className="shrink-0 accent-[#5b93d6]"
                />
                {/* Radio: selects the preview entry. Wraps ONLY plain, non-interactive text — never a Link or a form control — so nothing inside it can steal/be stolen from its own keydown handling (see ShotVideoCandidatesPanel's own header comment for the exact bug this avoids). */}
                <div
                  ref={(el) => {
                    if (el) radioRefs.current.set(row.id, el);
                    else radioRefs.current.delete(row.id);
                  }}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={provenanceLabel(row)}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setSelectedId(row.id)}
                  onKeyDown={(e) => onRadioKeyDown(e, index)}
                  className="min-w-0 flex-1 cursor-pointer text-[#a4abb2] rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5b93d6]"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[#e7e9ec]">{provenanceLabel(row)}</span>
                    {row.durationSeconds !== null && <span className="text-[#6e767d]">({row.durationSeconds.toFixed(3)}s)</span>}
                    {row.isApproved && (
                      <span className="text-[9px] uppercase tracking-wider border rounded px-1.5 py-px text-[#6b9e72] border-[#2a3d2e]">Approved</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#6e767d] mt-0.5">{row.createdAtLabel}</div>
                </div>
              </div>

              {/* Siblings of the radio, not descendants. */}
              <div className="flex items-center gap-3 shrink-0">
                {row.splitWorkspaceHref && (
                  <Link href={row.splitWorkspaceHref} className="text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors">
                    Open Run →
                  </Link>
                )}
                {!row.isApproved && (
                  <form action={approveShotVideo}>
                    <input type="hidden" name="shotVideoId" value={row.id} />
                    <input type="hidden" name="shotId" value={shotId} />
                    <input type="hidden" name="sequenceId" value={sequenceId} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <ConfirmSubmitButton
                      confirmMessage="Approve this video as the Shot's output? This will replace the current Approved Output pointer and mark dependent Sequence/Film Results outdated."
                      className="text-[#6b9e72] hover:text-[#8fc491] transition-colors"
                    >
                      Approve as Shot Output
                    </ConfirmSubmitButton>
                  </form>
                )}
                {!row.isApproved && (
                  <form action={deleteShotVideo}>
                    <input type="hidden" name="shotVideoId" value={row.id} />
                    <input type="hidden" name="shotId" value={shotId} />
                    <input type="hidden" name="sequenceId" value={sequenceId} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <ConfirmSubmitButton confirmMessage="Delete this video? This cannot be undone." className="text-[#cf7b6b]/70 hover:text-[#cf7b6b] transition-colors">
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openReelExportHref && (
        <form method="GET" action={openReelExportHref} target="_blank" className="flex items-center gap-3 pt-1">
          <input type="hidden" name="ids" value={checkedIds.join(",")} />
          <button
            type="submit"
            disabled={checkedIds.length === 0}
            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            Open Selected in OpenReel {checkedIds.length > 0 ? `(${checkedIds.length})` : ""}
          </button>
          <span className="text-[10px] text-[#6e767d]">Shot-local, read-only — opening does not modify this Shot.</span>
        </form>
      )}
    </div>
  );
}
