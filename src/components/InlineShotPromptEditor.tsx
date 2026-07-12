"use client";

import { useState } from "react";
import { updateShotPrompt } from "@/actions/shots";
import PromptTextareaWithTranslate from "@/components/PromptTextareaWithTranslate";

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  currentShotPrompt: string | null;
  /** Preserves the open Generate panel — workflow, image/scalar/text overrides — across the save redirect. */
  returnTo: string;
  saved?: boolean;
  error?: string | null;
};

/**
 * Inline Shot Prompt editor for the Generate panel (PROMPTUX.1). Reuses
 * updateShotPrompt exactly as ShotPromptForm does — the only difference is
 * that `returnTo` points back at the current panel state (generation=open,
 * workflowId, image/scalar/text overrides) instead of the bare Shot Detail
 * URL, so saving never closes the panel or drops in-progress selections.
 * Typing never writes — only the explicit Save button submits.
 */
export default function InlineShotPromptEditor({
  projectId,
  sequenceId,
  shotId,
  currentShotPrompt,
  returnTo,
  saved,
  error,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Edit
        </button>
        {saved && <p className="text-xs text-[#6b9e72]">Shot prompt saved.</p>}
        {error && <p className="text-xs text-[#cf7b6b]">{error}</p>}
      </div>
    );
  }

  return (
    <form action={updateShotPrompt} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={String(projectId)} />
      <input type="hidden" name="sequenceId" value={String(sequenceId)} />
      <input type="hidden" name="shotId" value={String(shotId)} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <PromptTextareaWithTranslate
        id={`inline-shot-prompt-${shotId}`}
        name="shotPrompt"
        initialValue={currentShotPrompt ?? ""}
        placeholder="Describe the shot as a clean generation prompt..."
        rows={5}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
