"use client";

// ---------------------------------------------------------------------------
// LookDevelopmentRecentTests.tsx — STYLE.1.G.UI.1
//
// Read-only list of this Project's Look Tests. "Open" loads one test's full
// detail (via getLookTestAction) and displays it inline for inspection only —
// no notes, status, Look Target, duplicate, edit/rerun or delete controls
// here; those belong to STYLE.1.G.UI.2.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import type { LookTestListItem, GetLookTestResult } from "@/actions/lookDevelopment";
import { refImageUrl } from "@/lib/refImageUrl";

type Props = {
  tests: LookTestListItem[];
  onOpen: (lookTestId: number) => Promise<GetLookTestResult>;
  workflowNameById: Map<number, string>;
};

const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function jobStateLabel(job: LookTestListItem["job"]): string {
  if (!job) return "no job";
  return job.status;
}

function resultStateLabel(result: LookTestListItem["result"]): string {
  if (!result) return "not saved";
  return result.status;
}

export default function LookDevelopmentRecentTests({ tests, onOpen, workflowNameById }: Props) {
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GetLookTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // Codex retake round 1 (P1, "Concurrent Recent-Test opens can display the
  // wrong test under a row") — a monotonically increasing request id. If
  // Open A is followed by Open B before A resolves, A's eventual response is
  // discarded by the `seq !== requestSeqRef.current` guards below: only the
  // response matching the MOST RECENT Open request is ever applied to state,
  // regardless of resolution order.
  const requestSeqRef = useRef(0);

  const handleOpen = async (lookTestId: number) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setOpenError(null);
    setOpenedId(lookTestId);
    setDetail(null);
    try {
      const result = await onOpen(lookTestId);
      if (seq !== requestSeqRef.current) return; // superseded by a later Open — discard
      if (!result.ok) {
        setOpenError(result.error);
        setDetail(null);
        return;
      }
      setDetail(result);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setOpenError("Failed to load this Look Test. Check your connection and try again.");
      setDetail(null);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  };

  const handleClose = (lookTestId: number) => {
    // Closing the currently-open row also retires its request id, so a
    // late-arriving response for it can never reopen/repopulate the row.
    if (openedId === lookTestId) {
      requestSeqRef.current += 1;
      setOpenedId(null);
      setDetail(null);
      setOpenError(null);
      setLoading(false);
    }
  };

  if (tests.length === 0) {
    return <p className="text-xs text-[#6e767d]">No Look Tests yet — generate one above.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {tests.map((t) => (
        <div key={t.id} className="rounded border border-[#2c3035] p-2 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-[#a4abb2] truncate">
                {t.source} · {t.mode} · {t.subject}
              </span>
              <span className="text-[10px] text-[#6e767d]">
                {t.createdAt} · workflow: {workflowNameById.get(t.workflowId) ?? `#${t.workflowId}`} · job: {jobStateLabel(t.job)} · result: {resultStateLabel(t.result)}
              </span>
            </div>
            <button type="button" className={smallButtonClass} onClick={() => handleOpen(t.id)}>
              Open
            </button>
          </div>

          {openedId === t.id && (
            <div className="border-t border-[#232629] pt-2 mt-1 flex flex-col gap-2">
              {loading && <p className="text-xs text-[#6e767d]">Loading…</p>}
              {!loading && openError && <p className="text-xs text-[#cf7b6b]">{openError}</p>}
              {!loading && !openError && detail?.ok && (
                <div className="flex flex-col gap-2 text-xs text-[#a4abb2]">
                  <p>
                    <span className="text-[#6e767d]">Workflow:</span> {workflowNameById.get(detail.test.workflowId) ?? `#${detail.test.workflowId}`}
                  </p>
                  <p>
                    <span className="text-[#6e767d]">Action:</span> {detail.test.action}
                  </p>
                  <p>
                    <span className="text-[#6e767d]">Style source:</span> {detail.test.styleSourceKind}
                    {detail.test.styleDraftRevision !== null ? ` (revision ${detail.test.styleDraftRevision})` : ""}
                    {detail.test.styleVersionId !== null ? ` (version #${detail.test.styleVersionId})` : ""}
                  </p>
                  <details>
                    <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-[#6e767d]">Compiled Style text</summary>
                    <pre className="text-[10px] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2 mt-1">
                      {detail.test.styleCompiledText || "(empty)"}
                    </pre>
                  </details>
                  {detail.references.length > 0 && (
                    <p>
                      <span className="text-[#6e767d]">References:</span>{" "}
                      {detail.references.map((r) => `#${r.referenceImageId}`).join(", ")}
                    </p>
                  )}
                  {detail.job && (
                    <p>
                      <span className="text-[#6e767d]">Job:</span> #{detail.job.id} — {detail.job.status}
                    </p>
                  )}
                  {detail.result ? (
                    detail.result.filePath.match(/\.(mp4|webm|mov)$/i) ? (
                      <video src={refImageUrl(detail.result.filePath)} controls className="max-w-full rounded border border-[#2c3035]" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={refImageUrl(detail.result.filePath)} alt="Look Result" className="max-w-full rounded border border-[#2c3035]" />
                    )
                  ) : (
                    <p className="text-[#6e767d]">No durable result saved yet for this test.</p>
                  )}
                  <button type="button" className={smallButtonClass} onClick={() => handleClose(t.id)}>
                    Close
                  </button>
                </div>
              )}
              {!loading && openError && (
                <button type="button" className={smallButtonClass} onClick={() => handleClose(t.id)}>
                  Close
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
