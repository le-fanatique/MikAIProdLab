"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadShotSourceFromPanel } from "@/actions/panelUpload";
import ImageSourcePicker from "@/components/ImageSourcePicker";

export type ShotPanelImageOption = {
  id: string;
  imagePath: string;
  label: string;
  role: string | null | undefined;
  source: "shot" | "asset";
  assetName?: string;
};

export type ShotPanelImageNode = {
  nodeId: string;
  displayLabel: string;
  isDup: boolean;
  initialValue: string;
  badgeLabel: string | null;
  images: ShotPanelImageOption[];
};

type Props = {
  nodes: ShotPanelImageNode[];
  passthroughParams: Record<string, string>;
  basePath: string;
  projectId: number;
  shotId: number;
  sequenceId: number;
};

export default function ShotPanelImagePreviewForm({
  nodes,
  passthroughParams,
  basePath,
  projectId,
  shotId,
  sequenceId,
}: Props) {
  const router = useRouter();

  const [selectedByNode, setSelectedByNode] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const node of nodes) {
      init[node.nodeId] = node.initialValue;
    }
    return init;
  });

  if (nodes.length === 0) return null;

  function buildUploadReturnTo(nodeId: string): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (k !== "jobId" && k !== `imageNode_${nodeId}`) {
        params.set(k, v);
      }
    }
    return `${basePath}?${params.toString()}`;
  }

  function handleSelect(nodeId: string, imageId: string) {
    const newSelected = { ...selectedByNode, [nodeId]: imageId };
    setSelectedByNode(newSelected);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (!k.startsWith("imageNode_") && k !== "jobId") params.set(k, v);
    }
    for (const [nid, id] of Object.entries(newSelected)) {
      if (id) params.set(`imageNode_${nid}`, id);
    }
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      {nodes.map((node) => {
        const { nodeId, displayLabel, isDup, badgeLabel, images } = node;
        const currentValue = selectedByNode[nodeId] ?? "";

        const shotImages = images.filter((img) => img.source === "shot");
        const assetImages = images.filter((img) => img.source === "asset");

        const shotItems = shotImages.map((img) => ({
          id: img.id,
          imagePath: img.imagePath,
          label: img.role ? img.role : img.label,
        }));

        const assetItems = assetImages.map((img) => ({
          id: img.id,
          imagePath: img.imagePath,
          label: img.assetName
            ? `${img.assetName}${img.role ? " · " + img.role : ""}`
            : (img.role ?? img.label),
        }));

        return (
          <div key={nodeId} className="flex flex-col gap-2">
            {/* Label + badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#e7e9ec]">{displayLabel}</span>
              {badgeLabel && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2535] text-[#5b93d6] border border-[#5b93d6]/20">
                  {badgeLabel}
                </span>
              )}
              {isDup && (
                <span className="text-[10px] font-mono text-[#3a4046]">node {nodeId}</span>
              )}
            </div>

            {images.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[#4b5158]">No sources available.</p>
                <form action={uploadShotSourceFromPanel} className="flex items-center gap-2">
                  <input type="hidden" name="shotId" value={String(shotId)} />
                  <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                  <input type="hidden" name="projectId" value={String(projectId)} />
                  <input type="hidden" name="nodeId" value={nodeId} />
                  <input type="hidden" name="returnTo" value={buildUploadReturnTo(nodeId)} />
                  <input
                    type="file"
                    name="imageFile"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                    className="flex-1 min-w-0 text-xs text-[#6e767d] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#1a1d20] file:px-2 file:py-1 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                  >
                    Upload Source
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ImageSourcePicker
                  groups={[
                    { groupLabel: "Shot Sources", items: shotItems },
                    { groupLabel: "Cast Sources", items: assetItems },
                  ]}
                  selectedId={currentValue}
                  onSelect={(id) => handleSelect(nodeId, id)}
                />
                {/* Upload form — independent server action, not nested */}
                <form action={uploadShotSourceFromPanel} className="flex items-center gap-2 mt-1">
                  <input type="hidden" name="shotId" value={String(shotId)} />
                  <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                  <input type="hidden" name="projectId" value={String(projectId)} />
                  <input type="hidden" name="nodeId" value={nodeId} />
                  <input type="hidden" name="returnTo" value={buildUploadReturnTo(nodeId)} />
                  <input
                    type="file"
                    name="imageFile"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                    className="flex-1 min-w-0 text-xs text-[#6e767d] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#1a1d20] file:px-2 file:py-1 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                  >
                    Upload Source
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
