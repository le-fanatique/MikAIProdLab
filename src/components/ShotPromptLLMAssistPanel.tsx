"use client";

import { useState } from "react";
import { generateShotPromptDraft } from "@/actions/llm/shotPrompt";
import { updateShotPrompt } from "@/actions/shots";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; draft: string }
  | { status: "error"; message: string };

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  hasExistingPrompt: boolean;
  returnTo: string;
};

export default function ShotPromptLLMAssistPanel({
  projectId,
  sequenceId,
  shotId,
  hasExistingPrompt,
  returnTo,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("shotId", String(shotId));
    const result = await generateShotPromptDraft(fd);
    if (result.ok) {
      setState({ status: "success", draft: result.draft });
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        LLM Assist
      </p>

      {state.status === "idle" && (
        <button
          type="button"
          onClick={handleGenerate}
          className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Generate Draft
        </button>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">Generating...</p>
      )}

      {state.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          <button
            type="button"
            onClick={handleGenerate}
            className="self-start text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Generated Draft
            </p>
            <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
              <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                {state.draft}
              </p>
            </div>
          </div>

          {hasExistingPrompt && (
            <p className="text-xs text-[#b89a5a]">
              Applying this draft will replace the current Shot Prompt.
            </p>
          )}

          <div className="flex items-center gap-4">
            <form action={updateShotPrompt}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="shotId" value={String(shotId)} />
              <input type="hidden" name="shotPrompt" value={state.draft} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="rounded bg-[#232629] text-[#e7e9ec] px-3 py-1.5 text-sm hover:bg-[#2c3035] transition-colors"
              >
                Apply to Shot Prompt
              </button>
            </form>

            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Cancel
            </button>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            className="self-start text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
