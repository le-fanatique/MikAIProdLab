"use client";

import { useState } from "react";
import {
  generateAssetCandidatesDraft,
  createSelectedAssets,
} from "@/actions/llm/assetExtraction";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import type { GeneratedAssetCandidate } from "@/types/llm";

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
};

export default function AssetsLLMExtractPanel({
  projectId,
  existingAssetNames,
  createdCount,
  createError,
  isConfigured,
  returnTo,
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
  const [inclShots, setInclShots] = useState(false);

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("includeCharacters", String(inclChars));
    fd.set("includeEnvironments", String(inclEnvs));
    fd.set("includeProps", String(inclProps));
    fd.set("includeVehicles", String(inclVehicles));
    fd.set("includeCrowds", String(inclCrowds));
    fd.set("includeOther", String(inclOther));
    fd.set("includeShots", String(inclShots));
    const result = await generateAssetCandidatesDraft(fd);
    if (result.ok) {
      setState({ status: "success", candidates: result.assets });
      setSelected(new Set(result.assets.map((_, i) => i)));
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
        Extract asset drafts from your project's narrative. Review the candidates, select the ones you want, then create them.
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

          {/* Include shots toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={inclShots}
              onChange={(e) => setInclShots(e.target.checked)}
              className="accent-[#5b93d6]"
            />
            <span className="text-xs text-[#a4abb2]">Include shots</span>
            <span className="text-xs text-[#3a4046]">(more detail, slower)</span>
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
