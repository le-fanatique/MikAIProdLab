"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Collapsible from "@/components/Collapsible";

export type StoryboardAssetReference = {
  id: number;
  /** Same id format as RuntimeImageOption ("asset-{assetId}-{imageId}", see src/lib/comfy/mapWorkflowInputs.ts) — the actual transport key into generation. */
  refId: string;
  imageUrl: string;
  label: string | null;
  roleLabel: string | null;
  variantState: string | null;
  approvedForGeneration: boolean;
};

export type StoryboardCastAsset = {
  assetId: number;
  assetName: string;
  assetType: string;
  /** Number of distinct Shots in this Sequence that cast this Asset — never duplicated into one row per Shot. */
  shotCount: number;
  /** Already in stable order (orderIndex) — never re-sorted here. */
  references: StoryboardAssetReference[];
};

type Props = {
  projectId: number;
  assets: StoryboardCastAsset[];
};

/**
 * SEQGEN.STORYBOARD.2 (retake) — "Storyboard Assets": every Asset cast
 * anywhere in the Sequence, listed exactly once, with a per-reference
 * selection checkbox. The selection is transported via the `storyboardRefs`
 * URL query param on this same Storyboard page (same `router.replace`
 * pattern already used by DynamicBatchImageList) — never only local state —
 * so `StoryboardGrid`'s "Generate"/"Regenerate" links (rendered server-side
 * from that same query string) carry the exact selected, ordered reference
 * ids into the Shot's generation flow, where ShotGenerationPanel filters
 * `availableImages` down to them (see that component and the report for the
 * full transport chain).
 */
export default function StoryboardAssetsPanel({ projectId, assets }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((searchParams.get("storyboardRefs") ?? "").split(",").map((s) => s.trim()).filter(Boolean))
  );

  // Stable order: always emitted in Storyboard Assets' own display order
  // (asset order, then reference order within each asset) — independent of
  // the order the user happened to click checkboxes in.
  function orderedIds(nextSelected: Set<string>): string[] {
    const ordered: string[] = [];
    for (const asset of assets) {
      for (const ref of asset.references) {
        if (nextSelected.has(ref.refId)) ordered.push(ref.refId);
      }
    }
    return ordered;
  }

  function toggle(refId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);

      const ids = orderedIds(next);
      const params = new URLSearchParams(searchParams.toString());
      if (ids.length > 0) params.set("storyboardRefs", ids.join(","));
      else params.delete("storyboardRefs");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });

      return next;
    });
  }

  if (assets.length === 0) {
    return (
      <p className="text-xs text-[#4b5158]">No Assets are cast in this Sequence yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {assets.map((asset) => {
        const selectedCount = asset.references.filter((r) => selected.has(r.refId)).length;
        return (
          <div key={asset.assetId} className="rounded border border-[#232629] bg-[#141618] px-3 py-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-sm text-[#e7e9ec] truncate">{asset.assetName}</span>
                <span className="text-[10px] uppercase tracking-wider text-[#4b5158] shrink-0">
                  {asset.assetType}
                </span>
                <span className="text-[10px] text-[#4b5158] shrink-0">
                  {asset.shotCount} shot{asset.shotCount !== 1 ? "s" : ""}
                </span>
              </div>
              <Link
                href={`/projects/${projectId}/assets/${asset.assetId}`}
                className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors shrink-0"
              >
                Open Asset →
              </Link>
            </div>

            {asset.references.length === 0 ? (
              <p className="text-[10px] text-[#4b5158] mt-1.5">No reference images for this Asset.</p>
            ) : (
              <div className="mt-1.5">
                <Collapsible
                  label={`References (${asset.references.length}) — ${selectedCount} selected / ${asset.references.length} available`}
                  defaultOpen
                >
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {asset.references.map((ref) => {
                      const isSelected = selected.has(ref.refId);
                      return (
                        <label
                          key={ref.id}
                          className={`flex flex-col gap-1 rounded border p-1 cursor-pointer transition-colors ${
                            isSelected ? "border-[#5b93d6]" : "border-[#232629] hover:border-[#3a4046]"
                          }`}
                        >
                          <div className="relative aspect-square w-full bg-[#0d0e10] overflow-hidden rounded">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ref.imageUrl}
                              alt={ref.label ?? asset.assetName}
                              className="w-full h-full object-cover"
                            />
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(ref.refId)}
                              className="absolute top-1 left-1 accent-[#5b93d6]"
                              aria-label={`Select reference ${ref.label ?? ref.refId}`}
                            />
                          </div>
                          <div className="flex flex-wrap gap-0.5">
                            {ref.roleLabel && (
                              <span className="text-[8px] uppercase tracking-wider text-[#6e767d] border border-[#232629] rounded px-1">
                                {ref.roleLabel}
                              </span>
                            )}
                            {ref.variantState && (
                              <span className="text-[8px] text-[#4b5158] truncate">{ref.variantState}</span>
                            )}
                            {!ref.approvedForGeneration && (
                              <span className="text-[8px] uppercase tracking-wider text-[#cda24f]">
                                Not approved
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </Collapsible>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
