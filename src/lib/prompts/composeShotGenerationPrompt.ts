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
// "Subject Definition:" — one line per reference actually sent, never only
// per casting reference (SHOTPROMPT.REFS.2's correction of the mirror
// defect), each carrying `@ImageN` plus the guide's named mode when its role
// has one (`getGuideModeForRole` — the exact table `buildSequenceStoryboardPrompt`
// already uses) and a job-level note when one was written — then the
// six-part body `composeStoryboardShot` already renders — reused verbatim
// here, never duplicated. `compileShotPrompt` keeps its own responsibility
// (the video `Timeline:` text and its warnings); this module wraps it, never
// replaces or empties it.
//
// No `【Unused Assets】` block: an unselected reference is never uploaded
// (`docs/WHERE_THE_RULES_LIVE.md`), so naming its `@ImageN` here would tell
// the model about an image it never received — the same reasoning
// `buildSequenceStoryboardPrompt`'s own header comment already states.
//
// Pure function: no DB, no browser, no network, no Date.now()/Math.random().
// `context` must already be built by `buildPromptCompilationContext` from a
// `references` array in the caller's own selection order (see
// `buildOrderedShotReferenceInputs` below) — `@ImageN` is never decided
// here, only read. `lighting` and `projectStyle` must already be resolved
// (`resolveStoryboardLighting`, `resolveProjectStyleTextForComposition`) —
// this module never re-resolves either, exactly like `composeStoryboardShot`'s
// own `lighting` input.
// ---------------------------------------------------------------------------

import { compileShotPrompt, type ShotPromptCompileKind } from "./compileShotPrompt";
import type { PromptCompilationContext, PromptCompilationReferenceImageInput } from "./buildPromptCompilationContext";
import {
  composeStoryboardShot,
  type StoryboardShotCompositionInput,
} from "@/lib/llmWorkspace/composition/storyboardShot";
import { getGuideModeForRole } from "@/lib/llmWorkspace/conformation/profiles/guideDefault";
import {
  checkPromptConsistency,
  type PromptConsistencyFinding,
} from "@/lib/llmWorkspace/composition/promptConsistency";
import type { ConformationFinding } from "@/lib/llmWorkspace/conformation";
import { orderStoryboardReferences } from "./orderStoryboardReferences";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { resolveOverriddenRole } from "@/lib/comfy/dynamicBatchRoleOverrides";
import { resolveNoteOverride } from "@/lib/comfy/dynamicBatchImageNotes";
import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";

// ---------------------------------------------------------------------------
// Reference ordering — IND.REFORDER.1's rule applied to a single Shot, and
// SHOTPROMPT.REFS.1's correction of its non-batch case.
//
// `@ImageN` must designate the image actually sent at that position:
//   - a Dynamic Batch node usable → its own selected order/subset
//     (`orderStoryboardReferences`, reused unchanged — already correct);
//   - no batch, but images assigned per node (`selectedImageByNodeId`) →
//     those images, in the workflow's own deterministic node order
//     (`orderShotReferencesByNodeAssignment` below) — never
//     `orderStoryboardReferences`'s "everything selectable" fallback, which
//     is right only for its other caller, the Sequence Storyboard page
//     (`docs/WHERE_THE_RULES_LIVE.md`);
//   - no image inputs sent at all → no references, so
//     `composeShotGenerationPrompt` renders no `Subject Definition` block —
//     never an empty one.
//
// Shared by all three composer callers so none of them can reimplement this
// rule slightly differently (SHOTPROMPT.SHOT.1's filet mutation 2).
// ---------------------------------------------------------------------------

export type BuildOrderedShotReferenceInputsParams = {
  /** True when a Dynamic Batch node was detected and is usable for this workflow. */
  hasDynamicBatch: boolean;
  /** The batch's own selection, in its own order — ignored when `hasDynamicBatch` is false. */
  batchSelectedIds: string[];
  /** Every selectable reference for this Shot (shot + cast asset references), by id — the metadata lookup for whichever ids actually get ordered below. Never itself the order, on the Shot path (SHOTPROMPT.REFS.1). */
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
  /**
   * SHOTPROMPT.REFS.2 — the job-level free-text note overlay from the same
   * "Selected Images" panel (`batchImageNotes_<nodeId>`, `id -> note`).
   * Job-only, never persisted to `shot_reference_images` or
   * `asset_reference_images`, and never read from a library field — there is
   * no "library note" to fall back to. Absent/undefined behaves exactly as
   * before this ticket (no note on any reference).
   */
  noteOverrides?: Record<string, string>;
  /**
   * SHOTPROMPT.REFS.1 — the workflow's own parsed inputs
   * (`parseComfyWorkflow(workflowJson).inputs`), used only when
   * `hasDynamicBatch` is false, to read the image-kind ones in the
   * workflow's own node order. That order is not invented here: ComfyUI
   * node ids are the workflow JSON's own object keys, and V8 (like every
   * spec-conformant engine) visits integer-like keys in ascending numeric
   * order regardless of source order — `parseComfyWorkflow`'s
   * `detectWorkflowInputs` already relies on exactly this, and
   * `comfyServerClient.ts`'s `extractComfyOutputs` documents the same
   * language rule for its own "between nodes" ordering. Deterministic
   * across runs for a given workflow, never invented.
   */
  imageInputs: WorkflowInput[];
  /**
   * SHOTPROMPT.REFS.1 — node id -> the image id actually assigned there,
   * exactly `buildGenerationPayload`'s own `selectedImageByNodeId`. Used
   * only when `hasDynamicBatch` is false: a workflow image node with no
   * entry here contributes no reference line, because no image was ever
   * actually sent for it. Absent entirely (no image inputs assigned, or no
   * image inputs at all) yields zero references — the caller renders no
   * `Subject Definition` block at all, never an empty one.
   */
  selectedImageByNodeId?: Record<string, string>;
};

/**
 * SHOTPROMPT.REFS.1 — case 2/3 of the Shot path's own ordering rule:
 * without a Dynamic Batch node, `@ImageN` must be the images actually
 * assigned per node, in the workflow's own node order, never "everything
 * selectable" (`orderStoryboardReferences`'s fallback, which is correct only
 * for its other caller, the Sequence Storyboard page — see
 * `docs/WHERE_THE_RULES_LIVE.md`). An asset whose two different images are
 * each assigned to a different node yields two lines — this orders by node
 * assignment, it never deduplicates by asset. A workflow with no image
 * inputs, or no assignments yet, yields `[]`: no batch, no per-node
 * assignment, nothing was actually sent.
 */
function orderShotReferencesByNodeAssignment(params: {
  imageInputs: WorkflowInput[];
  selectedImageByNodeId?: Record<string, string>;
}): string[] {
  const selected = params.selectedImageByNodeId;
  if (!selected) return [];

  const orderedIds: string[] = [];
  for (const input of params.imageInputs) {
    if (input.kind !== "image") continue;
    const imageId = selected[input.nodeId];
    if (!imageId) continue;
    orderedIds.push(imageId);
  }
  return orderedIds;
}

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

  // Dynamic Batch reuses `orderStoryboardReferences` unchanged — already
  // correct, it returns the batch's own selection regardless of
  // `availableImages`. Without a batch node, the Shot path orders by actual
  // per-node assignment instead of that module's "everything selectable"
  // fallback (SHOTPROMPT.REFS.1 — see this file's own header and
  // `docs/WHERE_THE_RULES_LIVE.md`).
  const orderedIds = params.hasDynamicBatch
    ? orderStoryboardReferences({
        hasDynamicBatch: true,
        batchSelectedIds: params.batchSelectedIds,
        availableImages: orderable,
        metaByRefId,
      }).orderedIds
    : orderShotReferencesByNodeAssignment({
        imageInputs: params.imageInputs,
        selectedImageByNodeId: params.selectedImageByNodeId,
      });

  const references = orderedIds
    .map((id) => metaByRefId.get(id))
    .filter((meta): meta is RuntimeImageOption & { source: "shot" | "asset" } => meta !== undefined);

  return references.map((img) => ({
    refId: img.id,
    source: img.source,
    assetName: img.assetName ?? null,
    assetType: img.assetType ?? null,
    label: img.label ?? null,
    role: resolveOverriddenRole(img.id, img.role ?? null, params.roleOverrides),
    variantState: img.variantState ?? null,
    approvedForGeneration: img.approved ?? null,
    note: resolveNoteOverride(img.id, params.noteOverrides),
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
  /**
   * PROMPT.DOCTOR.1, Part A, check 5 — see
   * `checkPromptConsistency`'s own `lightingChainHadUnusedCandidate` doc.
   * Optional and defaulting to no finding: this module reads no database, so
   * the caller (which already resolves the lighting chain) supplies it.
   */
  lightingChainHadUnusedCandidate?: boolean;
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
  /**
   * PROMPT.DOCTOR.1 — `composeStoryboardShot`'s own conformation findings
   * (the engine's output discipline, `guideDefault.inspect`) plus
   * `checkPromptConsistency`'s own (this composition's internal
   * consistency), merged into the one shape both already share
   * (`code`/`severity`/`message`). Previously computed by this module and
   * thrown away — every caller can now display them, informational only,
   * never a gate on Generate.
   */
  findings: Array<ConformationFinding | PromptConsistencyFinding>;
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
 * SHOTPROMPT.REFS.2 — one line per reference actually sent
 * (`context.references`' own order, already the caller's selection order),
 * never one line per casting-named asset only. The mirror of
 * `SHOTPROMPT.REFS.1`'s "declare nothing that wasn't sent": this is "declare
 * everything that WAS sent" — the author's own case (four images sent, one
 * from the plan, only three declared) is exactly a reference with no
 * `assetName` producing no line at all, which this function no longer does.
 *
 * Two shapes, chosen by whether the reference carries a casting asset name:
 *   - issued from an asset: `{name} ({type}) — @ImageN[ {mode}][ — {note}]` —
 *     unchanged from before this ticket, plus the trailing note;
 *   - issued from the plan (no asset name — a Shot reference image, or an
 *     asset reference whose name did not survive trimming): `@ImageN[ {mode}]
 *     [ — {note}]` — the tag alone when neither a named mode nor a note
 *     exists, never the image's own `label` as a stand-in name. A `label`
 *     defaults to "Generated Output" for a generated image, and the author
 *     was explicit that showing that default would misrepresent the image as
 *     described when it isn't ("le nom est par défaut Generated Output, donc
 *     je suggère de ne pas le mettre").
 */
function buildSubjectDefinitionLines(context: PromptCompilationContext): string[] {
  const lines: string[] = [];
  for (const ref of context.references) {
    const mode = getGuideModeForRole(ref.role);
    const modePart = mode ? ` ${mode}` : "";
    const notePart = ref.note ? ` — ${ref.note}` : "";
    if (ref.source === "asset" && ref.assetName) {
      const namePart = ref.assetType ? `${ref.assetName} (${ref.assetType})` : ref.assetName;
      lines.push(`${namePart} — ${ref.tag}${modePart}${notePart}`);
    } else {
      lines.push(`${ref.tag}${modePart}${notePart}`);
    }
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

  const consistencyFindings = checkPromptConsistency({
    composition: storyboardComposition,
    context,
    lightingChainHadUnusedCandidate: input.lightingChainHadUnusedCandidate,
  });

  return {
    text,
    kind: input.kind,
    sections,
    usedTimeline: compiledShotPrompt.usedTimeline,
    warnings: dedupePreservingOrder([...compiledShotPrompt.warnings, ...context.warnings]),
    findings: [...storyboardComposition.findings, ...consistencyFindings],
  };
}
