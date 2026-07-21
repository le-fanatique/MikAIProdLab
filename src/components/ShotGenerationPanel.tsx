import Link from "next/link";
import { db } from "@/db";
import {
  shots,
  comfyWorkflows,
  shotAssets,
  assets,
  promptSegments,
  shotReferenceImages,
  assetReferenceImages,
  generationJobs,
  projects,
  sequences,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import PartnerNodeConfirmForm from "@/components/PartnerNodeConfirmForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import CompiledShotPromptPreviewPanel from "@/components/CompiledShotPromptPreviewPanel";
import InlineShotPromptEditor from "@/components/InlineShotPromptEditor";
import ShotPanelImagePreviewForm from "@/components/ShotPanelImagePreviewForm";
import type { ShotPanelImageNode } from "@/components/ShotPanelImagePreviewForm";
import ShotPanelVideoSelectionForm from "@/components/ShotPanelVideoSelectionForm";
import type { ShotPanelVideoNode } from "@/components/ShotPanelVideoSelectionForm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { buildRuntimeImageOptions } from "@/lib/comfy/mapWorkflowInputs";
import { loadRuntimeVideoOptionsForShot } from "@/lib/shotVideoLibrary/loadRuntimeVideoOptions";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import {
  runWorkflowGenerationFromForm,
  attachOutputAsShotReference,
  approveVideoOutput,
} from "@/actions/generation";
import { saveVideoOutputToLibrary } from "@/actions/shotVideoLibrary";
import { saveStoryboardDraftFromJob } from "@/actions/storyboard";
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { type FillSource } from "@/lib/textInputKind";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import PromptCompilerHandoffGate from "@/components/PromptCompilerHandoffGate";
import type { PromptCompilationReferenceImageInput } from "@/lib/prompts/buildPromptCompilationContext";
import { resolvePromptCompilerTextNode } from "@/lib/prompts/promptCompilerHandoff";
import {
  resolveWorkflowProfile,
  auditWorkflowNodes,
  resolveFirstLastFrameNodes,
} from "@/lib/comfy/workflowProfiles";
import WorkflowProfilePanel from "@/components/WorkflowProfilePanel";
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import { getComfySettings } from "@/lib/settings";
import { computeCloudPreflightForPanel } from "@/lib/comfy/cloudPreflight";

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  workflowId: number;
  closeUrl: string;
  selectorUrl: string;
  basePath: string;
  currentSearchParams: Record<string, string>;
  selectedImageByNodeId: Record<string, string>;
  /** SHOT.VIDEO.LIBRARY.1, Lot C */
  selectedVideoByNodeId: Record<string, string>;
  scalarValueByNodeId: Record<string, string>;
  textOverrideByNodeId: Record<string, string>;
  generationError: string | undefined;
  activeJobId: number | null;
  attachedReference?: boolean;
  attachError?: string | null;
  approvedVideo?: boolean;
  approveError?: string | null;
  /** SHOT.VIDEO.LIBRARY.1 — feedback for "Save to Shot Videos" (save-only, never approves). */
  librarySaved?: boolean;
  libraryAlreadySaved?: boolean;
  libraryError?: string | null;
  shotPromptSaved?: boolean;
  shotPromptError?: string | null;
  /** SEQGEN.STORYBOARD.2 feedback after saveStoryboardDraftFromJob — same shape as attachedReference/attachError above. */
  storyboardDraftSaved?: boolean;
  storyboardDraftError?: string | null;
};

export default async function ShotGenerationPanel({
  projectId: pid,
  sequenceId: sid,
  shotId: shid,
  workflowId: wid,
  closeUrl,
  selectorUrl,
  basePath,
  currentSearchParams,
  selectedImageByNodeId,
  selectedVideoByNodeId,
  scalarValueByNodeId,
  textOverrideByNodeId,
  generationError,
  activeJobId,
  attachedReference,
  attachError,
  approvedVideo,
  approveError,
  librarySaved,
  libraryAlreadySaved,
  libraryError,
  shotPromptSaved,
  shotPromptError,
  storyboardDraftSaved,
  storyboardDraftError,
}: Props) {
  // SEQGEN.STORYBOARD.2: currentSearchParams already forwards every raw
  // query param generically (see this file's caller) — no new prop needed
  // just to read this one flag.
  const isStoryboardContext = currentSearchParams["storyboard"] === "1";
  // Retake fix: the actual reference-selection transport from Storyboard
  // Assets. Ordered, comma-separated RuntimeImageOption ids (the same "id"
  // shape buildRuntimeImageOptions already produces below) — parsed here,
  // applied once `availableImages` exists.
  const storyboardSelectedRefIds = (currentSearchParams["storyboardRefs"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot) return null;

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) return null;

  // COMFY.PROVIDER.1 — Cloud preflight, computed from the workflow's stored
  // class_type set (unaffected by Dynamic Batch node cloning or per-node
  // input overrides — those never introduce a new class_type). Never
  // inferred from local availability; a missing class always blocks,
  // read/network failure always blocks too (never assume safe). Shared with
  // AssetGenerationPanel and both Sequence generate pages.
  const comfySettings = await getComfySettings();
  const cloudPreflight = await computeCloudPreflightForPanel(workflow.workflowJson, comfySettings);

  const [project, sequence, assignedRows] = await Promise.all([
    db
      .select({ name: projects.name, pitch: projects.pitch, story: projects.story })
      .from(projects)
      .where(eq(projects.id, pid))
      .then(([r]) => r ?? null),
    db
      .select({
        title: sequences.title,
        summary: sequences.summary,
        mood: sequences.mood,
        locationHint: sequences.locationHint,
        narrativePurpose: sequences.narrativePurpose,
      })
      .from(sequences)
      .where(eq(sequences.id, sid))
      .then(([r]) => r ?? null),
    db
      .select({
        assetId: assets.id,
        assetName: assets.name,
        assetType: assets.type,
        assetDescription: assets.description,
        assetNotes: assets.notes,
        assetVisualIdentity: assets.visualIdentity,
        assetUsageRules: assets.usageRules,
        assetForbiddenVariations: assets.forbiddenVariations,
      })
      .from(shotAssets)
      .innerJoin(assets, eq(shotAssets.assetId, assets.id))
      .where(eq(shotAssets.shotId, shid))
      .orderBy(asc(assets.name)),
  ]);

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  const segmentList = await db
    .select()
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shid))
    .orderBy(asc(promptSegments.orderIndex));

  const shotRefImages = await db
    .select({
      id: shotReferenceImages.id,
      imagePath: shotReferenceImages.imagePath,
      label: shotReferenceImages.label,
      imageRole: shotReferenceImages.imageRole,
      sourceFilename: shotReferenceImages.sourceFilename,
    })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shid))
    .orderBy(asc(shotReferenceImages.orderIndex), asc(shotReferenceImages.id));

  const castAssetRefImages =
    assignedAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            imagePath: assetReferenceImages.imagePath,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            sourceFilename: assetReferenceImages.sourceFilename,
            variantState: assetReferenceImages.variantState,
            usageNotes: assetReferenceImages.usageNotes,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, assignedAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  const compiledPrompt = compilePromptSegments(segmentList);
  const hasRealPromptSegments = segmentList.length > 0;
  const compiledShotPrompt = compileShotPrompt({
    kind: workflow.kind as ShotPromptCompileKind,
    shotPrompt: shot.shotPrompt,
    compiledPromptSegments: hasRealPromptSegments ? compiledPrompt.text : "",
    hasPromptSegments: hasRealPromptSegments,
    hasMissingTiming: compiledPrompt.hasMissingTiming,
  });

  // ── Prompt Compiler handoff (PROMPT.COMPILER.3) — live snapshot the
  // client-side PromptCompilerHandoffGate compares a stored handoff
  // against. Built from the exact same real data already queried above;
  // no additional DB reads. ──
  const promptCompilerAvailableReferences: PromptCompilationReferenceImageInput[] = [
    ...shotRefImages.map((img) => ({
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
    ...castAssetRefImages.map((img) => {
      const asset = assignedRows.find((r) => r.assetId === img.assetId);
      return {
        refId: `asset-${img.assetId}-${img.id}`,
        source: "asset" as const,
        assetId: img.assetId,
        assetName: asset?.assetName ?? null,
        label: img.label,
        role: img.imageRole,
        variantState: img.variantState,
        usageNotes: img.usageNotes,
        approvedForGeneration: img.approvedForGeneration,
      };
    }),
  ];

  const promptCompilerLiveData = {
    shot: {
      title: shot.title,
      description: shot.description,
      actionPitch: shot.actionPitch,
      cameraPitch: shot.cameraPitch,
      durationSeconds: shot.durationSeconds,
      shotPrompt: shot.shotPrompt,
      compiledPromptSegments: hasRealPromptSegments ? compiledPrompt.text : "",
      hasPromptSegments: hasRealPromptSegments,
      hasMissingTiming: compiledPrompt.hasMissingTiming,
    },
    castAssets: assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
      description: r.assetDescription,
      notes: r.assetNotes,
    })),
    assetBibles: assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
      visualIdentity: r.assetVisualIdentity,
      usageRules: r.assetUsageRules,
      forbiddenVariations: r.assetForbiddenVariations,
    })),
    sequenceContext: sequence
      ? {
          title: sequence.title,
          summary: sequence.summary,
          mood: sequence.mood,
          locationHint: sequence.locationHint,
          narrativePurpose: sequence.narrativePurpose,
        }
      : null,
    projectContext: project
      ? { name: project.name, pitch: project.pitch, story: project.story }
      : null,
    availableReferenceRefIds: promptCompilerAvailableReferences.map((r) => r.refId),
    availableReferencesByRefId: Object.fromEntries(
      promptCompilerAvailableReferences.map((r) => [r.refId, r])
    ),
  };

  const composedShotPrompt =
    project && sequence
      ? composeShotPrompt({
          project: { name: project.name, pitch: project.pitch },
          sequence: {
            title: sequence.title,
            mood: sequence.mood,
            locationHint: sequence.locationHint,
            summary: sequence.summary,
            narrativePurpose: sequence.narrativePurpose,
          },
          shot: {
            shotCode: shot.shotCode,
            title: shot.title,
            durationSeconds: shot.durationSeconds,
            description: shot.description,
            actionPitch: shot.actionPitch,
            cameraPitch: shot.cameraPitch,
            framing: shot.framing,
            cameraMovement: shot.cameraMovement,
          },
          castAssets: assignedRows.map((r) => ({
            name: r.assetName,
            type: r.assetType,
            description: r.assetDescription,
            notes: r.assetNotes,
          })),
          shotRefImages: shotRefImages.map((img) => ({
            imageRole: img.imageRole,
            label: img.label,
            sourceFilename: img.sourceFilename,
          })),
          castAssetRefImages: castAssetRefImages.map((img) => {
            const row = assignedRows.find((r) => r.assetId === img.assetId);
            return {
              assetName: row?.assetName ?? "",
              assetType: row?.assetType ?? "",
              imageRole: img.imageRole,
              label: img.label,
              sourceFilename: img.sourceFilename,
            };
          }),
        })
      : null;

  const actionCamera = [shot.actionPitch, shot.cameraPitch]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => v.trim())
    .join("\n");

  const STYLE_KINDS: FillSource["kinds"] = ["generic", "positive", "style"];

  const fillSources: FillSource[] = [
    shot.shotPrompt?.trim()
      ? { id: "shotPrompt", label: "Shot Prompt", text: shot.shotPrompt.trim() }
      : null,
    compiledShotPrompt.text.trim() && compiledShotPrompt.text.trim() !== (shot.shotPrompt?.trim() ?? "")
      ? { id: "compiledPrompt", label: "Compiled Prompt", text: compiledShotPrompt.text.trim() }
      : null,
    hasRealPromptSegments && compiledPrompt.text.trim()
      ? { id: "segments", label: "Prompt Segments", text: compiledPrompt.text.trim() }
      : null,
    shot.description?.trim()
      ? { id: "description", label: "Shot Description", text: shot.description.trim() }
      : null,
    actionCamera
      ? { id: "actionCamera", label: "Action + Camera", text: actionCamera }
      : null,
    composedShotPrompt?.hasContent
      ? { id: "casting", label: "Casting-aware Prompt", text: composedShotPrompt.proposalText, kinds: STYLE_KINDS }
      : null,
    project?.story?.trim()
      ? { id: "projectStory", label: "Project Story", text: project.story!.trim(), kinds: STYLE_KINDS }
      : null,
    sequence?.summary?.trim()
      ? { id: "sequenceSummary", label: "Sequence Summary", text: sequence.summary!.trim(), kinds: STYLE_KINDS }
      : null,
  ].filter((s): s is FillSource => s !== null);

  const allAvailableImages = buildRuntimeImageOptions(
    shotRefImages,
    castAssetRefImages,
    assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
    }))
  );

  // Retake fix — SEQGEN.STORYBOARD.2: when a Storyboard Assets selection was
  // transported in, every downstream consumer of `availableImages` (Dynamic
  // Batch groups, per-node image pickers, and — critically —
  // buildGenerationPayload's actual payload below) sees only the selected
  // references, in the exact order they were selected. No selection (or a
  // non-storyboard context) keeps today's default: every cast/shot
  // reference, unfiltered. Filtering itself lives in a pure, independently
  // tested helper — see filterAvailableImagesBySelection.ts.
  const availableImages = isStoryboardContext
    ? filterAvailableImagesBySelection(allAvailableImages, storyboardSelectedRefIds)
    : allAvailableImages;

  // SHOT.VIDEO.LIBRARY.1, Lot C — this Shot's own durable video library,
  // ready for a ComfyUI video-input picker. No real workflow has one today
  // (see claude_report.md), so this list is queried unconditionally but
  // only ever rendered/used when `videoMappings` below is non-empty.
  const availableVideos = await loadRuntimeVideoOptionsForShot(shid);

  // --- Dynamic Batch UI info (detect + trace + titles) — shared helper, same
  // result the /map page and AssetGenerationPanel compute for this workflow. ---
  const batchUiInfo = parsed !== null ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const };
  const batchDetectionOk = batchUiInfo.kind === "ready";
  let batchPreview: BatchExpansionPreview | null = null;
  let batchError: { kind: "detection"; message: string } | null = null;
  const batchTemplateChainNodeIds = batchUiInfo.kind === "ready" ? batchUiInfo.templateChainNodeIds : [];

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

  // Parse selected batch images from searchParams
  let batchSelectedIds: string[] = [];
  if (batchUiInfo.kind === "ready") {
    const raw = currentSearchParams[`batchImages_${batchUiInfo.batchNodeId}`] ?? "";
    batchSelectedIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

  // --- Canonical payload (GEN.SEEDANCE.1): same function used by /map,
  // AssetGenerationPanel and the server action — the preview computed here
  // matches exactly what queueing recomputes. ---
  const resolvedBatchImages: DynamicBatchExpansionImage[] = batchSelectedIds
    .map((id) => availableImages.find((img) => img.id === id))
    .filter((img): img is NonNullable<typeof img> => img !== undefined)
    .map((img) => ({ id: img.id, imagePath: img.imagePath }));

  const built =
    parsed !== null
      ? buildGenerationPayload({
          workflowJson: workflow.workflowJson,
          inputs: parsed.inputs,
          suggestedText: compiledShotPrompt.text,
          availableImages,
          availableVideos,
          textOverrideByNodeId,
          selectedImageByNodeId,
          selectedVideoByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  const mappings = built?.ok ? built.mappings : [];
  const imageMappings = mappings.filter((m) => m.mappingKind === "image");
  // SHOT.VIDEO.LIBRARY.1, Lot C
  const videoMappings = mappings.filter((m) => m.mappingKind === "video");
  const panelVideoNodes: ShotPanelVideoNode[] = videoMappings.map((mapping) => {
    const nodeId = mapping.input.nodeId;
    return {
      nodeId,
      displayLabel: mapping.input.label || mapping.input.title || "Load Video",
      initialValue: selectedVideoByNodeId[nodeId] ?? "",
      videos: mapping.availableVideos.map((v) => ({
        id: String(v.shotVideoId),
        label: v.label,
        source: v.source,
        durationSeconds: v.durationSeconds,
        isApproved: v.isApproved,
      })),
    };
  });
  const promptCompilerTextNodeCandidates = mappings
    .filter((m) => m.mappingKind === "text")
    .map((m) => ({ nodeId: m.input.nodeId, label: m.input.label, title: m.input.title }));

  // When Dynamic Batch is active, template-chain image inputs are replaced by the batch list.
  // Exclude them from classic UI display.
  const displayImageMappings = batchDetectionOk
    ? imageMappings.filter((m) => !batchTemplateChainNodeIds.includes(m.input.nodeId))
    : imageMappings;

  // ── Workflow profile (GEN.SEEDANCE.2) — resolved purely from a stable
  // signature already in the stored JSON; never rewrites it, never touches
  // selections. A generic workflow (profile === null) runs no specialized
  // diagnostic below. ──
  const workflowProfile = resolveWorkflowProfile(workflow.workflowJson);
  const workflowNodeState =
    parsed !== null
      ? auditWorkflowNodes(workflow.workflowJson, parsed)
      : {
          hasTextPromptNode: false,
          imageInputCount: 0,
          dynamicBatchPresent: false,
          hasFirstFrameNode: false,
          hasLastFrameNode: false,
        };
  const promptCompilerTextNodeResolution = resolvePromptCompilerTextNode(promptCompilerTextNodeCandidates);
  const promptCompilerTextNodeMapping = promptCompilerTextNodeResolution.ok
    ? mappings.find((m) => m.input.nodeId === promptCompilerTextNodeResolution.nodeId)
    : undefined;
  const hasTextPromptValue = Boolean(promptCompilerTextNodeMapping?.suggestedText?.trim());
  const selectedImageCount = imageMappings.filter((m) => Boolean(selectedImageByNodeId[m.input.nodeId])).length;

  // First/Last Frame mapping strictness (GEN.SEEDANCE.3) — resolves the two
  // real, distinct image nodes by their exact title, then looks up what the
  // user actually selected for each and that selection's own stored role.
  // Never guesses, never auto-selects, never mutates a selection.
  const workflowImageNodeCandidates = imageMappings.map((m) => ({
    nodeId: m.input.nodeId,
    label: m.input.label,
    title: m.input.title,
  }));
  const { firstFrameNodeId, lastFrameNodeId } = resolveFirstLastFrameNodes(workflowImageNodeCandidates);
  const imageRoleById = new Map(availableImages.map((img) => [img.id, img.role]));
  const firstFrameSelectedImageId = firstFrameNodeId
    ? selectedImageByNodeId[firstFrameNodeId] ?? null
    : null;
  const lastFrameSelectedImageId = lastFrameNodeId
    ? selectedImageByNodeId[lastFrameNodeId] ?? null
    : null;
  const firstFrameSelectedImageRole = firstFrameSelectedImageId
    ? imageRoleById.get(firstFrameSelectedImageId) ?? null
    : null;
  const lastFrameSelectedImageRole = lastFrameSelectedImageId
    ? imageRoleById.get(lastFrameSelectedImageId) ?? null
    : null;

  // Build panelImageNodes for the client image preview component
  const _labelCount: Record<string, number> = {};
  for (const m of displayImageMappings) {
    const l = m.input.label || m.input.title || "Load Image";
    _labelCount[l] = (_labelCount[l] ?? 0) + 1;
  }
  const _labelIndex: Record<string, number> = {};

  const panelImageNodes: ShotPanelImageNode[] = displayImageMappings.map((mapping) => {
    const nodeId = mapping.input.nodeId;
    const rawLabel = mapping.input.label || mapping.input.title || "Load Image";
    const isDup = _labelCount[rawLabel] > 1;
    _labelIndex[rawLabel] = (_labelIndex[rawLabel] ?? 0) + 1;
    const displayLabel = isDup ? `${rawLabel} ${_labelIndex[rawLabel]}` : rawLabel;
    const images = mapping.availableImages;
    const selectedId = selectedImageByNodeId[nodeId] ?? "";
    const suggestedId = suggestImageForNode(rawLabel, images);
    const isSuggestion = selectedId === "" && suggestedId !== null;
    const effectiveId = selectedId !== "" ? selectedId : (suggestedId ?? "");

    let badgeLabel: string | null = null;
    if (isSuggestion && suggestedId) {
      if (suggestedId.startsWith("shot-")) badgeLabel = "Suggested from shot";
      else if (suggestedId.startsWith("asset-")) badgeLabel = "Suggested from cast";
      else badgeLabel = "Suggested";
    }

    return {
      nodeId,
      displayLabel,
      isDup,
      initialValue: effectiveId,
      badgeLabel,
      images: images.map((img) => ({
        id: img.id,
        imagePath: img.imagePath,
        label: img.label,
        role: img.role ?? undefined,
        source: img.source,
        assetName: img.assetName,
      })),
    };
  });

  // --- Runtime preview JSON — GEN.SEEDANCE.1: this is `built.patch`, the
  // exact same canonical computation the server re-runs at queue time, so
  // preview and queue can never diverge. When the workflow has a Dynamic
  // Batch node and nothing is selected yet, `built` is a clean `ok:false`
  // (never a crash) — no preview is shown rather than displaying an
  // incomplete/misleading intermediate payload; DynamicBatchImageList's own
  // "Add at least one image" notice already covers that state. Any other
  // (unexpected) Dynamic Batch error is surfaced via batchError too, so
  // nothing fails silently.
  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

  const batchNodeId = batchUiInfo.kind === "ready" ? batchUiInfo.batchNodeId : "";

  // Build available images as BatchImageGroups for DynamicBatchImageList
  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetectionOk) {
    const shotItems = availableImages.filter((img) => img.source === "shot").map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.label,
      source: img.source,
      assetName: img.assetName,
    }));
    const assetItems = availableImages.filter((img) => img.source === "asset").map((img) => {
      const roleLabel = getReferenceImageRoleLabel(img.role);
      return {
        id: img.id,
        imagePath: img.imagePath,
        label: img.assetName ? `${img.assetName}${roleLabel ? " · " + roleLabel : ""}` : (roleLabel ?? img.label),
        source: img.source,
        assetName: img.assetName,
      };
    });
    if (shotItems.length > 0) batchImageGroups.push({ groupLabel: "Shot Sources", items: shotItems });
    if (assetItems.length > 0) batchImageGroups.push({ groupLabel: "Cast Sources", items: assetItems });
  }

  // Build selectionParams — also include batchImages_* to persist selection after Generate
  const selectionParams = new URLSearchParams({ generation: "open", workflowId: String(wid) });
  for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
    selectionParams.set(`imageNode_${nodeId}`, imageId);
  }
  for (const [nodeId, videoId] of Object.entries(selectedVideoByNodeId)) {
    selectionParams.set(`videoNode_${nodeId}`, videoId);
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
  const returnTo = `${basePath}?${selectionParams.toString()}`;

  // approveReturnTo keeps the panel open with the current jobId visible
  const approveParams = new URLSearchParams(selectionParams);
  if (activeJobId !== null) {
    approveParams.set("jobId", String(activeJobId));
  }
  const approveReturnTo = `${basePath}?${approveParams.toString()}`;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  const VIDEO_APPROVE_EXTS = new Set([".mp4", ".webm", ".mov"]);
  let canAttach = false;
  let canApproveVideo = false;

  if (activeJobId !== null) {
    const [fetchedJob] = await db
      .select({
        status: generationJobs.status,
        outputPath: generationJobs.outputPath,
        shotId: generationJobs.shotId,
      })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));

    if (fetchedJob && fetchedJob.shotId === shid && fetchedJob.status === "done" && fetchedJob.outputPath !== null) {
      const ext = `.${fetchedJob.outputPath.split(".").pop()?.toLowerCase() ?? ""}`;
      if (workflow.kind === "image") {
        canAttach = ATTACH_EXTS.has(ext);
      } else if (workflow.kind === "video") {
        canApproveVideo = VIDEO_APPROVE_EXTS.has(ext);
      }
    }
  }

  // SEQGEN.STORYBOARD.2 — provenance snapshots for saveStoryboardDraftFromJob.
  // Reuses this render's own already-computed compiledShotPrompt/
  // availableImages; never a second source of truth.
  const canSaveStoryboardDraft = isStoryboardContext && workflow.kind === "image" && canAttach;
  const storyboardReferencesSnapshot = JSON.stringify(
    Object.values(selectedImageByNodeId)
      .map((imageId) => availableImages.find((img) => img.id === imageId))
      .filter((img): img is NonNullable<typeof img> => img !== undefined)
      .map((img) => ({ id: img.id, label: img.label, source: img.source, assetName: img.assetName }))
  );

  // COMFY.PROVIDER.1 — derived from cloudPreflight computed earlier: Generate
  // is entirely hidden when Cloud can't run this workflow at all, and gated
  // behind an explicit native confirm() naming the Partner Node cost when
  // that's the only concern.
  const cloudPreflightBlocksGeneration =
    cloudPreflight !== null && ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0);
  const partnerNodeConfirmMessage =
    cloudPreflight !== null && !("error" in cloudPreflight) && cloudPreflight.apiNodeClasses.length > 0
      ? `This will call paid Comfy Cloud Partner Node(s): ${cloudPreflight.apiNodeClasses.join(", ")}. Continue and incur cost?`
      : null;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#232629]">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-[#e7e9ec]">Generate Content</span>
          <div className="flex items-center gap-2">
            <WorkflowKindBadge kind={workflow.kind} />
            <span className="text-xs text-[#a4abb2] truncate">{workflow.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows/${wid}/map`}
            className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Open page ↗
          </Link>
          <Link
            href={selectorUrl}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Change Workflow
          </Link>
          <Link
            href={closeUrl}
            className="text-[#6e767d] hover:text-[#a4abb2] transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
            aria-label="Close panel"
          >
            ×
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-5">

        {/* Shot Prompt */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Shot Prompt
          </p>
          <CompiledShotPromptPreviewPanel
            compiled={compiledShotPrompt}
            workflowKind={workflow.kind}
          />
          <InlineShotPromptEditor
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            currentShotPrompt={shot.shotPrompt}
            returnTo={returnTo}
            saved={shotPromptSaved}
            error={shotPromptError}
          />
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Open Shot Detail →
          </Link>
        </div>

        {/* Suggested Inputs */}
        <WorkflowProfilePanel
          shotId={shid}
          profile={workflowProfile}
          nodeState={workflowNodeState}
          hasTextPromptValue={hasTextPromptValue}
          selectedImageCount={selectedImageCount}
          dynamicBatchActive={batchDetectionOk}
          dynamicBatchSelectedCount={batchSelectedIds.length}
          firstFrameSelectedImageId={firstFrameSelectedImageId}
          lastFrameSelectedImageId={lastFrameSelectedImageId}
          firstFrameSelectedImageRole={firstFrameSelectedImageRole}
          lastFrameSelectedImageRole={lastFrameSelectedImageRole}
        >
        <PromptCompilerHandoffGate
          shotId={shid}
          basePath={basePath}
          currentSearchParams={currentSearchParams}
          textNodeCandidates={promptCompilerTextNodeCandidates}
          liveData={promptCompilerLiveData}
        >
        {parsed === null ? (
          <p className="text-sm text-[#cf7b6b]">Workflow JSON could not be parsed.</p>
        ) : (
          <>
            <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                Suggested Inputs
              </p>
              <WorkflowRuntimeMappingPanel
                mappings={mappings}
                scalarValueByNodeId={scalarValueByNodeId}
                textOverrideByNodeId={textOverrideByNodeId}
                currentSearchParams={currentSearchParams}
                basePath={basePath}
                fillSources={fillSources}
              />
            </div>

            {displayImageMappings.length > 0 && (
              <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                  Image Sources
                </p>
                <ShotPanelImagePreviewForm
                  nodes={panelImageNodes}
                  passthroughParams={currentSearchParams}
                  basePath={basePath}
                  projectId={pid}
                  shotId={shid}
                  sequenceId={sid}
                />
              </div>
            )}

            {/* SHOT.VIDEO.LIBRARY.1, Lot C — renders only when the workflow
                has a real, structurally-detected video input node. No such
                workflow exists in this library today (see the audit in
                claude_report.md), so this block is a no-op on every current
                workflow. */}
            {videoMappings.length > 0 && (
              <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                  Video Sources
                </p>
                <ShotPanelVideoSelectionForm nodes={panelVideoNodes} passthroughParams={currentSearchParams} basePath={basePath} />
              </div>
            )}

            {/* Dynamic Image Batch (WFBUILD.1A) */}
            {batchDetectionOk && (
              <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
                <DynamicBatchImageList
                  batchNodeId={batchNodeId}
                  preview={batchPreview}
                  error={batchError}
                  availableImages={batchImageGroups}
                  selectedImageIds={batchSelectedIds}
                  passthroughParams={currentSearchParams}
                  basePath={basePath}
                  contextType="shot"
                  projectId={pid}
                  workflowId={String(wid)}
                  shotId={shid}
                  sequenceId={sid}
                />
              </div>
            )}

            {/* Batch detection error (non-fatal, but informative) */}
            {batchError && !batchDetectionOk && (
              <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
                <DynamicBatchImageList
                  batchNodeId=""
                  preview={null}
                  error={batchError}
                  availableImages={[]}
                  selectedImageIds={[]}
                  passthroughParams={currentSearchParams}
                  basePath={basePath}
                  contextType="shot"
                  projectId={pid}
                  workflowId={String(wid)}
                  shotId={shid}
                  sequenceId={sid}
                />
              </div>
            )}
          </>
        )}

        {/* Preview — shows the final expanded+patched JSON */}
        {payloadPreview !== null && (
          <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Preview
            </p>
            <WorkflowPayloadPreviewPanel result={payloadPreview} />
          </div>
        )}

        {/* Generate */}
        {payloadPreview !== null && (
          <div className="border-t border-[#232629] pt-4">
            {generationError && (
              <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3">
                <p className="text-xs text-[#cf7b6b] leading-relaxed">{generationError}</p>
              </div>
            )}
            {/* COMFY.PROVIDER.1 — Cloud preflight blocks Generate outright
                when the workflow cannot even be checked or uses a node
                class Comfy Cloud does not expose. Never a silent submission. */}
            {cloudPreflight !== null &&
              ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0) && (
                <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3">
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
                <div className="rounded border border-[#3d3320] bg-[#1a1712] px-3 py-2 mb-3">
                  <p className="text-xs text-[#c9a24b] leading-relaxed">
                    This workflow calls paid Comfy Cloud Partner Node(s):{" "}
                    <span className="font-mono">{cloudPreflight.apiNodeClasses.join(", ")}</span>. Generating
                    will incur Comfy Cloud usage cost. You will be asked to confirm before it runs.
                  </p>
                </div>
              )}
            {!cloudPreflightBlocksGeneration && (
            <PartnerNodeConfirmForm
              action={runWorkflowGenerationFromForm}
              partnerNodeConfirmMessage={partnerNodeConfirmMessage}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="projectId" value={String(pid)} />
              <input type="hidden" name="sequenceId" value={String(sid)} />
              <input type="hidden" name="shotId" value={String(shid)} />
              <input type="hidden" name="workflowId" value={String(wid)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              {Object.entries(selectedImageByNodeId).map(([nodeId, imageId]) => (
                <input
                  key={nodeId}
                  type="hidden"
                  name={`imageNode_${nodeId}`}
                  value={String(imageId)}
                />
              ))}
              {/* SHOT.VIDEO.LIBRARY.1, Lot C */}
              {Object.entries(selectedVideoByNodeId).map(([nodeId, videoId]) => (
                <input key={`video-${nodeId}`} type="hidden" name={`videoNode_${nodeId}`} value={String(videoId)} />
              ))}
              {Object.entries(scalarValueByNodeId).map(([nodeId, value]) => (
                <input
                  key={`scalar-${nodeId}`}
                  type="hidden"
                  name={`scalarNode_${nodeId}`}
                  value={value}
                />
              ))}
              {/* GEN.SEEDANCE.1 — text overrides staged in the panel were
                  previously never submitted, so Generate silently dropped
                  them and recomputed the prompt from DB state. */}
              {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                <input
                  key={`text-${nodeId}`}
                  type="hidden"
                  name={`textNode_${nodeId}`}
                  value={value}
                />
              ))}
              {/* DynamicBatchFormSync replaces the static hidden input — it reads
                  the current URL searchParams at submit time, keeping in sync with
                  client-side DynamicBatchImageList updates via pushState(). */}
              {batchDetectionOk && (
                <DynamicBatchFormSync batchNodeId={batchNodeId} workflowId={String(wid)} />
              )}
              {/* COMFY.PROVIDER.1 — confirmPartnerNodeCost is deliberately NOT
                  rendered here: PartnerNodeConfirmForm sets it itself, only on
                  the confirmed submit path, so it never exists in the SSR/
                  pre-hydration HTML. */}
              <WorkflowGenerateActions
                initialJsonText={payloadPreview.patchedJsonText}
                buttonLabel={workflow.kind === "video" ? "Generate Video" : "Generate Keyframe"}
              />
            </PartnerNodeConfirmForm>
            )}
          </div>
        )}
        </PromptCompilerHandoffGate>
        </WorkflowProfilePanel>

        {/* Output */}
        {activeJobId !== null && (
          <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">Output</p>
            <GenerationJobStatusPanel jobId={activeJobId} />
            {/* Image/keyframe approve — GEN.2.G.1 */}
            {attachError && (
              <p className="text-xs text-[#cf7b6b]">{attachError}</p>
            )}
            {attachedReference ? (
              <p className="text-xs text-[#6b9e72]">Output approved as source.</p>
            ) : canAttach ? (
              <form action={attachOutputAsShotReference}>
                <input type="hidden" name="projectId" value={String(pid)} />
                <input type="hidden" name="sequenceId" value={String(sid)} />
                <input type="hidden" name="shotId" value={String(shid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input type="hidden" name="returnTo" value={approveReturnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
                >
                  Approve Output
                </button>
              </form>
            ) : null}
            {/* Storyboard draft — SEQGEN.STORYBOARD.2, additive to the
                Approve Output/Attach-as-reference actions above, never
                replacing them. Only offered for image workflows reached
                from the Storyboard workspace (?storyboard=1). */}
            {canSaveStoryboardDraft && (
              <>
                {storyboardDraftError && (
                  <p className="text-xs text-[#cf7b6b]">{storyboardDraftError}</p>
                )}
                {storyboardDraftSaved ? (
                  <p className="text-xs text-[#6b9e72]">Saved as storyboard draft.</p>
                ) : (
                  <form action={saveStoryboardDraftFromJob}>
                    <input type="hidden" name="shotId" value={String(shid)} />
                    <input type="hidden" name="jobId" value={String(activeJobId)} />
                    <input type="hidden" name="promptSnapshot" value={compiledShotPrompt.text} />
                    <input type="hidden" name="referencesSnapshot" value={storyboardReferencesSnapshot} />
                    <input type="hidden" name="returnTo" value={approveReturnTo} />
                    <button
                      type="submit"
                      className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
                    >
                      Save as Storyboard Draft
                    </button>
                  </form>
                )}
              </>
            )}
            {/* Video approve — GEN.2.G.2 */}
            {approveError && (
              <p className="text-xs text-[#cf7b6b]">{approveError}</p>
            )}
            {approvedVideo ? (
              <p className="text-xs text-[#6b9e72]">Video approved as shot output.</p>
            ) : canApproveVideo ? (
              <form action={approveVideoOutput}>
                <input type="hidden" name="shotId" value={String(shid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input type="hidden" name="returnTo" value={approveReturnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
                >
                  Approve Output
                </button>
              </form>
            ) : null}
            {/* SHOT.VIDEO.LIBRARY.1 — save-only (never approves), always
                available whenever the same output is video-approvable, so a
                video becomes a reusable Shot media asset even before/without
                ever being approved as the Shot's output. */}
            {libraryError && <p className="text-xs text-[#cf7b6b]">{libraryError}</p>}
            {librarySaved ? (
              <p className="text-xs text-[#6b9e72]">Saved to the Shot Video Library.</p>
            ) : libraryAlreadySaved ? (
              <p className="text-xs text-[#a4abb2]">Already saved to the Shot Video Library.</p>
            ) : canApproveVideo ? (
              <form action={saveVideoOutputToLibrary}>
                <input type="hidden" name="shotId" value={String(shid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input type="hidden" name="returnTo" value={approveReturnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
                >
                  Save to Shot Videos
                </button>
              </form>
            ) : null}
          </div>
        )}

      </div>
    </div>
  );
}