"use client";

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { buildAssetPromptCardCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = { text: string };

type Props = {
  projectId: number;
  assetId: number;
  promptCard: string | null;
  isConfigured: boolean;
};

/**
 * `asset.promptCard` — ASSET.PROMPTCARD.2. On the model of
 * `AssetLightingFromImagePanel` (§5 of the ticket: the closest existing
 * panel by shape — text output, review, approval via `ProposalPanel`) minus
 * the reference-image selection that panel needs and this descriptor does
 * not: `asset.promptCard` reads the Asset Bible already in the database, no
 * image involved.
 *
 * Unlike `AssetRetakeDirectedPanel`, the director's note here is optional
 * input, not the whole point of the operation (§3 of the ticket) — the
 * trigger is enabled whenever the LLM is configured, note or no note.
 */
export default function AssetPromptCardPanel({ projectId, assetId, promptCard, isConfigured }: Props) {
  const [freeText, setFreeText] = useState("");

  const trigger: ProposalTrigger<Draft> = {
    id: "proposeCard",
    label: "Propose Prompt Card",
    loadingLabel: "Reading the Asset Bible...",
    run: async () => {
      const result = await runWorkspaceOperation({
        descriptorId: "asset.promptCard",
        ids: { projectId, assetId },
        intent: { freeText: freeText || undefined },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "object") return { ok: false, error: "Expected an object-kind result." };
      const { promptCard: proposed } = result.values;
      if (typeof proposed !== "string") return { ok: false, error: "Unexpected non-text value for the prompt card." };
      return { ok: true, draft: { text: proposed } };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply Prompt Card",
        run: async (draft) => {
          const args = buildAssetPromptCardCommitArgs({ assetId, projectId, promptCard: draft.text });
          return ACTION_BINDINGS.updateAssetPromptCardInline(...args);
        },
      },
    ];
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Read this asset&apos;s Bible and propose a short Prompt Card — 3 to 5 anchors, the approved, engine-facing
        translation used verbatim at composition instead of the long Bible fields.
      </p>

      <ProposalPanel<Draft>
        isConfigured={isConfigured}
        notConfiguredMessage="LLM is not configured. Configure it in Settings to propose a Prompt Card."
        triggers={[trigger]}
        freeTextInput={{
          label: "Director's note (optional)",
          value: freeText,
          onChange: setFreeText,
          placeholder: "e.g. insist on the silhouette, keep the mechanical vocabulary",
        }}
        showRegenerate
        cancelLabel="Discard"
        approveActions={approveActions}
        renderDraft={(draft, setDraft) => (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#b89a5a]">Preview only — nothing is saved until you click Apply Prompt Card.</p>

            <label htmlFor="assetPromptCard" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Prompt Card
            </label>
            <textarea
              id="assetPromptCard"
              value={draft.text}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((prev) => ({ ...prev, text: value }));
              }}
              placeholder={promptCard ?? ""}
              rows={3}
              className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            />
            <p className="text-xs text-[#b89a5a]">This will replace the current Prompt Card.</p>
          </div>
        )}
      />
    </div>
  );
}
