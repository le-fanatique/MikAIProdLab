import Link from "next/link";
import Collapsible from "@/components/Collapsible";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export type SequenceStoryboardDraft = {
  id: number;
  imageUrl: string;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
  promptPreview: string | null;
  /** True when a sequence_storyboard_extractions row OR a sequence_video_drafts row already uses this draft as its source; Delete is refused server-side either way, but disabling the button here avoids a round trip just to learn that. */
  usedByExtraction: boolean;
};

type Props = {
  drafts: SequenceStoryboardDraft[];
  projectId: number;
  sequenceId: number;
  returnTo: string;
  uploadAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  uploadError?: string | null;
  /** SEQGEN.VIDEO.1 — current Storyboard Assets selection, forwarded unchanged into "Generate Sequence Video" so casting references (optional there) survive the trip, same convention as the image workflow CTA. */
  storyboardRefs?: string;
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
export default function SequenceStoryboardDraftsPanel({
  drafts,
  projectId,
  sequenceId,
  returnTo,
  uploadAction,
  deleteAction,
  uploadError,
  storyboardRefs,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* REVISE (round 3, finding #1) — no explicit `encType`: React sets the
          method/encoding itself for a Server Action function passed to
          `action`, and warns in the console ("value" attribute overridden
          warning) when one is set explicitly here — it would be silently
          overridden anyway, so this was never actually not-multipart, just a
          spurious dev-console error. The file still arrives as a real
          FormData entry either way. */}
      <form action={uploadAction} className="flex items-end gap-2">
        <input type="hidden" name="sequenceId" value={String(sequenceId)} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Upload storyboard (PNG/JPEG/WebP, max 10MB)</span>
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            required
            className="text-xs text-[#a4abb2] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#0d0e10] file:text-[#a4abb2] file:text-xs file:px-2 file:py-1 file:hover:border-[#3a4046]"
          />
        </label>
        <button
          type="submit"
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Upload storyboard
        </button>
      </form>
      {uploadError && <p className="text-xs text-[#cf7b6b]">{uploadError}</p>}
      <p className="text-[9px] text-[#4b5158] max-w-md">
        Each upload consumes the real size of the uploaded file. Re-running detection on an existing draft never
        duplicates the source image — it only adds small extraction/region rows.
      </p>

      {drafts.length === 0 ? (
        <p className="text-xs text-[#4b5158]">
          No Sequence Storyboard drafts yet. Use{" "}
          <span className="text-[#a4abb2]">Generate Sequence Storyboard</span> above, or upload one.
        </p>
      ) : (
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
                <Link
                  href={`/projects/${projectId}/sequences/${sequenceId}/storyboard/video/workflows?sourceStoryboardImageId=${d.id}${
                    storyboardRefs ? `&storyboardRefs=${encodeURIComponent(storyboardRefs)}` : ""
                  }`}
                  className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  Generate Sequence Video →
                </Link>
                <form action={deleteAction} className="mt-0.5">
                  <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                  <input type="hidden" name="imageId" value={String(d.id)} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <ConfirmSubmitButton
                    confirmMessage="Delete this Sequence Storyboard draft? This cannot be undone."
                    disabled={d.usedByExtraction}
                    title={d.usedByExtraction ? "This draft is already the source of an extraction or a Sequence Video draft and cannot be deleted." : undefined}
                    className="text-[10px] text-[#cf7b6b] hover:text-[#e0958a] transition-colors disabled:text-[#4b5158] disabled:cursor-not-allowed"
                  >
                    {d.usedByExtraction ? "Delete (in use)" : "Delete"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
