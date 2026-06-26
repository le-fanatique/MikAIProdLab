import Link from "next/link";
import { db } from "@/db";
import { assets, comfyWorkflows, assetReferenceImages, generationJobs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import AssetPanelImagePreviewForm from "@/components/AssetPanelImagePreviewForm";
import type { AssetPanelImageNode } from "@/components/AssetPanelImagePreviewForm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import {
  getRuntimeImageLabel,
  mapWorkflowInputs,
  type RuntimeImageOption,
} from "@/lib/comfy/mapWorkflowInputs";
import { patchWorkflowPayload } from "@/lib/comfy/patchWorkflowPayload";
import {
  detectDynamicBatchInput,
  traceUpstreamTemplateChain,
  expandDynamicBatchWorkflow,
  type DynamicBatchExpansionImage,
} from "@/lib/comfy/expandDynamicBatch";
import { runAssetGenerationFromForm, attachOutputAsAssetReference } from "@/actions/generation";
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { type FillSource } from "@/lib/textInputKind";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";

type Props = {
  projectId: number;
  assetId: number;
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
};

export default async function AssetGenerationPanel({
  projectId: pid,
  assetId: aid,
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
}: Props) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset) return null;

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow || workflow.kind !== "image") return null;

  const assetRefImages = await db
    .select({
      id: assetReferenceImages.id,
      assetId: assetReferenceImages.assetId,
      imagePath: assetReferenceImages.imagePath,
      label: assetReferenceImages.label,
      imageRole: assetReferenceImages.imageRole,
      sourceFilename: assetReferenceImages.sourceFilename,
    })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, aid))
    .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id));

  const availableImages: RuntimeImageOption[] = assetRefImages.map((image) => ({
    id: `asset-${image.assetId}-${image.id}`,
    source: "asset" as const,
    imagePath: image.imagePath,
    label: getRuntimeImageLabel(image),
    role: image.imageRole,
    assetName: asset.name,
    assetType: asset.type,
  }));

  const assetPromptText = [asset.description, asset.notes]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v))
    .join("\n\n");

  const descTrimmed = asset.description?.trim() ?? "";
  const notesTrimmed = asset.notes?.trim() ?? "";
  const fillSources: FillSource[] = [
    descTrimmed ? { id: "description", label: "Asset Description", text: descTrimmed } : null,
    notesTrimmed ? { id: "notes", label: "Asset Notes", text: notesTrimmed } : null,
    descTrimmed && notesTrimmed
      ? { id: "desc_notes", label: "Description + Notes", text: `${descTrimmed}\n${notesTrimmed}` }
      : null,
  ].filter((s): s is FillSource => s !== null);

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  const mappings =
    parsed !== null
      ? mapWorkflowInputs(parsed.inputs, assetPromptText, availableImages, textOverrideByNodeId)
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

  const panelImageNodes: AssetPanelImageNode[] = displayImageMappings.map((mapping) => {
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
    return {
      nodeId,
      displayLabel,
      isDup,
      initialValue: effectiveId,
      isSuggestion,
      images: images.map((img) => ({
        id: img.id,
        imagePath: img.imagePath,
        label: img.label,
        role: img.role ?? undefined,
      })),
    };
  });

  // --- Build the runtime preview JSON ---
  // Order: expandDynamicBatchWorkflow first, then patchWorkflowPayload on the expanded JSON.
  let payloadPreview: import("@/lib/comfy/patchWorkflowPayload").WorkflowPayloadPatchResult | null = null;

  if (parsed !== null) {
    let previewJsonSource = workflow.workflowJson;

    if (batchDetection?.ok && batchSelectedIds.length > 0) {
      const resolvedBatchImages: DynamicBatchExpansionImage[] = [];
      for (const id of batchSelectedIds) {
        const found = availableImages.find((img) => img.id === id);
        if (found) {
          resolvedBatchImages.push({ id: found.id, imagePath: found.imagePath });
        }
      }

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

  // Build available images as BatchImageGroups
  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetection?.ok) {
    const items = availableImages.map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.assetName ? `${img.assetName}${img.role ? " · " + img.role : ""}` : (img.role ?? img.label),
      source: img.source,
      assetName: img.assetName,
    }));
    if (items.length > 0) batchImageGroups.push({ groupLabel: "Asset Sources", items });
  }

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

  const editDetailsParams = new URLSearchParams(selectionParams);
  if (activeJobId !== null) {
    editDetailsParams.set("jobId", String(activeJobId));
  }
  const editDetailsHref = `/projects/${pid}/assets/${aid}?${editDetailsParams.toString()}#asset-details`;

  const approveParams = new URLSearchParams(selectionParams);
  if (activeJobId !== null) {
    approveParams.set("jobId", String(activeJobId));
  }
  const approveReturnTo = `${basePath}?${approveParams.toString()}`;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  let canAttach = false;

  if (activeJobId !== null) {
    const [fetchedJob] = await db
      .select({
        status: generationJobs.status,
        outputPath: generationJobs.outputPath,
        assetId: generationJobs.assetId,
      })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));

    if (fetchedJob && fetchedJob.assetId === aid) {
      const ext = fetchedJob.outputPath?.split(".").pop()?.toLowerCase() ?? "";
      canAttach =
        fetchedJob.status === "done" &&
        fetchedJob.outputPath !== null &&
        ATTACH_EXTS.has(`.${ext}`);
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
            href={
              selectionParams.toString()
                ? `/projects/${pid}/assets/${aid}/workflows/${wid}/generate?${selectionParams.toString()}`
                : `/projects/${pid}/assets/${aid}/workflows/${wid}/generate`
            }
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

        {assetPromptText ? (
          <p className="text-xs text-[#4b5158]">
            Asset prompt set.{" "}
            <Link
              href={editDetailsHref}
              className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Asset prompt · Edit →
            </Link>
          </p>
        ) : (
          <div className="rounded border border-[#5c4a24]/60 bg-[#141008] px-3 py-2">
            <p className="text-xs text-[#b89a5a]">
              No asset prompt yet.{" "}
              <Link
                href={editDetailsHref}
                className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                Edit Asset →
              </Link>
            </p>
          </div>
        )}

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
                <AssetPanelImagePreviewForm
                  nodes={panelImageNodes}
                  passthroughParams={currentSearchParams}
                  basePath={basePath}
                  projectId={pid}
                  assetId={aid}
                />
              </div>
            )}

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
                  contextType="asset"
                  projectId={pid}
                  workflowId={String(wid)}
                  assetId={aid}
                />
              </div>
            )}

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
                  contextType="asset"
                  projectId={pid}
                  workflowId={String(wid)}
                  assetId={aid}
                />
              </div>
            )}
          </>
        )}

        {payloadPreview !== null && (
          <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Preview
            </p>
            <WorkflowPayloadPreviewPanel result={payloadPreview} />
          </div>
        )}

        {payloadPreview !== null && (
          <div className="border-t border-[#232629] pt-4">
            {generationError && (
              <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3">
                <p className="text-xs text-[#cf7b6b] leading-relaxed">{generationError}</p>
              </div>
            )}
            <form action={runAssetGenerationFromForm} className="flex flex-col gap-4">
              <input type="hidden" name="projectId" value={String(pid)} />
              <input type="hidden" name="assetId" value={String(aid)} />
              <input type="hidden" name="workflowId" value={String(wid)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              {Object.entries(selectedImageByNodeId).map(([nodeId, imageId]) => (
                <input key={nodeId} type="hidden" name={`imageNode_${nodeId}`} value={String(imageId)} />
              ))}
              {Object.entries(scalarValueByNodeId).map(([nodeId, value]) => (
                <input key={`scalar-${nodeId}`} type="hidden" name={`scalarNode_${nodeId}`} value={value} />
              ))}
              {batchDetection?.ok && (
                <DynamicBatchFormSync batchNodeId={batchDetection.info.nodeId} workflowId={String(wid)} />
              )}
              <WorkflowGenerateActions
                initialJsonText={payloadPreview.patchedJsonText}
                buttonLabel="Generate Image"
              />
            </form>
          </div>
        )}

        {activeJobId !== null && (
          <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">Output</p>
            <GenerationJobStatusPanel jobId={activeJobId} />
            {attachError && (
              <p className="text-xs text-[#cf7b6b]">{attachError}</p>
            )}
            {attachedReference ? (
              <p className="text-xs text-[#6b9e72]">Reference image attached.</p>
            ) : canAttach ? (
              <form action={attachOutputAsAssetReference}>
                <input type="hidden" name="projectId" value={String(pid)} />
                <input type="hidden" name="assetId" value={String(aid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input type="hidden" name="returnTo" value={approveReturnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
                >
                  Attach as Reference
                </button>
              </form>
            ) : null}
          </div>
        )}

      </div>
    </div>
  );
}