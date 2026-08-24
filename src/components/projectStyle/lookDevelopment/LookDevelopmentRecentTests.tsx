"use client";

// ---------------------------------------------------------------------------
// LookDevelopmentRecentTests.tsx — STYLE.1.G.UI.1 / STYLE.1.G.UI.2
//
// Review workspace over this Project's Look Tests: open one test's full
// detail (media, source/mode/subject/action, workflow, Style, exact prompt,
// references, job/result state), review it (notes, Candidate/Reject/Look
// Target, Delete Result), select it for comparison, and duplicate it for an
// edit-and-rerun cycle. Only one detail is open at a time; opening another
// row closes the previous one. A pre-run definition (a duplicate, or an
// existing Look Test that was never run) is rendered with
// `LookDevelopmentPrerunEditor` instead of read-only detail.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from "react";
import type { LookTestListItem, GetLookTestResult } from "@/actions/lookDevelopment";
import { duplicateLookTestAction } from "@/actions/lookDevelopment";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import type { LookResultStatus, LookStyleSourceRequest } from "@/lib/lookDevelopment/contracts";
import { parseGenerationSnapshot, type GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { refImageUrl } from "@/lib/refImageUrl";
import LookDevelopmentReviewControls from "./LookDevelopmentReviewControls";
import LookDevelopmentPrerunEditor from "./LookDevelopmentPrerunEditor";
import StyleFeedbackPanel from "./StyleFeedbackPanel";

type WorkflowRow = { id: number; name: string; kind: "image" | "video"; workflowJson: string };
type StyleSourceOption = { key: string; label: string; request: LookStyleSourceRequest; compiledText: string };

type Props = {
  projectId: number;
  tests: LookTestListItem[];
  onOpen: (lookTestId: number) => Promise<GetLookTestResult>;
  workflowNameById: Map<number, string>;
  workflows: WorkflowRow[];
  allReferences: ProjectStyleReferenceView[];
  styleOptions: StyleSourceOption[];
  comparisonIds: number[];
  onToggleComparison: (lookTestId: number) => void;
  onNotesSaved: (resultId: number, notes: string | null) => void;
  onStatusChanged: (resultId: number, status: "candidate" | "rejected" | "look-target") => void;
  onDeleted: (resultId: number) => void;
  /** Refreshes `tests` (list `listLookTestsAction`) and reports whether that read itself succeeded — never re-invokes duplication. */
  onDuplicated: (lookTestId: number) => Promise<boolean>;
  onQueued: (lookTestId: number, jobId: number) => void;
  onPublished: (lookTestId: number, resultId: number, filePath: string, generationJobId: number) => void;
  /** `style.adjustFromLookResult`'s `commitAdvisory`, resolved server-side by
   * the Look Development page and descended as a prop — this component
   * never imports a descriptor itself (STYLE.LLM.LOOKFEEDBACK.UI.1). */
  styleFeedbackCommitAdvisory?: string;
};

const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const toggleButtonClass =
  "rounded border px-2 py-1 text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function jobStateLabel(job: LookTestListItem["job"]): string {
  if (!job) return "no job";
  return job.status;
}

function resultStateLabel(result: LookTestListItem["result"]): string {
  if (!result) return "not saved";
  return result.status;
}

// WF.DETACH.1 — a live workflow resolves through the current catalog
// (`workflowNameById`, only active/known workflows); a detached test
// (`workflowId === null`) falls back to the name stamped at deletion time
// (`workflowName`), suffixed so it reads as history, never as a current
// selectable workflow. Neither present is the "before this ticket" legacy
// case — there are no such rows today, but the code must not crash on one.
function workflowLabel(workflowId: number | null, workflowName: string | null, workflowNameById: Map<number, string>): string {
  if (workflowId !== null) return workflowNameById.get(workflowId) ?? `#${workflowId}`;
  return workflowName ? `${workflowName} (deleted)` : "Unknown workflow";
}

export default function LookDevelopmentRecentTests({
  projectId,
  tests,
  onOpen,
  workflowNameById,
  workflows,
  allReferences,
  styleOptions,
  comparisonIds,
  onToggleComparison,
  onNotesSaved,
  onStatusChanged,
  onDeleted,
  onDuplicated,
  onQueued,
  onPublished,
  styleFeedbackCommitAdvisory,
}: Props) {
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GetLookTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [restoreContext, setRestoreContext] = useState<{ forDuplicateId: number; sourceLookTestId: number; snapshot: GenerationSnapshot | null } | null>(null);
  // A duplicate whose creation is a KNOWN success but whose `listLookTestsAction`
  // refresh failed — the id must stay visible and retryable, never silently
  // dropped because its row doesn't exist yet in `tests`. Cleared once
  // `tests` actually contains it (a successful sync).
  const [pendingDuplicateId, setPendingDuplicateId] = useState<number | null>(null);
  const [syncingDuplicate, setSyncingDuplicate] = useState(false);
  // Codex Round 2 (P1, "Queueing immediately unmounts the rerun polling/
  // publication UI") — `isPrerun` (derived from `t.job === null`) flips to
  // false the instant `onQueued` patches `tests[]`, which would otherwise
  // remove `LookDevelopmentPrerunEditor` from the tree mid-flight. Tracking
  // "this Look Test has an active, not-yet-published rerun" keeps it
  // mounted (queued -> running -> done -> published) even after its `job`
  // becomes non-null.
  //
  // Codex Round 3 (P1, "queuedJobId stays local to the child, lost on
  // remount") — the job id itself is lifted up to this parent, the ONE
  // orchestration level that survives a Close -> open-a-different-row ->
  // reopen cycle (the child editor itself fully unmounts/remounts across
  // that sequence, and would otherwise forget it ever queued anything).
  //
  // Codex Round 4 (P1, "a single global slot loses a first rerun when a
  // second one is queued") — this is a CONTROLLED REGISTRY
  // `lookTestId -> jobId`, not a single `{ id, jobId }` pair: submitting a
  // rerun for Look Test B while Look Test A's rerun is still active must
  // add B's entry alongside A's, never overwrite it. Every read/write below
  // is keyed by the SAME lookTestId the caller passed, so two concurrent
  // active reruns never interfere with each other. Still only one
  // `LookDevelopmentPrerunEditor` is ever mounted at a time (it lives inside
  // `renderOpenedBody`, itself only invoked for the single currently-opened
  // row) — the registry only needs to answer "does THIS row have a
  // known-active job, and which one" for whichever row happens to be open.
  //
  // An entry is added only by `handleQueuedLocal` and removed only by
  // `handlePublishedLocal`, and ONLY the exact `lookTestId`/`jobId` pair
  // just published — never on Close, never inferred from an arbitrary
  // historical Look Test that merely has `job != null` (a deliberately
  // deleted result must never be treated as "resume and republish"). There
  // is no "cancel an already-submitted job" concept in this system, so no
  // other code path may remove an entry.
  const [activeReruns, setActiveReruns] = useState<Record<number, number>>({});

  // Codex retake round 1 (P1, "Concurrent Recent-Test opens can display the
  // wrong test under a row") — a monotonically increasing request id: only
  // the response matching the MOST RECENT Open/refetch request is ever
  // applied.
  const requestSeqRef = useRef(0);
  const duplicateLockRef = useRef(false);

  const handleOpen = async (lookTestId: number) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setOpenError(null);
    setOpenedId(lookTestId);
    setDetail(null);
    setDuplicateError(null);
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
    if (openedId === lookTestId) {
      requestSeqRef.current += 1;
      setOpenedId(null);
      setDetail(null);
      setOpenError(null);
      setLoading(false);
      // Codex Round 3 — Close must NOT forget an already-submitted rerun
      // job: `activeReruns` (the registry) is deliberately left untouched
      // here, so reopening this same row later still resumes the same
      // poller/publisher instead of re-showing the pre-run configuration
      // form (which would only hit a CORE refusal, since the Look Test
      // already has a job).
    }
  };

  // Wrapped mutation callbacks — patch the OPENED detail immediately with
  // the known-good value from a successful CORE call, before any confirming
  // re-read. `tests[]` reconciliation still happens via the raw callback
  // passed down from `LookDevelopmentBench`; this only keeps the currently
  // opened row's own view (status label, aria-pressed, media) from ever
  // showing a stale value while a read-only `Retry sync` is pending.
  const handleStatusChangedLocal = useCallback(
    (resultId: number, status: LookResultStatus) => {
      setDetail((prev) => (prev && prev.ok && prev.result?.id === resultId ? { ...prev, result: { ...prev.result, status } } : prev));
      onStatusChanged(resultId, status);
    },
    [onStatusChanged]
  );

  const handleNotesSavedLocal = useCallback(
    (resultId: number, notes: string | null) => {
      setDetail((prev) => (prev && prev.ok && prev.result?.id === resultId ? { ...prev, result: { ...prev.result, notes } } : prev));
      onNotesSaved(resultId, notes);
    },
    [onNotesSaved]
  );

  const handleQueuedLocal = useCallback(
    (lookTestId: number, jobId: number) => {
      // Adds/replaces ONLY this Look Test's own entry — every other Look
      // Test's active rerun (if any) is carried over untouched.
      setActiveReruns((prev) => ({ ...prev, [lookTestId]: jobId }));
      onQueued(lookTestId, jobId);
    },
    [onQueued]
  );

  // A known publish success patches the opened detail's `result` with a
  // fully-shaped row (every field the CORE contract guarantees for a fresh
  // publish: `status: "candidate"`, no notes yet) — never left `null`, which
  // would otherwise contradict the pre-run editor's own "Look Result saved"
  // message with a "No durable result saved" line right next to it. Once
  // patched, ONLY this exact `lookTestId`/`generationJobId` entry is removed
  // from the registry — any OTHER Look Test's still-active rerun is left
  // untouched — so the row falls through to the normal `detail.result`
  // branch (media + full review controls) exactly like any other reviewed
  // result, no second, redundant media renderer.
  const handlePublishedLocal = useCallback(
    (lookTestId: number, resultId: number, filePath: string, generationJobId: number) => {
      setDetail((prev) => {
        if (!prev || !prev.ok || prev.test.id !== lookTestId) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          result: {
            id: resultId,
            lookTestId,
            projectId,
            generationJobId,
            kind: prev.test.mode,
            filePath,
            notes: null,
            status: "candidate",
            createdAt: now,
            updatedAt: now,
          },
        };
      });
      setActiveReruns((prev) => {
        if (prev[lookTestId] !== generationJobId) return prev; // not the entry we think it is — leave the registry untouched
        const next = { ...prev };
        delete next[lookTestId];
        return next;
      });
      onPublished(lookTestId, resultId, filePath, generationJobId);
    },
    [onPublished, projectId]
  );

  // Confirms/refreshes the currently-opened detail from a real read, WITHOUT
  // clearing `detail` first (unlike `handleOpen`, this must never flash an
  // empty/loading state for an already-successful mutation). Used by
  // `LookDevelopmentReviewControls` after each known CORE success, to decide
  // between a clean reconciliation and `committed, pending sync`. Shares the
  // same monotonic sequence guard as `handleOpen` so a stale refetch can
  // never clobber a newer Open's result.
  const refetchDetail = useCallback(
    async (lookTestId: number): Promise<boolean> => {
      const seq = ++requestSeqRef.current;
      try {
        const result = await onOpen(lookTestId);
        if (seq !== requestSeqRef.current) return true; // superseded — not this call's concern
        if (!result.ok) return false;
        setDetail(result);
        return true;
      } catch {
        if (seq !== requestSeqRef.current) return true;
        return false;
      }
    },
    [onOpen]
  );

  const handleDuplicate = async (lookTestId: number) => {
    // Codex retake round 1 (P1) — a SYNCHRONOUS ref lock acquired before the
    // first `await`, so two activations in the same tick (a double click
    // before React re-renders `duplicating`) can only ever result in one
    // real call to `duplicateLookTestAction`.
    if (duplicateLockRef.current) return;
    duplicateLockRef.current = true;
    setDuplicating(true);
    setDuplicateError(null);
    // Capture the source test's own prior generation snapshot (if its detail
    // is currently loaded) BEFORE duplicating, so the pre-run editor can
    // offer an exact "Restore prior settings" once the duplicate opens.
    const sourceSnapshot = detail?.ok && detail.test.id === lookTestId ? parseGenerationSnapshot(detail.job?.payloadSnapshot ?? null) : null;
    try {
      const result = await duplicateLookTestAction(projectId, lookTestId);
      if (!result.ok) {
        setDuplicateError(result.error);
        return;
      }
      // Known success from here on — the created id is never lost, even if
      // the list refresh below fails.
      setPendingDuplicateId(result.lookTestId);
      setRestoreContext({ forDuplicateId: result.lookTestId, sourceLookTestId: lookTestId, snapshot: sourceSnapshot });
      await handleOpen(result.lookTestId);
      const synced = await onDuplicated(result.lookTestId);
      if (synced) setPendingDuplicateId(null);
    } catch {
      setDuplicateError("Failed to duplicate this Look Test. Check your connection and try again.");
    } finally {
      duplicateLockRef.current = false;
      setDuplicating(false);
    }
  };

  const handleRetryDuplicateSync = async () => {
    if (pendingDuplicateId === null || syncingDuplicate) return;
    setSyncingDuplicate(true);
    try {
      const synced = await onDuplicated(pendingDuplicateId);
      if (synced) setPendingDuplicateId(null);
    } finally {
      setSyncingDuplicate(false);
    }
  };

  const renderOpenedBody = (lookTestId: number, isPrerun: boolean) => (
    <div className="border-t border-[#232629] pt-2 mt-1 flex flex-col gap-2">
      {loading && <p className="text-xs text-[#6e767d]">Loading…</p>}
      {!loading && openError && <p className="text-xs text-[#cf7b6b]">{openError}</p>}
      {duplicateError && <p className="text-[10px] text-[#cf7b6b]">{duplicateError}</p>}

      {!loading && !openError && detail?.ok && (
        <div className="flex flex-col gap-2 text-xs text-[#a4abb2]">
          <p>
            <span className="text-[#6e767d]">Workflow:</span> {workflowLabel(detail.test.workflowId, detail.test.workflowName, workflowNameById)}
          </p>
          <p>
            <span className="text-[#6e767d]">Subject:</span> {detail.test.subject}
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
            <pre className="text-[10px] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2 mt-1">{detail.test.styleCompiledText || "(empty)"}</pre>
          </details>
          {detail.job?.payloadSnapshot && (
            <details>
              <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-[#6e767d]">Exact prompt sent</summary>
              <pre className="text-[10px] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2 mt-1">
                {(() => {
                  // Retake Round 2 — `promptText` must be validated as a string
                  // before rendering; a corrupt/legacy snapshot with an
                  // object-valued `promptText` must show a local diagnostic,
                  // never be passed to React as a child.
                  const rawPromptText: unknown = parseGenerationSnapshot(detail.job?.payloadSnapshot ?? null)?.promptText;
                  return typeof rawPromptText === "string" ? rawPromptText : "(snapshot could not be parsed)";
                })()}
              </pre>
            </details>
          )}
          {detail.references.length > 0 && (
            <p>
              <span className="text-[#6e767d]">References (ordered):</span> {detail.references.map((r) => `#${r.referenceImageId}`).join(", ")}
            </p>
          )}
          {detail.job && (
            <p>
              <span className="text-[#6e767d]">Job:</span> #{detail.job.id} — {detail.job.status}
            </p>
          )}
          {detail.result ? (
            <>
              {detail.result.filePath.match(/\.(mp4|webm|mov)$/i) ? (
                <video src={refImageUrl(detail.result.filePath)} controls className="max-w-full rounded border border-[#2c3035]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={refImageUrl(detail.result.filePath)} alt="Look Result" className="max-w-full rounded border border-[#2c3035]" />
              )}
              <LookDevelopmentReviewControls
                projectId={projectId}
                result={{ id: detail.result.id, status: detail.result.status, notes: detail.result.notes }}
                onNotesSaved={handleNotesSavedLocal}
                onStatusChanged={handleStatusChangedLocal}
                onDeleted={(resultId) => {
                  onDeleted(resultId);
                  setDetail((prev) => (prev && prev.ok ? { ...prev, result: null } : prev));
                }}
                onRefetchDetail={() => refetchDetail(lookTestId)}
              />
              {/* STYLE.LLM.LOOKFEEDBACK.UI.1, extended by LOOK.FEEDBACK.PLACE.1
                  — one of two surfaces for `style.adjustFromLookResult`. This
                  one sits next to a REOPENED test's review controls, for
                  looking back on an older result days later. The other lives
                  in `LookDevelopmentBench`, right under `Save Look Result`,
                  for the generation the author just published. */}
              <StyleFeedbackPanel projectId={projectId} lookResultId={detail.result.id} commitAdvisory={styleFeedbackCommitAdvisory} />
            </>
          ) : (
            <p className="text-[#6e767d]">No durable result saved — save the Look Result to review it here and to request style feedback.</p>
          )}

          {(isPrerun || lookTestId in activeReruns) && (
            <LookDevelopmentPrerunEditor
              projectId={projectId}
              lookTestId={lookTestId}
              frozen={{ source: detail.test.source as LookTestListItem["source"], mode: detail.test.mode as LookTestListItem["mode"], subject: detail.test.subject, action: detail.test.action, workflowId: detail.test.workflowId }}
              workflow={workflows.find((w) => w.id === detail.test.workflowId) ?? null}
              allReferences={allReferences}
              initialReferenceIds={detail.references.map((r) => r.referenceImageId)}
              styleOptions={styleOptions}
              initialStyleSourceKind={detail.test.styleSourceKind}
              initialStyleDraftRevision={detail.test.styleDraftRevision}
              initialStyleVersionId={detail.test.styleVersionId}
              restoreSourceContext={restoreContext && restoreContext.forDuplicateId === lookTestId ? { sourceLookTestId: restoreContext.sourceLookTestId, snapshot: restoreContext.snapshot } : null}
              resumeJobId={activeReruns[lookTestId] ?? null}
              onQueued={handleQueuedLocal}
              onPublished={handlePublishedLocal}
            />
          )}
        </div>
      )}
      {!loading && openError && (
        <button type="button" className={smallButtonClass} onClick={() => handleClose(lookTestId)}>
          Close
        </button>
      )}
    </div>
  );

  const pendingDuplicateVisible = pendingDuplicateId !== null && !tests.some((t) => t.id === pendingDuplicateId);

  if (tests.length === 0 && !pendingDuplicateVisible) {
    return <p className="text-xs text-[#6e767d]">No Look Tests yet — generate one above.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {pendingDuplicateVisible && (
        <div className="rounded border border-[#3d3320] bg-[#1a1712] p-2 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#c9a24b]">
              Look Test #{pendingDuplicateId} was duplicated, but the list could not be refreshed — committed, pending sync.
            </span>
            <button type="button" className={smallButtonClass} disabled={syncingDuplicate} onClick={handleRetryDuplicateSync}>
              {syncingDuplicate ? "Syncing…" : "Retry sync"}
            </button>
          </div>
          {openedId === pendingDuplicateId && renderOpenedBody(pendingDuplicateId as number, true)}
        </div>
      )}

      {tests.map((t) => {
        const canCompare = t.result !== null;
        const isSelectedForComparison = comparisonIds.includes(t.id);
        const comparisonDisabled = !canCompare || (!isSelectedForComparison && comparisonIds.length >= 4);
        const isPrerun = t.job === null;

        return (
          <div key={t.id} className="rounded border border-[#2c3035] p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  aria-pressed={isSelectedForComparison}
                  disabled={comparisonDisabled}
                  title={!canCompare ? "No durable result to compare" : undefined}
                  className={`${toggleButtonClass} ${isSelectedForComparison ? "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]" : "border-[#2c3035] text-[#6e767d]"}`}
                  onClick={() => onToggleComparison(t.id)}
                >
                  Compare
                </button>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-[#a4abb2] truncate">
                    {t.source} · {t.mode} · {t.subject}
                  </span>
                  <span className="text-[10px] text-[#6e767d]">
                    {t.createdAt} · workflow: {workflowLabel(t.workflowId, t.workflowName, workflowNameById)} · job: {jobStateLabel(t.job)} · result: {resultStateLabel(t.result)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.result && (
                  <button type="button" className={smallButtonClass} disabled={duplicating} onClick={() => handleDuplicate(t.id)}>
                    Duplicate for rerun
                  </button>
                )}
                <button type="button" className={smallButtonClass} onClick={() => (openedId === t.id ? handleClose(t.id) : handleOpen(t.id))}>
                  {openedId === t.id ? "Close" : "Open"}
                </button>
              </div>
            </div>
            {duplicateError && openedId !== t.id && <p className="text-[10px] text-[#cf7b6b]">{duplicateError}</p>}

            {openedId === t.id && renderOpenedBody(t.id, isPrerun)}
          </div>
        );
      })}
    </div>
  );
}
