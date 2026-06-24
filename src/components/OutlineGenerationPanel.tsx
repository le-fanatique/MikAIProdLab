"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateOutlineDraft, applyGeneratedOutline } from "@/actions/llm/outlineGeneration";
import type { LLMPreviewState, GenerateOutlineResult } from "@/types/llm";

type Props = {
  projectId: number;
  pitch: string | null;
  story: string | null;
  existingOutline: string | null;
  isConfigured: boolean;
};

export default function OutlineGenerationPanel({
  projectId,
  pitch,
  story: _story,
  existingOutline,
  isConfigured,
}: Props) {
  const router = useRouter();
  const [targetSections, setTargetSections] = useState("");
  const [state, setState] = useState<LLMPreviewState<GenerateOutlineResult>>({ status: "idle" });

  const notConfigured = !isConfigured;
  const noPitch = isConfigured && !pitch?.trim();
  const isLoading = state.status === "loading";
  const generateDisabled = notConfigured || noPitch || isLoading;

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    if (targetSections.trim()) fd.set("targetSections", targetSections.trim());
    const result = await generateOutlineDraft(fd);
    if (result.ok) {
      setState({ status: "success", result: { outline: result.outline } });
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  async function handleApply() {
    if (state.status !== "success") return;
    const outline = state.result.outline;
    setState({ status: "loading" });
    const result = await applyGeneratedOutline(projectId, outline);
    if (result.ok) {
      setState({ status: "idle" });
      router.refresh();
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  function handleCancel() {
    setState({ status: "idle" });
  }

  function handleRetry() {
    setState({ status: "idle" });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Target sections
          </label>
          <input
            type="number"
            min={2}
            max={20}
            placeholder="Auto"
            value={targetSections}
            onChange={(e) => setTargetSections(e.target.value)}
            disabled={isLoading}
            className="w-24 rounded border border-[#2c3035] bg-[#141618] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 focus:outline-none focus:border-[#3a4046] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generateDisabled}
          className={
            generateDisabled
              ? "rounded border border-[#232629] text-[#3a4046] px-4 py-1.5 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-4 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          {isLoading && state.status === "loading" && !("result" in state)
            ? "Generating..."
            : "Generate Outline Draft"}
        </button>
      </div>

      {/* Inline hints */}
      {notConfigured && (
        <p className="text-xs text-[#4b5158]">
          LLM provider not configured.{" "}
          <a href="/settings" className="underline hover:text-[#6e767d]">
            See Settings.
          </a>
        </p>
      )}
      {noPitch && (
        <p className="text-xs text-[#4b5158]">Add a pitch first.</p>
      )}

      {/* Loading */}
      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">
          Generating outline — this may take a few seconds...
        </p>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm text-red-400">{state.message}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="self-start text-xs text-[#6e767d] underline hover:text-[#a4abb2] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Preview */}
      {state.status === "success" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-[#2c3035] bg-[#141618] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
              Generated Outline — Preview
            </p>
            <pre className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed font-mono">
              {state.result.outline}
            </pre>
          </div>

          {existingOutline && (
            <p className="text-xs text-amber-600">
              Applying will replace your existing outline.
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApply}
              className="rounded bg-[#e7e9ec] text-[#141618] px-4 py-1.5 text-sm font-medium hover:bg-white transition-colors"
            >
              Apply Outline
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-[#2c3035] text-[#6e767d] px-4 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
