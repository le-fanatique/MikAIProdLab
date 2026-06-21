"use client";

import { useState } from "react";
import { generateShotPromptDraft } from "@/actions/llm/shotPrompt";
import { updateShotPrompt } from "@/actions/shots";
import type { ShotPromptAssistMode } from "@/lib/prompts/shot-prompt-from-context";

type State =
  | { status: "idle" }
  | { status: "loading"; mode: ShotPromptAssistMode }
  | { status: "success"; draft: string; mode: ShotPromptAssistMode }
  | { status: "error"; message: string; mode: ShotPromptAssistMode };

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  currentShotPrompt: string | null;
  returnTo: string;
};

const DRAFT_LABELS: Record<ShotPromptAssistMode, string> = {
  generate: "Generated Draft",
  enhance: "Enhanced Draft",
  rewrite: "Rewritten Draft",
  shorten: "Shortened Draft",
  expand: "Expanded Draft",
};

export default function ShotPromptLLMAssistPanel({
  projectId,
  sequenceId,
  shotId,
  currentShotPrompt,
  returnTo,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  const hasExistingPrompt = Boolean(currentShotPrompt?.trim());

  async function handleMode(mode: ShotPromptAssistMode) {
    setState({ status: "loading", mode });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("shotId", String(shotId));
    fd.set("mode", mode);
    const result = await generateShotPromptDraft(fd);
    if (result.ok) {
      setState({ status: "success", draft: result.draft, mode });
    } else {
      setState({ status: "error", message: result.error, mode });
    }
  }

  const activeMode = state.status !== "idle" ? state.mode : null;

  const transformButtonClass = (disabled: boolean) =>
    disabled
      ? "rounded border border-[#1e2124] text-[#4b5158] px-2.5 py-1.5 text-xs cursor-not-allowed"
      : "rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors";

  const appendedValue = hasExistingPrompt
    ? `${currentShotPrompt!.trim()}\n\n${state.status === "success" ? state.draft.trim() : ""}`
    : state.status === "success"
    ? state.draft.trim()
    : "";

  return (
    <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        LLM Assist
      </p>

      {/* Mode buttons — always visible when idle or error */}
      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleMode("generate")}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Generate Draft
            </button>
            <button
              type="button"
              onClick={() => handleMode("enhance")}
              disabled={!hasExistingPrompt}
              className={transformButtonClass(!hasExistingPrompt)}
            >
              Enhance
            </button>
            <button
              type="button"
              onClick={() => handleMode("rewrite")}
              disabled={!hasExistingPrompt}
              className={transformButtonClass(!hasExistingPrompt)}
            >
              Rewrite
            </button>
            <button
              type="button"
              onClick={() => handleMode("shorten")}
              disabled={!hasExistingPrompt}
              className={transformButtonClass(!hasExistingPrompt)}
            >
              Shorten
            </button>
            <button
              type="button"
              onClick={() => handleMode("expand")}
              disabled={!hasExistingPrompt}
              className={transformButtonClass(!hasExistingPrompt)}
            >
              Expand
            </button>
          </div>
          {!hasExistingPrompt && (
            <p className="text-xs text-[#4b5158]">
              Enhance, Rewrite, Shorten and Expand require an existing Shot Prompt.
            </p>
          )}
          {state.status === "error" && (
            <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          )}
        </div>
      )}

      {/* Loading */}
      {state.status === "loading" && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-[#6e767d] animate-pulse">Generating...</p>
          <span className="text-xs text-[#4b5158]">
            {DRAFT_LABELS[activeMode!].replace(" Draft", "").toLowerCase()}
          </span>
        </div>
      )}

      {/* Success — draft preview + actions */}
      {state.status === "success" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              {DRAFT_LABELS[state.mode]}
            </p>
            <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
              <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                {state.draft}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Replace */}
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
                Replace Prompt
              </button>
            </form>

            {/* Append */}
            <form action={updateShotPrompt}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="shotId" value={String(shotId)} />
              <input type="hidden" name="shotPrompt" value={appendedValue} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Append to Prompt
              </button>
            </form>

            {/* Cancel */}
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
