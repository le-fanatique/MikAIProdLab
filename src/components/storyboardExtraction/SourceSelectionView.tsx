import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";
import { startStoryboardExtraction } from "@/actions/storyboardExtractionStart";
import type { sequenceStoryboardImages } from "@/db/schema";

type SourceDraft = typeof sequenceStoryboardImages.$inferSelect;

type Props = {
  crumbs: { label: string; href?: string }[];
  metaText: string;
  extractError: string | null;
  sourceDrafts: SourceDraft[];
  storyboardPagePath: string;
  sequenceId: number;
  returnTo: string;
};

/** State A — no extraction chosen yet: explicit source selection (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function SourceSelectionView({
  crumbs,
  metaText,
  extractError,
  sourceDrafts,
  storyboardPagePath,
  sequenceId,
  returnTo,
}: Props) {
  return (
    <div>
      <Breadcrumb crumbs={crumbs} />
      <PageHeader title="Extract Storyboard Panels" meta={metaText} />

      {extractError && <p className="text-xs text-[#cf7b6b] mb-4">{extractError}</p>}

      {sourceDrafts.length === 0 ? (
        <EmptyState
          title="No Sequence Storyboard images yet."
          description="Generate a Sequence Storyboard contact sheet first."
          action={
            <Link href={storyboardPagePath} className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
              ← Back to Storyboard
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-xs text-[#6e767d] mb-4">
            Choose which Sequence Storyboard image to detect panels from. Nothing is analyzed until you pick one
            explicitly.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sourceDrafts.map((d) => (
              <div key={d.id} className="flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden">
                <div className="relative aspect-video w-full bg-[#0d0e10] shrink-0 overflow-hidden">
                  <ThumbnailHoverPreview src={refImageUrl(d.imagePath)} alt="" focusable>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refImageUrl(d.imagePath)} alt="" className="w-full h-full object-cover" />
                  </ThumbnailHoverPreview>
                </div>
                <div className="flex flex-col gap-1.5 px-2 py-1.5">
                  <span className="text-[10px] font-mono text-[#4b5158]">
                    {new Date(d.createdAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <form action={startStoryboardExtraction}>
                    <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                    <input type="hidden" name="sourceStoryboardImageId" value={String(d.id)} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      className="mt-0.5 block w-full text-center rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-2 py-1.5 text-[11px] font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors"
                    >
                      Extract from this image
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 pt-4 border-t border-[#232629]">
        <Link href={storyboardPagePath} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Storyboard
        </Link>
      </div>
    </div>
  );
}
