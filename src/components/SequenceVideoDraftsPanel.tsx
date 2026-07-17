import Collapsible from "@/components/Collapsible";
import VideoFrameReviewPlayer from "@/components/VideoFrameReviewPlayer";

export type SequenceVideoDraftItem = {
  id: number;
  videoUrl: string;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
  promptPreview: string | null;
  sourceStoryboardImageUrl: string | null;
};

type Props = {
  projectId: number;
  drafts: SequenceVideoDraftItem[];
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: SequenceVideoDraftItem["status"]): string {
  switch (status) {
    case "approved":
      return "text-[#6b9e72] border-[#2a3d2e]";
    case "rejected":
      return "text-[#cf7b6b] border-[#3d2323]";
    default:
      return "text-[#4b5158] border-[#232629]";
  }
}

/**
 * SEQGEN.VIDEO.1 — read-only listing of every `sequence_video_drafts` row
 * for the current Sequence, newest first, mirroring
 * SequenceStoryboardDraftsPanel's own layout. Every version is shown, never
 * only the latest — multiple drafts per Sequence are explicit product
 * intent (comparing different workflows/prompts). Playback only:
 * VideoFrameReviewPlayer is reused unmodified with `captureDestinations={[]}`
 * (no per-Shot/per-Asset frame capture at Sequence level — out of scope
 * here; `SEQGEN.SPLIT.1` will own turning this video into Shot clips).
 * Nothing here approves, splits, or pushes to Shots.
 */
export default function SequenceVideoDraftsPanel({ projectId, drafts }: Props) {
  if (drafts.length === 0) {
    return (
      <p className="text-xs text-[#4b5158]">
        No Sequence Video drafts yet. Use <span className="text-[#a4abb2]">Generate Sequence Video</span> on a
        Sequence Storyboard draft above.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {drafts.map((d) => (
        <div key={d.id} className="flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden">
          <div className="relative bg-[#0d0e10]">
            <VideoFrameReviewPlayer src={d.videoUrl} projectId={projectId} captureDestinations={[]} />
            <span
              className={`absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider border rounded px-1.5 py-px bg-[#0d0e10]/80 ${statusClass(d.status)}`}
            >
              {d.status}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-2 py-1.5">
            <div className="flex items-center gap-2">
              {d.sourceStoryboardImageUrl && (
                <div className="relative w-12 aspect-video bg-[#0d0e10] shrink-0 overflow-hidden rounded">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.sourceStoryboardImageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <span className="text-[10px] font-mono text-[#4b5158]">{fmtDate(d.createdAt)}</span>
            </div>
            {d.promptPreview && (
              <Collapsible label="Prompt">
                <p className="text-[10px] text-[#6e767d] whitespace-pre-wrap">{d.promptPreview}</p>
              </Collapsible>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
