"use client";

// ---------------------------------------------------------------------------
// ShotReferenceVideosPanel.tsx — SHOT.VIDEO.REFERENCES.1
//
// Shot-local "Video References" section: a plain inline upload form (file +
// Label + Notes, no separate route — mirrors the existing Shot Videos
// section's own local, no-route convention rather than
// ReferenceImagesPanel's `/reference-images/new` page), a compact list with
// a native <video controls> per entry (deliberately NOT
// `VideoFrameReviewPlayer` — a raw creative source has no capture-frame use
// case, and reusing that component's capture side effects here would be
// misapplied), and the "Add to Shot Videos" bridge per row.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { getReferenceImageRoleGroups, getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import EmptyState from "@/components/EmptyState";
import FormStatusSubmitButton from "@/components/FormStatusSubmitButton";
import LockedActionForm from "@/components/LockedActionForm";

export type ShotReferenceVideoRow = {
  id: number;
  videoUrl: string;
  sourceFilename: string | null;
  label: string | null;
  videoRole: string | null;
  notes: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** SHOT.VIDEO.REFERENCES.1 — computed server-side from the same 0<d<=600s rule the bridge action enforces, so the checkbox is honestly disabled here rather than accepted then silently ignored. */
  targetDurationEligible: boolean;
};

function formatDimensions(width: number | null, height: number | null): string | null {
  if (width === null || height === null) return null;
  return `${width}×${height}`;
}

export default function ShotReferenceVideosPanel({
  entries,
  shotId,
  sequenceId,
  projectId,
  returnTo,
  createAction,
  deleteAction,
  addToShotVideosAction,
}: {
  entries: ShotReferenceVideoRow[];
  shotId: number;
  sequenceId: number;
  projectId: number;
  returnTo: string;
  createAction: (formData: FormData) => Promise<void>;
  // A Server Action reference passed straight through from the Server
  // Component (a REAL `"use server"` export, or a direct `.bind()` result of
  // one) — NEVER a plain closure that merely RETURNS one. React Server
  // Components can only pass an actual Server Action reference as a prop
  // into a Client Component; a wrapping factory function (e.g. `(id) =>
  // deleteShotReferenceVideo.bind(...)`) is a regular, non-serializable
  // client function and fails at render time ("Functions cannot be passed
  // directly to Client Components..."). Each row instead calls `.bind()` on
  // this reference itself, client-side — a documented-supported pattern for
  // Server Actions.
  deleteAction: (id: number, shotId: number, sequenceId: number, projectId: number) => Promise<void>;
  addToShotVideosAction: (formData: FormData) => Promise<void>;
}) {
  // B17a — the roles the guide keys its video modes on, from the one catalogue.
  const roleGroups = getReferenceImageRoleGroups("shotVideo");
  const [checkedTargetDurationById, setCheckedTargetDurationById] = useState<Record<number, boolean>>({});

  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <EmptyState title="No Video References yet." description="Import reference videos to guide future video workflows." />
      ) : (
        <div className="flex flex-col divide-y divide-[#1a1d20]">
          {entries.map((row) => {
            const displayName = row.label ?? row.sourceFilename ?? "Video reference";
            const roleLabel = getReferenceImageRoleLabel(row.videoRole);
            const dimensions = formatDimensions(row.width, row.height);
            const wantsTargetDuration = checkedTargetDurationById[row.id] ?? false;
            return (
              <div key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <video src={row.videoUrl} controls className="w-full max-w-md rounded border border-[#2c3035] bg-black" />
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-[#e7e9ec]">{displayName}</p>
                  {roleLabel && (
                    <span className="rounded border border-[#2c3035] px-1.5 py-0.5 text-[10px] text-[#a4abb2]">{roleLabel}</span>
                  )}
                  {row.durationSeconds !== null && <span className="text-[10px] text-[#6e767d]">{row.durationSeconds.toFixed(3)}s</span>}
                  {dimensions && <span className="text-[10px] text-[#6e767d]">{dimensions}</span>}
                </div>
                {row.notes && <p className="text-[11px] text-[#6e767d] leading-relaxed line-clamp-2">{row.notes}</p>}

                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <LockedActionForm
                    action={addToShotVideosAction}
                    className="flex items-center gap-2 flex-wrap"
                    confirmMessage={
                      wantsTargetDuration && row.targetDurationEligible
                        ? `Add this Video Reference to Shot Videos as a new "reference_copy" entry, and set the Shot's target duration to ${row.durationSeconds?.toFixed(3)}s? This does not affect the current Approved Output.`
                        : `Add this Video Reference to Shot Videos as a new "reference_copy" entry? The Shot's target duration will not change.`
                    }
                  >
                    {({ pending }) => (
                      <>
                        <input type="hidden" name="referenceVideoId" value={row.id} />
                        <input type="hidden" name="shotId" value={shotId} />
                        <input type="hidden" name="sequenceId" value={sequenceId} />
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="hidden" name="updateTargetDuration" value={wantsTargetDuration && row.targetDurationEligible ? "1" : "0"} />
                        <label
                          className={`flex items-center gap-1.5 text-[10px] ${row.targetDurationEligible ? "text-[#a4abb2]" : "text-[#4b5158]"}`}
                          title={row.targetDurationEligible ? undefined : "This video's duration is missing, non-finite, or not between 0 and 600 seconds — the Shot's target duration cannot be updated from it."}
                        >
                          <input
                            type="checkbox"
                            checked={wantsTargetDuration}
                            disabled={!row.targetDurationEligible || pending}
                            onChange={(e) => setCheckedTargetDurationById((prev) => ({ ...prev, [row.id]: e.target.checked }))}
                            className="accent-[#5b93d6]"
                          />
                          Update Shot target duration
                        </label>
                        <button type="submit" disabled={pending} className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors disabled:opacity-40">
                          {pending ? "Adding…" : "Add to Shot Videos"}
                        </button>
                      </>
                    )}
                  </LockedActionForm>

                  <form action={deleteAction.bind(null, row.id, shotId, sequenceId, projectId)}>
                    <FormStatusSubmitButton
                      confirmMessage="Delete this Video Reference? This cannot be undone."
                      pendingLabel="Deleting…"
                      className="text-[10px] text-[#cf7b6b]/70 hover:text-[#cf7b6b] transition-colors disabled:opacity-40"
                    >
                      Delete
                    </FormStatusSubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form action={createAction} className="flex flex-col gap-2 border-t border-[#1a1d20] pt-3" encType="multipart/form-data">
        <label className="text-[10px] uppercase tracking-wider text-[#6e767d]">
          Video file (MP4, WebM, MOV)
          <input type="file" name="videoFile" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" required className="mt-1 block w-full text-xs text-[#a4abb2]" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#6e767d]">
          Label (optional)
          <input type="text" name="label" className="mt-1 block w-full rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5 text-xs text-[#e7e9ec]" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#6e767d]">
          Role (optional)
          <select
            name="videoRole"
            defaultValue=""
            className="mt-1 block w-full rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5 text-xs text-[#e7e9ec]"
          >
            <option value="">No role</option>
            {roleGroups.map((group) => (
              <optgroup key={group.category} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#6e767d]">
          Notes (optional)
          <textarea name="notes" rows={2} className="mt-1 block w-full rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5 text-xs text-[#e7e9ec]" />
        </label>
        <FormStatusSubmitButton
          pendingLabel="Uploading…"
          className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40"
        >
          + Add Video Reference
        </FormStatusSubmitButton>
      </form>
    </div>
  );
}
