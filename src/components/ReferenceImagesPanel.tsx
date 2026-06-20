import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import ReferenceImageRoleBadge from "@/components/ReferenceImageRoleBadge";

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
      <div className="grid grid-cols-2 gap-3">
        {images.map((image) => {
          const altText = image.label ?? image.sourceFilename ?? "Reference image";
          const displayName = image.label ?? image.sourceFilename ?? "Reference image";
          return (
            <div
              key={image.id}
              className="rounded border border-[#2c3035] bg-[#141618] overflow-hidden"
            >
              <img
                src={`/${image.imagePath}`}
                alt={altText}
                className="w-full aspect-video object-cover"
              />
              <div className="p-2.5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-[#e7e9ec] leading-snug flex-1 min-w-0 truncate">
                    {displayName}
                  </p>
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
