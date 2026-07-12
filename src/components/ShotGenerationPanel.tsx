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
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import CompiledShotPromptPreviewPanel from "@/components/CompiledShotPromptPreviewPanel";
import InlineShotPromptEditor from "@/components/InlineShotPromptEditor";
import ShotPanelImagePreviewForm from "@/components/ShotPanelImagePreviewForm";
import type { ShotPanelImageNode } from "@/components/ShotPanelImagePreviewForm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import {
  buildRuntimeImageOptions,
  mapWorkflowInputs,
} from "@/lib/comfy/mapWorkflowInputs";
import { patchWorkflowPayload } from "@/lib/comfy/patchWorkflowPayload";
import {
  detectDynamicBatchInput,
  traceUpstreamTemplateChain,
  expandDynamicBatchWorkflow,
  type DynamicBatchExpansionImage,
} from "@/lib/comfy/expandDynamicBatch";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import {
  runWorkflowGenerationFromForm,
  attachOutputAsShotReference,
  approveVideoOutput,
} from "@/actions/generation";
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { type FillSource } from "@/lib/textInputKind";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";

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
  scalarValueByNodeId: Record<string, string>;
  textOverrideByNodeId: Record<string, string>;
  generationError: string | undefined;
  activeJobId: number | null;
  attachedReference?: boolean;
  attachError?: string | null;
  approvedVideo?: boolean;
  approveError?: string | null;
  shotPromptSaved?: boolean;
  shotPromptError?: string | null;
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
  scalarValueByNodeId,
  textOverrideByNodeId,
  generationError,
  activeJobId,
  attachedReference,
  attachError,
  approvedVideo,
  approveError,
  shotPromptSaved,
  shotPromptError,
}: Props) {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot) return null;

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) return null;

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
  });

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

  const availableImages = buildRuntimeImageOptions(
    shotRefImages,
    castAssetRefImages,
    assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
    }))
  );

  const mappings =
    parsed !== null
      ? mapWorkflowInputs(parsed.inputs, compiledShotPrompt.text, availableImages, textOverrideByNodeId)
      : [];

  const imageMappings = mappings.filter((m) => m.mappingKind === "image");

  // --- Dynamic Batch Input detection (before building classic image UI) ---
  const batchDetection = parsed !== null ? detectDynamicBatchInput(workflow.workflowJson) : null;
  let batchPreview: BatchExpansionPreview | null = null;
  let batchError: { kind: "detection"; message: string } | null = null;
  let batchTemplateChainNodeIds: string[] = [];

  if (batchDetection?.ok) {
    const trace = traceUpstreamTemplateChain(JSON.parse(workflow.workflowJson), batchDetection.info);
    if (trace.ok) {
      batchTemplateChainNodeIds = trace.templateChainNodeIds;
      const parsedWorkflowJson = JSON.parse(workflow.workflowJson) as Record<string, { _meta?: { title?: string }; class_type?: string }>;
      const titles = batchTemplateChainNodeIds.map((nid) => {
        const node = parsedWorkflowJson[nid];
        if (!node) return nid;
        const t = node._meta?.title ?? node.class_type ?? nid;
        return t.replace("(Input)", "").replace("(Dynamic Batch Input)", "").trim();
      });
      batchPreview = {
        batchTitle: batchDetection.info.title.replace("(Dynamic Batch Input)", "").trim(),
        templateChainTitles: titles,
        selectedImageCount: 0,
        clonedNodeCount: 0,
      };
    } else {
      batchError = { kind: "detection", message: trace.error };
    }
  } else if (batchDetection && !batchDetection.ok && batchDetection.error) {
    batchError = { kind: "detection", message: batchDetection.error };
  }

  // Parse selected batch images from searchParams
  let batchSelectedIds: string[] = [];
  if (batchDetection?.ok) {
    const raw = currentSearchParams[`batchImages_${batchDetection.info.nodeId}`] ?? "";
    batchSelectedIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

  // When Dynamic Batch is active, template-chain image inputs are replaced by the batch list.
  // Exclude them from classic UI display and from preview warnings.
  const displayImageMappings = batchDetection?.ok
    ? imageMappings.filter((m) => !batchTemplateChainNodeIds.includes(m.input.nodeId))
    : imageMappings;

  const previewMappings = batchDetection?.ok
    ? mappings.filter((m) => !batchTemplateChainNodeIds.includes(m.input.nodeId))
    : mappings;

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

  // --- Build the runtime preview JSON ---
  // Order: expandDynamicBatchWorkflow first, then patchWorkflowPayload on the expanded JSON.
  // This mirrors the server-side pipeline exactly so the preview matches what's sent to ComfyUI.
  let payloadPreview: import("@/lib/comfy/patchWorkflowPayload").WorkflowPayloadPatchResult | null = null;

  if (parsed !== null) {
    let previewJsonSource = workflow.workflowJson;

    if (batchDetection?.ok && batchSelectedIds.length > 0) {
      // Resolve batch image IDs to DynamicBatchExpansionImage[]
      const resolvedBatchImages: DynamicBatchExpansionImage[] = [];
      for (const id of batchSelectedIds) {
        const found = availableImages.find((img) => img.id === id);
        if (found) {
          resolvedBatchImages.push({ id: found.id, imagePath: found.imagePath });
        }
      }

      // Expand workflow with selected batch images
      const expansion = expandDynamicBatchWorkflow({
        workflowJson: workflow.workflowJson,
        selectedImages: resolvedBatchImages,
      });

      if (expansion.ok) {
        previewJsonSource = expansion.workflowJson;
      }
    }

    payloadPreview = patchWorkflowPayload(previewJsonSource, previewMappings, {
      selectedImageByNodeId,
      scalarOverrideByNodeId: scalarValueByNodeId,
    });
  }

  // Build available images as BatchImageGroups for DynamicBatchImageList
  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetection?.ok) {
    const shotItems = availableImages.filter((img) => img.source === "shot").map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.label,
      source: img.source,
      assetName: img.assetName,
    }));
    const assetItems = availableImages.filter((img) => img.source === "asset").map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.assetName ? `${img.assetName}${img.role ? " · " + img.role : ""}` : (img.role ?? img.label),
      source: img.source,
      assetName: img.assetName,
    }));
    if (shotItems.length > 0) batchImageGroups.push({ groupLabel: "Shot Sources", items: shotItems });
    if (assetItems.length > 0) batchImageGroups.push({ groupLabel: "Cast Sources", items: assetItems });
  }

  // Build selectionParams — also include batchImages_* to persist selection after Generate
  const selectionParams = new URLSearchParams({ generation: "open", workflowId: String(wid) });
  for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
    selectionParams.set(`imageNode_${nodeId}`, imageId);
  }
  for (const [nodeId, value] of Object.entries(scalarValueByNodeId)) {
    selectionParams.set(`scalarNode_${nodeId}`, value);
  }
  for (const [nodeId, value] of Object.entries(textOverrideByNodeId)) {
    selectionParams.set(`textNode_${nodeId}`, value);
  }
  if (batchDetection?.ok && batchSelectedIds.length > 0) {
    selectionParams.set(`batchImages_${batchDetection.info.nodeId}`, batchSelectedIds.join(","));
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

            {/* Dynamic Image Batch (WFBUILD.1A) */}
            {batchDetection?.ok && (
              <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
                <DynamicBatchImageList
                  batchNodeId={batchDetection.info.nodeId}
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
            {batchError && !batchDetection?.ok && (
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
              {/* DynamicBatchFormSync replaces the static hidden input — it reads
                  the current URL searchParams at submit time, keeping in sync with
                  client-side DynamicBatchImageList updates via pushState(). */}
              {batchDetection?.ok && (
                <DynamicBatchFormSync batchNodeId={batchDetection.info.nodeId} workflowId={String(wid)} />
              )}
              <WorkflowGenerateActions
                initialJsonText={payloadPreview.patchedJsonText}
                buttonLabel={workflow.kind === "video" ? "Generate Video" : "Generate Keyframe"}
              />
            </form>
          </div>
        )}

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
          </div>
        )}

      </div>
    </div>
  );
}