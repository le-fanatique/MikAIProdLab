"use client";

import { useState } from "react";
import { generateAssetDescriptionDraft } from "@/actions/llm/assetDescription";
import { updateAssetDescriptionFieldInline, applyBatchAssetDescriptionDraftsInline } from "@/actions/assets";
import type { GeneratedAssetDescriptionDraft } from "@/types/llm";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; draft: GeneratedAssetDescriptionDraft }
  | { status: "error"; message: string };

type AppliedState = Record<string, "replaced" | "appended">;

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
  const [applied, setApplied] = useState<AppliedState>({});
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("assetId", String(assetId));
    const result = await generateAssetDescriptionDraft(fd);
    if (result.ok) {
      setState({ status: "success", draft: result.draft });
      setApplied({});
      setApplyMessage(null);
      setApplyError(null);
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  async function handleApplyOne(field: "description" | "notes", mode: "replace" | "append", content: string) {
    if (!content.trim()) return;
    setIsApplying(true);
    setApplyError(null);
    setApplyMessage(null);
    try {
      const result = await updateAssetDescriptionFieldInline({
        assetId,
        projectId,
        field,
        mode,
        content: content.trim(),
      });
      if (result.ok) {
        const appliedMode = mode === "replace" ? "replaced" : "appended";
        setApplied((prev) => ({ ...prev, [field]: appliedMode }));
        setApplyMessage(field === "description"
          ? `Description ${appliedMode}.`
          : `Notes ${appliedMode}.`);
      } else {
        setApplyError(result.error);
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsApplying(false);
    }
  }

  async function handleApplyAll(mode: "replace" | "append") {
    if (state.status !== "success") return;

    const items = [];
    if (state.draft.descriptionDraft?.trim()) {
      items.push({
        assetId,
        descriptionDraft: state.draft.descriptionDraft,
        notesDraft: "",
      });
    }
    if (state.draft.notesDraft?.trim()) {
      if (items.length > 0) {
        items[0].notesDraft = state.draft.notesDraft;
      } else {
        items.push({
          assetId,
          descriptionDraft: "",
          notesDraft: state.draft.notesDraft,
        });
      }
    }

    if (items.length === 0) {
      setApplyError("No drafts to apply.");
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplyMessage(null);
    try {
      const result = await applyBatchAssetDescriptionDraftsInline({
        projectId,
        mode,
        items,
      });
      if (result.ok) {
        const appliedItem = result.applied[0];
        if (appliedItem) {
          const appliedMode = mode === "replace" ? "replaced" : "appended";
          const newApplied: AppliedState = {};
          if (appliedItem.descriptionApplied) newApplied.description = appliedMode;
          if (appliedItem.notesApplied) newApplied.notes = appliedMode;
          setApplied((prev) => ({ ...prev, ...newApplied }));
          setApplyMessage(mode === "replace" ? "All drafts replaced." : "All drafts appended.");
        }
      } else {
        setApplyError(result.error);
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsApplying(false);
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
          {/* Applied/Error messages */}
          {applyMessage && (
            <div className="rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-3 py-2">
              <p className="text-xs text-[#6b9e72]">{applyMessage}</p>
            </div>
          )}
          {applyError && (
            <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
              <p className="text-xs text-[#cf7b6b]">{applyError}</p>
            </div>
          )}

          {/* Description Draft */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                Description Draft
              </p>
              {applied.description && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a2e1e] text-[#6b9e72] font-medium">
                  {applied.description === "replaced" ? "Replaced" : "Appended"}
                </span>
              )}
            </div>
            {state.draft.descriptionDraft ? (
              <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
                <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                  {state.draft.descriptionDraft}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#4b5158]">No description draft generated.</p>
            )}
            {hasExistingDescription && state.draft.descriptionDraft && !applied.description && (
              <p className="text-xs text-[#b89a5a]">This will replace your current description.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleApplyOne("description", "replace", state.draft.descriptionDraft)}
                disabled={!state.draft.descriptionDraft || isApplying || applied.description === "replaced"}
                className={(!state.draft.descriptionDraft || isApplying || applied.description === "replaced") ? applyButtonDisabledClass : applyButtonClass}
              >
                Replace Description
              </button>
              <button
                type="button"
                onClick={() => handleApplyOne("description", "append", state.draft.descriptionDraft)}
                disabled={!state.draft.descriptionDraft || isApplying || applied.description === "appended"}
                className={(!state.draft.descriptionDraft || isApplying || applied.description === "appended") ? applyButtonDisabledClass : applyButtonClass}
              >
                Append to Description
              </button>
            </div>
          </div>

          {/* Notes Draft */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                Notes Draft
              </p>
              {applied.notes && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a2e1e] text-[#6b9e72] font-medium">
                  {applied.notes === "replaced" ? "Replaced" : "Appended"}
                </span>
              )}
            </div>
            {state.draft.notesDraft ? (
              <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
                <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                  {state.draft.notesDraft}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#4b5158]">No notes draft generated.</p>
            )}
            {hasExistingNotes && state.draft.notesDraft && !applied.notes && (
              <p className="text-xs text-[#b89a5a]">This will replace your current notes.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleApplyOne("notes", "replace", state.draft.notesDraft)}
                disabled={!state.draft.notesDraft || isApplying || applied.notes === "replaced"}
                className={(!state.draft.notesDraft || isApplying || applied.notes === "replaced") ? applyButtonDisabledClass : applyButtonClass}
              >
                Replace Notes
              </button>
              <button
                type="button"
                onClick={() => handleApplyOne("notes", "append", state.draft.notesDraft)}
                disabled={!state.draft.notesDraft || isApplying || applied.notes === "appended"}
                className={(!state.draft.notesDraft || isApplying || applied.notes === "appended") ? applyButtonDisabledClass : applyButtonClass}
              >
                Append to Notes
              </button>
            </div>
          </div>

          {/* Replace All / Append All */}
          {(state.draft.descriptionDraft || state.draft.notesDraft) && (
            <div className="border-t border-[#1e2124] pt-3">
              <p className="mb-2 text-xs text-[#4b5158]">
                Apply both generated drafts to this asset.
              </p>
              <p className="mb-3 text-[10px] text-[#8a6f3d]">
                Replace All overwrites the current description and notes. Append All keeps existing text and adds the drafts below it.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyAll("replace")}
                  disabled={isApplying}
                  className={isApplying ? applyButtonDisabledClass : applyButtonClass}
                >
                  Replace All
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAll("append")}
                  disabled={isApplying}
                  className={isApplying ? applyButtonDisabledClass : applyButtonClass}
                >
                  Append All
                </button>
              </div>
            </div>
          )}

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
