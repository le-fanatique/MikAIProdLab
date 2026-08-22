import Link from "next/link";
import { orderStoryboardReferences } from "@/lib/prompts/orderStoryboardReferences";
import GenerateOutputCard from "@/components/storyboardGenerate/GenerateOutputCard";
import CastingReferencesGrid from "@/components/storyboardGenerate/CastingReferencesGrid";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  promptSegments,
  shotReferenceImages,
  comfyWorkflows,
  generationJobs,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowImageSelectionForm from "@/components/WorkflowImageSelectionForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import PartnerNodeConfirmForm from "@/components/PartnerNodeConfirmForm";
import { resolveSequenceCastReferences } from "@/lib/prompts/resolveSequenceCastReferences";
import { selectStoryboardShotRange } from "@/lib/prompts/selectStoryboardShotRange";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { pruneDynamicBatchIds } from "@/lib/comfy/pruneDynamicBatchSelection";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import StoryboardAssetsPanel from "@/components/StoryboardAssetsPanel";
import { runSequenceGenerationFromForm } from "@/actions/sequenceGeneration";
import { saveSequenceStoryboardDraftFromJob } from "@/actions/sequenceStoryboard";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import type { PromptCompilationReferenceImageInput } from "@/lib/prompts/buildPromptCompilationContext";
import {
  buildSequenceGenerationPackage,
  formatSequenceGenerationPackageText,
  type SequenceGenerationPackageShotInput,
} from "@/lib/prompts/buildSequenceGenerationPackage";
import {
  buildSequenceStoryboardPrompt,
  type SequenceStoryboardReferenceInput,
} from "@/lib/prompts/buildSequenceStoryboardPrompt";
import { refImageUrl } from "@/lib/refImageUrl";
import { getComfySettings } from "@/lib/settings";
import { computeCloudPreflightForPanel } from "@/lib/comfy/cloudPreflight";
import { prepareGenerationStyleSource } from "@/lib/projectStyle/generationStylePreparation";
import ProjectStyleGenerationPreview from "@/components/projectStyle/ProjectStyleGenerationPreview";
import { resolveProjectStyle } from "@/lib/llmWorkspace/variables/registry";
import {
  resolveStoryboardLighting,
  type StoryboardLighting,
} from "@/lib/llmWorkspace/composition/resolveStoryboardLighting";
import { composeStoryboardShot } from "@/lib/llmWorkspace/composition/storyboardShot";
import StoryboardCompositionChoice from "@/components/StoryboardCompositionChoice";
import StoryboardShotRangeChoice from "@/components/StoryboardShotRangeChoice";

// ---------------------------------------------------------------------------
// LLMW.STORYBOARD.COMPOSE.2 (B14b) — same two helpers as
// `src/actions/sequenceGeneration.ts`'s own copy, duplicated rather than
// shared: this page already recomputes its whole DB fetch independently of
// the action ("Data-fetch/package-build logic is intentionally recomputed
// here", this file's own header comment above) — same convention applied to
// this one addition.
// ---------------------------------------------------------------------------

async function resolveProjectStyleTextForComposition(projectId: number): Promise<string | null> {
  const data = await resolveProjectStyle(projectId);
  if (data.mode === "none") return null;
  const joined = [data.worldSegment, data.visualSegment, data.rulesSegment]
    .filter((segment) => segment.length > 0)
    .join("\n\n");
  return joined.length > 0 ? joined : null;
}

// SEQGEN.STORYBOARD.SHOTRANGE.1 — `shotFrom`/`shotTo` carry a Shot id (never
// a position), parsed exactly like `jobId` already is above: string |
// string[] | undefined from Next's searchParams, `null` when absent or not
// an integer. selectStoryboardShotRange itself never trusts a raw string.
function parseShotBoundaryParam(raw: string | string[] | undefined): number | null {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

// Same "shotCode, else title, else Shot {id}" convention used by
// StoryboardShotRangeChoice's own option labels below — never a bare id
// shown to the user/LLM when a real label exists.
function shotDisplayLabel(shot: { id: number; shotCode: string | null; title: string | null }): string {
  return shot.shotCode?.trim() || shot.title?.trim() || `Shot ${shot.id}`;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

// Lot D (SEQGEN.STORYBOARD.CASTING.FIX1) — params tied to a previous
// generation attempt/draft save, dropped whenever the inline Casting
// References editor changes the casting selection so a stale result is
// never presented as belonging to the new selection.
const CASTING_STALE_RESULT_PARAMS = [
  "jobId",
  "generationError",
  "sequenceStoryboardDraftSaved",
  "sequenceStoryboardDraftError",
];

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * SEQGEN.STORYBOARD.3 — Sequence-level generate page: the twin of
 * `.../shots/[shotId]/workflows/[workflowId]/map/page.tsx` and
 * `.../assets/[assetId]/workflows/[workflowId]/generate/page.tsx`. Produces
 * a single contact-sheet Sequence Storyboard image from the casting
 * references selected in Storyboard Assets, using the exact same canonical
 * pipeline (buildGenerationPayload, filterAvailableImagesBySelection,
 * Dynamic Batch UI) — no second ComfyUI protocol, no change to per-Shot
 * data. Data-fetch/package-build logic is intentionally recomputed here
 * (not imported from SequenceGenerationPackagePanel or shared with
 * runSequenceGeneration) — the same "each surface recomputes its own
 * canonical data" convention already used between /map and
 * runWorkflowGeneration.
 */
export default async function SequenceStoryboardGeneratePage({ params, searchParams }: Props) {
  const { projectId, sequenceId, workflowId } = await params;
  const resolvedSearchParams = await searchParams;

  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const wid = parseInt(workflowId, 10);

  const rawJobId = resolvedSearchParams["jobId"];
  const jobIdParam =
    typeof rawJobId === "string" ? rawJobId : Array.isArray(rawJobId) ? rawJobId[0] : undefined;

  const rawGenerationError = resolvedSearchParams["generationError"];
  const generationError =
    typeof rawGenerationError === "string"
      ? rawGenerationError
      : Array.isArray(rawGenerationError)
      ? rawGenerationError[0]
      : undefined;

  const rawDraftSaved = resolvedSearchParams["sequenceStoryboardDraftSaved"];
  const draftSaved =
    (typeof rawDraftSaved === "string" ? rawDraftSaved : Array.isArray(rawDraftSaved) ? rawDraftSaved[0] : undefined) === "1";
  const rawDraftError = resolvedSearchParams["sequenceStoryboardDraftError"];
  const draftError =
    typeof rawDraftError === "string" ? rawDraftError : Array.isArray(rawDraftError) ? rawDraftError[0] : undefined;

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("imageNode_")) continue;
    const nodeId = key.slice("imageNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue?.trim()) selectedImageByNodeId[nodeId] = strValue.trim();
  }

  const scalarValueByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("scalarNode_")) continue;
    const nodeId = key.slice("scalarNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) scalarValueByNodeId[nodeId] = strValue;
  }

  const textOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("textNode_")) continue;
    const nodeId = key.slice("textNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) textOverrideByNodeId[nodeId] = strValue;
  }

  // SEQGEN.STORYBOARD.3-FIX4 — `generationError` is a flash message tied to
  // this one failed attempt, read separately above (`generationError` const)
  // for display on THIS render only. It must never be re-propagated as a
  // navigation parameter: every in-page form/link that spreads
  // `currentSearchParams` as its own passthrough base
  // (WorkflowRuntimeMappingPanel -> WorkflowTextOverrideForm/
  // WorkflowScalarInputsForm, DynamicBatchImageList's pushState and upload
  // form) would otherwise carry a stale error forward into every subsequent
  // interaction and Sequence/workflow the user moves to next. Filtering it
  // out at this single shared construction site fixes every one of those
  // downstream consumers at once — no divergent per-component filtering.
  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key === "generationError") continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();
  if (workflow.kind !== "image") notFound();

  // COMFY.PROVIDER.1 — same Cloud preflight as ShotGenerationPanel.
  const comfySettings = await getComfySettings();
  const cloudPreflight = await computeCloudPreflightForPanel(workflow.workflowJson, comfySettings);
  const cloudPreflightBlocksGeneration =
    cloudPreflight !== null && ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0);
  const partnerNodeConfirmMessage =
    cloudPreflight !== null && !("error" in cloudPreflight) && cloudPreflight.apiNodeClasses.length > 0
      ? `This will call paid Comfy Cloud Partner Node(s): ${cloudPreflight.apiNodeClasses.join(", ")}. Continue and incur cost?`
      : null;

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));
  // Casting stays on the full Sequence (decision 1 of the ticket): `shotIds`
  // is never filtered by the Shot range and is what feeds
  // resolveSequenceCastReferences below.
  const shotIds = shotList.map((s) => s.id);

  // SEQGEN.STORYBOARD.SHOTRANGE.1 — the inclusive Shot range only ever
  // narrows `shotInputs`/`shotCount`/`resolveStoryboardLighting`'s input
  // below, never `shotIds`/casting.
  const shotFromId = parseShotBoundaryParam(resolvedSearchParams["shotFrom"]);
  const shotToId = parseShotBoundaryParam(resolvedSearchParams["shotTo"]);
  const shotRangeResult = selectStoryboardShotRange(shotList, shotFromId, shotToId);
  const rangedShots = shotRangeResult.shots;

  const {
    castByShot,
    assetRefsByAsset,
    refMetaByRefId,
    castingEditorAssets,
    storyboardCompositionParam,
    useGuideComposition,
    storyboardRefsParam,
    hasExplicitSelection,
    availableImages,
    parsed,
  } = await resolveSequenceCastReferences({
    shotIds,
    currentSearchParams,
    workflowJson: workflow.workflowJson,
  });

  // --- Dynamic Batch UI info — same canonical helpers as the Shot/Asset
  // pages, computed early (before the @ImageN mapping) because the actual
  // send order/subset for this workflow's LoadImage (Repeatable) chain is
  // the Dynamic Batch selection, not the raw Storyboard Assets order. ---
  const batchUiInfo = parsed !== null ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const };
  const batchDetectionOk = batchUiInfo.kind === "ready";
  const batchNodeId = batchUiInfo.kind === "ready" ? batchUiInfo.batchNodeId : "";
  let batchPreview: BatchExpansionPreview | null = null;
  let batchError: { kind: "detection"; message: string } | null = null;

  if (batchUiInfo.kind === "ready") {
    batchPreview = {
      batchTitle: batchUiInfo.batchTitle,
      templateChainTitles: batchUiInfo.templateChainTitles,
      selectedImageCount: 0,
      clonedNodeCount: 0,
    };
  } else if (batchUiInfo.kind === "error") {
    batchError = { kind: "detection", message: batchUiInfo.message };
  }

  let batchSelectedIds: string[] = [];
  if (batchDetectionOk) {
    const rawParam = currentSearchParams[`batchImages_${batchNodeId}`];
    if (rawParam !== undefined) {
      // Explicit selection already in the URL (either the user reordered/
      // removed images in the panel, or a previous render already
      // initialized it below) — this is always the source of truth once
      // present, for both modes.
      batchSelectedIds = rawParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (batchUiInfo.kind === "ready") {
      // SEQGEN.STORYBOARD.3-FIX3, extended by
      // SEQGEN.STORYBOARD.CASTING.FIX1 (Lot C) to both modes — when the URL
      // has no explicit `batchImages_<nodeId>` yet, the casting selection
      // (`storyboardRefs`, already resolved into `availableImages` in its
      // own selection order) IS the intended initial Dynamic Batch/Direct
      // Repeatable selection, so the first render already shows it
      // pre-loaded, without an extra manual "Add Image" click. The moment
      // the param becomes explicitly present (including empty, e.g. after
      // Clear Images or a manual remove) the branch above takes over and
      // this preload never runs again for that render.
      batchSelectedIds = availableImages.map((img) => img.id);
    }
    // Lot D (SEQGEN.STORYBOARD.CASTING.FIX1) — a reference the user just
    // removed from the casting selection (via the inline Casting References
    // editor) must be pruned from every `batchImages_<nodeId>`, whether it
    // came from an explicit URL param or the preload above. Same canonical
    // helper as StoryboardAssetsPanel's client-side reconciliation below —
    // one rule, not two independently-maintained filters.
    batchSelectedIds = pruneDynamicBatchIds(batchSelectedIds, availableImages.map((img) => img.id));
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

  const resolvedBatchImages: DynamicBatchExpansionImage[] = batchSelectedIds
    .map((id) => availableImages.find((img) => img.id === id))
    .filter((img): img is NonNullable<typeof img> => img !== undefined)
    .map((img) => ({ id: img.id, imagePath: img.imagePath }));

  // SEQGEN.STORYBOARD.3 (retake) — @ImageN must designate the image
  // actually sent at that position. When this workflow has a Dynamic
  // Batch node, that is the batch's own selected order/subset — never the
  // raw Storyboard Assets selection order, which the user can reorder or
  // narrow independently inside the Dynamic Batch panel. Only workflows
  // without a Dynamic Batch node (assigned per-node via Image Inputs
  // instead) fall back to the full explicit selection order.
  const { orderedIds: orderedReferenceIds, references: referenceInputs } =
    orderStoryboardReferences<SequenceStoryboardReferenceInput>({
      hasDynamicBatch: batchDetectionOk,
      batchSelectedIds,
      availableImages,
      metaByRefId: refMetaByRefId,
    });

  // --- Sequence Generation Package (SEQGEN.1/STORYBOARD.2 builder, unmodified) ---
  const segmentRows =
    shotIds.length > 0
      ? await db
          .select()
          .from(promptSegments)
          .where(inArray(promptSegments.shotId, shotIds))
          .orderBy(asc(promptSegments.orderIndex))
      : [];
  const segmentsByShot = new Map<number, typeof segmentRows>();
  for (const row of segmentRows) {
    const list = segmentsByShot.get(row.shotId) ?? [];
    list.push(row);
    segmentsByShot.set(row.shotId, list);
  }

  const shotRefRows =
    shotIds.length > 0
      ? await db
          .select({
            id: shotReferenceImages.id,
            shotId: shotReferenceImages.shotId,
            label: shotReferenceImages.label,
            imageRole: shotReferenceImages.imageRole,
          })
          .from(shotReferenceImages)
          .where(inArray(shotReferenceImages.shotId, shotIds))
          .orderBy(asc(shotReferenceImages.orderIndex), asc(shotReferenceImages.id))
      : [];
  const shotRefsByShot = new Map<number, typeof shotRefRows>();
  for (const row of shotRefRows) {
    const list = shotRefsByShot.get(row.shotId) ?? [];
    list.push(row);
    shotRefsByShot.set(row.shotId, list);
  }

  const shotInputs: SequenceGenerationPackageShotInput[] = rangedShots.map((s) => {
    const segments = segmentsByShot.get(s.id) ?? [];
    const hasPromptSegments = segments.length > 0;
    const compiledSegments = compilePromptSegments(segments);
    const cast = castByShot.get(s.id) ?? [];

    const references: PromptCompilationReferenceImageInput[] = [
      ...(shotRefsByShot.get(s.id) ?? []).map((img) => ({
        refId: `shot-${img.id}`,
        source: "shot" as const,
        assetId: null,
        assetName: null,
        label: img.label,
        role: img.imageRole,
        variantState: null,
        usageNotes: null,
        approvedForGeneration: null,
      })),
      ...cast.flatMap((c) =>
        (assetRefsByAsset.get(c.assetId) ?? []).map((img) => ({
          refId: `asset-${c.assetId}-${img.id}`,
          source: "asset" as const,
          assetId: c.assetId,
          assetName: c.assetName,
          label: img.label,
          role: img.imageRole,
          variantState: img.variantState,
          usageNotes: img.usageNotes,
          approvedForGeneration: img.approvedForGeneration,
        }))
      ),
    ];

    return {
      shotId: s.id,
      shotCode: s.shotCode,
      title: s.title,
      orderIndex: s.orderIndex,
      durationSeconds: s.durationSeconds,
      hasApprovedVideo: s.approvedVideoPath !== null,
      continuity: {
        framing: s.shotSize,
        cameraMovement: s.cameraMovement,
        continuityIn: s.continuityIn,
        continuityOut: s.continuityOut,
        continuityNotes: s.continuityNotes,
      },
      promptContext: {
        shot: {
          title: s.title,
          description: s.description,
          actionPitch: s.actionPitch,
          cameraPitch: s.cameraSubject,
          durationSeconds: s.durationSeconds,
          shotPrompt: s.shotPrompt,
          compiledPromptSegments: hasPromptSegments ? compiledSegments.text : "",
          hasPromptSegments,
          hasMissingTiming: compiledSegments.hasMissingTiming,
        },
        castAssets: cast.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          description: c.description,
          notes: c.notes,
        })),
        references,
        assetBibles: cast.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          visualIdentity: c.visualIdentity,
          usageRules: c.usageRules,
          forbiddenVariations: c.forbiddenVariations,
        })),
        sequenceContext: {
          title: sequence.title,
          summary: sequence.summary,
          mood: sequence.mood,
          locationHint: sequence.locationHint,
          narrativePurpose: sequence.narrativePurpose,
        },
        projectContext: { name: project.name, pitch: project.pitch, story: project.story },
        sources: {
          casting: true,
          references: true,
          assetBibles: true,
          sequenceContext: true,
          projectContext: true,
        },
      },
    };
  });

  const pkg = buildSequenceGenerationPackage(
    { projectId: pid, sequenceId: sid, sequenceTitle: sequence.title, sequenceCode: sequence.sequenceCode },
    shotInputs
  );

  // LLMW.STORYBOARD.COMPOSE.2 (B14b) — resolved only when the guide
  // composition is actually selected; the legacy default (this page's own
  // behavior before this ticket) never pays for these two extra queries and
  // never changes a single byte of `packageText` below.
  let storyboardComposition:
    | { projectStyle: string | null; lighting: StoryboardLighting }
    | undefined;
  // The findings §5.6's output discipline reports, per Shot — display-only,
  // never a blocker (§5.4): computed straight from the same inputs handed to
  // `formatSequenceGenerationPackageText` below, so preview and queued text
  // can never diverge (composeStoryboardShot is pure and deterministic).
  let storyboardFindings: { shotLabel: string; findings: { code: string; severity: "info" | "warn"; message: string }[] }[] = [];

  if (useGuideComposition) {
    const projectStyle = await resolveProjectStyleTextForComposition(pid);

    const lighting = await resolveStoryboardLighting(
      sid,
      rangedShots.map((s) => ({ id: s.id, lighting: s.lighting ?? null }))
    );
    storyboardComposition = { projectStyle, lighting };

    storyboardFindings = pkg.shots.map((s) => ({
      shotLabel: s.shotCode ?? s.title,
      findings: composeStoryboardShot({
        context: s.context,
        continuity: {
              shotSize: s.continuity.shotSize,
              cameraPosition: s.continuity.cameraPosition,
              cameraMovement: s.continuity.cameraMovement,
              movementSpeed: s.continuity.movementSpeed,
              cameraSubject: s.continuity.cameraSubject,
              cameraLens: s.continuity.cameraLens,
            },
        projectStyle,
        lighting: lighting.byShotId[s.shotId] ?? null,
      }).findings,
    }));
  }

  // Lot A (SEQGEN.STORYBOARD.CASTING.FIX1) — no `Warnings:` block in the
  // text fed into the prompt preview/queue; preview and queue must never
  // diverge, so this preview-only build uses the exact same option as the
  // action (buildSequenceStoryboardGenerationContext).
  const packageText = formatSequenceGenerationPackageText(pkg, {
    includeWarnings: false,
    ...(storyboardComposition ? { storyboardComposition } : {}),
  });

  const promptResult = buildSequenceStoryboardPrompt({
    projectId: pid,
    sequenceId: sid,
    sequenceTitle: sequence.title,
    sequenceCode: sequence.sequenceCode,
    shotCount: rangedShots.length,
    references: referenceInputs,
    packageText,
    ...(shotRangeResult.isFullSequence
      ? {}
      : {
          shotRange: {
            fromLabel: shotDisplayLabel(
              shotList.find((s) => s.id === shotRangeResult.fromShotId) ?? { id: shotRangeResult.fromShotId!, shotCode: null, title: null }
            ),
            toLabel: shotDisplayLabel(
              shotList.find((s) => s.id === shotRangeResult.toShotId) ?? { id: shotRangeResult.toShotId!, shotCode: null, title: null }
            ),
            totalShotCount: shotList.length,
          },
        }),
  });

  const basePath = `/projects/${pid}/sequences/${sid}/storyboard/workflows/${wid}/generate`;

  // STYLE.1.E.SURFACES.2 — the fixed "sequence-storyboard" consumer.
  // Preview-only; the server action re-resolves independently at submit
  // time (the same shared helper, so preview/action can never diverge).
  const preparedStyle = await prepareGenerationStyleSource(
    "sequence-storyboard",
    { kind: "sequence", projectId: pid, sequenceId: sid },
    promptResult.text
  );
  const styledSuggestedText = preparedStyle.ok ? preparedStyle.composedSuggestedPrompt.prompt : promptResult.text;
  const styledTextOverrideByNodeId = preparedStyle.ok
    ? Object.fromEntries(Object.entries(textOverrideByNodeId).map(([nodeId, value]) => [nodeId, preparedStyle.composeTextOverride(value)]))
    : textOverrideByNodeId;

  // SEQGEN.STORYBOARD.3 (retake) — generation is blocked entirely without
  // at least one explicit Storyboard Assets selection ("bloquer clairement
  // la generation sans reference"), not just displayed as empty.
  const built =
    parsed !== null && hasExplicitSelection
      ? buildGenerationPayload({
          workflowJson: workflow.workflowJson,
          inputs: parsed.inputs,
          suggestedText: styledSuggestedText,
          availableImages,
          textOverrideByNodeId: styledTextOverrideByNodeId,
          selectedImageByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  // STYLE.1.E.SURFACES.2 retake Round 1 (Codex P1) — three-state
  // injectability, never a false "not compatible" claim for an unevaluated
  // payload. `built` is `null` both when the workflow JSON failed to parse
  // AND when Sequence Storyboard deliberately skips buildGenerationPayload()
  // until at least one casting reference is explicitly selected — both are
  // "pending", never "not-compatible". Only a successful build
  // (`built.ok`) that produced zero text-kind patches is a confirmed
  // incompatibility.
  const styleTextInjectability = built === null ? "pending" : built.ok ? (built.patch.patches.some((p) => p.kind === "text") ? "injected" : "not-compatible") : "pending";

  const mappings = built?.ok ? built.mappings : [];
  const displayMappings = built?.ok ? built.displayMappings : mappings;

  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetectionOk) {
    const items = availableImages.map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.assetName ? `${img.assetName}${img.role ? " · " + img.role : ""}` : (img.role ?? img.label),
      source: img.source,
      assetName: img.assetName,
    }));
    if (items.length > 0) batchImageGroups.push({ groupLabel: "Casting Sources", items });
  }

  // SEQGEN.STORYBOARD.3 — storyboardRefs must survive the Image Inputs
  // "Update Preview" GET form and the Generate redirect's returnTo, not
  // just this page's initial render (same fix already applied to the
  // per-Shot /map page in SEQGEN.STORYBOARD.2 retake 3).
  // LLMW.STORYBOARD.COMPOSE.2 (B14b) — the composition choice must survive
  // the same round trips `storyboardRefs` already does: the Image Inputs
  // "Update Preview" GET form and the Generate redirect's returnTo.
  const storyboardPreserveParamsEntries: [string, string][] = [];
  if (storyboardRefsParam) storyboardPreserveParamsEntries.push(["storyboardRefs", storyboardRefsParam]);
  // Only the non-default choice needs carrying through a round trip.
  if (!useGuideComposition) storyboardPreserveParamsEntries.push(["storyboardComposition", "legacy"]);
  // SEQGEN.STORYBOARD.SHOTRANGE.1 — same discipline: only carried when
  // actually set, otherwise the Image Inputs "Update Preview" GET form and
  // the Generate redirect's returnTo would silently drop the chosen range
  // (the exact bug already fixed twice on storyboardRefs).
  if (shotFromId !== null) storyboardPreserveParamsEntries.push(["shotFrom", String(shotFromId)]);
  if (shotToId !== null) storyboardPreserveParamsEntries.push(["shotTo", String(shotToId)]);
  const storyboardPreserveParams: Record<string, string> | undefined =
    storyboardPreserveParamsEntries.length > 0 ? Object.fromEntries(storyboardPreserveParamsEntries) : undefined;

  const selectionParams = new URLSearchParams();
  for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
    selectionParams.set(`imageNode_${nodeId}`, imageId);
  }
  for (const [nodeId, value] of Object.entries(scalarValueByNodeId)) {
    selectionParams.set(`scalarNode_${nodeId}`, value);
  }
  for (const [nodeId, value] of Object.entries(textOverrideByNodeId)) {
    selectionParams.set(`textNode_${nodeId}`, value);
  }
  if (batchDetectionOk && batchSelectedIds.length > 0) {
    selectionParams.set(`batchImages_${batchNodeId}`, batchSelectedIds.join(","));
  }
  if (storyboardPreserveParams) {
    for (const [key, value] of Object.entries(storyboardPreserveParams)) {
      selectionParams.set(key, value);
    }
  }
  const selectionQuery = selectionParams.toString();
  const returnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;

  const outputParams = new URLSearchParams(selectionParams);
  if (jobIdParam) outputParams.set("jobId", jobIdParam);
  const outputReturnTo = `${basePath}?${outputParams.toString()}`;

  const activeJobId = jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  let canSaveDraft = false;

  if (activeJobId !== null) {
    const [fetchedJob] = await db
      .select({ status: generationJobs.status, outputPath: generationJobs.outputPath, sequenceId: generationJobs.sequenceId })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));

    if (fetchedJob && fetchedJob.sequenceId === sid) {
      const outputPath = fetchedJob.outputPath ?? null;
      const ext = outputPath ? outputPath.split(".").pop()?.toLowerCase() ?? "" : "";
      canSaveDraft = fetchedJob.status === "done" && outputPath !== null && ATTACH_EXTS.has(`.${ext}`);
    }
  }

  // SEQGEN.STORYBOARD.3 (retake) — the empty state must explain WHY no
  // @ImageN mapping exists yet: no explicit Storyboard Assets selection at
  // all, versus a selection that exists but hasn't been added to the
  // Dynamic Batch (the actual send order) yet.
  const castingReferencesEmptyMessage = !hasExplicitSelection
    ? "No casting references selected. Select references in Storyboard Assets before generating."
    : batchDetectionOk
    ? "Casting references are selected, but none have been added to the Dynamic Image Batch below yet — add them there to set the @ImageN order that will actually be sent."
    : "No casting references available for the current selection.";

  // SEQGEN.STORYBOARD.3 (retake 2) — every link back to Storyboard must
  // carry the current storyboardRefs selection, otherwise the user's
  // casting-reference checkboxes appear deselected on return even though
  // nothing was actually changed.
  const storyboardWorkspaceReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}${
    storyboardRefsParam ? `&storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""
  }`;
  const sequenceLabel = sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardWorkspaceReturnTo },
          {
            label: "Generate Sequence Storyboard",
            href: `/projects/${pid}/sequences/${sid}/storyboard/workflows${storyboardRefsParam ? `?storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""}`,
          },
          { label: workflow.name },
        ]}
      />

      <PageHeader title="Generate Sequence Storyboard" meta={sequenceLabel} />

      <div className="flex flex-col gap-4">
        {/* ── Workflow ──────────────────────────────────────── */}
        <Card title="Workflow">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <WorkflowKindBadge kind={workflow.kind} />
              <span className="text-sm font-medium text-[#e7e9ec]">{workflow.name}</span>
            </div>
            {workflow.description && <p className="text-xs text-[#a4abb2]">{workflow.description}</p>}
            {workflow.sourceFilename && (
              <p className="text-xs font-mono text-[#6e767d]">{workflow.sourceFilename}</p>
            )}
          </div>
        </Card>

        {/* ── Inputs ────────────────────────────────────────── */}
        <SectionLabel label="Inputs" />

        <Card title="Casting References (@ImageN)">
          <CastingReferencesGrid
            imageMappings={promptResult.imageMappings}
            availableImages={availableImages}
            emptyMessage={castingReferencesEmptyMessage}
            refImageUrl={refImageUrl}
          />
          {/* Lot D — inline casting editor replaces the "Edit Selection in
              Storyboard Assets" link: every Asset cast in this Sequence,
              including references not currently selected, editable without
              leaving this page. Reuses StoryboardAssetsPanel's canonical
              selection logic (stable Asset-then-Reference order,
              `asset-{assetId}-{imageId}` ids, `storyboardRefs` via local
              `router.replace`, no scroll-to-top) — same component the
              Storyboard workspace uses, not a second implementation. */}
          <div className="mt-3 pt-3 border-t border-[#1e2124]">
            <StoryboardAssetsPanel
              projectId={pid}
              assets={castingEditorAssets}
              clearParamsOnChange={CASTING_STALE_RESULT_PARAMS}
              castingBatchSync={batchDetectionOk ? { workflowId: String(wid), batchNodeId } : undefined}
            />
          </div>
        </Card>

        {!hasExplicitSelection && (
          <div className="rounded border border-[#5c4a24]/60 bg-[#141008] px-3 py-2.5">
            <p className="text-xs text-[#b89a5a]">
              Generation is disabled until at least one casting reference is explicitly selected
              in Storyboard Assets.
            </p>
          </div>
        )}

        {/* SEQGEN.STORYBOARD.SHOTRANGE.1 — narrows the Storyboard's shot
            content (shotInputs/shotCount/lighting) to an inclusive [From,
            To] sub-range of this Sequence's Shots. Casting is never
            filtered by this control — the pool of casting references above
            is always computed on the whole Sequence (a deliberate product
            decision, not an oversight). */}
        <Card title="Storyboard Shot Range">
          <StoryboardShotRangeChoice
            basePath={basePath}
            currentSearchParams={currentSearchParams}
            shots={shotList.map((s) => ({ id: s.id, label: shotDisplayLabel(s) }))}
            currentFromValue={shotFromId !== null ? String(shotFromId) : ""}
            currentToValue={shotToId !== null ? String(shotToId) : ""}
          />
          {shotRangeResult.warnings.length > 0 && (
            <ul className="mt-3 pt-3 border-t border-[#1e2124] flex flex-col gap-1">
              {shotRangeResult.warnings.map((warning, i) => (
                <li key={i} className="text-xs text-[#a4abb2]">
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* LLMW.STORYBOARD.COMPOSE.2 (B14b) — the choice between the legacy
            Shot-Prompt-only body and composeStoryboardShot's six-part
            composition (§5.5). The chosen text is visible below in
            "Suggested Inputs" (the same text this page already showed
            before this ticket) — never a separate preview the queued text
            could diverge from. */}
        <Card title="Storyboard Prompt Composition">
          <StoryboardCompositionChoice
            basePath={basePath}
            currentSearchParams={currentSearchParams}
            currentValue={storyboardCompositionParam}
          />
          {useGuideComposition && storyboardFindings.some((s) => s.findings.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[#1e2124] flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
                Findings — informational, never blocking
              </span>
              {storyboardFindings
                .filter((s) => s.findings.length > 0)
                .map((s) => (
                  <div key={s.shotLabel} className="text-xs">
                    <span className="text-[#a4abb2]">{s.shotLabel}</span>
                    <ul className="ml-3 list-disc">
                      {s.findings.map((f, i) => (
                        <li
                          key={`${f.code}-${i}`}
                          className={f.severity === "warn" ? "text-[#cf7b6b]" : "text-[#6e767d]"}
                        >
                          {f.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <Card title="Suggested Inputs">
          {parsed === null ? (
            <p className="text-sm text-[#cf7b6b]">This workflow JSON could not be parsed.</p>
          ) : (
            <WorkflowRuntimeMappingPanel
              // P1 retake (SEQGEN.STORYBOARD.CASTING.FIX1) — remount the
              // whole panel (including WorkflowTextOverrideForm's own
              // useState-once "Suggested Text") whenever the casting +
              // Dynamic Batch order signature that drives the canonical
              // suggested prompt (@ImageN lines, Lot B) changes. When a
              // `textNode_*` override is already applied, `mapping.
              // suggestedText` already equals that override (see
              // mapWorkflowInputs: `textOverrideByNodeId?.[nodeId] ??
              // suggestedText`), so remounting never discards it — only an
              // unapplied, in-progress local edit can be reset here, which
              // is the documented, sanctioned tradeoff for never silently
              // Applying a stale prompt.
              //
              // LLMW.STORYBOARD.COMPOSE.2 (B14b) — `storyboardCompositionParam`
              // joined into the same key: the composition choice changes
              // `mapping.suggestedText` exactly like the casting/batch order
              // does, and must remount this panel for the same reason.
              key={`${orderedReferenceIds.join(",")}|${storyboardCompositionParam}|${shotFromId}|${shotToId}`}
              mappings={mappings}
              scalarValueByNodeId={scalarValueByNodeId}
              textOverrideByNodeId={textOverrideByNodeId}
              currentSearchParams={currentSearchParams}
              basePath={basePath}
            />
          )}
        </Card>

        {displayMappings.some((m) => m.mappingKind === "image") && (
          <Card title="Image Inputs">
            <WorkflowImageSelectionForm
              basePath={basePath}
              mappings={displayMappings}
              selectedImageByNodeId={selectedImageByNodeId}
              preserveParams={storyboardPreserveParams}
            />
          </Card>
        )}

        {/* ── Dynamic Image Batch ───────────────────────────── */}
        {batchDetectionOk && (
          <Card title="Dynamic Image Batch">
            <DynamicBatchImageList
              // Lot D — remount when the casting selection itself changes
              // (never on a batch-only tweak) so this Client Component's
              // internal `selected` state, seeded once from
              // `selectedImageIds`, always picks up the freshly pruned/
              // preloaded server value instead of going stale after the
              // inline Casting References editor's same-page navigation.
              key={`batch-${storyboardRefsParam}`}
              batchNodeId={batchNodeId}
              preview={batchPreview}
              error={batchError}
              availableImages={batchImageGroups}
              selectedImageIds={batchSelectedIds}
              passthroughParams={currentSearchParams}
              basePath={basePath}
              contextType="sequence"
              showAddFromCasting
              preserveExplicitEmptySelection
              projectId={pid}
              workflowId={String(wid)}
              sequenceId={sid}
            />
          </Card>
        )}

        {batchError && !batchDetectionOk && (
          <Card title="Dynamic Image Batch">
            <DynamicBatchImageList
              batchNodeId=""
              preview={null}
              error={batchError}
              availableImages={[]}
              selectedImageIds={[]}
              passthroughParams={currentSearchParams}
              basePath={basePath}
              contextType="sequence"
              projectId={pid}
              workflowId={String(wid)}
              sequenceId={sid}
            />
          </Card>
        )}

        {/* STYLE.1.E.SURFACES.2 — inspectable Style source, before the payload preview. */}
        <Card>
          <ProjectStyleGenerationPreview sourceLabel="Resolved Sequence Style" prepared={preparedStyle} textInjectability={styleTextInjectability} />
        </Card>

        {/* ── Preview ───────────────────────────────────────── */}
        {payloadPreview !== null && (
          <>
            <SectionLabel label="Preview" />
            <Card title="Payload Preview">
              <WorkflowPayloadPreviewPanel result={payloadPreview} />
            </Card>
          </>
        )}

        {/* ── Generate ──────────────────────────────────────── */}
        {payloadPreview !== null && (
          <>
            <SectionLabel label="Generate" />
            <Card>
              <div className="flex flex-col gap-4">
                {generationError && (
                  <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
                    <p className="text-xs text-[#cf7b6b] leading-relaxed">{generationError}</p>
                  </div>
                )}

                {!preparedStyle.ok && (
                  <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
                    <p className="text-xs text-[#cf7b6b] leading-relaxed">
                      Generation is disabled: Sequence Style could not be resolved.
                    </p>
                  </div>
                )}

                {/* COMFY.PROVIDER.1 — see identical blocks in ShotGenerationPanel. */}
                {cloudPreflight !== null &&
                  ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0) && (
                    <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
                      <p className="text-xs text-[#cf7b6b] leading-relaxed">
                        {"error" in cloudPreflight
                          ? cloudPreflight.error
                          : `This workflow uses node type(s) not available on Comfy Cloud: ${cloudPreflight.missingClasses.join(", ")}. It cannot be generated with Comfy Cloud selected.`}
                      </p>
                    </div>
                  )}
                {cloudPreflight !== null &&
                  !("error" in cloudPreflight) &&
                  cloudPreflight.missingClasses.length === 0 &&
                  cloudPreflight.apiNodeClasses.length > 0 && (
                    <div className="rounded border border-[#3d3320] bg-[#1a1712] px-3 py-2">
                      <p className="text-xs text-[#c9a24b] leading-relaxed">
                        This workflow calls paid Comfy Cloud Partner Node(s):{" "}
                        <span className="font-mono">{cloudPreflight.apiNodeClasses.join(", ")}</span>. Generating
                        will incur Comfy Cloud usage cost. You will be asked to confirm before it runs.
                      </p>
                    </div>
                  )}
                {!cloudPreflightBlocksGeneration && preparedStyle.ok && (
                <PartnerNodeConfirmForm
                  action={runSequenceGenerationFromForm}
                  partnerNodeConfirmMessage={partnerNodeConfirmMessage}
                  className="flex flex-col gap-4"
                >
                  <input type="hidden" name="projectId" value={String(pid)} />
                  <input type="hidden" name="sequenceId" value={String(sid)} />
                  <input type="hidden" name="workflowId" value={String(wid)} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="storyboardRefs" value={storyboardRefsParam} />
                  <input type="hidden" name="storyboardComposition" value={storyboardCompositionParam} />
                  {shotFromId !== null && (
                    <input type="hidden" name="shotFrom" value={String(shotFromId)} />
                  )}
                  {shotToId !== null && <input type="hidden" name="shotTo" value={String(shotToId)} />}
                  {Object.entries(selectedImageByNodeId).map(([nodeId, imageId]) => (
                    <input key={nodeId} type="hidden" name={`imageNode_${nodeId}`} value={String(imageId)} />
                  ))}
                  {Object.entries(scalarValueByNodeId).map(([nodeId, value]) => (
                    <input key={`scalar-${nodeId}`} type="hidden" name={`scalarNode_${nodeId}`} value={value} />
                  ))}
                  {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                    <input key={`text-${nodeId}`} type="hidden" name={`textNode_${nodeId}`} value={value} />
                  ))}
                  {batchDetectionOk && (
                    <DynamicBatchFormSync
                      batchNodeId={batchNodeId}
                      workflowId={String(wid)}
                      initialValue={batchSelectedIds.join(",")}
                    />
                  )}
                  {/* COMFY.PROVIDER.1 — confirmPartnerNodeCost is deliberately
                      NOT rendered here: PartnerNodeConfirmForm sets it itself,
                      only on the confirmed submit path. */}

                  <WorkflowGenerateActions
                    initialJsonText={payloadPreview.patchedJsonText}
                    buttonLabel="Generate Sequence Storyboard"
                  />
                </PartnerNodeConfirmForm>
                )}
              </div>
            </Card>
          </>
        )}

        {/* ── Output ────────────────────────────────────────── */}
        {activeJobId !== null && (
          <>
            <SectionLabel label="Output" />
            <GenerateOutputCard
            activeJobId={activeJobId}
            draftError={draftError}
            draftSaved={draftSaved}
            canSaveDraft={canSaveDraft}
            storyboardWorkspaceReturnTo={storyboardWorkspaceReturnTo}
            outputReturnTo={outputReturnTo}
            sequenceId={sid}
              saveAction={saveSequenceStoryboardDraftFromJob}
            />
          </>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-6">
        <Link
          href={`/projects/${pid}/sequences/${sid}/storyboard/workflows${storyboardRefsParam ? `?storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Workflows
        </Link>
        <Link
          href={storyboardWorkspaceReturnTo}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}
