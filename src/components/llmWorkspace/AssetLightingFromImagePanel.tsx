"use client";

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildAssetLightingCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import { resolveDefaultReferenceImageSelection } from "@/lib/llmWorkspace/resolveDefaultReferenceImageSelection";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";

type ReferenceImage = { id: number; label: string | null; imagePath: string; approvedForGeneration: boolean };

type Draft = { text: string };

type Props = {
  projectId: number;
  assetId: number;
  /** Every reference image this Asset has — same scope `ASSET.REFERENCE_IMAGES`
   * (the descriptor's own declared image source) resolves from, unfiltered by
   * approval. ASSET.LIGHTING.PLACE.2 — this panel now always renders (the
   * caller no longer gates it on approval, a filter this image family never
   * had); an empty list is rendered here as an explicit empty state rather
   * than an empty, unusable selector. `approvedForGeneration` — added by
   * ASSET.LIGHTING.PLACE.3 — decides only the default checkbox state
   * (`resolveDefaultReferenceImageSelection`), never which images appear
   * here or whether the card renders: every image stays offered and
   * selectable regardless of approval. */
  referenceImages: ReferenceImage[];
  minCount: number;
  maxCount: number;
  isConfigured: boolean;
};

/**
 * `lighting.fromImage` — ASSET.LIGHTING.PLACE.1 §4b. The second of §5.9's
 * three ways to fill the Asset-level `lighting` field, previously reachable
 * only at the bench. `intent: {}` — the descriptor declares no free text, so
 * unlike `AssetRetakeDirectedPanel` this panel has no director's note input;
 * the only run input beyond the anchor is the image selection below, which
 * `ProposalPanel` has no built-in concept of (`hints` carries it instead, the
 * same slot `AssetDescriptionEnhancePanel` uses for its "limited context"
 * warning).
 */
export default function AssetLightingFromImagePanel({
  projectId,
  assetId,
  referenceImages,
  minCount,
  maxCount,
  isConfigured,
}: Props) {
  // Default selection — ASSET.LIGHTING.PLACE.3 §1c, replacing PLACE.1's
  // "first `maxCount` images" default (arbitrary on a twelve-image Asset).
  // `resolveDefaultReferenceImageSelection` pre-checks the approved images
  // alone (capped at `maxCount`), or nothing if none is approved. This is
  // NOT the approval gate PLACE.2 removed: approval decides only what
  // starts pre-checked here, never whether the card renders or which images
  // this grid offers — every image stays selectable by hand, approved or
  // not, exactly as before.
  const [selectedIds, setSelectedIds] = useState<number[]>(
    resolveDefaultReferenceImageSelection(referenceImages, maxCount)
  );

  function toggleImage(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }

  const selectionValid = selectedIds.length >= minCount && selectedIds.length <= maxCount;

  const trigger: ProposalTrigger<Draft> = {
    id: "describe",
    label: "Describe Lighting From Reference",
    disabled: !selectionValid,
    loadingLabel: "Looking at the reference image(s)...",
    run: async () => {
      const result = await runWorkspaceOperation({
        descriptorId: "lighting.fromImage",
        ids: { projectId, assetId },
        images: { selectedIds },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "text") return { ok: false, error: "Expected a text-kind result." };
      return { ok: true, draft: { text: result.text } };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply Lighting",
        run: async (draft) => {
          const args = buildAssetLightingCommitArgs({ assetId, projectId, lighting: draft.text });
          return ACTION_BINDINGS.updateAssetLightingInline(...args);
        },
      },
    ];
  }

  // ASSET.LIGHTING.PLACE.2 §4a — `minCount: 1` means an Asset with no
  // reference image at all cannot run this operation. Rendered as an
  // explicit empty state (a sentence, not a disabled checkbox list with a
  // button underneath) rather than letting the card render its normal,
  // unusable-with-zero-options body.
  if (referenceImages.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#6e767d] leading-relaxed">
          Read the lighting visible in one or more of this asset&apos;s reference images and propose it as the Lighting field.
        </p>
        <p className="text-xs text-[#4b5158]">
          Add a reference image to this asset first — this operation needs at least one to read.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Read the lighting visible in one or more of this asset&apos;s reference images and propose it as the Lighting field.
      </p>

      <ProposalPanel<Draft>
        isConfigured={isConfigured}
        notConfiguredMessage="LLM is not configured. Configure it in Settings to describe lighting from a reference image."
        triggers={[trigger]}
        showRegenerate
        cancelLabel="Discard"
        approveActions={approveActions}
        hints={
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              {`Reference images (${selectedIds.length} selected, ${minCount}–${maxCount} required)`}
            </p>
            {/* ASSET.LIGHTING.PLACE.3 §1a — `grid-cols-5`, measured against
             * the previous `grid-cols-3`: a tile on a 1126px-wide panel
             * measured 371x391px (area ≈137.9k px²); five columns at the
             * same `gap-1.5` measure ≈220x~230px (area ≈47.9k px²) — close
             * to the requested third of the surface (ratio ≈2.9x), the
             * nearest available column count (four columns only reaches
             * ≈1.8x, six overshoots to ≈4.1x). */}
            <div className="grid grid-cols-5 gap-1.5">
              {referenceImages.map((image) => {
                const isSelected = selectedIds.includes(image.id);
                const label = image.label ?? `Reference #${image.id}`;
                return (
                  // ASSET.LIGHTING.PLACE.3 §1b — `ThumbnailHoverPreview`
                  // (`src/components/ThumbnailHoverPreview.tsx`), the same
                  // wrapper `ImageSourcePicker` uses. `focusable` is left at
                  // its default `false`: the wrapped `<button>` below is
                  // already a focusable descendant, so setting it `true`
                  // would add a second tab stop for the same thumbnail.
                  <ThumbnailHoverPreview
                    key={image.id}
                    src={refImageUrl(image.imagePath)}
                    alt={label}
                    className="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => toggleImage(image.id)}
                      title={label}
                      className={[
                        "relative flex flex-col w-full rounded overflow-hidden text-left transition-colors",
                        isSelected
                          ? "border-2 border-[#5b93d6] bg-[#141e2b]"
                          : "border-2 border-[#232629] bg-[#1a1d20] hover:border-[#3a4046] hover:bg-[#212529]",
                      ].join(" ")}
                    >
                      <div className="aspect-square w-full bg-[#141618] flex items-center justify-center overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={refImageUrl(image.imagePath)}
                          alt={label}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="px-1 pt-0.5 pb-1">
                        <p className="text-[10px] text-[#6e767d] truncate leading-snug">{label}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#5b93d6] flex items-center justify-center">
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
                            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </ThumbnailHoverPreview>
                );
              })}
            </div>
          </div>
        }
        disabledHint={
          !selectionValid ? (
            <p className="text-xs text-[#4b5158]">
              {`Select between ${minCount} and ${maxCount} reference images to describe their lighting.`}
            </p>
          ) : undefined
        }
        renderDraft={(draft, setDraft) => (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#b89a5a]">Preview only — nothing is saved until you click Apply Lighting.</p>

            <label htmlFor="assetLightingFromImage" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Lighting
            </label>
            <textarea
              id="assetLightingFromImage"
              value={draft.text}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((prev) => ({ ...prev, text: value }));
              }}
              rows={4}
              className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            />
            <p className="text-xs text-[#b89a5a]">This will replace the current Lighting field.</p>
          </div>
        )}
      />
    </div>
  );
}
