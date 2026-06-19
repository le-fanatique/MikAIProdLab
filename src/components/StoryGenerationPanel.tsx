"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateStory, applyGeneratedStory } from "@/actions/llm/story";
import type { LLMPreviewState, GenerateStoryResult } from "@/types/llm";

type Props = {
  projectId: number;
  pitch: string | null;
  existingStory: string | null;
  isConfigured: boolean;
};

export default function StoryGenerationPanel({
  projectId,
  pitch,
  existingStory,
  isConfigured,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<LLMPreviewState<GenerateStoryResult>>({
    status: "idle",
  });

  const isApplying = state.status === "loading" || state.status === "success" && false;

  // Determine the disabled reason for the generate button
  const notConfigured = !isConfigured;
  const noPitch = isConfigured && !pitch?.trim();
  const isLoading = state.status === "loading";
  const generateDisabled = notConfigured || noPitch || isLoading;

  async function handleGenerate() {
    setState({ status: "loading" });
    const result = await generateStory(projectId);
    if (result.ok) {
      setState({ status: "success", result: { story: result.story } });
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  async function handleApply() {
    if (state.status !== "success") return;
    const story = state.result.story;

    setState({ status: "loading" });
    const result = await applyGeneratedStory(projectId, story);
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
      {/* Generate button */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generateDisabled}
          className={
            generateDisabled
              ? "rounded border border-neutral-800 text-neutral-700 px-4 py-2 text-sm opacity-50 cursor-not-allowed self-start"
              : "rounded border border-neutral-600 text-neutral-300 px-4 py-2 text-sm hover:border-neutral-400 hover:text-neutral-100 transition-colors self-start"
          }
        >
          {isLoading && state.status === "loading" && !("result" in state)
            ? "Generating..."
            : "Generate Story from Pitch"}
        </button>

        {/* Inline hints under the button */}
        {notConfigured && (
          <p className="text-xs text-neutral-600">
            LLM provider not configured.{" "}
            <a href="/settings" className="underline hover:text-neutral-400">
              See Settings.
            </a>
          </p>
        )}
        {noPitch && (
          <p className="text-xs text-neutral-600">Add a pitch first.</p>
        )}
      </div>

      {/* Loading indicator */}
      {state.status === "loading" && (
        <p className="text-xs text-neutral-500 animate-pulse">
          Generating story — this may take a few seconds...
        </p>
      )}

      {/* Error state */}
      {state.status === "error" && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm text-red-400">{state.message}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="self-start text-xs text-neutral-500 underline hover:text-neutral-300 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Preview state */}
      {state.status === "success" && (
        <div className="flex flex-col gap-3">
          {/* Generated preview */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
              Generated Story — Preview
            </p>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
              {state.result.story}
            </p>
          </div>

          {/* Warning if story already exists */}
          {existingStory && (
            <p className="text-xs text-amber-600">
              Applying will replace your existing story.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApply}
              className="rounded bg-neutral-200 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
            >
              Apply to Story
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-neutral-700 text-neutral-400 px-4 py-2 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
