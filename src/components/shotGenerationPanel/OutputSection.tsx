import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import { attachOutputAsShotReference, approveVideoOutput } from "@/actions/generation";
import { saveVideoOutputToLibrary } from "@/actions/shotVideoLibrary";
import { saveStoryboardDraftFromJob } from "@/actions/storyboard";

type Props = {
  activeJobId: number;
  projectId: number;
  sequenceId: number;
  shotId: number;
  approveReturnTo: string;
  attachError: string | null | undefined;
  attachedReference: boolean | undefined;
  canAttach: boolean;
  canSaveStoryboardDraft: boolean;
  storyboardDraftError: string | null | undefined;
  storyboardDraftSaved: boolean | undefined;
  compiledShotPromptText: string;
  storyboardReferencesSnapshot: string;
  approveError: string | null | undefined;
  approvedVideo: boolean | undefined;
  canApproveVideo: boolean;
  libraryError: string | null | undefined;
  librarySaved: boolean | undefined;
  libraryAlreadySaved: boolean | undefined;
};

/** "Output" block: job status, Approve Output (image/video), Save as Storyboard Draft, Save to Shot Videos (IND.CLIENTSPLIT.1, moved verbatim from ShotGenerationPanel.tsx). */
export default function OutputSection({
  activeJobId,
  projectId: pid,
  sequenceId: sid,
  shotId: shid,
  approveReturnTo,
  attachError,
  attachedReference,
  canAttach,
  canSaveStoryboardDraft,
  storyboardDraftError,
  storyboardDraftSaved,
  compiledShotPromptText,
  storyboardReferencesSnapshot,
  approveError,
  approvedVideo,
  canApproveVideo,
  libraryError,
  librarySaved,
  libraryAlreadySaved,
}: Props) {
  return (
    <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">Output</p>
      <GenerationJobStatusPanel jobId={activeJobId} />
      {/* Image/keyframe approve — GEN.2.G.1 */}
      {attachError && (
        <p className="text-xs text-[#cf7b6b]">{attachError}</p>
      )}
      {attachedReference ? (
        <p className="text-xs text-[#6b9e72]">Output approved as source.</p>
      ) : canAttach ? (
        <form action={attachOutputAsShotReference}>
          <input type="hidden" name="projectId" value={String(pid)} />
          <input type="hidden" name="sequenceId" value={String(sid)} />
          <input type="hidden" name="shotId" value={String(shid)} />
          <input type="hidden" name="jobId" value={String(activeJobId)} />
          <input type="hidden" name="returnTo" value={approveReturnTo} />
          <button
            type="submit"
            className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
          >
            Approve Output
          </button>
        </form>
      ) : null}
      {/* Storyboard draft — SEQGEN.STORYBOARD.2, additive to the
          Approve Output/Attach-as-reference actions above, never
          replacing them. Only offered for image workflows reached
          from the Storyboard workspace (?storyboard=1). */}
      {canSaveStoryboardDraft && (
        <>
          {storyboardDraftError && (
            <p className="text-xs text-[#cf7b6b]">{storyboardDraftError}</p>
          )}
          {storyboardDraftSaved ? (
            <p className="text-xs text-[#6b9e72]">Saved as storyboard draft.</p>
          ) : (
            <form action={saveStoryboardDraftFromJob}>
              <input type="hidden" name="shotId" value={String(shid)} />
              <input type="hidden" name="jobId" value={String(activeJobId)} />
              <input type="hidden" name="promptSnapshot" value={compiledShotPromptText} />
              <input type="hidden" name="referencesSnapshot" value={storyboardReferencesSnapshot} />
              <input type="hidden" name="returnTo" value={approveReturnTo} />
              <button
                type="submit"
                className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
              >
                Save as Storyboard Draft
              </button>
            </form>
          )}
        </>
      )}
      {/* Video approve — GEN.2.G.2 */}
      {approveError && (
        <p className="text-xs text-[#cf7b6b]">{approveError}</p>
      )}
      {approvedVideo ? (
        <p className="text-xs text-[#6b9e72]">Video approved as shot output.</p>
      ) : canApproveVideo ? (
        <form action={approveVideoOutput}>
          <input type="hidden" name="shotId" value={String(shid)} />
          <input type="hidden" name="jobId" value={String(activeJobId)} />
          <input type="hidden" name="returnTo" value={approveReturnTo} />
          <button
            type="submit"
            className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
          >
            Approve Output
          </button>
        </form>
      ) : null}
      {/* SHOT.VIDEO.LIBRARY.1 — save-only (never approves), always
          available whenever the same output is video-approvable, so a
          video becomes a reusable Shot media asset even before/without
          ever being approved as the Shot's output. */}
      {libraryError && <p className="text-xs text-[#cf7b6b]">{libraryError}</p>}
      {librarySaved ? (
        <p className="text-xs text-[#6b9e72]">Saved to the Shot Video Library.</p>
      ) : libraryAlreadySaved ? (
        <p className="text-xs text-[#a4abb2]">Already saved to the Shot Video Library.</p>
      ) : canApproveVideo ? (
        <form action={saveVideoOutputToLibrary}>
          <input type="hidden" name="shotId" value={String(shid)} />
          <input type="hidden" name="jobId" value={String(activeJobId)} />
          <input type="hidden" name="returnTo" value={approveReturnTo} />
          <button
            type="submit"
            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
          >
            Save to Shot Videos
          </button>
        </form>
      ) : null}
    </div>
  );
}
