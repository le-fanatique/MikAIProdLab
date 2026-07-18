"use client";

// ---------------------------------------------------------------------------
// ShotVideoCandidatesPanel.tsx — SEQGEN.PUSH.1 (Lot D)
//
// Compact, versioned (newest first) list of a Shot's Sequence Video
// Candidates, with ONE `VideoFrameReviewPlayer` preview for whichever
// candidate is currently selected — never one heavy player per row. Approve/
// Delete are always explicit per-row actions; there is no "Approve All" in
// this ticket.
//
// Selection is a proper `radiogroup`/`radio` pattern (exactly one candidate
// is ever "selected" for preview, exactly like a radio button group) with
// roving `tabIndex` and Arrow/Home/End/Enter/Space keyboard support.
//
// REVISE (round 3) — the `role="radio"` element must never contain any
// other focusable descendant: nesting the "Split Run #N" `Link` and the
// Approve/Delete `<form>` buttons inside it was both an ARIA-validity
// violation AND a real bug — a keydown on those nested controls (Enter to
// submit, Enter to follow the link) bubbles up through the DOM tree and
// also fires the row's own `onKeyDown` (which calls `preventDefault`),
// letting the radio's own keyboard handling intercept/interfere with the
// nested controls' native keyboard activation. Fixed by making the radio
// element and the Link/Approve/Delete controls SIBLINGS — the radio only
// ever wraps plain, non-interactive text — so a keydown on any nested
// control never reaches the row's handler at all.
// ---------------------------------------------------------------------------

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import VideoFrameReviewPlayer from "@/components/VideoFrameReviewPlayer";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { approveShotVideoCandidate, deleteShotVideoCandidate } from "@/actions/sequenceVideoPush";

export type ShotVideoCandidateRow = {
  id: number;
  clipUrl: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  /** Preformatted on the server with an explicit, fixed time zone — never computed client-side, so SSR and hydration always render byte-identical text regardless of the server's/browser's local time zone. */
  createdAtLabel: string;
  splitRunId: number;
  splitSegmentOrderIndex: number | null;
  splitWorkspaceHref: string | null;
  isApproved: boolean;
};

export default function ShotVideoCandidatesPanel({
  candidates,
  shotId,
  sequenceId,
  projectId,
  returnTo,
}: {
  candidates: ShotVideoCandidateRow[];
  shotId: number;
  sequenceId: number;
  projectId: number;
  returnTo: string;
}) {
  const [selectedId, setSelectedId] = useState<number>(candidates[0]?.id ?? -1);
  const selected = candidates.find((c) => c.id === selectedId) ?? candidates[0];
  const radioRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  if (candidates.length === 0) return null;

  function focusAndSelect(id: number) {
    setSelectedId(id);
    radioRefs.current.get(id)?.focus();
  }

  function onRadioKeyDown(e: KeyboardEvent<HTMLDivElement>, index: number) {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        focusAndSelect(candidates[index].id);
        return;
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(candidates[(index + 1) % candidates.length].id);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(candidates[(index - 1 + candidates.length) % candidates.length].id);
        return;
      case "Home":
        e.preventDefault();
        focusAndSelect(candidates[0].id);
        return;
      case "End":
        e.preventDefault();
        focusAndSelect(candidates[candidates.length - 1].id);
        return;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {selected && (
        <VideoFrameReviewPlayer src={selected.clipUrl} projectId={projectId} sequenceId={sequenceId} shotId={shotId} defaultFps={24} captureDestinations={[]} />
      )}

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Sequence Video Candidates">
        {candidates.map((c, index) => {
          const isSelected = c.id === selected?.id;
          return (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs transition-colors ${
                isSelected ? "border-[#5b93d6]/60 bg-[#5b93d6]/10" : "border-[#232629] bg-[#141618] hover:border-[#3a4046]"
              }`}
            >
              {/* Radio: selects the preview candidate. Wraps ONLY plain, non-interactive text — never a Link or a form control — so nothing inside it can steal/be stolen from its own keydown handling. */}
              <div
                ref={(el) => {
                  if (el) radioRefs.current.set(c.id, el);
                  else radioRefs.current.delete(c.id);
                }}
                role="radio"
                aria-checked={isSelected}
                aria-label={`Candidate ${c.sourceStartSeconds.toFixed(3)}s–${c.sourceEndSeconds.toFixed(3)}s`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedId(c.id)}
                onKeyDown={(e) => onRadioKeyDown(e, index)}
                className="min-w-0 flex-1 cursor-pointer text-[#a4abb2] rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5b93d6]"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#e7e9ec]">
                    {c.sourceStartSeconds.toFixed(3)}s–{c.sourceEndSeconds.toFixed(3)}s
                  </span>
                  <span className="text-[#6e767d]">({(c.sourceEndSeconds - c.sourceStartSeconds).toFixed(3)}s)</span>
                  {c.isApproved && (
                    <span className="text-[9px] uppercase tracking-wider border rounded px-1.5 py-px text-[#6b9e72] border-[#2a3d2e]">Approved</span>
                  )}
                </div>
                <div className="text-[10px] text-[#6e767d] mt-0.5">
                  Split Run #{c.splitRunId}
                  {c.splitSegmentOrderIndex !== null && <> · Segment #{c.splitSegmentOrderIndex + 1}</>} · {c.createdAtLabel}
                </div>
              </div>

              {/* Siblings of the radio, not descendants — each is its own independent, natively-keyboard-operable control (Tab reaches them in order; the radio's Arrow/Enter/Space handling never runs for them). */}
              <div className="flex items-center gap-3 shrink-0">
                {c.splitWorkspaceHref && (
                  <Link href={c.splitWorkspaceHref} className="text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors">
                    Open Run →
                  </Link>
                )}
                {!c.isApproved && (
                  <form action={approveShotVideoCandidate}>
                    <input type="hidden" name="candidateId" value={c.id} />
                    <input type="hidden" name="shotId" value={shotId} />
                    <input type="hidden" name="sequenceId" value={sequenceId} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <ConfirmSubmitButton
                      confirmMessage="Approve this candidate as the Shot's output? This will replace the current Approved Output pointer and mark dependent Sequence/Film Results outdated."
                      className="text-[#6b9e72] hover:text-[#8fc491] transition-colors"
                    >
                      Approve as Shot Output
                    </ConfirmSubmitButton>
                  </form>
                )}
                {!c.isApproved && (
                  <form action={deleteShotVideoCandidate}>
                    <input type="hidden" name="candidateId" value={c.id} />
                    <input type="hidden" name="shotId" value={shotId} />
                    <input type="hidden" name="sequenceId" value={sequenceId} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <ConfirmSubmitButton confirmMessage="Delete this candidate? This cannot be undone." className="text-[#cf7b6b]/70 hover:text-[#cf7b6b] transition-colors">
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
