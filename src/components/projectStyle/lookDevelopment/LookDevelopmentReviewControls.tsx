"use client";

// ---------------------------------------------------------------------------
// LookDevelopmentReviewControls.tsx — STYLE.1.G.UI.2 (Retake Round 1)
//
// Notes, Candidate/Reject/Mark-as-Look-Target and Delete Result controls for
// ONE opened durable Look Result. Every mutation goes through the exact CORE
// Server Actions in src/actions/lookDevelopment.ts. A synchronous ref lock
// guarantees at most one in-flight mutation for this result at a time.
//
// Honest success/pending-sync contract: `outcome.ok === true` from the CORE
// action IS the only known success. Only THEN is `onRefetchDetail` called to
// confirm/refresh the opened detail from a real read
// (`getLookTestAction`) — if THAT read fails, the result enters
// `committed, pending sync` with a `Retry sync` button that repeats ONLY the
// read, never the mutation. A transport exception thrown BEFORE a known CORE
// success is always reported as an uncertain failure — never "committed".
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import {
  updateLookResultNotesAction,
  setLookResultStatusAction,
  markLookResultAsTargetAction,
  deleteLookResultAction,
} from "@/actions/lookDevelopment";
import { MAX_NOTES_LENGTH, type LookResultStatus } from "@/lib/lookDevelopment/contracts";

export type ReviewResult = { id: number; status: LookResultStatus; notes: string | null };

type Props = {
  projectId: number;
  result: ReviewResult;
  /** True while ANY other mutation targeting this same result/duplicate is in flight, from a sibling control. */
  busyElsewhere?: boolean;
  /** Called after a CORE mutation succeeds, so the parent can reconcile local status/notes/Look Target state everywhere (including any other row that previously held Look Target). */
  onStatusChanged: (resultId: number, status: LookResultStatus) => void;
  onNotesSaved: (resultId: number, notes: string | null) => void;
  onDeleted: (resultId: number) => void;
  /** Re-fetches and applies the opened detail for this Look Test (a real `getLookTestAction` read). Returns whether the read itself succeeded — called only AFTER a known CORE mutation success, to confirm/refresh the opened detail. */
  onRefetchDetail: () => Promise<boolean>;
};

const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const destructiveButtonClass =
  "rounded border border-[#3a2020] px-2 py-1 text-[10px] text-[#a5695c] hover:border-[#5a2f2a] hover:text-[#cf7b6b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export default function LookDevelopmentReviewControls({ projectId, result, busyElsewhere, onStatusChanged, onNotesSaved, onDeleted, onRefetchDetail }: Props) {
  const [notesDraft, setNotesDraft] = useState(result.notes ?? "");
  const [notesSyncedTo, setNotesSyncedTo] = useState(result.id);
  if (notesSyncedTo !== result.id) {
    // A different result was opened under this same control instance — resync the draft once.
    setNotesDraft(result.notes ?? "");
    setNotesSyncedTo(result.id);
  }

  const lockRef = useRef(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState<LookResultStatus | "delete" | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Shared "committed, pending sync" state — set ONLY after a known CORE
  // success whose confirming read (`onRefetchDetail`) then failed. Never set
  // from a catch block (a transport exception before a known success is
  // always an uncertain failure, reported via notesError/statusError only).
  const [pendingSync, setPendingSync] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);

  const disabled = Boolean(busyElsewhere) || savingNotes || statusBusy !== null || retryingSync;

  const confirmWithRefetch = async () => {
    const refreshed = await onRefetchDetail();
    setPendingSync(!refreshed);
  };

  const handleRetrySync = async () => {
    if (retryingSync) return;
    setRetryingSync(true);
    try {
      const refreshed = await onRefetchDetail();
      setPendingSync(!refreshed);
    } finally {
      setRetryingSync(false);
    }
  };

  const handleSaveNotes = async () => {
    if (lockRef.current || disabled) return;
    lockRef.current = true;
    setSavingNotes(true);
    setNotesError(null);
    try {
      const trimmed = notesDraft.trim().length > 0 ? notesDraft : null;
      const outcome = await updateLookResultNotesAction(projectId, result.id, trimmed);
      if (!outcome.ok) {
        setNotesError(outcome.error);
        return;
      }
      // Known success from here on — a failed confirming read is a sync
      // problem, never a reason to doubt or replay this mutation.
      onNotesSaved(result.id, trimmed);
      await confirmWithRefetch();
    } catch {
      setNotesError("Notes may not have been saved — check your connection. Your text was kept; click Save to retry.");
    } finally {
      lockRef.current = false;
      setSavingNotes(false);
    }
  };

  const handleSetStatus = async (status: "candidate" | "rejected") => {
    if (lockRef.current || disabled) return;
    lockRef.current = true;
    setStatusBusy(status);
    setStatusError(null);
    try {
      const outcome = await setLookResultStatusAction(projectId, result.id, status);
      if (!outcome.ok) {
        setStatusError(outcome.error);
        return;
      }
      onStatusChanged(result.id, status);
      await confirmWithRefetch();
    } catch {
      setStatusError("The status change may not have gone through — check your connection and try again.");
    } finally {
      lockRef.current = false;
      setStatusBusy(null);
    }
  };

  const handleMarkTarget = async () => {
    if (lockRef.current || disabled) return;
    lockRef.current = true;
    setStatusBusy("look-target");
    setStatusError(null);
    try {
      const outcome = await markLookResultAsTargetAction(projectId, result.id);
      if (!outcome.ok) {
        setStatusError(outcome.error);
        return;
      }
      onStatusChanged(result.id, "look-target");
      await confirmWithRefetch();
    } catch {
      setStatusError("Marking this result as Look Target may not have gone through — check your connection and try again.");
    } finally {
      lockRef.current = false;
      setStatusBusy(null);
    }
  };

  const handleDelete = async () => {
    if (lockRef.current || disabled) return;
    lockRef.current = true;
    setStatusBusy("delete");
    setDeleteError(null);
    try {
      const outcome = await deleteLookResultAction(projectId, result.id);
      if (!outcome.ok) {
        setDeleteError(outcome.error);
        return;
      }
      setConfirmingDelete(false);
      onDeleted(result.id);
    } catch {
      setDeleteError("Failed to delete this result — check your connection. Nothing was changed locally.");
    } finally {
      lockRef.current = false;
      setStatusBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[#232629] pt-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[#6e767d]">Notes</label>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={2}
          maxLength={MAX_NOTES_LENGTH}
          className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full"
          aria-label="Result notes"
        />
        <div className="flex items-center gap-2">
          <button type="button" className={smallButtonClass} disabled={disabled || savingNotes} onClick={handleSaveNotes}>
            {savingNotes ? "Saving…" : "Save notes"}
          </button>
        </div>
        {notesError && <p className="text-[10px] text-[#cf7b6b]">{notesError}</p>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-[#6e767d]">
          Status: <span className="text-[#a4abb2]">{result.status}</span>
        </span>
        <button
          type="button"
          aria-pressed={result.status === "candidate"}
          className={smallButtonClass}
          disabled={disabled || result.status === "candidate"}
          onClick={() => handleSetStatus("candidate")}
        >
          {statusBusy === "candidate" ? "Marking…" : "Mark Candidate"}
        </button>
        <button
          type="button"
          aria-pressed={result.status === "rejected"}
          className={smallButtonClass}
          disabled={disabled || result.status === "rejected"}
          onClick={() => handleSetStatus("rejected")}
        >
          {statusBusy === "rejected" ? "Rejecting…" : "Reject"}
        </button>
        <button
          type="button"
          aria-pressed={result.status === "look-target"}
          className={smallButtonClass}
          disabled={disabled || result.status === "look-target"}
          onClick={handleMarkTarget}
        >
          {statusBusy === "look-target" ? "Marking…" : "Mark as Look Target"}
        </button>
      </div>
      {statusError && <p className="text-[10px] text-[#cf7b6b]">{statusError}</p>}

      {pendingSync && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#c9a24b]">committed, pending sync</span>
          <button type="button" className={smallButtonClass} disabled={retryingSync} onClick={handleRetrySync}>
            {retryingSync ? "Syncing…" : "Retry sync"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!confirmingDelete ? (
          <button type="button" className={destructiveButtonClass} disabled={disabled} onClick={() => setConfirmingDelete(true)}>
            Delete Result
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#cf7b6b]">Permanently delete this durable result? The Look Test itself is kept.</span>
            <button type="button" className={destructiveButtonClass} disabled={disabled} onClick={handleDelete}>
              {statusBusy === "delete" ? "Deleting…" : "Confirm delete"}
            </button>
            <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => setConfirmingDelete(false)}>
              Keep result
            </button>
          </div>
        )}
      </div>
      {deleteError && <p className="text-[10px] text-[#cf7b6b]">{deleteError}</p>}
    </div>
  );
}
