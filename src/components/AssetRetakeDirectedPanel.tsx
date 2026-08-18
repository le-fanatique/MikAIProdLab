"use client";

import { useState } from "react";
import { generateAssetRetakeDraft } from "@/actions/llm/assetRetake";
import { buildAssetDescriptionFieldCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import type { GeneratedAssetRetakeDraft } from "@/types/llm";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Props = {
  projectId: number;
  assetId: number;
  description: string | null;
  /** LLMW.COMMIT.ADVISORY.1 (B10-f). `assetRetakeDirectedDescriptor.commitAdvisory`,
   * resolved server-side by Asset Detail and passed down as a plain string —
   * this client component never imports a descriptor itself. Shown after a
   * successful Approve, via `ProposalPanel`'s `onApproved`, on the same model
   * as `AssetDescriptionEnhancePanel`. */
  commitAdvisory?: string;
};

/**
 * `asset.retakeDirected` — LLMW.UC3.SURFACE.1 (S4). Sits next to "Enhance
 * Description" on Asset Detail — the surface the ticket names as this
 * component's model — since both write the same `description` column
 * through `updateAssetDescriptionFieldInline`. The free-text director's note
 * (B9a) is this operation's only input, `intent.freeText` — no `intent.mode`
 * (same shape as `shot.retakeDirected`/`ShotRetakeDirectedPanel`).
 *
 * Unlike `ShotRetakeDirectedPanel`, there is no preservation trap and no
 * "unchanged — keeps current value" affordance: `output.require: "all"`
 * guarantees the model always returns a non-empty description, and the
 * single Approve action always writes `mode: "replace"` — a retake replaces,
 * it does not offer to append (`.agents/supervised_task.md`'s own
 * vigilance point).
 */
export default function AssetRetakeDirectedPanel({ projectId, assetId, description, commitAdvisory }: Props) {
  const [freeText, setFreeText] = useState("");
  const [showAdvisory, setShowAdvisory] = useState(false);
  const hasDirection = Boolean(freeText.trim());

  const trigger: ProposalTrigger<GeneratedAssetRetakeDraft> = {
    id: "retake",
    label: "Propose Retake",
    // A directed retake with no direction is not this operation — it is a
    // random regeneration that still costs a model call, same discipline as
    // `ShotRetakeDirectedPanel`'s own trigger.
    disabled: !hasDirection,
    loadingLabel: "Working out a retake...",
    run: async () => {
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("assetId", String(assetId));
      fd.set("freeText", freeText);
      const result = await generateAssetRetakeDraft(fd);
      return result.ok ? { ok: true, draft: result.draft } : { ok: false, error: result.error };
    },
  };

  function approveActions(): ProposalApproveAction<GeneratedAssetRetakeDraft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply Retake",
        run: async (draft) => {
          const args = buildAssetDescriptionFieldCommitArgs({
            assetId,
            projectId,
            field: "description",
            mode: "replace",
            content: draft.description,
          });
          return ACTION_BINDINGS.updateAssetDescriptionFieldInline(...args);
        },
      },
    ];
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Describe what you want changed — silhouette, styling, tone — and the assistant proposes an updated Description for review.
      </p>

      {showAdvisory && commitAdvisory && <p className="text-xs text-[#b89a5a]">{commitAdvisory}</p>}

      <ProposalPanel<GeneratedAssetRetakeDraft>
        triggers={[trigger]}
        freeTextInput={{
          label: "Director's note",
          value: freeText,
          onChange: setFreeText,
          placeholder: "e.g. she reads too masculine, soften the silhouette and the jawline",
        }}
        disabledHint={
          !hasDirection ? (
            <p className="text-xs text-[#4b5158]">
              Add a director&apos;s note above to propose a retake — a retake needs direction.
            </p>
          ) : undefined
        }
        showRegenerate
        cancelLabel="Discard"
        onApproved={commitAdvisory ? () => setShowAdvisory(true) : undefined}
        approveActions={approveActions}
        renderDraft={(draft, setDraft) => (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#b89a5a]">Preview only — nothing is saved until you click Apply Retake.</p>

            <label htmlFor="assetRetakeDescription" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Description
            </label>
            <textarea
              id="assetRetakeDescription"
              value={draft.description}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((prev) => ({ ...prev, description: value }));
              }}
              placeholder={description ?? ""}
              rows={5}
              className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            />
            <p className="text-xs text-[#b89a5a]">This will replace your current description.</p>
          </div>
        )}
      />
    </div>
  );
}
