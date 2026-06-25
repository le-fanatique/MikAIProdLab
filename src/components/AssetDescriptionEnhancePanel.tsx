"use client";

import { useState } from "react";
import { generateAssetDescriptionDraft } from "@/actions/llm/assetDescription";
import { updateAssetDescriptionField } from "@/actions/assets";
import type { GeneratedAssetDescriptionDraft } from "@/types/llm";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; draft: GeneratedAssetDescriptionDraft }
  | { status: "error"; message: string };

type Props = {
  projectId: number;
  assetId: number;
  returnTo: string;
  hasExistingDescription: boolean;
  hasExistingNotes: boolean;
  isConfigured: boolean;
  hasUsageContext: boolean;
};

export default function AssetDescriptionEnhancePanel({
  projectId,
  assetId,
  returnTo,
  hasExistingDescription,
  hasExistingNotes,
  isConfigured,
  hasUsageContext,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("assetId", String(assetId));
    const result = await generateAssetDescriptionDraft(fd);
    if (result.ok) {
      setState({ status: "success", draft: result.draft });
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  const buttonClass = isConfigured
    ? "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
    : "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed";

  const applyButtonClass = "rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors";
  const applyButtonDisabledClass = "rounded border border-[#1e2124] text-[#4b5158] px-2.5 py-1.5 text-xs cursor-not-allowed";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Generate description and notes from this asset's story, outline, sequence, and shot context.
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#cf7b6b]">
          LLM is not configured. Configure it in Settings to generate asset descriptions.
        </p>
      )}

      {isConfigured && !hasUsageContext && (
        <p className="text-xs text-[#b89a5a]">
          Limited context: this asset is not assigned to any sequence or shot yet. The draft may be generic.
        </p>
      )}

      {/* Idle */}
      {state.status === "idle" && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!isConfigured}
          className={buttonClass}
        >
          Enhance Description
        </button>
      )}

      {/* Loading */}
      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">Analyzing asset context...</p>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          <button
            type="button"
            onClick={handleGenerate}
            className={buttonClass}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Success */}
      {state.status === "success" && (
        <div className="flex flex-col gap-4">
          {/* Description Draft */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Description Draft
            </p>
            {state.draft.descriptionDraft ? (
              <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
                <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                  {state.draft.descriptionDraft}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#4b5158]">No description draft generated.</p>
            )}
            {hasExistingDescription && state.draft.descriptionDraft && (
              <p className="text-xs text-[#b89a5a]">This will replace your current description.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={updateAssetDescriptionField.bind(null, assetId, projectId)}>
                <input type="hidden" name="field" value="description" />
                <input type="hidden" name="mode" value="replace" />
                <input type="hidden" name="content" value={state.draft.descriptionDraft} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  disabled={!state.draft.descriptionDraft}
                  className={state.draft.descriptionDraft ? applyButtonClass : applyButtonDisabledClass}
                >
                  Replace Description
                </button>
              </form>
              <form action={updateAssetDescriptionField.bind(null, assetId, projectId)}>
                <input type="hidden" name="field" value="description" />
                <input type="hidden" name="mode" value="append" />
                <input type="hidden" name="content" value={state.draft.descriptionDraft} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  disabled={!state.draft.descriptionDraft}
                  className={state.draft.descriptionDraft ? applyButtonClass : applyButtonDisabledClass}
                >
                  Append to Description
                </button>
              </form>
            </div>
          </div>

          {/* Notes Draft */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Notes Draft
            </p>
            {state.draft.notesDraft ? (
              <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
                <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                  {state.draft.notesDraft}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#4b5158]">No notes draft generated.</p>
            )}
            {hasExistingNotes && state.draft.notesDraft && (
              <p className="text-xs text-[#b89a5a]">This will replace your current notes.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={updateAssetDescriptionField.bind(null, assetId, projectId)}>
                <input type="hidden" name="field" value="notes" />
                <input type="hidden" name="mode" value="replace" />
                <input type="hidden" name="content" value={state.draft.notesDraft} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  disabled={!state.draft.notesDraft}
                  className={state.draft.notesDraft ? applyButtonClass : applyButtonDisabledClass}
                >
                  Replace Notes
                </button>
              </form>
              <form action={updateAssetDescriptionField.bind(null, assetId, projectId)}>
                <input type="hidden" name="field" value="notes" />
                <input type="hidden" name="mode" value="append" />
                <input type="hidden" name="content" value={state.draft.notesDraft} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  disabled={!state.draft.notesDraft}
                  className={state.draft.notesDraft ? applyButtonClass : applyButtonDisabledClass}
                >
                  Append to Notes
                </button>
              </form>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-2">
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
