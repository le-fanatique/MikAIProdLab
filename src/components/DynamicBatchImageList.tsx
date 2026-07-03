"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ImageSourcePicker from "@/components/ImageSourcePicker";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { uploadShotSourceFromPanel, uploadAssetSourceFromPanel } from "@/actions/panelUpload";
import { refImageUrl } from "@/lib/refImageUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BatchImageItem = {
  id: string;
  imagePath: string;
  label: string;
  source: "shot" | "asset";
  assetName?: string;
};

export type BatchImageGroup = {
  groupLabel: string;
  items: BatchImageItem[];
};

export type BatchExpansionPreview = {
  batchTitle: string;
  templateChainTitles: string[];
  selectedImageCount: number;
  clonedNodeCount: number;
};

// ---------------------------------------------------------------------------
// Shared key helper (T2 — workflow-keyed sessionStorage)
// ---------------------------------------------------------------------------

export function buildBatchKey(workflowId: string, batchNodeId: string): string {
  return `mikai.dynamicBatchImages.${workflowId}.${batchNodeId}`;
}

export type BatchError =
  | { kind: "detection"; message: string }
  | { kind: "none" };

type Props = {
  batchNodeId: string;
  preview: BatchExpansionPreview | null;
  error: BatchError | null;
  availableImages: BatchImageGroup[];
  selectedImageIds: string[];
  passthroughParams: Record<string, string>;
  basePath: string;
  /** "shot" or "asset" — determines which panel upload server action to use */
  contextType: "shot" | "asset";
  projectId: number;
  workflowId: string;
  shotId?: number;
  sequenceId?: number;
  assetId?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBatchParamKey(batchNodeId: string): string {
  return `batchImages_${batchNodeId}`;
}

/** Build incrementing batch slot labels like "image1", "image2", etc. */
function buildBatchSlotLabels(index: number): string {
  return index === 0 ? "image1" : `image${index + 1}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DynamicBatchImageList({
  batchNodeId,
  preview,
  error,
  availableImages,
  selectedImageIds,
  passthroughParams,
  basePath,
  contextType,
  projectId,
  workflowId,
  shotId,
  sequenceId,
  assetId,
}: Props) {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>(selectedImageIds);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Combine all available images into flat picker items
  const allPickerItems = availableImages.flatMap((g) => g.items);

  // T2 — workflow-keyed sessionStorage
  const ssKey = buildBatchKey(workflowId, batchNodeId);

  // Seed sessionStorage from initial URL params on mount so the hidden input
  // can read a fresh value on the very first Generate click after page load.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ssKey) === null) {
        sessionStorage.setItem(ssKey, selectedImageIds.length > 0 ? selectedImageIds.join(",") : "");
      }
    } catch { /* sessionStorage unavailable */ }
  }, [ssKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function pushState(newIds: string[]) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (!k.startsWith("batchImages_") && k !== "jobId") params.set(k, v);
    }
    const urlKey = buildBatchParamKey(batchNodeId);
    if (newIds.length > 0) params.set(urlKey, newIds.join(","));
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });

    // Sync sessionStorage immediately so DynamicBatchFormSync can read it
    // at submit time before router.replace has updated window.location.search.
    try {
      if (newIds.length > 0) {
        sessionStorage.setItem(ssKey, newIds.join(","));
      } else {
        sessionStorage.removeItem(ssKey);
      }
    } catch {
      // sessionStorage unavailable — ignore, URL-based sync is fallback.
    }
  }

  // T1 — Clear Images
  function handleClear() {
    setSelected([]);
    pushState([]);
  }

  function handleRemove(id: string) {
    const next = selected.filter((s) => s !== id);
    setSelected(next);
    pushState(next);
  }

  function handleAdd(id: string) {
    if (selected.includes(id)) return;
    const next = [...selected, id];
    setSelected(next);
    pushState(next);
    setPickerOpen(false);
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...selected];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setSelected(next);
    pushState(next);
  }

  function handleMoveDown(index: number) {
    if (index === selected.length - 1) return;
    const next = [...selected];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setSelected(next);
    pushState(next);
  }

  // Get label for a selected image id
  function getLabel(id: string): string {
    const img = allPickerItems.find((i) => i.id === id);
    return img ? img.label : id;
  }

  function getRoleLabel(id: string): string | undefined {
    for (const group of availableImages) {
      const img = group.items.find((i) => i.id === id);
      if (img) return group.groupLabel;
    }
    return undefined;
  }

  function getImagePath(id: string): string {
    const img = allPickerItems.find((i) => i.id === id);
    return img ? img.imagePath : "";
  }

  // --- Error state ---
  if (error && error.kind === "detection") {
    return (
      <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2.5">
        <p className="text-xs text-[#cf7b6b]">{error.message}</p>
      </div>
    );
  }

  // --- Preview ---
  const hasPreview = preview && preview.selectedImageCount >= 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Section label */}
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Dynamic Image Batch
        </p>
        <p className="text-[10px] text-[#4b5158]">
          These images will be expanded into the Dynamic Batch at generation time.
        </p>
      </div>

      {/* T5 — Runtime Expansion Preview (polished) */}
      {hasPreview && preview!.batchTitle && (
        <div className="flex flex-col gap-2 rounded border border-[#2a2f35] bg-[#131518] px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#5a6168]">
            Runtime Expansion Preview
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[#5a6168]">Batch node</span>
              <span className="text-xs text-[#a4abb2]">{preview!.batchTitle}</span>
            </div>
            {preview!.templateChainTitles.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#5a6168]">Template chain</span>
                <span className="text-xs text-[#a4abb2]">
                  {preview!.templateChainTitles.join(" → ")}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[#5a6168]">Selected images</span>
              <span className="text-xs text-[#e7e9ec]">{selected.length}</span>
            </div>
            {selected.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#5a6168]">Batch inputs</span>
                <span className="text-xs font-mono text-[#8fbbe8]">
                  {selected.map((_, i) => buildBatchSlotLabels(i)).join(", ")}
                </span>
              </div>
            )}
            {preview!.clonedNodeCount > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#5a6168]">Runtime clones</span>
                <span className="text-xs text-[#a4abb2]">{preview!.clonedNodeCount} nodes</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* T4 — Selected images list with improved reorder feedback */}
      {selected.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Selected Images
            </p>
            <p className="text-[10px] text-[#4b5158]">
              Images are sent in order: {selected.map((_, i) => buildBatchSlotLabels(i)).join(", ")}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {selected.map((id, index) => (
              <div
                key={id}
                className="flex items-center gap-2 rounded border border-[#232629] bg-[#1a1d20] px-2 py-1.5"
              >
                <span className="text-[10px] text-[#5a6168] font-mono w-16 shrink-0 text-left">
                  {buildBatchSlotLabels(index)}
                </span>
                <div className="w-7 h-7 rounded overflow-hidden bg-[#141618] shrink-0 flex items-center justify-center">
                  <ThumbnailHoverPreview
                    src={refImageUrl(getImagePath(id))}
                    alt={getLabel(id)}
                    previewSize={320}
                    className="w-full h-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={refImageUrl(getImagePath(id))}
                      alt={getLabel(id)}
                      className="w-full h-full object-contain"
                    />
                  </ThumbnailHoverPreview>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs text-[#a4abb2] truncate">
                    {getLabel(id)}
                  </span>
                  {getRoleLabel(id) && (
                    <span className="text-[10px] text-[#4b5158] truncate">
                      {getRoleLabel(id)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="text-[10px] text-[#5a6168] hover:text-[#e7e9ec] transition-colors px-1.5 py-1 rounded hover:bg-[#2a2f35] disabled:opacity-20 disabled:cursor-default"
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === selected.length - 1}
                    className="text-[10px] text-[#5a6168] hover:text-[#e7e9ec] transition-colors px-1.5 py-1 rounded hover:bg-[#2a2f35] disabled:opacity-20 disabled:cursor-default"
                    title="Move Down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(id)}
                    className="text-[10px] text-[#6e767d] hover:text-[#cf7b6b] transition-colors px-1.5 py-0.5 rounded hover:bg-[#2a1a1a]"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* T3 — Improved warning message */}
      {selected.length === 0 && (
        <div className="rounded border border-[#5c4a24]/60 bg-[#141008] px-3 py-2">
          <p className="text-xs text-[#b89a5a]">
            Add at least one image to the Dynamic Batch before generating.
          </p>
        </div>
      )}

      {/* T1 + Add image section */}
      <div className="flex flex-col gap-2">
        {/* T1 — Clear Images button (only visible when images selected) */}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="self-start rounded border border-[#3a2820] text-[#cf7b6b] px-2.5 py-1 text-xs hover:border-[#5a3830] hover:text-[#e89478] hover:bg-[#2a1210] transition-colors"
          >
            Clear Images
          </button>
        )}
        {!pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Add Image
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#6e767d]">Select from available images:</span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
              >
                Cancel
              </button>
            </div>
            <ImageSourcePicker
              groups={availableImages.map((g) => ({
                groupLabel: g.groupLabel,
                items: g.items.map((i) => ({
                  id: i.id,
                  imagePath: i.imagePath,
                  label: i.label,
                })),
              }))}
              selectedId=""
              onSelect={handleAdd}
            />
          </div>
        )}
      </div>

      {/* Upload form */}
      <form
        action={contextType === "shot" ? uploadShotSourceFromPanel : uploadAssetSourceFromPanel}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="projectId" value={String(projectId)} />
        {contextType === "shot" && (
          <>
            <input type="hidden" name="shotId" value={String(shotId ?? "")} />
            <input type="hidden" name="sequenceId" value={String(sequenceId ?? "")} />
          </>
        )}
        {contextType === "asset" && (
          <input type="hidden" name="assetId" value={String(assetId ?? "")} />
        )}
        <input type="hidden" name="nodeId" value={batchNodeId} />
        <input
          type="hidden"
          name="returnTo"
          value={(() => {
            const p = new URLSearchParams();
            for (const [k, v] of Object.entries(passthroughParams)) {
              if (!k.startsWith("batchImages_") && k !== "jobId") p.set(k, v);
            }
            const key = buildBatchParamKey(batchNodeId);
            if (selected.length > 0) p.set(key, selected.join(","));
            return `${basePath}?${p.toString()}`;
          })()}
        />
        <input
          type="file"
          name="imageFile"
          accept={[".jpg", ".jpeg", ".png", ".webp", ".gif", "image/jpeg", "image/png", "image/webp", "image/gif"].join(",")}
          className="flex-1 min-w-0 text-xs text-[#6e767d] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#1a1d20] file:px-2 file:py-1 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
        />
        <button
          type="submit"
          className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Upload Image
        </button>
      </form>
    </div>
  );
}