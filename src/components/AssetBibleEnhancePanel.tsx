"use client";

import { useState } from "react";
import { generateAssetBibleDraft } from "@/actions/llm/assetBible";
import { updateAssetDetailsInline } from "@/actions/assets";
import { preserveAssetBibleField } from "@/lib/prompts/assetBibleDraft";
import type { GeneratedAssetBibleDraft } from "@/types/llm";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; draft: GeneratedAssetBibleDraft }
  | { status: "error"; message: string };

type Props = {
  projectId: number;
  assetId: number;
  description: string | null;
  notes: string | null;
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
  isConfigured: boolean;
  returnTo: string;
};

export default function AssetBibleEnhancePanel({
  projectId,
  assetId,
  description,
  notes,
  visualIdentity: existingVisualIdentity,
  usageRules: existingUsageRules,
  forbiddenVariations: existingForbiddenVariations,
  isConfigured,
  returnTo,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [visualIdentity, setVisualIdentity] = useState("");
  const [usageRules, setUsageRules] = useState("");
  const [forbiddenVariations, setForbiddenVariations] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function handleGenerate() {
    setState({ status: "loading" });
    setApplyError(null);
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("assetId", String(assetId));
    const result = await generateAssetBibleDraft(fd);
    if (result.ok) {
      setState({ status: "success", draft: result.draft });
      setVisualIdentity(preserveAssetBibleField(existingVisualIdentity ?? "", result.draft.visualIdentity));
      setUsageRules(preserveAssetBibleField(existingUsageRules ?? "", result.draft.usageRules));
      setForbiddenVariations(preserveAssetBibleField(existingForbiddenVariations ?? "", result.draft.forbiddenVariations));
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  async function handleApply() {
    setIsApplying(true);
    setApplyError(null);
    try {
      const result = await updateAssetDetailsInline({
        assetId,
        projectId,
        description: description ?? "",
        notes: notes ?? "",
        visualIdentity: preserveAssetBibleField(existingVisualIdentity ?? "", visualIdentity),
        usageRules: preserveAssetBibleField(existingUsageRules ?? "", usageRules),
        forbiddenVariations: preserveAssetBibleField(existingForbiddenVariations ?? "", forbiddenVariations),
      });
      if (result.ok) {
        const sep = returnTo.includes("?") ? "&" : "?";
        window.location.href = `${returnTo}${sep}bibleUpdated=1`;
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

  const textareaClass =
    "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Generate Visual Identity, Usage Rules, and Forbidden Variations from this asset&apos;s Description and Notes.
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#cf7b6b]">
          LLM is not configured. Configure it in Settings to generate an Asset Bible draft.
        </p>
      )}

      {state.status === "idle" && (
        <button type="button" onClick={handleGenerate} disabled={!isConfigured} className={buttonClass}>
          Enhance Asset Bible
        </button>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">Analyzing description and notes...</p>
      )}

      {state.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          <button type="button" onClick={handleGenerate} className={buttonClass}>
            Try Again
          </button>
        </div>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-4">
          {applyError && (
            <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
              <p className="text-xs text-[#cf7b6b]">{applyError}</p>
            </div>
          )}

          <p className="text-xs text-[#b89a5a]">
            Preview only — nothing is saved until you click Apply to Asset Bible.
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor="bibleVisualIdentity" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Visual Identity
            </label>
            <textarea
              id="bibleVisualIdentity"
              value={visualIdentity}
              onChange={(e) => setVisualIdentity(e.target.value)}
              rows={3}
              className={textareaClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="bibleUsageRules" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Usage / Performance Rules
            </label>
            <textarea
              id="bibleUsageRules"
              value={usageRules}
              onChange={(e) => setUsageRules(e.target.value)}
              rows={3}
              className={textareaClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="bibleForbiddenVariations" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Forbidden Variations
            </label>
            <textarea
              id="bibleForbiddenVariations"
              value={forbiddenVariations}
              onChange={(e) => setForbiddenVariations(e.target.value)}
              rows={3}
              className={textareaClass}
            />
          </div>

          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className={
                isApplying
                  ? "rounded border border-[#1e2124] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                  : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              }
            >
              Apply to Asset Bible
            </button>
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
