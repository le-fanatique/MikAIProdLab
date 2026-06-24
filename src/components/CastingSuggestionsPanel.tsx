"use client";

import { useState } from "react";
import {
  generateCastingSuggestionsDraft,
  applySelectedCastingSuggestions,
} from "@/actions/llm/castingSuggestions";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import type { GeneratedCastingSuggestion } from "@/types/llm";

const CONFIDENCE_CHIP: Record<
  GeneratedCastingSuggestion["confidence"],
  string
> = {
  high: "text-[#5fa37a] border-[#5fa37a]/40",
  medium: "text-[#cda24f] border-[#cda24f]/40",
  low: "text-[#6e767d] border-[#2c3035]",
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; suggestions: GeneratedCastingSuggestion[] }
  | { status: "error"; message: string };

type Group = {
  targetType: "sequence" | "shot";
  targetId: number;
  targetLabel: string;
  items: { suggestion: GeneratedCastingSuggestion; index: number }[];
};

type Props = {
  projectId: number;
  sequenceId: number;
  castingsApplied?: number | null;
  castingsError?: string | null;
  isConfigured: boolean;
};

export default function CastingSuggestionsPanel({
  projectId,
  sequenceId,
  castingsApplied,
  castingsError,
  isConfigured,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [includeSequenceLevel, setIncludeSequenceLevel] = useState(false);

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("includeSequenceLevel", String(includeSequenceLevel));
    const result = await generateCastingSuggestionsDraft(fd);
    if (result.ok) {
      // Select all by default except alreadyAssigned
      const defaultSelected = new Set(
        result.suggestions
          .map((_, i) => i)
          .filter((i) => !result.suggestions[i].alreadyAssigned)
      );
      setState({ status: "success", suggestions: result.suggestions });
      setSelected(defaultSelected);
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  function toggleSelected(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const suggestions =
    state.status === "success" ? state.suggestions : [];
  const selectedSuggestions = suggestions.filter((_, i) => selected.has(i));

  // Build ordered groups (sequence group first if present, then shots in order)
  function buildGroups(suggs: GeneratedCastingSuggestion[]): Group[] {
    const groups: Group[] = [];
    const keyToIndex = new Map<string, number>();
    for (let i = 0; i < suggs.length; i++) {
      const s = suggs[i];
      const key = `${s.targetType}:${s.targetId}`;
      if (keyToIndex.has(key)) {
        groups[keyToIndex.get(key)!].items.push({ suggestion: s, index: i });
      } else {
        keyToIndex.set(key, groups.length);
        groups.push({
          targetType: s.targetType,
          targetId: s.targetId,
          targetLabel: s.targetLabel,
          items: [{ suggestion: s, index: i }],
        });
      }
    }
    // Sequence-level groups first, then shot groups
    const seqGroups = groups.filter((g) => g.targetType === "sequence");
    const shotGroups = groups.filter((g) => g.targetType === "shot");
    return [...seqGroups, ...shotGroups];
  }

  const groups = buildGroups(suggestions);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Analyze the sequence and its shots to suggest which assets should be cast. Review suggestions, select the ones you want, then apply them.
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#cf7b6b]">
          LLM not configured. Go to Settings to set up Ollama.
        </p>
      )}

      {castingsApplied != null && castingsApplied > 0 && (
        <p className="text-xs text-[#6b9e72]">
          Applied {castingsApplied} casting{castingsApplied !== 1 ? "s" : ""}.
        </p>
      )}
      {castingsError && (
        <p className="text-xs text-[#cf7b6b]">{castingsError}</p>
      )}

      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSequenceLevel}
              onChange={(e) => setIncludeSequenceLevel(e.target.checked)}
              className="accent-[#5b93d6]"
            />
            <span className="text-xs text-[#a4abb2]">
              Include sequence-level suggestions
            </span>
          </label>

          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!isConfigured}
              className={
                !isConfigured
                  ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                  : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              }
            >
              Suggest Asset Casting
            </button>
          </div>

          {state.status === "error" && (
            <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">
          Analyzing sequence...
        </p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
            {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} — {selected.size} selected
          </p>

          {/* Groups */}
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={`${group.targetType}:${group.targetId}`}>
                <div className="flex items-center gap-2 mb-2">
                  {group.targetType === "sequence" && (
                    <span className="inline-flex items-center rounded border border-[#5b93d6]/30 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#5b93d6]">
                      Sequence
                    </span>
                  )}
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#3a4046]">
                    {group.targetLabel}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {group.items.map(({ suggestion: s, index: i }) => (
                    <label
                      key={i}
                      className={[
                        "rounded border px-3 py-2.5 flex gap-3 cursor-pointer transition-colors",
                        selected.has(i)
                          ? "border-[#2c3035] bg-[#141618]"
                          : "border-[#1a1d20] bg-[#0d0e10] opacity-60",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleSelected(i)}
                        className="accent-[#5b93d6] mt-0.5 shrink-0"
                      />
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#e7e9ec]">
                            {s.assetName}
                          </span>
                          <AssetTypeBadge type={s.assetType} />
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${CONFIDENCE_CHIP[s.confidence]}`}
                          >
                            {s.confidence}
                          </span>
                        </div>
                        {s.reason && (
                          <p className="text-xs text-[#6e767d] leading-relaxed">
                            {s.reason}
                          </p>
                        )}
                        {s.alreadyAssigned && (
                          <div className="rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1">
                            <p className="text-xs text-amber-500">
                              Already assigned to this target.
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 flex-wrap">
            <form
              action={async (fd) => {
                setIsCreating(true);
                await applySelectedCastingSuggestions(fd);
              }}
            >
              <input
                type="hidden"
                name="projectId"
                value={String(projectId)}
              />
              <input
                type="hidden"
                name="sequenceId"
                value={String(sequenceId)}
              />
              <input
                type="hidden"
                name="selectedJson"
                value={JSON.stringify(selectedSuggestions)}
              />
              <input
                type="hidden"
                name="returnTo"
                value={`/projects/${projectId}/sequences/${sequenceId}`}
              />
              <button
                type="submit"
                disabled={isCreating || selected.size === 0}
                className={
                  isCreating || selected.size === 0
                    ? "rounded bg-[#1a1d20] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                    : "rounded bg-[#232629] text-[#e7e9ec] px-3 py-1.5 text-sm hover:bg-[#2c3035] transition-colors"
                }
              >
                {isCreating
                  ? "Applying suggestions..."
                  : selected.size === 0
                  ? "No suggestions selected"
                  : `Apply Selected (${selected.size})`}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
