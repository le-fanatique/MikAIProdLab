import Collapsible from "@/components/Collapsible";

export type SequenceStoryboardDraft = {
  id: number;
  imageUrl: string;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
  promptPreview: string | null;
};

type Props = {
  drafts: SequenceStoryboardDraft[];
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

function statusClass(status: SequenceStoryboardDraft["status"]): string {
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
 * SEQGEN.STORYBOARD.3 (retake) — read-only listing of every
 * `sequence_storyboard_images` row for the current Sequence, newest first.
 * Closes the loop left by "Save as Sequence Storyboard Draft" previously
 * having no visible destination: without this, a saved draft became
 * unreachable from any product surface. Every version is shown (never
 * only the latest) since multiple versions are explicitly retained.
 */
export default function SequenceStoryboardDraftsPanel({ drafts }: Props) {
  if (drafts.length === 0) {
    return (
      <p className="text-xs text-[#4b5158]">
        No Sequence Storyboard drafts yet. Use{" "}
        <span className="text-[#a4abb2]">Generate Sequence Storyboard</span> above to create one.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {drafts.map((d) => (
        <div
          key={d.id}
          className="flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden"
        >
          <div className="relative aspect-video w-full bg-[#0d0e10] shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.imageUrl} alt="" className="w-full h-full object-cover" />
            <span
              className={`absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider border rounded px-1.5 py-px bg-[#0d0e10]/80 ${statusClass(d.status)}`}
            >
              {d.status}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-2 py-1.5">
            <span className="text-[10px] font-mono text-[#4b5158]">{fmtDate(d.createdAt)}</span>
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
