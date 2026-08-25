"use client";

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { preserveAssetBibleField } from "@/lib/prompts/assetBibleDraft";
import type { GeneratedAssetBibleDraft } from "@/types/llm";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildAssetBibleCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Props = {
  projectId: number;
  assetId: number;
  description: string | null;
  notes: string | null;
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
  // ASSET.LIGHTING.PLACE.1 — never generated here, carried through unchanged
  // by `buildAssetBibleCommitArgs`'s own `existingLighting`.
  lighting: string | null;
  isConfigured: boolean;
};

/**
 * `assetBible.generate` — the first of B5's two most constraining cases
 * (docs/LLM_WORKSPACE_ARCHITECTURE.md §11.2, B5): three generated-and-editable
 * fields, two fields (`description`/`notes`) the commit replaces without
 * generating, `updateAssetDetailsInline`'s full-replacement contract
 * (registry behaviour 3), and — arbitrated 2026-08-14 — a local confirmation
 * that replaces the former `?bibleUpdated=1` navigation now that `router.refresh()`
 * keeps the panel mounted instead of a full page reload.
 */
export default function AssetBibleEnhancePanel({
  projectId,
  assetId,
  description,
  notes,
  visualIdentity: existingVisualIdentity,
  usageRules: existingUsageRules,
  forbiddenVariations: existingForbiddenVariations,
  lighting: existingLighting,
  isConfigured,
}: Props) {
  const [justUpdated, setJustUpdated] = useState(false);

  // LLMW.UNIFY.PANEL.2 — names its operation instead of importing a function
  // for it. The narrowing below is not defensive noise: `runOperation`'s
  // `"object"` values are `string | number`, while all three fields this
  // descriptor declares are `type: "string"`. The impossible branch is
  // refused loudly rather than coerced, exactly as the deleted adapter did.
  const trigger: ProposalTrigger<GeneratedAssetBibleDraft> = {
    id: "enhance",
    label: "Enhance Asset Bible",
    loadingLabel: "Analyzing description and notes...",
    run: async () => {
      const result = await runWorkspaceOperation({ descriptorId: "assetBible.generate", ids: { projectId, assetId } });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "object") return { ok: false, error: "Expected an object-kind result." };
      const { visualIdentity, usageRules, forbiddenVariations } = result.values;
      if (typeof visualIdentity !== "string" || typeof usageRules !== "string" || typeof forbiddenVariations !== "string") {
        return { ok: false, error: "Unexpected non-text value in a string field." };
      }
      return { ok: true, draft: { visualIdentity, usageRules, forbiddenVariations } };
    },
  };

  function mapDraft(draft: GeneratedAssetBibleDraft): GeneratedAssetBibleDraft {
    return {
      visualIdentity: preserveAssetBibleField(existingVisualIdentity ?? "", draft.visualIdentity),
      usageRules: preserveAssetBibleField(existingUsageRules ?? "", draft.usageRules),
      forbiddenVariations: preserveAssetBibleField(existingForbiddenVariations ?? "", draft.forbiddenVariations),
    };
  }

  function approveActions(): ProposalApproveAction<GeneratedAssetBibleDraft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply to Asset Bible",
        run: async (current) => {
          const args = buildAssetBibleCommitArgs({
            assetId,
            projectId,
            description,
            notes,
            existingVisualIdentity,
            existingUsageRules,
            existingForbiddenVariations,
            visualIdentity: current.visualIdentity,
            usageRules: current.usageRules,
            forbiddenVariations: current.forbiddenVariations,
            existingLighting,
          });
          return ACTION_BINDINGS.updateAssetDetailsInline(...args);
        },
      },
    ];
  }

  const textareaClass =
    "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Generate Visual Identity, Usage Rules, and Forbidden Variations from this asset&apos;s Description and Notes.
      </p>

      {justUpdated && <p className="text-xs text-[#6b9e72]">Asset Bible updated.</p>}

      <ProposalPanel<GeneratedAssetBibleDraft>
        isConfigured={isConfigured}
        notConfiguredMessage="LLM is not configured. Configure it in Settings to generate an Asset Bible draft."
        triggers={[trigger]}
        mapDraft={mapDraft}
        showRegenerate
        cancelLabel="Discard"
        onApproved={() => setJustUpdated(true)}
        approveActions={approveActions}
        renderDraft={(draft, setDraft) => (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-[#b89a5a]">
              Preview only — nothing is saved until you click Apply to Asset Bible.
            </p>

            <div className="flex flex-col gap-2">
              <label htmlFor="bibleVisualIdentity" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                Visual Identity
              </label>
              <textarea
                id="bibleVisualIdentity"
                value={draft.visualIdentity}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, visualIdentity: value }));
                }}
                rows={3}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="bibleUsageRules" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                Usage / Performance Rules
              </label>
              <textarea
                id="bibleUsageRules"
                value={draft.usageRules}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, usageRules: value }));
                }}
                rows={3}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="bibleForbiddenVariations" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                Forbidden Variations
              </label>
              <textarea
                id="bibleForbiddenVariations"
                value={draft.forbiddenVariations}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, forbiddenVariations: value }));
                }}
                rows={3}
                className={textareaClass}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}
