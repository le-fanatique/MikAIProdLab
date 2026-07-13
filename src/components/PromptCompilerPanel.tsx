"use client";

import { useMemo, useState } from "react";
import { updateShotPrompt } from "@/actions/shots";
import { generatePromptCompilerDraft } from "@/actions/llm/promptCompiler";
import {
  PROMPT_COMPILER_PRESETS,
  PROMPT_COMPILER_SOURCE_IDS,
  getDefaultSourceFlags,
  isSourceLocked,
  resolveEffectiveSourceFlags,
  validatePresetRequirements,
  computePromptCompilerFingerprint,
  type PromptCompilerPresetId,
  type PromptCompilerSourceId,
} from "@/lib/prompts/promptCompilerPresets";
import {
  buildPromptCompilationContext,
  type PromptCompilationSourceFlags,
  type PromptCompilationShotInput,
  type PromptCompilationCastAssetInput,
  type PromptCompilationAssetBibleInput,
  type PromptCompilationSequenceContextInput,
  type PromptCompilationProjectContextInput,
  type PromptCompilationReferenceImageInput,
} from "@/lib/prompts/buildPromptCompilationContext";

const SOURCE_LABELS: Record<PromptCompilerSourceId, string> = {
  casting: "Casting",
  assetBibles: "Asset Bibles",
  references: "References",
  sequenceContext: "Sequence Context",
  projectContext: "Project Context",
};

const PRESET_ORDER: PromptCompilerPresetId[] = [
  "text-to-video",
  "animate-keyframe",
  "prompt-timeline",
  "reference-to-video",
];

type ReferenceCandidate = PromptCompilationReferenceImageInput & { refId: string };

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  returnTo: string;
  currentShotPrompt: string | null;
  shot: PromptCompilationShotInput;
  castAssets: PromptCompilationCastAssetInput[];
  assetBibles: PromptCompilationAssetBibleInput[];
  availableReferences: ReferenceCandidate[];
  sequenceContext: PromptCompilationSequenceContextInput | null;
  projectContext: PromptCompilationProjectContextInput | null;
};

export default function PromptCompilerPanel({
  projectId,
  sequenceId,
  shotId,
  returnTo,
  currentShotPrompt,
  shot,
  castAssets,
  assetBibles,
  availableReferences,
  sequenceContext,
  projectContext,
}: Props) {
  const [presetId, setPresetId] = useState<PromptCompilerPresetId>("text-to-video");
  const preset = PROMPT_COMPILER_PRESETS[presetId];

  const [userFlags, setUserFlags] = useState<Partial<PromptCompilationSourceFlags>>({});
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);

  const [draftText, setDraftText] = useState("");
  const [lastGeneratedDraft, setLastGeneratedDraft] = useState<string | null>(null);
  const [draftFingerprint, setDraftFingerprint] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceFlags = useMemo(
    () => resolveEffectiveSourceFlags(preset, userFlags),
    [preset, userFlags]
  );

  const orderedReferences: PromptCompilationReferenceImageInput[] = useMemo(
    () =>
      selectedRefIds
        .map((id) => availableReferences.find((r) => r.refId === id))
        .filter((r): r is ReferenceCandidate => r !== undefined),
    [selectedRefIds, availableReferences]
  );

  const contextInput = useMemo(
    () => ({
      shot,
      castAssets,
      references: orderedReferences,
      assetBibles,
      sequenceContext,
      projectContext,
    }),
    [shot, castAssets, orderedReferences, assetBibles, sequenceContext, projectContext]
  );

  const context = useMemo(
    () => buildPromptCompilationContext({ ...contextInput, sources: sourceFlags }),
    [contextInput, sourceFlags]
  );

  const currentFingerprint = useMemo(
    () => computePromptCompilerFingerprint(presetId, sourceFlags, context),
    [presetId, sourceFlags, context]
  );

  const isStale = draftFingerprint !== null && draftFingerprint !== currentFingerprint;
  const hasDraft = lastGeneratedDraft !== null;

  const validation = validatePresetRequirements(presetId, context);

  function handlePresetChange(id: PromptCompilerPresetId) {
    setPresetId(id);
    setUserFlags({});
  }

  function toggleSource(id: PromptCompilerSourceId) {
    if (isSourceLocked(preset, id)) return;
    setUserFlags((prev) => ({ ...prev, [id]: !sourceFlags[id] }));
  }

  function toggleReference(refId: string) {
    setSelectedRefIds((prev) =>
      prev.includes(refId) ? prev.filter((id) => id !== refId) : [...prev, refId]
    );
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    const result = await generatePromptCompilerDraft({
      presetId,
      sourceFlags,
      contextInput,
    });
    setIsGenerating(false);
    if (result.ok) {
      setDraftText(result.draft);
      setLastGeneratedDraft(result.draft);
      setDraftFingerprint(result.fingerprint);
    } else {
      setError(result.error);
    }
  }

  function handleResetDraft() {
    if (lastGeneratedDraft !== null) setDraftText(lastGeneratedDraft);
  }

  const replaceValue = draftText;
  const appendValue = currentShotPrompt?.trim()
    ? `${currentShotPrompt.trim()}\n\n${draftText}`
    : draftText;

  const canApply = hasDraft && !isStale && draftText.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Generate an English video prompt draft from Shot context via a preset. Nothing is
        applied to the Shot Prompt until you explicitly click Replace or Append.
      </p>

      {/* Preset */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">Preset</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_ORDER.map((id) => {
            const p = PROMPT_COMPILER_PRESETS[id];
            const active = id === presetId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handlePresetChange(id)}
                aria-pressed={active}
                className={`rounded border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-[#5b93d6] text-[#e7e9ec] bg-[#5b93d6]/10"
                    : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[#4b5158]">{preset.description}</p>
      </div>

      {/* Sources */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">Sources</p>
        <div className="flex flex-col gap-1">
          {PROMPT_COMPILER_SOURCE_IDS.map((id) => {
            const req = preset.sources[id];
            const locked = isSourceLocked(preset, id);
            const checked = sourceFlags[id];
            return (
              <label
                key={id}
                className={`flex items-center gap-2 text-xs ${
                  locked ? "text-[#4b5158]" : "text-[#a4abb2] cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggleSource(id)}
                  className="accent-[#5b93d6]"
                />
                <span>{SOURCE_LABELS[id]}</span>
                <span className="text-[9px] font-mono uppercase tracking-wider text-[#3a4046]">
                  {req}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Reference selection — only relevant while the references source is on */}
      {sourceFlags.references && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
            Reference Images — click to select, in the order you want them sent
          </p>
          {availableReferences.length === 0 ? (
            <p className="text-xs text-[#4b5158] italic">No reference images available for this shot.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {availableReferences.map((ref) => {
                const orderIndex = selectedRefIds.indexOf(ref.refId);
                const selected = orderIndex !== -1;
                return (
                  <label
                    key={ref.refId}
                    className="flex items-center gap-2 text-xs text-[#a4abb2] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleReference(ref.refId)}
                      className="accent-[#5b93d6]"
                    />
                    <span>{ref.label ?? ref.assetName ?? ref.refId}</span>
                    {ref.role && <span className="text-[10px] text-[#4b5158]">{ref.role}</span>}
                    {selected && (
                      <span className="text-[9px] font-mono text-[#5b93d6]">
                        @Image{orderIndex + 1}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sources effectively sent */}
      <div className="flex flex-wrap gap-2 text-[10px] text-[#4b5158]">
        <span>Sending:</span>
        {context.sourcesIncluded.map((g) => (
          <span key={g} className="font-mono text-[#6e767d]">
            {g}
          </span>
        ))}
      </div>

      {/* Validation */}
      {!validation.ok && (
        <div className="flex flex-col gap-1">
          {validation.missing.map((msg, i) => (
            <p key={i} className="text-xs text-[#cf7b6b]">
              {msg}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!validation.ok || isGenerating}
          className={
            !validation.ok || isGenerating
              ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
              : "rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          }
        >
          {isGenerating ? "Generating…" : hasDraft ? "Regenerate Draft" : "Generate Draft"}
        </button>
        {error && <p className="text-xs text-[#cf7b6b]">{error}</p>}
      </div>

      {/* Preview */}
      {hasDraft && (
        <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Draft Preview
            </p>
            <button
              type="button"
              onClick={handleResetDraft}
              className="text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors"
            >
              Reset Draft
            </button>
          </div>
          {isStale && (
            <p className="text-xs text-[#b89a5a]">
              Stale — regenerate draft. Sources or references changed since this draft was generated.
            </p>
          )}
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={6}
            className="w-full rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] leading-relaxed resize-y focus:outline-none focus:border-[#3a4046]"
          />

          <div className="flex items-center gap-3 pt-1">
            <form action={updateShotPrompt}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="shotId" value={String(shotId)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="shotPrompt" value={replaceValue} />
              <button
                type="submit"
                disabled={!canApply}
                className={
                  !canApply
                    ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                    : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                }
              >
                Replace Prompt
              </button>
            </form>
            <form action={updateShotPrompt}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="shotId" value={String(shotId)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="shotPrompt" value={appendValue} />
              <button
                type="submit"
                disabled={!canApply}
                className={
                  !canApply
                    ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                    : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                }
              >
                Append to Prompt
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
