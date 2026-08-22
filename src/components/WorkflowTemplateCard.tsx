import { type ReactNode } from "react";
import Card from "@/components/Card";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import { refImageUrl } from "@/lib/refImageUrl";
import type { WorkflowKind } from "@/lib/comfy/workflowCatalog";

type Props = {
  name: string;
  kind: WorkflowKind;
  description: string | null;
  tags: string[];
  /** Stored `uploads/`-relative path, or `null` — the case for all 33 of the
   * author's workflows today. `refImageUrl` (the repo's precedent for a
   * stored image served under `/api/uploads/[...path]`) resolves it. */
  thumbnailPath: string | null;
  /** The card knows no route. "Generate Keyframe →" in production contexts,
   * "View / Edit / Delete" in Settings — filled by the caller. */
  actions?: ReactNode;
  /** Default-workflow pastilles (Asset Default, Shot Keyframe Default, Shot
   * Video Default) — Settings-only, filled by the caller. */
  badges?: ReactNode;
  /** WF.FAVORITE.1 §4 — the favorite star, top-left over the thumbnail.
   * Only safe to pass here when this card is NOT itself wrapped in a
   * `<Link>` by the caller (a `<form>` nested inside an `<a>` is invalid
   * HTML and would navigate instead of toggling) — every caller that does
   * wrap the card in a `<Link>` (`WorkflowSelectorPanel`) renders the
   * button itself, as a sibling of that link, instead of passing it here. */
  favoriteButton?: ReactNode;
};

export default function WorkflowTemplateCard({
  name,
  kind,
  description,
  tags,
  thumbnailPath,
  actions,
  badges,
  favoriteButton,
}: Props) {
  return (
    <Card className="flex flex-col h-full">
      {/* Fixed ratio regardless of whether a thumbnail exists, so the grid
          never deforms depending on which cards have one. */}
      <div className="relative w-full aspect-video bg-[#0d0e10] rounded overflow-hidden mb-3 shrink-0">
        {favoriteButton && <div className="absolute top-2 left-2 z-10">{favoriteButton}</div>}
        {thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={refImageUrl(thumbnailPath)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#2c3035]" aria-hidden="true">
            <span className="text-2xl">◇</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-1">
        <WorkflowKindBadge kind={kind} />
        <span className="text-sm font-medium text-[#e7e9ec] truncate">{name}</span>
        {badges}
      </div>

      {description && (
        <p className="text-xs text-[#a4abb2] mb-2 line-clamp-2">{description}</p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded border border-[#2c3035] text-[#6e767d]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {actions && <div className="mt-auto pt-2">{actions}</div>}
    </Card>
  );
}
