"use client";

// ---------------------------------------------------------------------------
// LatestApprovedButton.tsx — EDITORIAL.LATEST.APPROVAL.1
//
// Client-only shell around `approveLatestGenerationForSequence`: owns the
// native confirmation, the disabled/loading/result states, and double-click
// protection. Carries no business logic of its own — `eligibleCount` is
// purely a display hint computed server-side by the page (the SAME
// `resolveVideoSourcesForShotList` call already used for its preview/badges,
// see the page's own comment on `videoSourceSummary`); the action itself
// re-resolves everything fresh and never trusts this count as authority.
// ---------------------------------------------------------------------------

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveLatestGenerationForSequence } from "@/actions/editorialApproval";
import type { VideoSourceMode } from "@/lib/editorial/videoSourceModeShared";

type Props = {
  projectId: number;
  sequenceId: number;
  videoSourceMode: VideoSourceMode;
  eligibleCount: number;
  totalCount: number;
};

export default function LatestApprovedButton({ projectId, sequenceId, videoSourceMode, eligibleCount, totalCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Synchronous lock acquired before the first `await` — see
  // PublishBasicSequenceResultButton's own comment for why `isPending`
  // alone does not close the double-click window.
  const inFlightRef = useRef(false);

  if (videoSourceMode !== "latest-generation") return null;

  const skippedCount = totalCount - eligibleCount;
  const disabled = isPending || eligibleCount === 0;

  function handleClick() {
    if (inFlightRef.current || eligibleCount === 0) return;

    const skipNote = skippedCount > 0 ? ` It will skip ${skippedCount} Shot${skippedCount === 1 ? "" : "s"} with no usable Latest generation video.` : "";
    const confirmed = window.confirm(
      `Approve the Latest generation video for ${eligibleCount} eligible Shot${eligibleCount === 1 ? "" : "s"}? ` +
        `This replaces existing approvals for those Shots only.${skipNote} ` +
        `Existing active/published Sequence and Film Results built from changed Shots may become outdated.`
    );
    if (!confirmed) return;

    inFlightRef.current = true;
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await approveLatestGenerationForSequence(projectId, sequenceId);
        if (result.ok) {
          const refreshNote = result.revalidationIncomplete
            ? " Some cached pages may take a moment to reflect this — refresh if needed."
            : "";
          setStatus({
            ok: true,
            message: `Approved ${result.approved}, already approved ${result.alreadyApproved}, skipped ${result.skipped}.${refreshNote}`,
          });
          router.refresh();
        } else {
          setStatus({ ok: false, message: result.error });
        }
      } catch {
        setStatus({ ok: false, message: "Approval failed due to a connection or server error. Please try again." });
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 mb-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={eligibleCount === 0 ? "No Shot currently has a usable Latest generation video to approve." : undefined}
        className="rounded border border-[#5b93d6]/50 text-[#8fbbe8] px-3 py-1.5 text-xs w-fit hover:border-[#5b93d6] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        {isPending ? "Approving…" : `Latest Approved (${eligibleCount} eligible)`}
      </button>
      {eligibleCount === 0 && !status && (
        <p className="text-[10px] text-[#6e767d]">No Shot currently has a usable Latest generation video to approve.</p>
      )}
      {status && (
        <p className={`text-[10px] ${status.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>{status.message}</p>
      )}
    </div>
  );
}
