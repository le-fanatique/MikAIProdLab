"use client";

import { useState } from "react";
import { createGeneratedSequences } from "@/actions/llm/sequenceGeneration";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import type { LLMPreviewState, GeneratedSequence, GenerateSequencesResult } from "@/types/llm";

// LLMW.UNIFY.PANEL.3 — this panel now names `sequences.fromOutline` directly
// instead of importing a generation function for it
// (`generateSequencesFromOutlineDraft`, deleted alongside this migration,
// `src/actions/llm/sequenceGeneration.ts`). `runWorkspaceOperation` already
// returns `result.items` keyed by the model's own JSON keys
// (LLMW.UNIFY.LIST.1). What remains here is presentation, kept identical to
// what the deleted adapter did: the `"" -> null` fill-back for the six
// `type: "string"` fields — `order_index` needs no fill, the descriptor's
// own `fallback: "index"` guarantees it is always present as a number. The
// boolean guard mirrors the deleted adapter's own "impossible input throws"
// discipline — no `output.item.fields` entry is ever boolean-typed for this
// descriptor.
function toSequence(item: Record<string, string | number | boolean>): GeneratedSequence {
  function strField(key: string): string | null {
    const value = item[key];
    if (value === undefined) return null;
    if (typeof value === "boolean") {
      throw new Error(`SequencesGenerationPanel: unexpected boolean value for field "${key}".`);
    }
    return value === "" ? null : String(value);
  }
  const title = item.title;
  if (typeof title !== "string") {
    throw new Error('SequencesGenerationPanel: expected a string "title" on every item.');
  }
  const orderIndex = item.order_index;
  if (typeof orderIndex !== "number") {
    throw new Error('SequencesGenerationPanel: expected a numeric "order_index" on every item.');
  }
  return {
    title,
    summary: strField("summary"),
    description: strField("description"),
    narrative_purpose: strField("narrative_purpose"),
    mood: strField("mood"),
    location_hint: strField("location_hint"),
    order_index: orderIndex,
  };
}

type Props = {
  projectId: number;
  pitch: string | null;
  story: string | null;
  outline: string | null;
  existingSequencesCount: number;
  isConfigured: boolean;
  returnTo?: string;
};

export default function SequencesGenerationPanel({
  projectId,
  pitch,
  story: _story,
  outline,
  existingSequencesCount,
  isConfigured,
  returnTo,
}: Props) {
  const [targetCount, setTargetCount] = useState("");
  const [state, setState] = useState<LLMPreviewState<GenerateSequencesResult>>({
    status: "idle",
  });
  const [isCreating, setIsCreating] = useState(false);

  const hasOutline = !!outline?.trim();
  const notConfigured = !isConfigured;
  const noSource = isConfigured && !pitch?.trim() && !outline?.trim();
  const isLoading = state.status === "loading";
  const generateDisabled = notConfigured || noSource || isLoading;

  async function handleGenerate() {
    setState({ status: "loading" });
    const rawCount = parseInt(targetCount, 10);
    const result = await runWorkspaceOperation({
      descriptorId: "sequences.fromOutline",
      ids: { projectId },
      intent: { parameters: Number.isInteger(rawCount) ? { targetCount: rawCount } : {} },
    });
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    if (result.kind !== "list") {
      setState({ status: "error", message: "Expected a list-kind result." });
      return;
    }
    try {
      const sequences = result.items.map(toSequence);
      setState({ status: "success", result: { sequences } });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
      });
    }
  }

  async function handleCreate(seqs: GeneratedSequence[]) {
    setIsCreating(true);
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequencesJson", JSON.stringify(seqs));
    fd.set("returnTo", returnTo ?? `/projects/${projectId}/outline`);
    await createGeneratedSequences(fd);
  }

  function handleCancel() {
    setState({ status: "idle" });
  }

  function handleRetry() {
    setState({ status: "idle" });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Source / fallback indicator */}
      {hasOutline ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5b93d6] bg-[#2c3035] border border-[#5b93d6]/20 px-2 py-0.5 rounded">
            Using Project Outline
          </span>
        </div>
      ) : (
        <div className="rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2.5">
          <p className="text-xs text-amber-500 leading-relaxed">
            No project outline has been saved yet. Sequences will be generated from the project
            pitch and story instead.
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Target sequences
          </label>
          <input
            type="number"
            min={1}
            max={20}
            placeholder="Auto"
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
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
          {isLoading ? "Generating..." : "Generate Sequence Draft"}
        </button>
      </div>

      {/* Hints */}
      {notConfigured && (
        <p className="text-xs text-[#4b5158]">
          LLM provider not configured.{" "}
          <a href="/settings" className="underline hover:text-[#6e767d]">
            See Settings.
          </a>
        </p>
      )}
      {noSource && (
        <p className="text-xs text-[#4b5158]">Add a project pitch or outline first.</p>
      )}

      {/* Loading */}
      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">
          Generating sequences — this may take a few seconds...
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
          <div className="rounded-lg border border-[#2c3035] bg-[#141618] overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] px-4 pt-3 pb-2 border-b border-[#1a1d20]">
              Sequence Draft — Preview ({state.result.sequences.length})
            </p>
            <div className="flex flex-col divide-y divide-[#1a1d20]">
              {state.result.sequences.map((seq, i) => (
                <div key={i} className="px-4 py-3 flex gap-3">
                  <span className="text-[#4b5158] font-mono text-xs shrink-0 pt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-sm font-semibold text-[#e7e9ec]">{seq.title}</p>
                    {seq.summary && (
                      <p className="text-xs text-[#6e767d] leading-relaxed">{seq.summary}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] mt-0.5">
                      {seq.narrative_purpose && (
                        <span>
                          <span className="text-[#3a4046]">Purpose </span>
                          <span className="text-[#4b5158]">{seq.narrative_purpose}</span>
                        </span>
                      )}
                      {seq.mood && (
                        <span>
                          <span className="text-[#3a4046]">Mood </span>
                          <span className="text-[#4b5158]">{seq.mood}</span>
                        </span>
                      )}
                      {seq.location_hint && (
                        <span>
                          <span className="text-[#3a4046]">Location </span>
                          <span className="text-[#4b5158]">{seq.location_hint}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {existingSequencesCount > 0 && (
            <p className="text-xs text-amber-500">
              This will add new sequences after the existing ones. ({existingSequencesCount}{" "}
              sequence{existingSequencesCount !== 1 ? "s" : ""} already exist.)
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleCreate(state.result.sequences)}
              disabled={isCreating}
              className={
                isCreating
                  ? "rounded bg-[#2c3035] text-[#4b5158] px-4 py-1.5 text-sm font-medium cursor-not-allowed"
                  : "rounded bg-[#e7e9ec] text-[#141618] px-4 py-1.5 text-sm font-medium hover:bg-white transition-colors"
              }
            >
              {isCreating
                ? "Creating sequences..."
                : `Create ${state.result.sequences.length} Sequence${state.result.sequences.length !== 1 ? "s" : ""}`}
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
