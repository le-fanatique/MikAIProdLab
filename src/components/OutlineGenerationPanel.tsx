"use client";

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildApplyGeneratedOutlineArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = { outline: string };

type Props = {
  projectId: number;
  pitch: string | null;
  story: string | null;
  existingOutline: string | null;
  isConfigured: boolean;
};

/**
 * `outline.generate` — same shape as `story.generate` (`response:
 * "returnValue"`, positional commit), plus one intent parameter
 * (`targetSections`) that stays in this wrapper: the "ask" surface, not the
 * proposal engine.
 */
export default function OutlineGenerationPanel({
  projectId,
  pitch,
  story: _story,
  existingOutline,
  isConfigured,
}: Props) {
  const [targetSections, setTargetSections] = useState("");
  const noPitch = isConfigured && !pitch?.trim();

  const trigger: ProposalTrigger<Draft> = {
    id: "generate",
    label: "Generate Outline Draft",
    disabled: noPitch,
    loadingLabel: "Generating outline — this may take a few seconds...",
    // LLMW.UNIFY.PANEL.2 — names its operation instead of importing a
    // function for it. `targetSections` travels through `intent.parameters`,
    // the descriptor's own declared shape; an invalid or absent value
    // (`NaN`) is dropped by the runner's own `normalizeIntentParameters`,
    // the same behaviour the deleted adapter relied on. The narrowing below
    // is not defensive noise: `runOperation`'s `"object"` values are
    // `string | number`, while this descriptor declares its one field
    // `type: "string"`. The impossible branch is refused loudly rather than
    // coerced, exactly as the deleted adapter did.
    run: async () => {
      const rawSections = parseInt(targetSections, 10);
      const result = await runWorkspaceOperation({
        descriptorId: "outline.generate",
        ids: { projectId },
        intent: { parameters: { targetSections: rawSections } },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "object") return { ok: false, error: "Expected an object-kind result." };
      const { outline } = result.values;
      if (typeof outline !== "string") return { ok: false, error: "Unexpected non-text value for the outline." };
      return { ok: true, draft: { outline } };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply Outline",
        run: (draft) => ACTION_BINDINGS.applyGeneratedOutline(...buildApplyGeneratedOutlineArgs(projectId, draft.outline)),
      },
    ];
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Target sections
          </label>
          <input
            type="number"
            min={2}
            max={20}
            placeholder="Auto"
            value={targetSections}
            onChange={(e) => setTargetSections(e.target.value)}
            className="w-24 rounded border border-[#2c3035] bg-[#141618] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 focus:outline-none focus:border-[#3a4046] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>

      <ProposalPanel<Draft>
        isConfigured={isConfigured}
        notConfiguredMessage={
          <>
            LLM provider not configured.{" "}
            <a href="/settings" className="underline hover:text-[#6e767d]">
              See Settings.
            </a>
          </>
        }
        triggers={[trigger]}
        disabledHint={noPitch ? <p className="text-xs text-[#4b5158]">Add a pitch first.</p> : undefined}
        approveActions={approveActions}
        renderDraft={(draft) => (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-[#2c3035] bg-[#141618] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
                Generated Outline — Preview
              </p>
              <pre className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed font-mono">{draft.outline}</pre>
            </div>
            {existingOutline && (
              <p className="text-xs text-amber-600">Applying will replace your existing outline.</p>
            )}
          </div>
        )}
      />
    </div>
  );
}
