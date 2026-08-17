"use client";

import { useState } from "react";
import { generateAssetDescriptionOnlyDraft, generateAssetNotesOnlyDraft } from "@/actions/llm/assetDescription";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildAssetDescriptionFieldCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Field = "description" | "notes";
type Draft = { text: string };

type Props = {
  projectId: number;
  assetId: number;
  hasExisting: boolean;
  isConfigured: boolean;
  hasUsageContext: boolean;
  /** LLMW.COMMIT.ADVISORY.1 (B10-f). `descriptor.commitAdvisory`, resolved
   * server-side by the Asset Detail page and passed down as a plain string —
   * this client component never imports a descriptor itself. Shown after a
   * successful Approve, via `ProposalPanel`'s `onApproved`. */
  commitAdvisory?: string;
};

const FIELD_LABEL: Record<Field, string> = { description: "Description", notes: "Notes" };
const FIELD_ACTION: Record<Field, string> = { description: "Enhance Description", notes: "Enhance Notes" };

/**
 * `assetDescription.generate` / `assetNotes.generate` — `response:
 * "returnValue"`, two Approve variants (Replace/Append) selecting the same
 * `updateAssetDescriptionFieldInline` binding's own `mode` argument, per
 * `proposalCommit.ts`'s `buildAssetDescriptionFieldCommitArgs`. Arbitrated
 * 2026-08-14: the stale-value defect (no refresh after commit, a local
 * "replaced"/"appended" badge left standing instead) is fixed by
 * `ProposalPanel`'s shared post-Approve `router.refresh()` — the badge is
 * removed, not replaced, because the page's own re-render now carries the
 * up-to-date value. This component's previous local `busyRef` (guarding
 * both generate and apply against a double click) is replaced by
 * `ProposalPanel`'s own `busyRef`, which guards both `runTrigger` (generate)
 * and `handleApprove` (apply) the same way, applied once inside the shared
 * engine instead of duplicated per panel.
 */
function FieldEnhancePanel({ field, projectId, assetId, hasExisting, isConfigured, hasUsageContext, commitAdvisory }: Props & { field: Field }) {
  const [showAdvisory, setShowAdvisory] = useState(false);

  const trigger: ProposalTrigger<Draft> = {
    id: field,
    label: FIELD_ACTION[field],
    loadingLabel: "Analyzing asset context...",
    run: async () => {
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("assetId", String(assetId));
      const result = field === "description" ? await generateAssetDescriptionOnlyDraft(fd) : await generateAssetNotesOnlyDraft(fd);
      return result.ok ? { ok: true, draft: { text: result.draft } } : { ok: false, error: result.error };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    const runFor = (mode: "replace" | "append") => async (draft: Draft) => {
      const args = buildAssetDescriptionFieldCommitArgs({ assetId, projectId, field, mode, content: draft.text });
      return ACTION_BINDINGS.updateAssetDescriptionFieldInline(...args);
    };
    return [
      { kind: "returnValue", id: "replace", label: `Replace ${FIELD_LABEL[field]}`, run: runFor("replace") },
      { kind: "returnValue", id: "append", label: `Append to ${FIELD_LABEL[field]}`, run: runFor("append") },
    ];
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        {`Generate ${FIELD_LABEL[field].toLowerCase()} from this asset's story, outline, sequence, and shot context.`}
      </p>

      {showAdvisory && commitAdvisory && <p className="text-xs text-[#b89a5a]">{commitAdvisory}</p>}

      <ProposalPanel<Draft>
        isConfigured={isConfigured}
        notConfiguredMessage={`LLM is not configured. Configure it in Settings to generate asset ${FIELD_LABEL[field].toLowerCase()}.`}
        triggers={[trigger]}
        showRegenerate
        cancelLabel="Discard"
        approveActions={approveActions}
        onApproved={commitAdvisory ? () => setShowAdvisory(true) : undefined}
        hints={
          isConfigured && !hasUsageContext ? (
            <p className="text-xs text-[#b89a5a]">
              Limited context: this asset is not assigned to any sequence or shot yet. The draft may be generic.
            </p>
          ) : undefined
        }
        renderDraft={(draft) => (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              {`${FIELD_LABEL[field]} Draft`}
            </p>
            <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
              <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">{draft.text}</p>
            </div>
            {hasExisting && (
              <p className="text-xs text-[#b89a5a]">{`This will replace your current ${FIELD_LABEL[field].toLowerCase()}.`}</p>
            )}
          </div>
        )}
      />
    </div>
  );
}

export default function AssetDescriptionEnhancePanel(props: Omit<Props, "hasExisting"> & { hasExistingDescription: boolean }) {
  return <FieldEnhancePanel field="description" {...props} hasExisting={props.hasExistingDescription} />;
}

export function AssetNotesEnhancePanel(props: Omit<Props, "hasExisting"> & { hasExistingNotes: boolean }) {
  return <FieldEnhancePanel field="notes" {...props} hasExisting={props.hasExistingNotes} />;
}
