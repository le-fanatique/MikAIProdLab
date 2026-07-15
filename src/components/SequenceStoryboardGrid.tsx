import Link from "next/link";

export type StoryboardCardStatus = "approved" | "generating" | "failed" | "none";

export type StoryboardShot = {
  id: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  /** Resolved URL of the approved video, or null. Highest display priority. */
  videoUrl: string | null;
  /** Resolved URL of the shot's first reference image, or null. Used only when there is no approved video. */
  imageUrl: string | null;
  status: StoryboardCardStatus;
};

type Props = {
  shots: StoryboardShot[];
  projectId: number;
  sequenceId: number;
};

function statusLabel(status: StoryboardCardStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "generating":
      return "Generating";
    case "failed":
      return "Failed";
    default:
      return "No approved output";
  }
}

function statusClass(status: StoryboardCardStatus): string {
  switch (status) {
    case "approved":
      return "text-[#6b9e72] border-[#2a3d2e]";
    case "generating":
      return "text-[#cda24f] border-[#3d3423]";
    case "failed":
      return "text-[#cf7b6b] border-[#3d2323]";
    default:
      return "text-[#4b5158] border-[#232629]";
  }
}

/**
 * Read-only visual grid for a Sequence's Shots (SEQGEN.STORYBOARD.1).
 * Media priority per card: approved video > first reference image > empty
 * state. Never fabricates a thumbnail or triggers a server-side frame
 * extraction — a shot with no approved video and no reference image simply
 * shows its empty state, same fixed card size as every other card.
 */
export default function SequenceStoryboardGrid({ shots, projectId, sequenceId }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {shots.map((shot, index) => {
        const shotHref = `/projects/${projectId}/sequences/${sequenceId}/shots/${shot.id}`;
        return (
          <Link
            key={shot.id}
            href={shotHref}
            aria-label={`Open Shot ${shot.shotCode ?? shot.title}`}
            className="group flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden hover:border-[#3a4046] focus:outline-none focus:ring-1 focus:ring-[#5b93d6] transition-colors"
          >
            <div className="relative aspect-video w-full bg-[#0d0e10] shrink-0 overflow-hidden">
              {shot.videoUrl ? (
                <video
                  src={shot.videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              ) : shot.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-[9px] uppercase tracking-wider text-[#3a4046]">
                    No media
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
            <div className="flex flex-col gap-1 px-2 py-1.5">
              <span className="text-xs text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors truncate">
                {shot.title}
              </span>
              <span className="text-[10px] text-[#5b93d6] group-hover:text-[#8fbbe8] transition-colors">
                Open Shot →
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
