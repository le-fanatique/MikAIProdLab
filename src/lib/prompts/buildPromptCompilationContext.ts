// ---------------------------------------------------------------------------
// buildPromptCompilationContext.ts — Canonical, deterministic compilation
// context builder (PROMPT.COMPILER.1-FIX).
//
// This is a context *contract*, not a prompt text generator: it never
// formats a final string, never calls an LLM, and never picks references,
// casting, duration, segments, workflow or JSON payload on its own — it only
// normalizes exactly what the caller already selected/decided into a stable,
// serializable, order-preserving shape that PROMPT.COMPILER.2/.3 can build
// on. Pure function: no DB, no browser, no network, no Date.now()/
// Math.random(). Never mutates its inputs.
//
// Existing surfaces (ShotGenerationPanel, the /map page, the generation
// action, compileShotPrompt/compilePromptSegments) are intentionally left
// untouched by this ticket — see the accompanying report for why no
// integration was necessary.
// ---------------------------------------------------------------------------

export type PromptCompilationSourceFlags = {
  casting: boolean;
  references: boolean;
  assetBibles: boolean;
  sequenceContext: boolean;
  projectContext: boolean;
};

export type PromptCompilationGroup =
  | "shot"
  | "casting"
  | "references"
  | "assetBibles"
  | "sequenceContext"
  | "projectContext";

export type PromptCompilationShotInput = {
  title?: string | null;
  description?: string | null;
  actionPitch?: string | null;
  cameraPitch?: string | null;
  durationSeconds?: number | null;
  shotPrompt?: string | null;
  /** Already-compiled Prompt Segments text (compilePromptSegments(...).text), never re-parsed here. */
  compiledPromptSegments?: string | null;
  hasPromptSegments?: boolean;
  hasMissingTiming?: boolean;
};

export type PromptCompilationShot = {
  title: string | null;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
  durationSeconds: number | null;
  shotPrompt: string | null;
  compiledPromptSegments: string | null;
  hasPromptSegments: boolean;
  hasMissingTiming: boolean;
};

/**
 * One image reference the user has actually selected, in the exact order
 * they selected it. `refId` is a caller-supplied stable identifier (e.g.
 * "shot-12" / "asset-3-45") used only for dedupe/lookup — never for
 * sorting, and never re-derived from label/role/id here.
 */
export type PromptCompilationReferenceImageInput = {
  refId: string;
  source: "shot" | "asset";
  assetId?: number | null;
  assetName?: string | null;
  label?: string | null;
  role?: string | null;
  variantState?: string | null;
  usageNotes?: string | null;
  approvedForGeneration?: boolean | null;
};

export type PromptCompilationImageTag = {
  /** Deterministic, 1-based, assigned strictly in input order: "@Image1", "@Image2", ... */
  tag: string;
  refId: string;
  source: "shot" | "asset";
  assetId: number | null;
  assetName: string | null;
  label: string | null;
  role: string | null;
  variantState: string | null;
  usageNotes: string | null;
  approvedForGeneration: boolean | null;
};

/**
 * One asset actually cast in the Shot (shot_assets), in the exact order the
 * caller supplied. This is the only source of narrative "who is in this
 * shot" truth — never derived from `references` or `assetBibles`.
 */
export type PromptCompilationCastAssetInput = {
  assetId: number;
  assetName: string;
  assetType?: string | null;
  description?: string | null;
  notes?: string | null;
};

export type PromptCompilationCastAsset = {
  assetId: number;
  assetName: string;
  assetType: string | null;
  description: string | null;
  notes: string | null;
  /** Explicit link to this asset's Asset Bible entry, if the assetBibles source is included and a matching entry was provided. Never fabricated. */
  assetBible: PromptCompilationAssetBible | null;
};

export type PromptCompilationAssetBibleInput = {
  assetId: number;
  assetName: string;
  assetType?: string | null;
  visualIdentity?: string | null;
  usageRules?: string | null;
  forbiddenVariations?: string | null;
};

export type PromptCompilationAssetBible = {
  assetId: number;
  assetName: string;
  assetType: string | null;
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
};

export type PromptCompilationSequenceContextInput = {
  title?: string | null;
  summary?: string | null;
  mood?: string | null;
  locationHint?: string | null;
  narrativePurpose?: string | null;
};

export type PromptCompilationSequenceContext = {
  title: string | null;
  summary: string | null;
  mood: string | null;
  locationHint: string | null;
  narrativePurpose: string | null;
};

export type PromptCompilationProjectContextInput = {
  name?: string | null;
  pitch?: string | null;
  story?: string | null;
};

export type PromptCompilationProjectContext = {
  name: string | null;
  pitch: string | null;
  story: string | null;
};

export type BuildPromptCompilationContextInput = {
  shot: PromptCompilationShotInput;
  /** Exact cast order (e.g. shot_assets insertion/orderIndex order); never re-sorted. */
  castAssets: PromptCompilationCastAssetInput[];
  /** Exact user-selected order; never re-sorted, never filtered by anything but the flags/dedupe rules below. */
  references: PromptCompilationReferenceImageInput[];
  assetBibles: PromptCompilationAssetBibleInput[];
  sequenceContext?: PromptCompilationSequenceContextInput | null;
  projectContext?: PromptCompilationProjectContextInput | null;
  sources: PromptCompilationSourceFlags;
};

export type PromptCompilationContext = {
  shot: PromptCompilationShot;
  /** Empty when sources.casting is false. Never contains an asset the caller didn't cast. */
  castAssets: PromptCompilationCastAsset[];
  /** Empty when sources.references is false. Never contains an image the caller didn't select. */
  references: PromptCompilationImageTag[];
  /** Empty when sources.assetBibles is false. */
  assetBibles: PromptCompilationAssetBible[];
  /** null when sources.sequenceContext is false, or when the input had no non-empty field. */
  sequenceContext: PromptCompilationSequenceContext | null;
  /** null when sources.projectContext is false, or when the input had no non-empty field. */
  projectContext: PromptCompilationProjectContext | null;
  sourcesIncluded: PromptCompilationGroup[];
  sourcesExcluded: PromptCompilationGroup[];
  /** "@ImageN" -> asset/reference, role, variant/state, usage notes — the exact mapping promised to callers. */
  imageMap: Record<string, PromptCompilationImageTag>;
  /** English diagnostics, deduplicated, deterministic order. Never throws. */
  warnings: string[];
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

function buildShot(input: PromptCompilationShotInput): PromptCompilationShot {
  return {
    title: trimOrNull(input.title),
    description: trimOrNull(input.description),
    actionPitch: trimOrNull(input.actionPitch),
    cameraPitch: trimOrNull(input.cameraPitch),
    durationSeconds:
      typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
        ? input.durationSeconds
        : null,
    shotPrompt: trimOrNull(input.shotPrompt),
    compiledPromptSegments: trimOrNull(input.compiledPromptSegments),
    hasPromptSegments: Boolean(input.hasPromptSegments),
    hasMissingTiming: Boolean(input.hasMissingTiming),
  };
}

function buildReferences(
  references: PromptCompilationReferenceImageInput[],
  warnings: string[]
): PromptCompilationImageTag[] {
  const seenRefIds = new Set<string>();
  const tags: PromptCompilationImageTag[] = [];
  let index = 0;

  for (const ref of references) {
    if (seenRefIds.has(ref.refId)) {
      warnings.push(`Duplicate reference removed: ${ref.refId}`);
      continue;
    }
    seenRefIds.add(ref.refId);
    index += 1;

    const role = trimOrNull(ref.role);
    const variantState = trimOrNull(ref.variantState);
    const usageNotes = trimOrNull(ref.usageNotes);
    const approvedForGeneration =
      ref.source === "asset" ? ref.approvedForGeneration ?? null : null;

    if (ref.source === "asset" && approvedForGeneration === false) {
      warnings.push("Reference image is not approved for generation.");
    }
    if (!role && !variantState && !usageNotes) {
      warnings.push("Reference image has no role, variant/state or usage notes.");
    }

    tags.push({
      tag: `@Image${index}`,
      refId: ref.refId,
      source: ref.source,
      assetId: ref.source === "asset" ? ref.assetId ?? null : null,
      assetName: ref.source === "asset" ? trimOrNull(ref.assetName) : null,
      label: trimOrNull(ref.label),
      role,
      variantState,
      usageNotes,
      approvedForGeneration,
    });
  }

  return tags;
}

function buildAssetBibles(
  assetBibles: PromptCompilationAssetBibleInput[],
  warnings: string[]
): PromptCompilationAssetBible[] {
  const seenAssetIds = new Set<number>();
  const result: PromptCompilationAssetBible[] = [];

  for (const bible of assetBibles) {
    if (seenAssetIds.has(bible.assetId)) {
      warnings.push(`Duplicate Asset Bible removed: asset ${bible.assetId}`);
      continue;
    }
    seenAssetIds.add(bible.assetId);

    result.push({
      assetId: bible.assetId,
      assetName: bible.assetName.trim(),
      assetType: trimOrNull(bible.assetType),
      visualIdentity: trimOrNull(bible.visualIdentity),
      usageRules: trimOrNull(bible.usageRules),
      forbiddenVariations: trimOrNull(bible.forbiddenVariations),
    });
  }

  return result;
}

function buildCastAssets(
  castAssets: PromptCompilationCastAssetInput[],
  assetBibles: PromptCompilationAssetBible[],
  warnings: string[]
): PromptCompilationCastAsset[] {
  const bibleByAssetId = new Map<number, PromptCompilationAssetBible>();
  for (const bible of assetBibles) {
    bibleByAssetId.set(bible.assetId, bible);
  }

  const seenAssetIds = new Set<number>();
  const result: PromptCompilationCastAsset[] = [];

  for (const cast of castAssets) {
    if (seenAssetIds.has(cast.assetId)) {
      warnings.push(`Duplicate cast asset removed: asset ${cast.assetId}`);
      continue;
    }
    seenAssetIds.add(cast.assetId);

    result.push({
      assetId: cast.assetId,
      assetName: cast.assetName.trim(),
      assetType: trimOrNull(cast.assetType),
      description: trimOrNull(cast.description),
      notes: trimOrNull(cast.notes),
      assetBible: bibleByAssetId.get(cast.assetId) ?? null,
    });
  }

  return result;
}

function buildSequenceContext(
  input: PromptCompilationSequenceContextInput | null | undefined
): PromptCompilationSequenceContext | null {
  if (!input) return null;
  const context: PromptCompilationSequenceContext = {
    title: trimOrNull(input.title),
    summary: trimOrNull(input.summary),
    mood: trimOrNull(input.mood),
    locationHint: trimOrNull(input.locationHint),
    narrativePurpose: trimOrNull(input.narrativePurpose),
  };
  const isEmpty = Object.values(context).every((v) => v === null);
  return isEmpty ? null : context;
}

function buildProjectContext(
  input: PromptCompilationProjectContextInput | null | undefined
): PromptCompilationProjectContext | null {
  if (!input) return null;
  const context: PromptCompilationProjectContext = {
    name: trimOrNull(input.name),
    pitch: trimOrNull(input.pitch),
    story: trimOrNull(input.story),
  };
  const isEmpty = Object.values(context).every((v) => v === null);
  return isEmpty ? null : context;
}

export function buildPromptCompilationContext(
  input: BuildPromptCompilationContextInput
): PromptCompilationContext {
  const warnings: string[] = [];

  const shot = buildShot(input.shot);

  const assetBibles = input.sources.assetBibles
    ? buildAssetBibles(input.assetBibles, warnings)
    : [];
  if (input.sources.assetBibles && assetBibles.length === 0) {
    warnings.push("Asset Bibles source was requested but produced no content.");
  }

  const castAssets = input.sources.casting
    ? buildCastAssets(input.castAssets, assetBibles, warnings)
    : [];
  if (input.sources.casting && castAssets.length === 0) {
    warnings.push("Casting source was requested but produced no content.");
  }

  const references = input.sources.references
    ? buildReferences(input.references, warnings)
    : [];
  if (input.sources.references && references.length === 0) {
    warnings.push("References source was requested but produced no content.");
  }

  const sequenceContext = input.sources.sequenceContext
    ? buildSequenceContext(input.sequenceContext)
    : null;
  if (input.sources.sequenceContext && sequenceContext === null) {
    warnings.push("Sequence context source was requested but produced no content.");
  }

  const projectContext = input.sources.projectContext
    ? buildProjectContext(input.projectContext)
    : null;
  if (input.sources.projectContext && projectContext === null) {
    warnings.push("Project context source was requested but produced no content.");
  }

  const sourcesIncluded: PromptCompilationGroup[] = ["shot"];
  const sourcesExcluded: PromptCompilationGroup[] = [];

  const groupFlags: [PromptCompilationGroup, boolean][] = [
    ["casting", input.sources.casting],
    ["references", input.sources.references],
    ["assetBibles", input.sources.assetBibles],
    ["sequenceContext", input.sources.sequenceContext],
    ["projectContext", input.sources.projectContext],
  ];
  for (const [group, enabled] of groupFlags) {
    if (enabled) sourcesIncluded.push(group);
    else sourcesExcluded.push(group);
  }

  const imageMap: Record<string, PromptCompilationImageTag> = {};
  for (const ref of references) {
    imageMap[ref.tag] = ref;
  }

  return {
    shot,
    castAssets,
    references,
    assetBibles,
    sequenceContext,
    projectContext,
    sourcesIncluded,
    sourcesExcluded,
    imageMap,
    warnings: dedupePreservingOrder(warnings),
  };
}
