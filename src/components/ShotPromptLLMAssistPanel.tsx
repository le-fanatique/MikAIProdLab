"use client";

import { generateShotPromptDraft } from "@/actions/llm/shotPrompt";
import type { ShotPromptAssistMode } from "@/lib/prompts/shot-prompt-from-context";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildUpdateShotPromptHiddenFields } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = { mode: ShotPromptAssistMode; text: string };

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  currentShotPrompt: string | null;
  returnTo: string;
};

const MODES: ShotPromptAssistMode[] = ["generate", "enhance", "rewrite", "shorten", "expand"];

const DRAFT_LABELS: Record<ShotPromptAssistMode, string> = {
  generate: "Generated Draft",
  enhance: "Enhanced Draft",
  rewrite: "Rewritten Draft",
  shorten: "Shortened Draft",
  expand: "Expanded Draft",
};

const MODE_BUTTON_LABELS: Record<ShotPromptAssistMode, string> = {
  generate: "Generate Draft",
  enhance: "Enhance",
  rewrite: "Rewrite",
  shorten: "Shorten",
  expand: "Expand",
};

/**
 * `shotPrompt.assist` — the second of B5's two most constraining cases
 * (docs/LLM_WORKSPACE_ARCHITECTURE.md §11.2, B5): `response: "redirectOnly"`,
 * five modes, a precondition on the existing prompt, and an `append` value
 * pre-computed client-side because the action itself carries no such mode
 * (unlike `updateAssetDescriptionFieldInline`). Both Approve variants
 * (Replace / Append) render as their own `<form action={ACTION_BINDINGS.updateShotPrompt}>`
 * — `ProposalPanel` never calls the binding directly for a `redirectOnly`
 * entry, so form identity, no-JS submission and the server redirect stay
 * structurally unchanged, per B4b.
 */
export default function ShotPromptLLMAssistPanel({
  projectId,
  sequenceId,
  shotId,
  currentShotPrompt,
  returnTo,
}: Props) {
  const hasExistingPrompt = Boolean(currentShotPrompt?.trim());

  const triggers: ProposalTrigger<Draft>[] = MODES.map((mode) => ({
    id: mode,
    label: MODE_BUTTON_LABELS[mode],
    disabled: mode !== "generate" && !hasExistingPrompt,
    loadingLabel: `Generating ${MODE_BUTTON_LABELS[mode].toLowerCase()}...`,
    run: async () => {
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("sequenceId", String(sequenceId));
      fd.set("shotId", String(shotId));
      fd.set("mode", mode);
      const result = await generateShotPromptDraft(fd);
      return result.ok ? { ok: true, draft: { mode, text: result.draft } } : { ok: false, error: result.error };
    },
  }));

  function approveActions(draft: Draft): ProposalApproveAction<Draft>[] {
    const appendedValue = hasExistingPrompt
      ? `${currentShotPrompt!.trim()}\n\n${draft.text.trim()}`
      : draft.text.trim();

    return [
      {
        kind: "redirectOnly",
        id: "replace",
        label: "Replace Prompt",
        action: ACTION_BINDINGS.updateShotPrompt,
        hiddenFields: (current) =>
          buildUpdateShotPromptHiddenFields({
            projectId,
            sequenceId,
            shotId,
            shotPrompt: current.text,
            returnTo,
          }),
      },
      {
        kind: "redirectOnly",
        id: "append",
        label: "Append to Prompt",
        action: ACTION_BINDINGS.updateShotPrompt,
        hiddenFields: () =>
          buildUpdateShotPromptHiddenFields({
            projectId,
            sequenceId,
            shotId,
            shotPrompt: appendedValue,
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
              Enhance, Rewrite, Shorten and Expand require an existing Shot Prompt.
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
