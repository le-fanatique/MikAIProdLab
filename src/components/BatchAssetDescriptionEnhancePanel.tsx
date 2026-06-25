"use client";

import { useState } from "react";
import Link from "next/link";
import {
  generateBatchAssetDescriptionDrafts,
  type BatchAssetDraftResult,
  type BatchAssetDraftError,
} from "@/actions/llm/assetDescription";
import { updateAssetDescriptionField } from "@/actions/assets";

export type BatchAssetItem = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
  sequenceCount: number;
  shotCount: number;
};

type Props = {
  projectId: number;
  assets: BatchAssetItem[];
  isConfigured: boolean;
  returnTo: string;
};

type State =
  | { status: "idle" }
  | { status: "loading"; count: number }
  | { status: "success"; results: BatchAssetDraftResult[]; errors: BatchAssetDraftError[] }
  | { status: "error"; message: string };

const ASSET_TYPE_COLORS: Record<string, string> = {
  character: "text-[#8fa8d6] border-[#8fa8d6]/30",
  environment: "text-[#7db88f] border-[#7db88f]/30",
  prop: "text-[#c4a46d] border-[#c4a46d]/30",
  vehicle: "text-[#b07cb8] border-[#b07cb8]/30",
  crowd: "text-[#6b9e9e] border-[#6b9e9e]/30",
  other: "text-[#6e767d] border-[#4b5158]/40",
};

export default function BatchAssetDescriptionEnhancePanel({
  projectId,
  assets,
  isConfigured,
  returnTo,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(assets.map((a) => a.id)));
  }

  function selectMissingDescriptions() {
    setSelected(new Set(assets.filter((a) => !a.description?.trim()).map((a) => a.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleGenerate() {
    if (selected.size === 0 || !isConfigured) return;
    setState({ status: "loading", count: selected.size });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("assetIds", JSON.stringify(Array.from(selected)));
    const result = await generateBatchAssetDescriptionDrafts(fd);
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "success", results: result.results, errors: result.errors });
  }

  const buttonClass = selected.size > 0 && isConfigured
    ? "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
    : "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed";

  const applyBtnClass = "rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors";
  const applyBtnDisabledClass = "rounded border border-[#1e2124] text-[#4b5158] px-2.5 py-1 text-xs cursor-not-allowed";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Select assets and generate description drafts from the project story, outline, sequences, and shots.
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#cf7b6b]">
          LLM is not configured. Configure it in Settings to batch enhance assets.
        </p>
      )}

      {/* Idle / selection UI — visible when idle or after error */}
      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-3">
          {assets.length === 0 ? (
            <p className="text-xs text-[#4b5158]">No assets in this project yet.</p>
          ) : (
            <>
              {/* Helper buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectMissingDescriptions}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Select Missing Descriptions
                </button>
                <span className="text-[#2c3035] text-xs">·</span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Select All
                </button>
                <span className="text-[#2c3035] text-xs">·</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Clear
                </button>
              </div>

              {/* Asset checklist */}
              <div className="flex flex-col divide-y divide-[#1a1d20]">
                {assets.map((asset) => {
                  const hasDesc = Boolean(asset.description?.trim());
                  const hasNotes = Boolean(asset.notes?.trim());
                  const hasUsage = asset.sequenceCount > 0 || asset.shotCount > 0;
                  const typeColors = ASSET_TYPE_COLORS[asset.type] ?? ASSET_TYPE_COLORS.other;
                  return (
                    <label
                      key={asset.id}
                      className="flex items-center gap-3 py-2 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(asset.id)}
                        onChange={() => toggle(asset.id)}
                        className="accent-[#5b93d6] shrink-0"
                      />
                      <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors truncate">
                          {asset.name}
                        </span>
                        <span className={`text-[10px] border px-1.5 py-0.5 rounded shrink-0 ${typeColors}`}>
                          {asset.type}
                        </span>
                        {!hasDesc && (
                          <span className="text-[10px] border border-[#b89a5a]/40 text-[#b89a5a] px-1.5 py-0.5 rounded shrink-0">
                            No description
                          </span>
                        )}
                        {!hasNotes && (
                          <span className="text-[10px] border border-[#4b5158]/40 text-[#4b5158] px-1.5 py-0.5 rounded shrink-0">
                            No notes
                          </span>
                        )}
                        {!hasUsage ? (
                          <span className="text-[10px] text-[#4b5158]">No usage context</span>
                        ) : (
                          <span className="text-[10px] text-[#4b5158]">
                            {asset.shotCount > 0 ? `${asset.shotCount} shot${asset.shotCount !== 1 ? "s" : ""}` : ""}
                            {asset.sequenceCount > 0 && asset.shotCount > 0 ? " · " : ""}
                            {asset.sequenceCount > 0 ? `${asset.sequenceCount} seq${asset.sequenceCount !== 1 ? "s" : ""}` : ""}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>

              {state.status === "error" && (
                <p className="text-xs text-[#cf7b6b]">{state.message}</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={selected.size === 0 || !isConfigured}
                  className={buttonClass}
                >
                  Enhance Selected Assets{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">
          Enhancing selected assets ({state.count})...
        </p>
      )}

      {/* Success — per-asset previews */}
      {state.status === "success" && (
        <div className="flex flex-col gap-6">
          {state.errors.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#cf7b6b]">
                Failed ({state.errors.length})
              </p>
              {state.errors.map((e, i) => (
                <p key={i} className="text-xs text-[#cf7b6b]">
                  {e.assetName ?? `Asset #${e.assetId}`}: {e.error}
                </p>
              ))}
            </div>
          )}

          {state.results.length > 0 && (
            <div className="flex flex-col gap-6">
              {state.results.map((result) => (
                <div
                  key={result.assetId}
                  className="flex flex-col gap-3 border-t border-[#1e2124] pt-4 first:border-t-0 first:pt-0"
                >
                  {/* Asset header */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#e7e9ec]">{result.assetName}</span>
                    <span className={`text-[10px] border px-1.5 py-0.5 rounded ${ASSET_TYPE_COLORS[result.assetType] ?? ASSET_TYPE_COLORS.other}`}>
                      {result.assetType}
                    </span>
                    <Link
                      href={`/projects/${projectId}/assets/${result.assetId}`}
                      className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors ml-auto shrink-0"
                    >
                      Open Asset →
                    </Link>
                  </div>

                  {/* Description Draft */}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                      Description Draft
                    </p>
                    {result.draft.descriptionDraft ? (
                      <>
                        <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
                          <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                            {result.draft.descriptionDraft}
                          </p>
                        </div>
                        {result.hasExistingDescription && (
                          <p className="text-xs text-[#b89a5a]">
                            This asset already has a description. Replace will overwrite it.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <form action={updateAssetDescriptionField.bind(null, result.assetId, projectId)}>
                            <input type="hidden" name="field" value="description" />
                            <input type="hidden" name="mode" value="replace" />
                            <input type="hidden" name="content" value={result.draft.descriptionDraft} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className={applyBtnClass}>Replace Description</button>
                          </form>
                          <form action={updateAssetDescriptionField.bind(null, result.assetId, projectId)}>
                            <input type="hidden" name="field" value="description" />
                            <input type="hidden" name="mode" value="append" />
                            <input type="hidden" name="content" value={result.draft.descriptionDraft} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className={applyBtnClass}>Append to Description</button>
                          </form>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-[#4b5158]">No description draft generated.</p>
                    )}
                  </div>

                  {/* Notes Draft */}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                      Notes Draft
                    </p>
                    {result.draft.notesDraft ? (
                      <>
                        <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
                          <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">
                            {result.draft.notesDraft}
                          </p>
                        </div>
                        {result.hasExistingNotes && (
                          <p className="text-xs text-[#b89a5a]">
                            This asset already has notes. Replace will overwrite them.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <form action={updateAssetDescriptionField.bind(null, result.assetId, projectId)}>
                            <input type="hidden" name="field" value="notes" />
                            <input type="hidden" name="mode" value="replace" />
                            <input type="hidden" name="content" value={result.draft.notesDraft} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className={applyBtnClass}>Replace Notes</button>
                          </form>
                          <form action={updateAssetDescriptionField.bind(null, result.assetId, projectId)}>
                            <input type="hidden" name="field" value="notes" />
                            <input type="hidden" name="mode" value="append" />
                            <input type="hidden" name="content" value={result.draft.notesDraft} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className={applyBtnClass}>Append to Notes</button>
                          </form>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-[#4b5158]">No notes draft generated.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Batch footer */}
          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-3">
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Discard Batch
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Regenerate Selected
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
