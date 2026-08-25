"use client";

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildAssetLightingCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type ReferenceImage = { id: number; label: string | null };

type Draft = { text: string };

type Props = {
  projectId: number;
  assetId: number;
  /** Every reference image this Asset has — same scope `ASSET.REFERENCE_IMAGES`
   * (the descriptor's own declared image source) resolves from, unfiltered by
   * approval. The caller decides *whether* this panel renders at all (gated
   * on at least one approved image existing); which images are offered for
   * selection inside it is a separate question, answered by the descriptor's
   * own source rather than narrowed again here. */
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
  // Default selection: as many of the Asset's own reference images as the
  // descriptor allows, in the order the page already queried them
  // (`orderIndex`) — the same "no click-order to express" limitation
  // `BenchRunPanel`'s own images selector documents, accepted here for the
  // same reason: nothing downstream reads a checked order, only the
  // resulting `selectedIds` array's own order, which is this list's display
  // order.
  const [selectedIds, setSelectedIds] = useState<number[]>(
    referenceImages.slice(0, maxCount).map((image) => image.id)
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
            <div className="flex flex-col gap-1.5">
              {referenceImages.map((image) => (
                <label key={image.id} className="flex items-center gap-2 text-xs text-[#a4abb2]">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(image.id)}
                    onChange={() => toggleImage(image.id)}
                  />
                  {image.label ?? `Reference #${image.id}`}
                </label>
              ))}
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
