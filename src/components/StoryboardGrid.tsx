import Link from "next/link";
import Collapsible from "@/components/Collapsible";
import { approveStoryboardDraft } from "@/actions/storyboard";

export type StoryboardGridStatus = "not_generated" | "generating" | "generated" | "approved" | "failed";

export type StoryboardGridShot = {
  shotId: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  /** The image actually shown on the card — the approved draft if one exists, else the most recent draft regardless of status. Null when the Shot has no draft at all. */
  displayImageUrl: string | null;
  displayDraftId: number | null;
  displayDraftStatus: "draft" | "approved" | "rejected" | null;
  status: StoryboardGridStatus;
  compiledPromptPreview: string | null;
  referenceCount: number;
};

type Props = {
  projectId: number;
  sequenceId: number;
  shots: StoryboardGridShot[];
  returnTo: string;
  /** Comma-separated, ordered reference ids selected in Storyboard Assets (RuntimeImageOption id format) — forwarded into each Shot's generate link so ShotGenerationPanel can filter its available images to exactly this set. Empty string when nothing is selected (default behavior, unchanged). */
  storyboardRefs: string;
};

function statusLabel(status: StoryboardGridStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "generated":
      return "Generated";
    case "generating":
      return "Generating";
    case "failed":
      return "Failed";
    default:
      return "Not generated";
  }
}

function statusClass(status: StoryboardGridStatus): string {
  switch (status) {
    case "approved":
      return "text-[#6b9e72] border-[#2a3d2e]";
    case "generated":
      return "text-[#5b93d6] border-[#5b93d6]/30";
    case "generating":
      return "text-[#cda24f] border-[#3d3423]";
    case "failed":
      return "text-[#cf7b6b] border-[#3d2323]";
    default:
      return "text-[#4b5158] border-[#232629]";
  }
}

/**
 * SEQGEN.STORYBOARD.2 — production grid: every declared Shot of the
 * Sequence stays visible even with zero storyboard media (never hidden,
 * unlike the read-only SequenceStoryboardGrid from SEQGEN.STORYBOARD.1).
 * Media priority is fixed by the caller (approved draft, else most recent
 * draft, else none) — this component never fabricates a placeholder image.
 */
export default function StoryboardGrid({ projectId, sequenceId, shots, returnTo, storyboardRefs }: Props) {
  if (shots.length === 0) {
    return (
      <p className="text-xs text-[#4b5158]">
        This Sequence has no Shots yet. Add Shots in Sequence Structure first.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {shots.map((shot, index) => {
        const shotHref = `/projects/${projectId}/sequences/${sequenceId}/shots/${shot.shotId}`;
        const generateHref =
          `${shotHref}/workflows?storyboard=1` +
          (storyboardRefs ? `&storyboardRefs=${encodeURIComponent(storyboardRefs)}` : "");
        const canApprove = shot.displayDraftId !== null && shot.displayDraftStatus !== "approved";

        return (
          <div
            key={shot.shotId}
            className="flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden"
          >
            <div className="relative aspect-video w-full bg-[#0d0e10] shrink-0 overflow-hidden">
              {shot.displayImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot.displayImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-[9px] uppercase tracking-wider text-[#3a4046]">
                    No storyboard image
                  </span>
                </div>
              )}
              <span
                className={`absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider border rounded px-1.5 py-px bg-[#0d0e10]/80 ${statusClass(shot.status)}`}
              >
                {statusLabel(shot.status)}
              </span>
              <span className="absolute bottom-1.5 left-1.5 text-[9px] font-mono text-[#e7e9ec] bg-[#0d0e10]/80 rounded px-1.5 py-px">
                {shot.shotCode ?? String(index + 1).padStart(2, "0")}
              </span>
              {shot.durationSeconds != null && (
                <span className="absolute bottom-1.5 right-1.5 text-[9px] font-mono text-[#a4abb2] bg-[#0d0e10]/80 rounded px-1.5 py-px">
                  {shot.durationSeconds.toFixed(1)}s
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 px-2 py-1.5">
              <span className="text-xs text-[#a4abb2] truncate">{shot.title}</span>

              {shot.compiledPromptPreview && (
                <Collapsible label={`Prompt · ${shot.referenceCount} ref${shot.referenceCount !== 1 ? "s" : ""}`}>
                  <p className="text-[10px] text-[#6e767d] whitespace-pre-wrap">
                    {shot.compiledPromptPreview}
                  </p>
                </Collapsible>
              )}

              <Link
                href={generateHref}
                className="mt-0.5 block w-full text-center rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-2 py-1.5 text-[11px] font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5b93d6] focus-visible:outline-offset-1"
              >
                {shot.status === "not_generated" ? "Generate Storyboard" : "Regenerate Storyboard"}
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                {canApprove && (
                  <form action={approveStoryboardDraft}>
                    <input type="hidden" name="draftId" value={String(shot.displayDraftId)} />
                    <input type="hidden" name="shotId" value={String(shot.shotId)} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      className="text-[10px] text-[#6b9e72] hover:text-[#8bbf96] transition-colors"
                    >
                      Approve
                    </button>
                  </form>
                )}
                <Link
                  href={shotHref}
                  className="text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors ml-auto"
                >
                  Open Shot →
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
