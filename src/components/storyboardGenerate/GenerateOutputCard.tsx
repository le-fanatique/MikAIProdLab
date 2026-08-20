// ---------------------------------------------------------------------------
// GenerateOutputCard — IND.CLIENTSPLIT.2
//
// The Output card of the Sequence Storyboard generate page: the job status,
// and the "save as draft" form once one can be saved.
//
// Presentation only. Every decision — whether a draft can be saved, where to
// return to — is made by the page and arrives as a prop, so nothing here can
// change behaviour and `tsc` checks the whole seam.
// ---------------------------------------------------------------------------

import Link from "next/link";
import Card from "@/components/Card";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";

type Props = {
  activeJobId: number;
  draftError: string | null | undefined;
  draftSaved: boolean;
  canSaveDraft: boolean;
  storyboardWorkspaceReturnTo: string;
  outputReturnTo: string;
  sequenceId: number;
  /** The page's own Server Action, passed rather than imported, so this file stays presentational. */
  saveAction: (formData: FormData) => void | Promise<void>;
};

export default function GenerateOutputCard({
  activeJobId,
  draftError,
  draftSaved,
  canSaveDraft,
  storyboardWorkspaceReturnTo,
  outputReturnTo,
  sequenceId,
  saveAction,
}: Props) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
          <GenerationJobStatusPanel jobId={activeJobId} />

          {draftError && <p className="text-xs text-[#cf7b6b]">{draftError}</p>}
          {draftSaved ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-[#6b9e72]">Saved as Sequence Storyboard draft.</p>
              <Link
                href={storyboardWorkspaceReturnTo}
                className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                ← Back to Storyboard Workspace
              </Link>
            </div>
          ) : canSaveDraft ? (
            <form action={saveAction}>
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="jobId" value={String(activeJobId)} />
              <input type="hidden" name="returnTo" value={outputReturnTo} />
              <button
                type="submit"
                className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
              >
                Save as Sequence Storyboard Draft
              </button>
            </form>
          ) : null}
      </div>
    </Card>
  );
}
