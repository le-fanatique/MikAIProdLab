"use client";

import { generateSequencePromptDraft } from "@/actions/llm/sequencePrompt";
import type { SequencePromptAssistMode } from "@/lib/prompts/sequence-prompt-from-context";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildUpdateSequencePromptHiddenFields } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = { mode: SequencePromptAssistMode; text: string };

type Props = {
  projectId: number;
  sequenceId: number;
  currentSequencePrompt: string | null;
  returnTo: string;
};

const MODES: SequencePromptAssistMode[] = ["generate", "enhance", "rewrite", "shorten", "expand"];

const DRAFT_LABELS: Record<SequencePromptAssistMode, string> = {
  generate: "Generated Draft",
  enhance: "Enhanced Draft",
  rewrite: "Rewritten Draft",
  shorten: "Shortened Draft",
  expand: "Expanded Draft",
};

const MODE_BUTTON_LABELS: Record<SequencePromptAssistMode, string> = {
  generate: "Generate Draft",
  enhance: "Enhance",
  rewrite: "Rewrite",
  shorten: "Shorten",
  expand: "Expand",
};

/**
 * `sequencePrompt.assist` — same shape as `shotPrompt.assist` (B5): five
 * modes, `response: "redirectOnly"`, `append` pre-computed client-side.
 * Confirms the form the two most constraining cases already fixed; no
 * change to `proposalCommit.ts` or `ProposalPanel` was needed for this
 * entry.
 */
export default function SequencePromptLLMAssistPanel({
  projectId,
  sequenceId,
  currentSequencePrompt,
  returnTo,
}: Props) {
  const hasExistingPrompt = Boolean(currentSequencePrompt?.trim());

  const triggers: ProposalTrigger<Draft>[] = MODES.map((mode) => ({
    id: mode,
    label: MODE_BUTTON_LABELS[mode],
    disabled: mode !== "generate" && !hasExistingPrompt,
    loadingLabel: `Generating ${MODE_BUTTON_LABELS[mode].toLowerCase()}...`,
    run: async () => {
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("sequenceId", String(sequenceId));
      fd.set("mode", mode);
      const result = await generateSequencePromptDraft(fd);
      return result.ok ? { ok: true, draft: { mode, text: result.draft } } : { ok: false, error: result.error };
    },
  }));

  function approveActions(draft: Draft): ProposalApproveAction<Draft>[] {
    const appendedValue = hasExistingPrompt
      ? `${currentSequencePrompt!.trim()}\n\n${draft.text.trim()}`
      : draft.text.trim();

    return [
      {
        kind: "redirectOnly",
        id: "replace",
        label: "Replace Prompt",
        action: ACTION_BINDINGS.updateSequencePrompt,
        hiddenFields: (current) =>
          buildUpdateSequencePromptHiddenFields({
            projectId,
            sequenceId,
            sequencePrompt: current.text,
            returnTo,
          }),
      },
      {
        kind: "redirectOnly",
        id: "append",
        label: "Append to Prompt",
        action: ACTION_BINDINGS.updateSequencePrompt,
        hiddenFields: () =>
          buildUpdateSequencePromptHiddenFields({
            projectId,
            sequenceId,
            sequencePrompt: appendedValue,
            returnTo,
          }),
      },
    ];
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        LLM Assist
      </p>

      <ProposalPanel<Draft>
        triggers={triggers}
        approveActions={approveActions}
        hints={
          !hasExistingPrompt ? (
            <p className="text-xs text-[#4b5158]">
              Enhance, Rewrite, Shorten and Expand require an existing Sequence Prompt.
            </p>
          ) : undefined
        }
        renderDraft={(draft) => (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              {DRAFT_LABELS[draft.mode]}
            </p>
            <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
              <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">{draft.text}</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}
