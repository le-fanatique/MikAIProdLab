"use client";

// ---------------------------------------------------------------------------
// BenchRunPanel.tsx — LLMW.BENCH.RUN.1 (B6c1), §4.5
//
// A thin wrapper around `ProposalPanel`: no business logic here — it calls
// the two Server Actions (`runBenchOperation`, `commitBenchProposal`) and
// renders the fields `plan` and `outputFields` (both computed server-side)
// already describe (`.claude/rules/frontend.md`, "Keep business logic and
// durable decisions out of Client Components").
//
// The bench's Approve is `replace` mode only (§3.2 of the ticket): no
// Append control exists here, and never will for this panel — see the
// executor report for why.
// ---------------------------------------------------------------------------

import { runBenchOperation, commitBenchProposal } from "@/actions/llmWorkspace/bench";
import { buildBenchDraftFields, type BenchCommitPlan, type ObjectOutputFields } from "@/lib/llmWorkspace/benchRun";
import { buildUpdateSequencePromptHiddenFields, buildUpdateShotPromptHiddenFields } from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import type { AnchorIds } from "@/lib/llmWorkspace/runner";
import type { BenchSearchParams } from "@/lib/llmWorkspace/bench";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = Record<string, string>;

type Props = {
  templateId: string;
  ids: AnchorIds;
  searchParams: BenchSearchParams;
  plan: BenchCommitPlan;
  outputFields: ObjectOutputFields;
  returnTo: string;
};

export default function BenchRunPanel({ templateId, ids, searchParams, plan, outputFields, returnTo }: Props) {
  const trigger: ProposalTrigger<Draft> = {
    id: "run",
    label: "Run",
    loadingLabel: "Running…",
    run: async () => {
      const result = await runBenchOperation({ templateId, ids, searchParams });
      if (!result.ok) return result;
      const draft = Object.fromEntries(
        buildBenchDraftFields(outputFields, result.values).map(({ field, value }) => [field, value])
      );
      return { ok: true, draft };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    if (plan.kind === "returnValue") {
      return [
        {
          kind: "returnValue",
          id: "approve",
          label: "Approve",
          run: (current) => commitBenchProposal({ templateId, ids, values: current }),
        },
      ];
    }

    if (plan.kind === "redirectOnly" && plan.actionId === "updateShotPrompt") {
      return [
        {
          kind: "redirectOnly",
          id: "approve",
          label: "Approve",
          action: ACTION_BINDINGS.updateShotPrompt,
          hiddenFields: (draft) =>
            buildUpdateShotPromptHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              shotId: ids.shotId as number,
              shotPrompt: draft.shotPrompt ?? "",
              returnTo,
            }),
        },
      ];
    }

    if (plan.kind === "redirectOnly" && plan.actionId === "updateSequencePrompt") {
      return [
        {
          kind: "redirectOnly",
          id: "approve",
          label: "Approve",
          action: ACTION_BINDINGS.updateSequencePrompt,
          hiddenFields: (draft) =>
            buildUpdateSequencePromptHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              sequencePrompt: draft.sequencePrompt ?? "",
              returnTo,
            }),
        },
      ];
    }

    // `plan.kind === "unsupported"` — no Approve action; the refusal reason
    // is rendered under the fields instead (below).
    return [];
  }

  const textareaClass =
    "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed";

  return (
    <ProposalPanel<Draft>
      triggers={[trigger]}
      // Supervisor review retake (post-B6c1): an `unsupported` plan (the
      // `entitySet` batch descriptor) is known before Run ever runs — surface
      // it here too, not only after a Run that already paid for a real model
      // call, so the user learns Approve is impossible without spending one.
      // Run itself stays offered either way (§3.2 of the ticket).
      hints={plan.kind === "unsupported" ? <p className="text-xs text-[#cf7b6b]">{plan.reason}</p> : undefined}
      showRegenerate
      regenerateLabel="Redo"
      approveActions={approveActions}
      renderDraft={(draft, setDraft) => (
        <div className="flex flex-col gap-4">
          {outputFields.map((f) => (
            <div key={f.field} className="flex flex-col gap-2">
              <label htmlFor={`bench-${f.field}`} className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                {f.field}
              </label>
              <textarea
                id={`bench-${f.field}`}
                value={draft[f.field] ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, [f.field]: value }));
                }}
                rows={5}
                className={textareaClass}
              />
            </div>
          ))}

          {plan.kind === "unsupported" && <p className="text-xs text-[#cf7b6b]">{plan.reason}</p>}
        </div>
      )}
    />
  );
}
