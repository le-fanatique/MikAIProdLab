"use client";

// ---------------------------------------------------------------------------
// LookDevelopmentComparisonGrid.tsx — STYLE.1.G.UI.2
//
// Side-by-side comparison of 2 to 4 durable Look Development results. Reuses
// `getLookTestAction` (the exact CORE read model already used by the Open
// detail) for every compared Look Test — no second read path. Refetches
// whenever the selection or `refreshToken` changes, so a status/notes/Look
// Target change made elsewhere in the review workspace becomes visible here
// without a page reload. "latest request wins" per entry: a superseded fetch
// for the same Look Test id is discarded.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { GetLookTestResult } from "@/actions/lookDevelopment";
import { refImageUrl } from "@/lib/refImageUrl";
import { parseGenerationSnapshot } from "@/lib/comfy/generationSnapshot";

type Props = {
  lookTestIds: number[];
  onOpen: (lookTestId: number) => Promise<GetLookTestResult>;
  workflowNameById: Map<number, string>;
  refreshToken: number;
  onClear: () => void;
  onRemove: (lookTestId: number) => void;
};

type Entry = { loading: boolean; error: string | null; detail: GetLookTestResult | null };

// WF.DETACH.1 — mirrors `workflowLabel` in `LookDevelopmentRecentTests.tsx`:
// a live workflow resolves through the current catalog, a detached test
// falls back to the name stamped at deletion time.
function workflowLabel(workflowId: number | null, workflowName: string | null, workflowNameById: Map<number, string>): string {
  if (workflowId !== null) return workflowNameById.get(workflowId) ?? `#${workflowId}`;
  return workflowName ? `${workflowName} (deleted)` : "Unknown workflow";
}

export default function LookDevelopmentComparisonGrid({ lookTestIds, onOpen, workflowNameById, refreshToken, onClear, onRemove }: Props) {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const seqRef = useRef<Record<number, number>>({});

  useEffect(() => {
    for (const id of lookTestIds) {
      const seq = (seqRef.current[id] ?? 0) + 1;
      seqRef.current[id] = seq;
      Promise.resolve().then(() => {
        if (seqRef.current[id] !== seq) return;
        setEntries((prev) => ({ ...prev, [id]: { loading: true, error: null, detail: prev[id]?.detail ?? null } }));
      });
      onOpen(id)
        .then((result) => {
          if (seqRef.current[id] !== seq) return;
          setEntries((prev) => ({ ...prev, [id]: { loading: false, error: result.ok ? null : result.error, detail: result } }));
        })
        .catch(() => {
          if (seqRef.current[id] !== seq) return;
          setEntries((prev) => ({ ...prev, [id]: { loading: false, error: "Failed to load this Look Test.", detail: null } }));
        });
    }
    // Entries for ids no longer selected are simply not read below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookTestIds.join(","), refreshToken]);

  if (lookTestIds.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">Comparison ({lookTestIds.length}/4)</span>
        <button
          type="button"
          className="rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
          onClick={onClear}
        >
          Clear comparison
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {lookTestIds.map((id) => {
          const entry = entries[id];
          return (
            <div key={id} className="rounded border border-[#2c3035] p-2 flex flex-col gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#6e767d]">Look Test #{id}</span>
                <button type="button" className="text-[10px] text-[#6e767d] hover:text-[#cf7b6b]" onClick={() => onRemove(id)}>
                  Remove
                </button>
              </div>
              {!entry || entry.loading ? (
                <p className="text-xs text-[#6e767d]">Loading…</p>
              ) : entry.error || !entry.detail?.ok ? (
                <p className="text-xs text-[#cf7b6b]">{entry.error ?? "Failed to load."}</p>
              ) : (
                (() => {
                  const detail = entry.detail;
                  if (!detail.ok) return null;
                  const { test, references, result, job } = detail;
                  // Retake Round 2 — `parseGenerationSnapshot` only validates the
                  // top-level JSON shape; `promptText` itself must be checked here
                  // before rendering, otherwise a corrupt/legacy snapshot with an
                  // object-valued `promptText` would be passed straight to React
                  // as a child and crash instead of showing a local diagnostic.
                  const rawPromptText: unknown = job?.payloadSnapshot ? parseGenerationSnapshot(job.payloadSnapshot)?.promptText : undefined;
                  const exactPrompt = typeof rawPromptText === "string" ? rawPromptText : null;
                  return (
                    <div className="flex flex-col gap-1.5 text-xs text-[#a4abb2] min-w-0">
                      {result ? (
                        result.filePath.match(/\.(mp4|webm|mov)$/i) ? (
                          <video src={refImageUrl(result.filePath)} controls className="max-w-full rounded border border-[#2c3035]" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={refImageUrl(result.filePath)} alt="Look Result" className="max-w-full rounded border border-[#2c3035]" />
                        )
                      ) : (
                        <p className="text-[#6e767d]">No durable result saved</p>
                      )}
                      <p className="truncate">
                        <span className="text-[#6e767d]">Subject:</span> {test.subject}
                      </p>
                      <p className="truncate">
                        <span className="text-[#6e767d]">Action:</span> {test.action}
                      </p>
                      <p className="truncate">
                        <span className="text-[#6e767d]">Style:</span> {test.styleSourceKind}
                        {test.styleDraftRevision !== null ? ` (rev ${test.styleDraftRevision})` : ""}
                        {test.styleVersionId !== null ? ` (v#${test.styleVersionId})` : ""}
                      </p>
                      <p className="truncate">
                        <span className="text-[#6e767d]">Workflow:</span> {workflowLabel(test.workflowId, test.workflowName, workflowNameById)}
                      </p>
                      {references.length > 0 && (
                        <p className="truncate">
                          <span className="text-[#6e767d]">References:</span> {references.map((r) => `#${r.referenceImageId}`).join(", ")}
                        </p>
                      )}
                      <details>
                        <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-[#6e767d]">Prompt</summary>
                        <pre className="text-[10px] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2 mt-1 max-h-32 overflow-auto">
                          {exactPrompt ?? (job ? "(prompt snapshot could not be parsed)" : "(no prompt snapshot recorded for this job)")}
                        </pre>
                      </details>
                      {result && (
                        <p>
                          <span className="text-[#6e767d]">Status:</span> {result.status}
                          {result.notes ? ` — ${result.notes}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
