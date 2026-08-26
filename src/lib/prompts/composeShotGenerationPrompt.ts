// ---------------------------------------------------------------------------
// composeShotGenerationPrompt.ts — SHOTPROMPT.SHOT.1
//
// The single shot-level generation prompt composer, reused by every surface
// that queues or previews one Shot's generation:
//   - `src/lib/comfy/runShotGeneration.ts` (the action that queues);
//   - `src/components/ShotGenerationPanel.tsx` (the embedded preview);
//   - the `/map` page (the standalone mapping surface).
//
// A resolution written three times is the recurring defect this codebase
// extracts modules to prevent (docs/WHERE_THE_RULES_LIVE.md §3) — this
// module exists so the three surfaces above can never disagree on what a
// Shot's composed generation text actually is.
//
// A Shot is the N = 1 case of the Sequence Storyboard package
// (`buildSequenceStoryboardPrompt` + `formatSequenceGenerationPackageText`'s
// `storyboardComposition` option): the same "Style:" once, then
// "Subject Definition:" (`@ImageN` + the guide's named mode per casting
// reference, `getGuideModeForRole` — the exact table
// `buildSequenceStoryboardPrompt` already uses), then the six-part body
// `composeStoryboardShot` already renders — reused verbatim here, never
// duplicated. `compileShotPrompt` keeps its own responsibility (the video
// `Timeline:` text and its warnings); this module wraps it, never replaces
// or empties it.
//
// No `【Unused Assets】` block: an unselected reference is never uploaded
// (`docs/WHERE_THE_RULES_LIVE.md`), so naming its `@ImageN` here would tell
// the model about an image it never received — the same reasoning
// `buildSequenceStoryboardPrompt`'s own header comment already states.
//
// Pure function: no DB, no browser, no network, no Date.now()/Math.random().
// `context` must already be built by `buildPromptCompilationContext` from a
// `references` array in the caller's own selection order
// (`orderStoryboardReferences` — see `buildOrderedShotReferenceInputs`
// below) — `@ImageN` is never decided here, only read. `lighting` and
// `projectStyle` must already be resolved (`resolveStoryboardLighting`,
// `resolveProjectStyleTextForComposition`) — this module never re-resolves
// either, exactly like `composeStoryboardShot`'s own `lighting` input.
// ---------------------------------------------------------------------------

import { compileShotPrompt, type ShotPromptCompileKind } from "./compileShotPrompt";
import type { PromptCompilationContext, PromptCompilationReferenceImageInput } from "./buildPromptCompilationContext";
import {
  composeStoryboardShot,
  type StoryboardShotCompositionInput,
} from "@/lib/llmWorkspace/composition/storyboardShot";
import { getGuideModeForRole } from "@/lib/llmWorkspace/conformation/profiles/guideDefault";
import { orderStoryboardReferences } from "./orderStoryboardReferences";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { resolveOverriddenRole } from "@/lib/comfy/dynamicBatchRoleOverrides";

// ---------------------------------------------------------------------------
// Reference ordering — IND.REFORDER.1's rule applied to a single Shot.
// `@ImageN` must designate the image actually sent at that position: the
// batch's own selected order/subset when a Dynamic Batch node is usable,
// never the raw Storyboard/cast order. Shared by all three composer callers
// so none of them can reimplement `orderStoryboardReferences` slightly
// differently (SHOTPROMPT.SHOT.1's filet mutation 2).
// ---------------------------------------------------------------------------

export type BuildOrderedShotReferenceInputsParams = {
  /** True when a Dynamic Batch node was detected and is usable for this workflow. */
  hasDynamicBatch: boolean;
  /** The batch's own selection, in its own order — ignored when `hasDynamicBatch` is false. */
  batchSelectedIds: string[];
  /** Every selectable reference for this Shot (shot + cast asset references), in display order — the fallback when there is no batch node. */
  availableImages: RuntimeImageOption[];
  /**
   * REFROLE.INTENT.1 — the job-level role overlay from the Dynamic Batch
   * "Selected Images" panel (`batchImageRoles_<nodeId>`, `id -> role`).
   * Overrides the library's own stored role for that id, for this
   * composition only — never written back to `shot_reference_images` or
   * `asset_reference_images`. Absent/undefined behaves exactly as before
   * this ticket.
   */
  roleOverrides?: Record<string, string>;
};

export function buildOrderedShotReferenceInputs(
  params: BuildOrderedShotReferenceInputsParams
): PromptCompilationReferenceImageInput[] {
  // "board" references (Sequence Storyboard visual anchor) never reach a
  // single Shot's own generation — only "shot"/"asset" are meaningful here,
  // and `PromptCompilationReferenceImageInput.source` has no third option.
  const orderable = params.availableImages.filter(
    (img): img is RuntimeImageOption & { source: "shot" | "asset" } => img.source === "shot" || img.source === "asset"
  );
  const metaByRefId = new Map(orderable.map((img) => [img.id, img]));

  const { references } = orderStoryboardReferences({
    hasDynamicBatch: params.hasDynamicBatch,
    batchSelectedIds: params.batchSelectedIds,
    availableImages: orderable,
    metaByRefId,
  });

  return references.map((img) => ({
    refId: img.id,
    source: img.source,
    assetName: img.assetName ?? null,
    assetType: img.assetType ?? null,
    label: img.label ?? null,
    role: resolveOverriddenRole(img.id, img.role ?? null, params.roleOverrides),
    variantState: img.variantState ?? null,
    approvedForGeneration: img.approved ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export type ComposeShotGenerationPromptInput = {
  kind: ShotPromptCompileKind;
  /** The already-built pantry — `context.references` must already be in the caller's own selection order (see `buildOrderedShotReferenceInputs`). */
  context: PromptCompilationContext;
  continuity: StoryboardShotCompositionInput["continuity"];
  /** Already resolved by precedence (`resolveStoryboardLighting`) — one value, never re-derived here. */
  lighting: string | null;
  /** Already resolved (`resolveProjectStyleTextForComposition`'s `styleText`) — rendered once, ahead of `Subject Definition:`, the same convention `buildSequenceStoryboardPrompt`'s header uses. `null`/blank renders no `Style:` line. */
  projectStyle: string | null;
  /**
   * SHOTPROMPT.STYLE.1 — `resolveProjectStyleTextForComposition`'s
   * `avoidText`: the Avoid group's bullet lines over Project Style rules
   * with `strength: "Avoid"` — **no leading `Avoid:` heading**
   * (SHOTPROMPT.RENDER.1: this value is passed through to
   * `composeStoryboardShot`, which folds it into `Constraints:` ahead of
   * the per-asset `forbiddenVariations` lines, so re-adding `Avoid:` here
   * duplicated it, `Constraints: Avoid:`). Never rendered under `Style:`.
   * `null`/blank renders nothing.
   */
  projectStyleAvoid?: string | null;
  /**
   * SHOT.NEGATIVE.1 — the Shot's own `negativeConstraints` column, straight
   * through to `composeStoryboardShot`'s own input of the same name. No
   * resolution here (unlike `lighting`): the caller reads the column itself.
   */
  negativeConstraints?: string | null;
  profileId?: StoryboardShotCompositionInput["profileId"];
};

export type ComposedShotGenerationPromptSectionId = "style" | "subjectDefinition" | "composition" | "timeline";

export type ComposedShotGenerationPromptSection = {
  id: ComposedShotGenerationPromptSectionId;
  label: string;
  text: string;
};

export type ComposedShotGenerationPrompt = {
  /** The exact final text — identical value used for preview and for generation. */
  text: string;
  kind: ShotPromptCompileKind;
  /** Only sections that actually contributed — never a fabricated empty one. */
  sections: ComposedShotGenerationPromptSection[];
  usedTimeline: boolean;
  /** English diagnostics, deduplicated: `compileShotPrompt`'s own (Timeline/empty-prompt) plus `buildPromptCompilationContext`'s own ("requested but produced no content"). */
  warnings: string[];
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
 * `assetName (assetType) — @ImageN <named mode>` per casting reference, in
 * `context.references`' own order (already the caller's selection order) —
 * the exact line shape `buildSequenceStoryboardPrompt`'s header already
 * renders once per Sequence package; here it is once per Shot. Shot-sourced
 * references (no `assetName`) never produce a line — Subject Definition
 * only ever names casting.
 */
function buildSubjectDefinitionLines(context: PromptCompilationContext): string[] {
  const lines: string[] = [];
  for (const ref of context.references) {
    if (ref.source !== "asset" || !ref.assetName) continue;
    const mode = getGuideModeForRole(ref.role);
    const namePart = ref.assetType ? `${ref.assetName} (${ref.assetType})` : ref.assetName;
    lines.push(`${namePart} — ${ref.tag}${mode ? ` ${mode}` : ""}`);
  }
  return lines;
}

/**
 * Composes exactly one Shot's generation prompt. The N = 1 case of the
 * Sequence Storyboard package's own per-Shot render, so the storyboard
 * image/video pass never has to redo this work.
 */
export function composeShotGenerationPrompt(input: ComposeShotGenerationPromptInput): ComposedShotGenerationPrompt {
  const { context } = input;

  const compiledShotPrompt = compileShotPrompt({
    kind: input.kind,
    shotPrompt: context.shot.shotPrompt,
    compiledPromptSegments: context.shot.compiledPromptSegments,
    hasPromptSegments: context.shot.hasPromptSegments,
    hasMissingTiming: context.shot.hasMissingTiming,
  });

  const storyboardComposition = composeStoryboardShot({
    context,
    continuity: input.continuity,
    lighting: input.lighting,
    styleAvoid: input.projectStyleAvoid,
    negativeConstraints: input.negativeConstraints,
    profileId: input.profileId,
  });

  const sections: ComposedShotGenerationPromptSection[] = [];

  const trimmedStyle = input.projectStyle?.trim() ?? "";
  if (trimmedStyle) {
    sections.push({ id: "style", label: "Style", text: trimmedStyle });
  }

  const subjectLines = buildSubjectDefinitionLines(context);
  if (subjectLines.length > 0) {
    sections.push({ id: "subjectDefinition", label: "Subject Definition", text: subjectLines.join("\n") });
  }

  if (storyboardComposition.text) {
    sections.push({ id: "composition", label: "Composition", text: storyboardComposition.text });
  }

  const timelineSection = compiledShotPrompt.sections.find((s) => s.id === "timeline");
  if (timelineSection) {
    sections.push({ id: "timeline", label: "Timeline", text: timelineSection.text });
  }

  const text = sections
    .map((section) => {
      if (section.id === "style") return `Style: ${section.text}`;
      if (section.id === "subjectDefinition") return `Subject Definition:\n${section.text}`;
      if (section.id === "timeline") return `Timeline:\n${section.text}`;
      return section.text;
    })
    .join("\n\n");

  return {
    text,
    kind: input.kind,
    sections,
    usedTimeline: compiledShotPrompt.usedTimeline,
    warnings: dedupePreservingOrder([...compiledShotPrompt.warnings, ...context.warnings]),
  };
}
