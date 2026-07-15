import Link from "next/link";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  comfyWorkflows,
  shotAssets,
  assets,
  promptSegments,
  shotReferenceImages,
  assetReferenceImages,
  generationJobs,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { buildRuntimeImageOptions } from "@/lib/comfy/mapWorkflowInputs";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowImageSelectionForm from "@/components/WorkflowImageSelectionForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import CompiledShotPromptPreviewPanel from "@/components/CompiledShotPromptPreviewPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import { runWorkflowGenerationFromForm, attachOutputAsShotReference } from "@/actions/generation";
import { saveStoryboardDraftFromJob } from "@/actions/storyboard";
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { type FillSource } from "@/lib/textInputKind";
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

type Props = {
  params: Promise<{
    projectId: string;
    sequenceId: string;
    shotId: string;
    workflowId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkflowMappingPage({ params, searchParams }: Props) {
  const { projectId, sequenceId, shotId, workflowId } = await params;
  const resolvedSearchParams = await searchParams;

  const rawJobId = resolvedSearchParams["jobId"];
  const jobIdParam = typeof rawJobId === "string" ? rawJobId : Array.isArray(rawJobId) ? rawJobId[0] : undefined;

  const rawGenerationError = resolvedSearchParams["generationError"];
  const generationError = typeof rawGenerationError === "string" ? rawGenerationError : Array.isArray(rawGenerationError) ? rawGenerationError[0] : undefined;

  // SEQGEN.STORYBOARD.2 (retake 3) — feedback after saveStoryboardDraftFromJob,
  // same shape as generationError above.
  const rawStoryboardDraftSaved = resolvedSearchParams["storyboardDraftSaved"];
  const storyboardDraftSaved =
    (typeof rawStoryboardDraftSaved === "string" ? rawStoryboardDraftSaved : Array.isArray(rawStoryboardDraftSaved) ? rawStoryboardDraftSaved[0] : undefined) === "1";
  const rawStoryboardDraftError = resolvedSearchParams["storyboardDraftError"];
  const storyboardDraftError = typeof rawStoryboardDraftError === "string" ? rawStoryboardDraftError : Array.isArray(rawStoryboardDraftError) ? rawStoryboardDraftError[0] : undefined;

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("imageNode_")) continue;
    const nodeId = key.slice("imageNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue && strValue.trim()) {
      selectedImageByNodeId[nodeId] = strValue.trim();
    }
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

  // Flat snapshot of all current search params for the scalar/text form passthrough
  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);
  const wid = parseInt(workflowId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  const [workflow] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();

  // Assigned cast assets
  const assignedRows = await db
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
    .orderBy(asc(assets.name));

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  // Prompt segments
  const segmentList = await db
    .select()
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shid))
    .orderBy(asc(promptSegments.orderIndex));

  // Shot reference images
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

  // Cast asset reference images (with imagePath)
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

  // Derived data
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
    sequenceContext: {
      title: sequence.title,
      summary: sequence.summary,
      mood: sequence.mood,
      locationHint: sequence.locationHint,
      narrativePurpose: sequence.narrativePurpose,
    },
    projectContext: { name: project.name, pitch: project.pitch, story: project.story },
    availableReferenceRefIds: promptCompilerAvailableReferences.map((r) => r.refId),
    availableReferencesByRefId: Object.fromEntries(
      promptCompilerAvailableReferences.map((r) => [r.refId, r])
    ),
  };

  // Fill sources for the "Fill" dropdown on text inputs (PROMPTUX.1) —
  // mirrors ShotGenerationPanel's calculation exactly, so the standalone
  // /map page and the Generate side panel offer the same named sources.
  const composedShotPrompt = composeShotPrompt({
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
  });

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
    composedShotPrompt.hasContent
      ? { id: "casting", label: "Casting-aware Prompt", text: composedShotPrompt.proposalText, kinds: STYLE_KINDS }
      : null,
    project.story?.trim()
      ? { id: "projectStory", label: "Project Story", text: project.story.trim(), kinds: STYLE_KINDS }
      : null,
    sequence.summary?.trim()
      ? { id: "sequenceSummary", label: "Sequence Summary", text: sequence.summary.trim(), kinds: STYLE_KINDS }
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

  // SEQGEN.STORYBOARD.2 (retake 2): this is the page StoryboardGrid's
  // Generate/Regenerate links actually land on (via the workflow selector),
  // not just ShotGenerationPanel's embedded copy on Shot Detail — the
  // Storyboard Assets selection must be applied here too, before any
  // preview/payload construction below, using the exact same shared pure
  // helper (no second filter implementation).
  const isStoryboardContext = currentSearchParams["storyboard"] === "1";
  const storyboardSelectedRefIds = (currentSearchParams["storyboardRefs"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const availableImages = isStoryboardContext
    ? filterAvailableImagesBySelection(allAvailableImages, storyboardSelectedRefIds)
    : allAvailableImages;

  // SEQGEN.STORYBOARD.2 (retake 3) — storyboard=1/storyboardRefs must survive
  // the Image Inputs "Update Preview" GET form and the Generate redirect's
  // returnTo, not just this page's initial render. Reused below both as
  // hidden fields for WorkflowImageSelectionForm and folded into
  // selectionParams so returnTo carries them too — no second passthrough
  // mechanism, just the existing selectionParams/currentSearchParams pattern.
  const storyboardPreserveParams: Record<string, string> | undefined = isStoryboardContext
    ? {
        storyboard: "1",
        ...(currentSearchParams["storyboardRefs"] ? { storyboardRefs: currentSearchParams["storyboardRefs"] } : {}),
      }
    : undefined;
  const storyboardWorkspaceReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;

  const basePath = `/projects/${pid}/sequences/${sid}/shots/${shid}/workflows/${wid}/map`;

  // --- Dynamic Batch UI info (GEN.SEEDANCE.1) — this page previously never
  // detected or expanded Dynamic Batch at all, so its preview silently
  // showed the unexpanded workflow and Generate would fail server-side with
  // no indication why. Now uses the exact same canonical helpers as
  // ShotGenerationPanel/AssetGenerationPanel. ---
  const batchUiInfo = parsed !== null ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const };
  const batchDetectionOk = batchUiInfo.kind === "ready";
  const batchNodeId = batchUiInfo.kind === "ready" ? batchUiInfo.batchNodeId : "";
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

  let batchSelectedIds: string[] = [];
  if (batchDetectionOk) {
    const raw = currentSearchParams[`batchImages_${batchNodeId}`] ?? "";
    batchSelectedIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

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
          textOverrideByNodeId,
          selectedImageByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  const mappings = built?.ok ? built.mappings : [];
  const displayMappings = built?.ok ? built.displayMappings : mappings;
  const promptCompilerTextNodeCandidates = mappings
    .filter((m) => m.mappingKind === "text")
    .map((m) => ({ nodeId: m.input.nodeId, label: m.input.label, title: m.input.title }));

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
  const selectedImageCount = displayMappings.filter(
    (m) => m.mappingKind === "image" && Boolean(selectedImageByNodeId[m.input.nodeId])
  ).length;

  // First/Last Frame mapping strictness (GEN.SEEDANCE.3) — resolves the two
  // real, distinct image nodes by their exact title, then looks up what the
  // user actually selected for each and that selection's own stored role.
  // Never guesses, never auto-selects, never mutates a selection.
  const workflowImageNodeCandidates = mappings
    .filter((m) => m.mappingKind === "image")
    .map((m) => ({ nodeId: m.input.nodeId, label: m.input.label, title: m.input.title }));
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

  // Same "no misleading intermediate payload" rule as the panels: when a
  // Dynamic Batch node exists and nothing is selected yet, show no preview
  // rather than the unexpanded/incomplete one.
  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

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

  const shotLabel = shot.shotCode
    ? `${shot.shotCode} — ${shot.title}`
    : shot.title;

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

  // Output-section returnTo (e.g. for Save as Storyboard Draft) — same
  // selection state as Generate's returnTo, plus the current jobId so the
  // panel reopens on the right output if the user comes back to /map.
  const outputParams = new URLSearchParams(selectionParams);
  if (jobIdParam) outputParams.set("jobId", jobIdParam);
  const outputReturnTo = `${basePath}?${outputParams.toString()}`;

  const activeJobId =
    jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  let activeJobOutputPath: string | null = null;
  let canAttach = false;

  if (activeJobId !== null && workflow.kind === "image") {
    const [fetchedJob] = await db
      .select({
        status: generationJobs.status,
        outputPath: generationJobs.outputPath,
        shotId: generationJobs.shotId,
      })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));

    if (fetchedJob && fetchedJob.shotId === shid) {
      activeJobOutputPath = fetchedJob.outputPath ?? null;
      const ext = activeJobOutputPath
        ? activeJobOutputPath.split(".").pop()?.toLowerCase() ?? ""
        : "";
      canAttach =
        fetchedJob.status === "done" &&
        activeJobOutputPath !== null &&
        ATTACH_EXTS.has(`.${ext}`);
    }
  }

  // SEQGEN.STORYBOARD.2 (retake 3) — this is the actual route the real
  // Storyboard flow reaches (Storyboard -> Generate -> workflow selector ->
  // /map), so the "Save as Storyboard Draft" action belongs here, reusing
  // saveStoryboardDraftFromJob and this render's own already-computed
  // compiledShotPrompt/availableImages/selectedImageByNodeId — never a
  // second source of truth or a second draft-saving action.
  const canSaveStoryboardDraft = isStoryboardContext && workflow.kind === "image" && canAttach;
  const storyboardReferencesSnapshot = JSON.stringify(
    Object.values(selectedImageByNodeId)
      .map((imageId) => availableImages.find((img) => img.id === imageId))
      .filter((img): img is NonNullable<typeof img> => img !== undefined)
      .map((img) => ({ id: img.id, label: img.label, source: img.source, assetName: img.assetName }))
  );

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          {
            label: shot.shotCode ?? shot.title,
            href: `/projects/${pid}/sequences/${sid}/shots/${shid}`,
          },
          {
            label: "Shot Workflows",
            href: `/projects/${pid}/sequences/${sid}/shots/${shid}/workflows`,
          },
          { label: workflow.name },
        ]}
      />

      <PageHeader
        title={workflow.kind === "video" ? "Generate Video" : "Generate Keyframe"}
        meta={shotLabel}
      />

      <div className="flex flex-col gap-4">

        {/* ── Workflow ──────────────────────────────────────── */}
        <Card title="Workflow">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <WorkflowKindBadge kind={workflow.kind} />
              <span className="text-sm font-medium text-[#e7e9ec]">{workflow.name}</span>
            </div>
            {workflow.description && (
              <p className="text-xs text-[#a4abb2]">{workflow.description}</p>
            )}
            {workflow.sourceFilename && (
              <p className="text-xs font-mono text-[#6e767d]">{workflow.sourceFilename}</p>
            )}
            {workflow.kind === "video" && (
              <p className="text-[10px] text-[#6e767d] mt-0.5">
                Uses shot prompt and timeline segments.
              </p>
            )}
          </div>
        </Card>

        {/* ── Inputs ────────────────────────────────────────── */}
        <SectionLabel label="Inputs" />

        <Card title="Shot Prompt">
          <CompiledShotPromptPreviewPanel
            compiled={compiledShotPrompt}
            workflowKind={workflow.kind}
          />
          <div className="mt-3 pt-3 border-t border-[#1e2124]">
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
              className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Edit Shot Prompt →
            </Link>
          </div>
        </Card>

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
        <Card title="Suggested Inputs">
          {parsed === null ? (
            <p className="text-sm text-[#cf7b6b]">
              This workflow JSON could not be parsed.
            </p>
          ) : (
            <WorkflowRuntimeMappingPanel
              mappings={mappings}
              scalarValueByNodeId={scalarValueByNodeId}
              textOverrideByNodeId={textOverrideByNodeId}
              currentSearchParams={currentSearchParams}
              basePath={basePath}
              fillSources={fillSources}
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

        {/* ── Dynamic Image Batch (GEN.SEEDANCE.1) ─────────────
            Previously absent from this page entirely — a workflow with a
            Dynamic Batch node had no way to select batch images here, and
            Generate would fail server-side with no visible reason. ─────── */}
        {batchDetectionOk && (
          <Card title="Dynamic Image Batch">
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
              contextType="shot"
              projectId={pid}
              workflowId={String(wid)}
              shotId={shid}
              sequenceId={sid}
            />
          </Card>
        )}

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
                    <p className="text-xs text-[#cf7b6b] leading-relaxed">
                      {generationError}
                    </p>
                  </div>
                )}

                <form action={runWorkflowGenerationFromForm} className="flex flex-col gap-4">
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
                  {Object.entries(scalarValueByNodeId).map(([nodeId, value]) => (
                    <input
                      key={`scalar-${nodeId}`}
                      type="hidden"
                      name={`scalarNode_${nodeId}`}
                      value={value}
                    />
                  ))}
                  {/* GEN.SEEDANCE.1 — previously never submitted, so Generate
                      silently dropped any staged text override. */}
                  {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                    <input
                      key={`text-${nodeId}`}
                      type="hidden"
                      name={`textNode_${nodeId}`}
                      value={value}
                    />
                  ))}
                  {/* GEN.SEEDANCE.1 — Dynamic Batch selection, same sync
                      mechanism as the panels (URL + sessionStorage). */}
                  {batchDetectionOk && (
                    <DynamicBatchFormSync batchNodeId={batchNodeId} workflowId={String(wid)} />
                  )}

                  <WorkflowGenerateActions
                    initialJsonText={payloadPreview.patchedJsonText}
                    buttonLabel={workflow.kind === "video" ? "Generate Video" : "Generate"}
                  />
                </form>
              </div>
            </Card>
          </>
        )}
        </PromptCompilerHandoffGate>
        </WorkflowProfilePanel>

        {/* ── Output ────────────────────────────────────────── */}
        {activeJobId !== null && (
          <>
            <SectionLabel label="Output" />
            <Card>
              <div className="flex flex-col gap-4">
                <GenerationJobStatusPanel jobId={activeJobId} />

                {canAttach && (
                  <form action={attachOutputAsShotReference}>
                    <input type="hidden" name="projectId" value={String(pid)} />
                    <input type="hidden" name="sequenceId" value={String(sid)} />
                    <input type="hidden" name="shotId" value={String(shid)} />
                    <input type="hidden" name="jobId" value={String(activeJobId)} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
                    />
                    <button
                      type="submit"
                      className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
                    >
                      Attach as Shot Reference
                    </button>
                  </form>
                )}

                {/* Storyboard draft — SEQGEN.STORYBOARD.2 (retake 3), additive to
                    Attach as Shot Reference above, never replacing it. Only
                    offered for image workflows reached from the Storyboard
                    workspace (?storyboard=1) — this is the real Generate route
                    the Storyboard grid leads to. */}
                {canSaveStoryboardDraft && (
                  <>
                    {storyboardDraftError && (
                      <p className="text-xs text-[#cf7b6b]">{storyboardDraftError}</p>
                    )}
                    {storyboardDraftSaved ? (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-[#6b9e72]">Saved as storyboard draft.</p>
                        <Link
                          href={storyboardWorkspaceReturnTo}
                          className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                        >
                          ← Back to Storyboard Workspace
                        </Link>
                      </div>
                    ) : (
                      <form action={saveStoryboardDraftFromJob}>
                        <input type="hidden" name="shotId" value={String(shid)} />
                        <input type="hidden" name="jobId" value={String(activeJobId)} />
                        <input type="hidden" name="promptSnapshot" value={compiledShotPrompt.text} />
                        <input type="hidden" name="referencesSnapshot" value={storyboardReferencesSnapshot} />
                        <input type="hidden" name="returnTo" value={outputReturnTo} />
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
              </div>
            </Card>
          </>
        )}

      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-6">
        <Link
          href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Workflows
        </Link>
        <Link
          href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Shot
        </Link>
        {isStoryboardContext && (
          <Link
            href={storyboardWorkspaceReturnTo}
            className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            ← Back to Storyboard Workspace
          </Link>
        )}
      </div>
    </div>
  );
}
