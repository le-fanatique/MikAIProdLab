"use client";

import { useState } from "react";
import { createSelectedAssets } from "@/actions/llm/assetExtraction";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import type { GeneratedAssetCandidate } from "@/types/llm";

// LLMW.UNIFY.PANEL.3 — this panel now names `assets.fromProject` directly
// instead of importing a generation function for it
// (`generateAssetCandidatesDraft`, deleted alongside this migration,
// `src/actions/llm/assetExtraction.ts`). `runWorkspaceOperation` already
// returns `result.items` keyed by the model's own JSON keys
// (LLMW.UNIFY.LIST.1) — the one gap that used to block this panel. What
// remains here is presentation, kept identical to what the deleted adapter
// did: the `"" -> null` fill-back for the five `type: "string"` fields
// (`name`, `assetType` and `sourceLevel` are `type: "enum"` fields with a
// mandatory default and are never `""`), and shaping each item into
// `GeneratedAssetCandidate`. The boolean guard mirrors the deleted adapter's
// own "impossible input throws" discipline — no `output.item.fields` entry
// is ever boolean-typed for this descriptor, so the branch is unreachable in
// practice, refused loudly rather than silently coerced.
//
// ASSET.EXTRACT.SEQ.1 — this panel is now parametrized by an optional
// `sequenceId`: when present it names `assets.fromSequence` instead
// (`descriptors/assetsFromSequence.ts`), the sequence-anchored, incremental
// sibling of `assets.fromProject`. Both share this exact candidate shape
// (`GeneratedAssetCandidate`, `toCandidate` below), the same asset-type
// filters, and the same commit action — only the descriptor id and the
// anchor ids sent to `runWorkspaceOperation` differ. `includeShots` no
// longer exists on either operation and is removed from this panel entirely.
function toCandidate(item: Record<string, string | number | boolean>): GeneratedAssetCandidate {
  function strField(key: string): string | null {
    const value = item[key];
    if (value === undefined) return null;
    if (typeof value === "boolean") {
      throw new Error(`AssetsLLMExtractPanel: unexpected boolean value for field "${key}".`);
    }
    return value === "" ? null : String(value);
  }
  const name = item.name;
  if (typeof name !== "string") {
    throw new Error('AssetsLLMExtractPanel: expected a string "name" on every item.');
  }
  return {
    name,
    assetType: item.assetType as GeneratedAssetCandidate["assetType"],
    description: strField("description"),
    notes: strField("notes"),
    sourceLevel: item.sourceLevel as GeneratedAssetCandidate["sourceLevel"],
    sourceExcerpt: strField("sourceExcerpt"),
    duplicateWarning: strField("duplicateWarning"),
  };
}

const TYPE_ORDER = [
  "character",
  "environment",
  "prop",
  "vehicle",
  "crowd",
  "other",
] as const;

const TYPE_LABELS: Record<string, string> = {
  character: "Characters",
  environment: "Environments",
  prop: "Props",
  vehicle: "Vehicles",
  crowd: "Crowds",
  other: "Other",
};

const SOURCE_CHIP_CLASS: Record<GeneratedAssetCandidate["sourceLevel"], string> = {
  outline: "text-[#5b93d6] border-[#5b93d6]/40",
  sequence: "text-[#5fa37a] border-[#5fa37a]/40",
  shot: "text-[#cda24f] border-[#cda24f]/40",
  story: "text-[#6e767d] border-[#2c3035]",
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; candidates: GeneratedAssetCandidate[] }
  | { status: "error"; message: string };

type Props = {
  projectId: number;
  existingAssetNames: string[];
  createdCount?: number | null;
  createError?: string | null;
  isConfigured: boolean;
  returnTo?: string;
  /**
   * ASSET.EXTRACT.SEQ.1 — when set, this panel runs the sequence-anchored,
   * incremental `assets.fromSequence` instead of the project-wide
   * `assets.fromProject`. The panel parametrizes by anchor rather than being
   * duplicated: both operations share the same asset-type filters, the same
   * result shape, and the same commit action (`createSelectedAssets`, which
   * only ever needed a `projectId`) — only which descriptor runs, and which
   * ids it anchors on, differ. See `.agents/executor_report.md` for why this
   * was the reuse found, over `castingFromSequence`'s own (never
   * reused-by-anchor) sequence-only panel.
   */
  sequenceId?: number;
};

export default function AssetsLLMExtractPanel({
  projectId,
  existingAssetNames,
  createdCount,
  createError,
  isConfigured,
  returnTo,
  sequenceId,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  const [inclChars, setInclChars] = useState(true);
  const [inclEnvs, setInclEnvs] = useState(true);
  const [inclProps, setInclProps] = useState(true);
  const [inclVehicles, setInclVehicles] = useState(false);
  const [inclCrowds, setInclCrowds] = useState(false);
  const [inclOther, setInclOther] = useState(false);

  async function handleGenerate() {
    setState({ status: "loading" });

    // Six form booleans -> the descriptor's own `assetTypes` multiEnum
    // parameter, in this exact declaration order (character, environment,
    // prop, vehicle, crowd, other) — the pre-migration adapter's own order,
    // observable in the rendered prompt (`assets-from-project.ts`'s
    // `typesStr`). An empty array is sent through unchanged, not omitted:
    // the descriptor's own precondition then reproduces "Select at least one
    // asset type." on it.
    const assetTypes: string[] = [];
    if (inclChars) assetTypes.push("character");
    if (inclEnvs) assetTypes.push("environment");
    if (inclProps) assetTypes.push("prop");
    if (inclVehicles) assetTypes.push("vehicle");
    if (inclCrowds) assetTypes.push("crowd");
    if (inclOther) assetTypes.push("other");

    // ASSET.EXTRACT.SEQ.1 — `includeShots` is gone: `assets.fromProject` no
    // longer takes it (the per-shot detail moved to `assets.fromSequence`,
    // always shot-scoped by its own anchor), so this panel no longer builds
    // it either, for both operations.
    const result = sequenceId != null
      ? await runWorkspaceOperation({
          descriptorId: "assets.fromSequence",
          ids: { projectId, sequenceId },
          intent: { parameters: { assetTypes } },
        })
      : await runWorkspaceOperation({
          descriptorId: "assets.fromProject",
          ids: { projectId },
          intent: { parameters: { assetTypes } },
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
      const candidates = result.items.map(toCandidate);
      setState({ status: "success", candidates });
      setSelected(new Set(candidates.map((_, i) => i)));
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unexpected error. Please try again.",
      });
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

  const candidates = state.status === "success" ? state.candidates : [];
  const selectedCandidates = candidates.filter((_, i) => selected.has(i));

  const typeFilters: [string, boolean, (v: boolean) => void][] = [
    ["Characters", inclChars, setInclChars],
    ["Environments", inclEnvs, setInclEnvs],
    ["Props", inclProps, setInclProps],
    ["Vehicles", inclVehicles, setInclVehicles],
    ["Crowds", inclCrowds, setInclCrowds],
    ["Other", inclOther, setInclOther],
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        {sequenceId != null
          ? "Extract asset drafts from this sequence and its shots — only assets missing from the project's existing list are proposed. Review the candidates, select the ones you want, then create them."
          : "Extract asset drafts from your project's narrative. Review the candidates, select the ones you want, then create them."}
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#cf7b6b]">
          LLM not configured. Go to Settings to set up Ollama.
        </p>
      )}

      {existingAssetNames.length > 0 && (
        <p className="text-xs text-[#4b5158]">
          {existingAssetNames.length} existing asset{existingAssetNames.length !== 1 ? "s" : ""} will be used for duplicate detection.
        </p>
      )}

      {createdCount != null && createdCount > 0 && (
        <p className="text-xs text-[#6b9e72]">
          Created {createdCount} asset{createdCount !== 1 ? "s" : ""}.
        </p>
      )}
      {createError && (
        <p className="text-xs text-[#cf7b6b]">{createError}</p>
      )}

      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-3">
          {/* Type filters */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Asset types
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {typeFilters.map(([label, checked, setter]) => (
                <label
                  key={label}
                  className="flex items-center gap-1.5 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setter(e.target.checked)}
                    className="accent-[#5b93d6]"
                  />
                  <span className="text-xs text-[#a4abb2]">{label}</span>
                </label>
              ))}
            </div>
          </div>

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
              Extract Asset Drafts
            </button>
          </div>

          {state.status === "error" && (
            <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">
          Extracting asset drafts...
        </p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
            {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} — {selected.size} selected
          </p>

          {/* Candidates grouped by type */}
          <div className="flex flex-col gap-5">
            {TYPE_ORDER.filter((type) =>
              candidates.some((c) => c.assetType === type)
            ).map((type) => (
              <div key={type}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#3a4046] mb-2">
                  {TYPE_LABELS[type]}
                </p>
                <div className="flex flex-col gap-2">
                  {candidates
                    .map((c, i) => ({ c, i }))
                    .filter(({ c }) => c.assetType === type)
                    .map(({ c, i }) => (
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
                              {c.name}
                            </span>
                            <AssetTypeBadge type={c.assetType} />
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${SOURCE_CHIP_CLASS[c.sourceLevel]}`}
                            >
                              {c.sourceLevel}
                            </span>
                          </div>
                          {c.description && (
                            <p className="text-xs text-[#6e767d] leading-relaxed">
                              {c.description}
                            </p>
                          )}
                          {c.notes && (
                            <p className="text-xs text-[#4b5158] leading-relaxed">
                              {c.notes}
                            </p>
                          )}
                          {c.sourceExcerpt && (
                            <p className="text-xs text-[#3a4046] italic leading-relaxed line-clamp-2">
                              &ldquo;{c.sourceExcerpt}&rdquo;
                            </p>
                          )}
                          {c.duplicateWarning && (
                            <div className="rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1">
                              <p className="text-xs text-amber-500">
                                Possible duplicate of existing asset: &ldquo;{c.duplicateWarning}&rdquo;
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
                await createSelectedAssets(fd);
              }}
            >
              <input
                type="hidden"
                name="projectId"
                value={String(projectId)}
              />
              <input
                type="hidden"
                name="selectedJson"
                value={JSON.stringify(selectedCandidates)}
              />
              <input
                type="hidden"
                name="returnTo"
                value={returnTo ?? `/projects/${projectId}/assets`}
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
                  ? "Creating assets..."
                  : selected.size === 0
                  ? "No assets selected"
                  : `Create ${selected.size} Asset${selected.size !== 1 ? "s" : ""}`}
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
