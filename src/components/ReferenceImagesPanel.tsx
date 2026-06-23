import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import ReferenceImageRoleBadge from "@/components/ReferenceImageRoleBadge";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";

type ReferenceImageItem = {
  id: number;
  imagePath: string;
  sourceFilename: string | null;
  label: string | null;
  imageRole: string | null;
  notes: string | null;
};

type Props = {
  images: ReferenceImageItem[];
  addHref: string;
  getEditHref: (imageId: number) => string;
  getDeleteAction: (imageId: number) => () => Promise<void>;
};

export default function ReferenceImagesPanel({
  images,
  addHref,
  getEditHref,
  getDeleteAction,
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
                src={`/${image.imagePath}`}
                alt={altText}
                previewSize={480}
                className="shrink-0"
              >
                <div className="w-10 h-10 rounded overflow-hidden border border-[#232629] bg-[#141618] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/${image.imagePath}`}
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
                </div>
                {image.notes && (
                  <p className="text-[11px] text-[#6e767d] leading-relaxed line-clamp-2">
                    {image.notes}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-0.5">
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
