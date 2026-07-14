// ---------------------------------------------------------------------------
// promptCompilerHandoff.ts — Prompt Compiler → Generation Panel handoff
// (PROMPT.COMPILER.3).
//
// Pure, deterministic module: no DB, no LLM call, no browser storage access
// (sessionStorage reads/writes stay in the client components that use this
// module). Defines the handoff's shape, a defensive sanitizer for whatever a
// caller pulls out of sessionStorage, and the staleness evaluation that
// compares a frozen handoff against live Shot data — reusing
// buildPromptCompilationContext/computePromptCompilerFingerprint exactly as
// PROMPT.COMPILER.1-FIX/.2 already validated, never duplicating their types.
// ---------------------------------------------------------------------------

import {
  buildPromptCompilationContext,
  type PromptCompilationContext,
  type PromptCompilationImageTag,
  type PromptCompilationSourceFlags,
  type PromptCompilationShotInput,
  type PromptCompilationCastAssetInput,
  type PromptCompilationAssetBibleInput,
  type PromptCompilationSequenceContextInput,
  type PromptCompilationProjectContextInput,
  type PromptCompilationReferenceImageInput,
} from "./buildPromptCompilationContext";
import {
  PROMPT_COMPILER_PRESETS,
  PROMPT_COMPILER_SOURCE_IDS,
  computePromptCompilerFingerprint,
  type PromptCompilerPresetId,
} from "./promptCompilerPresets";
import { detectTextInputKind } from "@/lib/textInputKind";

export const PROMPT_COMPILER_HANDOFF_MAX_DRAFT_LENGTH = 20000;

/** A single @ImageN mapping entry — identical shape to the compiler's own tag, never redefined. */
export type PromptCompilerHandoffReference = PromptCompilationImageTag;

export type PromptCompilerHandoff = {
  shotId: number;
  draftText: string;
  presetId: PromptCompilerPresetId;
  sourceFlags: PromptCompilationSourceFlags;
  /** The exact fingerprint computed by the Prompt Compiler panel when this draft was generated. */
  fingerprint: string;
  /** The exact, ordered @ImageN mapping used to build the draft. */
  references: PromptCompilerHandoffReference[];
  /** All reference refIds that were selectable for this shot at handoff time (the whole pool, not just the selection). */
  availableReferenceRefIds: string[];
  /** ISO timestamp — informational only, never used to decide staleness. */
  createdAt: string;
};

export function getPromptCompilerHandoffStorageKey(shotId: number): string {
  return `mikai:promptCompilerHandoff:shot:${shotId}`;
}

/** Immutable constructor — trims/bounds the draft text, never mutates inputs. */
export function buildPromptCompilerHandoff(input: {
  shotId: number;
  draftText: string;
  presetId: PromptCompilerPresetId;
  sourceFlags: PromptCompilationSourceFlags;
  fingerprint: string;
  references: PromptCompilerHandoffReference[];
  availableReferenceRefIds: string[];
  createdAt: string;
}): PromptCompilerHandoff {
  return {
    shotId: input.shotId,
    draftText: input.draftText.trim().slice(0, PROMPT_COMPILER_HANDOFF_MAX_DRAFT_LENGTH),
    presetId: input.presetId,
    sourceFlags: { ...input.sourceFlags },
    fingerprint: input.fingerprint,
    references: input.references.map((r) => ({ ...r })),
    availableReferenceRefIds: [...input.availableReferenceRefIds],
    createdAt: input.createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Defensive parser for whatever a caller reads out of sessionStorage (never
 * trusted): validates every field's type/shape and bounds the draft text.
 * Returns null on any structural mismatch — never throws, never guesses.
 */
export function sanitizePromptCompilerHandoff(raw: unknown): PromptCompilerHandoff | null {
  if (!isRecord(raw)) return null;

  if (typeof raw.shotId !== "number" || !Number.isInteger(raw.shotId) || raw.shotId <= 0) return null;
  if (typeof raw.draftText !== "string") return null;
  if (typeof raw.presetId !== "string" || !Object.hasOwn(PROMPT_COMPILER_PRESETS, raw.presetId)) return null;
  if (typeof raw.fingerprint !== "string" || raw.fingerprint.length === 0) return null;
  if (typeof raw.createdAt !== "string") return null;
  if (!isRecord(raw.sourceFlags)) return null;
  for (const id of PROMPT_COMPILER_SOURCE_IDS) {
    if (typeof raw.sourceFlags[id] !== "boolean") return null;
  }
  if (!Array.isArray(raw.references)) return null;
  if (!Array.isArray(raw.availableReferenceRefIds)) return null;

  const references: PromptCompilerHandoffReference[] = [];
  for (const entry of raw.references) {
    if (!isRecord(entry)) return null;
    if (typeof entry.tag !== "string" || typeof entry.refId !== "string") return null;
    if (entry.source !== "shot" && entry.source !== "asset") return null;
    references.push({
      tag: entry.tag,
      refId: entry.refId,
      source: entry.source,
      assetId: typeof entry.assetId === "number" ? entry.assetId : null,
      assetName: typeof entry.assetName === "string" ? entry.assetName : null,
      label: typeof entry.label === "string" ? entry.label : null,
      role: typeof entry.role === "string" ? entry.role : null,
      variantState: typeof entry.variantState === "string" ? entry.variantState : null,
      usageNotes: typeof entry.usageNotes === "string" ? entry.usageNotes : null,
      approvedForGeneration:
        typeof entry.approvedForGeneration === "boolean" ? entry.approvedForGeneration : null,
    });
  }

  const availableReferenceRefIds = raw.availableReferenceRefIds.filter(
    (id): id is string => typeof id === "string"
  );

  return buildPromptCompilerHandoff({
    shotId: raw.shotId,
    draftText: raw.draftText,
    presetId: raw.presetId as PromptCompilerPresetId,
    sourceFlags: raw.sourceFlags as PromptCompilationSourceFlags,
    fingerprint: raw.fingerprint,
    references,
    availableReferenceRefIds,
    createdAt: raw.createdAt,
  });
}

/** Live Shot data the Generation Panel already has, in the exact input shape buildPromptCompilationContext expects. */
export type PromptCompilerHandoffLiveData = {
  shot: PromptCompilationShotInput;
  castAssets: PromptCompilationCastAssetInput[];
  assetBibles: PromptCompilationAssetBibleInput[];
  sequenceContext: PromptCompilationSequenceContextInput | null;
  projectContext: PromptCompilationProjectContextInput | null;
  /** All refIds currently selectable for this shot (shot + cast asset reference images), regardless of any selection. */
  availableReferenceRefIds: string[];
  /** Live lookup so a reference's role/variant/usage/approval is re-derived from current data, never trusted from the frozen handoff cache. */
  availableReferencesByRefId: Record<string, PromptCompilationReferenceImageInput>;
};

export type PromptCompilerHandoffEvaluation = {
  stale: boolean;
  /** English, deterministic, deduplicated. */
  reasons: string[];
  /** Handoff reference refIds no longer present in the live pool — blocks Generate on its own, independent of `stale`. */
  missingReferenceRefIds: string[];
  currentFingerprint: string;
  context: PromptCompilationContext;
};

function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/**
 * Compares a frozen handoff against live Shot data. Never mutates either
 * argument. A reference's metadata is always re-derived from `live` when
 * still available (never from the handoff's frozen cache), so a role/
 * variant/usage-notes edit is caught by the fingerprint comparison exactly
 * like a casting/Asset Bible/context change would be.
 */
export function evaluatePromptCompilerHandoff(
  handoff: PromptCompilerHandoff,
  live: PromptCompilerHandoffLiveData
): PromptCompilerHandoffEvaluation {
  const reasons: string[] = [];

  const missingReferenceRefIds = handoff.references
    .map((r) => r.refId)
    .filter((refId) => !live.availableReferenceRefIds.includes(refId));

  if (missingReferenceRefIds.length > 0) {
    reasons.push(
      "A reference used in the Compiled Prompt Draft is no longer available for this shot."
    );
  }

  const liveSet = new Set(live.availableReferenceRefIds);
  const handoffSet = new Set(handoff.availableReferenceRefIds);
  const poolChanged =
    liveSet.size !== handoffSet.size || [...liveSet].some((id) => !handoffSet.has(id));
  if (poolChanged) {
    reasons.push(
      "The set of available reference images for this shot has changed since this draft was generated."
    );
  }

  const replayedReferences: PromptCompilationReferenceImageInput[] = handoff.references.map(
    (r) => live.availableReferencesByRefId[r.refId] ?? r
  );

  const context = buildPromptCompilationContext({
    shot: live.shot,
    castAssets: live.castAssets,
    references: replayedReferences,
    assetBibles: live.assetBibles,
    sequenceContext: live.sequenceContext,
    projectContext: live.projectContext,
    sources: handoff.sourceFlags,
  });

  const currentFingerprint = computePromptCompilerFingerprint(
    handoff.presetId,
    handoff.sourceFlags,
    context
  );

  if (currentFingerprint !== handoff.fingerprint) {
    reasons.push(
      "The Shot's context (references, casting, Asset Bibles, or sources) has changed since this draft was generated."
    );
  }

  return {
    stale: reasons.length > 0,
    reasons: dedupePreservingOrder(reasons),
    missingReferenceRefIds,
    currentFingerprint,
    context,
  };
}

/**
 * Rebuilds the query string with `textNode_<nodeId>` set to `value`,
 * replacing any prior value for that same node (never a duplicate key).
 * Pure string transform — no browser API, safe to unit test directly.
 */
export function buildSearchParamsWithTextOverride(
  currentSearchParams: Record<string, string>,
  nodeId: string,
  value: string
): string {
  const params = new URLSearchParams();
  for (const [key, v] of Object.entries(currentSearchParams)) {
    if (key === `textNode_${nodeId}`) continue;
    params.set(key, v);
  }
  params.set(`textNode_${nodeId}`, value);
  return params.toString();
}

/** Rebuilds the query string with `textNode_<nodeId>` removed entirely. */
export function buildSearchParamsWithoutTextOverride(
  currentSearchParams: Record<string, string>,
  nodeId: string
): string {
  const params = new URLSearchParams();
  for (const [key, v] of Object.entries(currentSearchParams)) {
    if (key === `textNode_${nodeId}`) continue;
    params.set(key, v);
  }
  return params.toString();
}

export type PromptCompilerTextNodeCandidate = { nodeId: string; label: string; title: string };

export type PromptCompilerTextNodeResolution =
  | { ok: true; nodeId: string }
  | { ok: false; reason: string };

/**
 * Identifies the real "Text Prompt (Input)" node among a workflow's
 * detected text-kind mappings, reusing the existing detectTextInputKind
 * helper (never re-implemented). Never silently guesses when zero or more
 * than one candidate is generic (i.e. neither negative nor style).
 */
export function resolvePromptCompilerTextNode(
  candidates: PromptCompilerTextNodeCandidate[]
): PromptCompilerTextNodeResolution {
  const generic = candidates.filter(
    (c) => detectTextInputKind(c.label || c.title) === "generic"
  );
  if (generic.length === 0) {
    return {
      ok: false,
      reason:
        "No Text Prompt (Input) field was detected on this workflow. The Compiled Prompt Draft cannot be applied automatically.",
    };
  }
  if (generic.length > 1) {
    return {
      ok: false,
      reason:
        "Multiple possible Text Prompt (Input) fields were detected on this workflow. Choose the field manually — the Compiled Prompt Draft was not applied automatically.",
    };
  }
  return { ok: true, nodeId: generic[0].nodeId };
}
