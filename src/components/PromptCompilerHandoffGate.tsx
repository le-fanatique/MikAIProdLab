"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  getPromptCompilerHandoffStorageKey,
  sanitizePromptCompilerHandoff,
  evaluatePromptCompilerHandoff,
  resolvePromptCompilerTextNode,
  buildSearchParamsWithTextOverride,
  buildSearchParamsWithoutTextOverride,
  type PromptCompilerHandoff,
  type PromptCompilerHandoffLiveData,
  type PromptCompilerTextNodeCandidate,
} from "@/lib/prompts/promptCompilerHandoff";
import { PROMPT_COMPILER_PRESETS } from "@/lib/prompts/promptCompilerPresets";

type Props = {
  shotId: number;
  basePath: string;
  currentSearchParams: Record<string, string>;
  textNodeCandidates: PromptCompilerTextNodeCandidate[];
  liveData: PromptCompilerHandoffLiveData;
  children: ReactNode;
};

function navigate(router: ReturnType<typeof useRouter>, basePath: string, query: string) {
  router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
}

/**
 * Wraps the "Suggested Inputs" → "Generate" region of a Generation Panel
 * surface (ShotGenerationPanel / the /map page). Applies a Prompt Compiler
 * handoff (sessionStorage-only, never DB) to the workflow's real Text
 * Prompt (Input) node when present and non-stale, shows its origin, and
 * blocks the wrapped Generate form's submit whenever the handoff is stale
 * for ANY reason (missing reference, casting/Asset Bible/context drift, or
 * reference pool drift) — never just the missing-reference case.
 *
 * Workflows with no stored handoff render `children` completely unchanged
 * — this component adds nothing to the DOM for that case beyond the
 * children themselves, so byte-identical non-regression holds.
 */
export default function PromptCompilerHandoffGate({
  shotId,
  basePath,
  currentSearchParams,
  textNodeCandidates,
  liveData,
  children,
}: Props) {
  const router = useRouter();
  const [handoff, setHandoff] = useState<PromptCompilerHandoff | null>(null);

  const storageKey = getPromptCompilerHandoffStorageKey(shotId);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        setHandoff(null);
        return;
      }
      const parsed = sanitizePromptCompilerHandoff(JSON.parse(raw));
      setHandoff(parsed && parsed.shotId === shotId ? parsed : null);
    } catch {
      // Corrupted or inaccessible sessionStorage entry — never crash the panel.
      setHandoff(null);
    }
  }, [storageKey, shotId]);

  const nodeResolution = useMemo(
    () => resolvePromptCompilerTextNode(textNodeCandidates),
    [textNodeCandidates]
  );

  const evaluation = useMemo(
    () => (handoff ? evaluatePromptCompilerHandoff(handoff, liveData) : null),
    [handoff, liveData]
  );

  const overrideNodeId = nodeResolution.ok ? nodeResolution.nodeId : null;
  const currentOverrideValue =
    overrideNodeId !== null ? currentSearchParams[`textNode_${overrideNodeId}`] : undefined;
  // True only while the URL still holds exactly the value this handoff
  // applied — false the moment the user types something else via
  // "Apply Text", so a later user edit is never touched by this component.
  const overrideIsUnmodifiedDraft = handoff !== null && currentOverrideValue === handoff.draftText;

  // Apply once: only when non-stale, a node was resolved, and nothing is
  // present yet for that node (never overwrites a draft OR a user edit).
  useEffect(() => {
    if (!handoff || !evaluation || evaluation.stale) return;
    if (!overrideNodeId) return;
    if (currentOverrideValue !== undefined) return;

    const query = buildSearchParamsWithTextOverride(currentSearchParams, overrideNodeId, handoff.draftText);
    navigate(router, basePath, query);
    // currentSearchParams/basePath change as a *result* of this effect (via
    // router.replace); `currentOverrideValue` becoming defined on the next
    // render is the real guard against re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, evaluation, overrideNodeId, currentOverrideValue]);

  // Auto-revert: once the handoff goes stale, remove the override from the
  // URL as soon as it still holds the (now stale) draft text verbatim, so
  // preview/payload immediately stop reflecting a stale draft. Never
  // touches the field if the user has since edited it to something else —
  // that edit is now theirs, independent of this handoff.
  useEffect(() => {
    if (!handoff || !evaluation || !evaluation.stale) return;
    if (!overrideNodeId) return;
    if (currentOverrideValue !== handoff.draftText) return;

    const query = buildSearchParamsWithoutTextOverride(currentSearchParams, overrideNodeId);
    navigate(router, basePath, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, evaluation, overrideNodeId, currentOverrideValue]);

  function handleDiscard() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    // Only clear the URL override when it's still exactly the applied
    // draft, verbatim — an explicit later user edit is preserved.
    if (overrideNodeId && overrideIsUnmodifiedDraft) {
      const query = buildSearchParamsWithoutTextOverride(currentSearchParams, overrideNodeId);
      navigate(router, basePath, query);
    }
    setHandoff(null);
  }

  // Blocks Generate/submit for ANY staleness reason — not only a missing
  // reference — matching the auto-revert above: a stale draft must never
  // remain usable for preview or payload.
  const isBlocked = Boolean(evaluation?.stale);

  function handleFormSubmit(e: FormEvent<HTMLDivElement>) {
    if (isBlocked) {
      e.preventDefault();
    }
  }

  if (!handoff) {
    return <>{children}</>;
  }

  const presetLabel = PROMPT_COMPILER_PRESETS[handoff.presetId]?.label ?? handoff.presetId;

  return (
    <div onSubmit={handleFormSubmit}>
      <div className="mb-4 rounded border border-[#2c3035] bg-[#141618] px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[#5b93d6]">
            Compiled Prompt Draft — {presetLabel}
          </span>
          <button
            type="button"
            onClick={handleDiscard}
            className="text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors"
          >
            Discard Draft Override
          </button>
        </div>
        {!nodeResolution.ok && (
          <p className="text-xs text-[#b89a5a]">{nodeResolution.reason}</p>
        )}
        {evaluation?.stale && (
          <p className="text-xs text-[#b89a5a]">
            Compiled Prompt Draft is stale. {evaluation.reasons.join(" ")}
          </p>
        )}
        {isBlocked && (
          <p className="text-xs text-[#cf7b6b]">
            Generate is blocked until this is resolved — discard the draft override above, or
            regenerate the draft from this Shot&apos;s Prompt Compiler.
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
