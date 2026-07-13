import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import ReferenceImageRoleBadge from "@/components/ReferenceImageRoleBadge";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";

type ReferenceImageItem = {
  id: number;
  imagePath: string;
  sourceFilename: string | null;
  label: string | null;
  imageRole: string | null;
  notes: string | null;
  // ASSET.BIBLE.2 — optional: only ever populated by the Asset Detail
  // caller. Shot Detail reuses this same panel for shot_reference_images,
  // which has no variant/usage/approval columns, so these are simply
  // omitted there (never rendered, never assumed present).
  variantState?: string | null;
  usageNotes?: string | null;
  approvedForGeneration?: boolean;
};

type Props = {
  images: ReferenceImageItem[];
  addHref: string;
  getEditHref: (imageId: number) => string;
  getDeleteAction: (imageId: number) => () => Promise<void>;
  // ASSET.BIBLE.2 — explicit approve/unapprove action. Omitted entirely by
  // Shot Detail; when omitted, no approval UI renders at all.
  getApprovalAction?: (imageId: number, nextApproved: boolean) => () => Promise<void>;
};

export default function ReferenceImagesPanel({
  images,
  addHref,
  getEditHref,
  getDeleteAction,
  getApprovalAction,
}: Props) {
  if (images.length === 0) {
    return (
      <EmptyState
        title="No reference images yet."
        description="Add reference images to guide future image and video workflows."
        action={
          <Link
            href={addHref}
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            + Add Reference Image
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-[#1a1d20]">
        {images.map((image) => {
          const altText = image.label ?? image.sourceFilename ?? "Reference image";
          const displayName = image.label ?? image.sourceFilename ?? "Reference image";
          return (
            <div key={image.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
              {/* Thumbnail — compact, object-contain, no crop */}
              <ThumbnailHoverPreview
                src={refImageUrl(image.imagePath)}
                alt={altText}
                previewSize={480}
                className="shrink-0"
              >
                <div className="w-10 h-10 rounded overflow-hidden border border-[#232629] bg-[#141618] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={refImageUrl(image.imagePath)}
                    alt={altText}
                    className="w-full h-full object-contain"
                  />
                </div>
              </ThumbnailHoverPreview>
              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col gap-1 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-[#e7e9ec] truncate">{displayName}</p>
                  <ReferenceImageRoleBadge role={image.imageRole} />
                  {image.variantState && (
                    <span className="inline-flex items-center rounded border border-[#3a4046] px-1.5 py-0.5 text-[10px] font-medium text-[#6e767d]">
                      {image.variantState}
                    </span>
                  )}
                  {/* ASSET.BIBLE.2 — readable at a glance, no menu to open. */}
                  {image.approvedForGeneration !== undefined && (
                    <span
                      className={
                        image.approvedForGeneration
                          ? "inline-flex items-center rounded border border-[#6b9e72]/40 bg-[#6b9e72]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#6b9e72]"
                          : "inline-flex items-center rounded border border-[#cda24f]/40 bg-[#cda24f]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#cda24f]"
                      }
                    >
                      {image.approvedForGeneration ? "Approved" : "Not approved"}
                    </span>
                  )}
                </div>
                {image.notes && (
                  <p className="text-[11px] text-[#6e767d] leading-relaxed line-clamp-2">
                    {image.notes}
                  </p>
                )}
                {image.usageNotes && (
                  <p className="text-[11px] text-[#6e767d] leading-relaxed line-clamp-2">
                    <span className="text-[#4b5158]">Usage: </span>
                    {image.usageNotes}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-0.5">
                  {getApprovalAction && image.approvedForGeneration !== undefined && (
                    <form action={getApprovalAction(image.id, !image.approvedForGeneration)}>
                      <button
                        type="submit"
                        className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                      >
                        {image.approvedForGeneration ? "Unapprove" : "Approve"}
                      </button>
                    </form>
                  )}
                  <Link
                    href={getEditHref(image.id)}
                    className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                  >
                    Edit
                  </Link>
                  <DeleteButton
                    action={getDeleteAction(image.id)}
                    confirm="Delete this reference image?"
                    label="Delete"
                    className="text-xs text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Link
        href={addHref}
        className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
      >
        + Add Reference Image
      </Link>
    </div>
  );
}
