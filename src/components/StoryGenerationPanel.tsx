"use client";

import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildApplyGeneratedStoryArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = { story: string };

type Props = {
  projectId: number;
  pitch: string | null;
  existingStory: string | null;
  isConfigured: boolean;
};

/**
 * `story.generate` — `response: "returnValue"`, positional commit
 * (`applyGeneratedStory(projectId, story)`), no editable fields. Confirms
 * the shape the two most constraining cases fixed.
 */
export default function StoryGenerationPanel({ projectId, pitch, existingStory, isConfigured }: Props) {
  const noPitch = isConfigured && !pitch?.trim();

  const trigger: ProposalTrigger<Draft> = {
    id: "generate",
    label: "Generate Story from Pitch",
    disabled: noPitch,
    loadingLabel: "Generating story — this may take a few seconds...",
    // LLMW.UNIFY.PANEL.1 — the first panel onto the generic action. It names
    // the operation; nothing about `story.generate` is encoded here any more.
    //
    // The narrowing that follows is not defensive noise: `runOperation`'s
    // result is `kind`-discriminated and its `"object"` values are
    // `string | number`, while this descriptor declares one `type: "string"`
    // field. Neither branch is reachable — they are refused loudly rather
    // than coerced, exactly as the adapter this replaces did.
    run: async () => {
      const result = await runWorkspaceOperation({ descriptorId: "story.generate", ids: { projectId } });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "object") return { ok: false, error: "Expected an object-kind result." };
      const { story } = result.values;
      if (typeof story !== "string") return { ok: false, error: "Unexpected non-text value for the story." };
      return { ok: true, draft: { story } };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply to Story",
        run: (draft) => ACTION_BINDINGS.applyGeneratedStory(...buildApplyGeneratedStoryArgs(projectId, draft.story)),
      },
    ];
  }

  return (
    <ProposalPanel<Draft>
      isConfigured={isConfigured}
      notConfiguredMessage={
        <>
          LLM provider not configured.{" "}
          <a href="/settings" className="underline hover:text-[#a4abb2]">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
              Generated Story — Preview
            </p>
            <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">{draft.story}</p>
          </div>
          {existingStory && (
            <p className="text-xs text-amber-500">Applying will replace your existing story.</p>
          )}
        </div>
      )}
    />
  );
}
