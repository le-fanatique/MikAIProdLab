import Link from "next/link";
import { db } from "@/db";
import { assets, comfyWorkflows, assetReferenceImages, generationJobs, generationJobOutputs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import PartnerNodeConfirmForm from "@/components/PartnerNodeConfirmForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import AssetPanelImagePreviewForm from "@/components/AssetPanelImagePreviewForm";
import type { AssetPanelImageNode } from "@/components/AssetPanelImagePreviewForm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import {
  getRuntimeImageLabel,
  type RuntimeImageOption,
} from "@/lib/comfy/mapWorkflowInputs";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
  summarizeGenerationMutations,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { runAssetGenerationFromForm, attachOutputAsAssetReference } from "@/actions/generation";
import JobOutputSelectionToggle from "@/components/JobOutputSelectionToggle";
import { generatedOutputUrl } from "@/lib/getOutputUrl";
import { prepareGenerationStyleSource } from "@/lib/projectStyle/generationStylePreparation";
import ProjectStyleGenerationPreview from "@/components/projectStyle/ProjectStyleGenerationPreview";
import ProjectStyleAppendCheckbox from "@/components/projectStyle/ProjectStyleAppendCheckbox";
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { buildAssetFillSources } from "@/lib/assetFillSources";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import { getComfySettings } from "@/lib/settings";
import { computeCloudPreflightForPanel } from "@/lib/comfy/cloudPreflight";

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
  /** GEN.MULTIOUT.1 — the count attached, as a string; several outputs can be
   *  attached in one submit. Absent when nothing was just attached. */
  attachedReference?: string;
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

  // COMFY.PROVIDER.1 — same Cloud preflight as ShotGenerationPanel, shared
  // via computeCloudPreflightForPanel.
  const comfySettings = await getComfySettings();
  const cloudPreflight = await computeCloudPreflightForPanel(workflow.workflowJson, comfySettings);
  const cloudPreflightBlocksGeneration =
    cloudPreflight !== null && ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0);
  const partnerNodeConfirmMessage =
    cloudPreflight !== null && !("error" in cloudPreflight) && cloudPreflight.apiNodeClasses.length > 0
      ? `This will call paid Comfy Cloud Partner Node(s): ${cloudPreflight.apiNodeClasses.join(", ")}. Continue and incur cost?`
      : null;

  const assetRefImages = await db
    .select({
      id: assetReferenceImages.id,
      assetId: assetReferenceImages.assetId,
      imagePath: assetReferenceImages.imagePath,
      label: assetReferenceImages.label,
      imageRole: assetReferenceImages.imageRole,
      sourceFilename: assetReferenceImages.sourceFilename,
      variantState: assetReferenceImages.variantState,
      approvedForGeneration: assetReferenceImages.approvedForGeneration,
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
    variantState: image.variantState,
    approved: image.approvedForGeneration,
  }));

  const assetPromptText = [asset.description, asset.notes]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v))
    .join("\n\n");

  // STYLE.1.E.SURFACES.1 — Asset consumer is always hard-coded "asset".
  // Preview-only; the server action re-resolves independently at submit time.
  const preparedStyle = await prepareGenerationStyleSource("asset", { kind: "project", projectId: pid }, assetPromptText);
  const styledSuggestedText = preparedStyle.ok ? preparedStyle.composedSuggestedPrompt.prompt : assetPromptText;
  const styledTextOverrideByNodeId = preparedStyle.ok
    ? Object.fromEntries(Object.entries(textOverrideByNodeId).map(([nodeId, value]) => [nodeId, preparedStyle.composeTextOverride(value)]))
    : textOverrideByNodeId;

  const fillSources = buildAssetFillSources(asset.description, asset.notes, asset.visualIdentity);

  const parsed = parseComfyWorkflow(workflow.workflowJson);

  // --- Dynamic Batch UI info (detect + trace + titles) — shared helper,
  // same result the /map page and ShotGenerationPanel compute. ---
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

  // Parse selected batch images from searchParams
  let batchSelectedIds: string[] = [];
  if (batchDetectionOk) {
    const raw = currentSearchParams[`batchImages_${batchNodeId}`] ?? "";
    batchSelectedIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

  // --- Canonical payload (GEN.SEEDANCE.1) — same function used by /map,
  // ShotGenerationPanel and the server action. ---
  const resolvedBatchImages: DynamicBatchExpansionImage[] = batchSelectedIds
    .map((id) => availableImages.find((img) => img.id === id))
    .filter((img): img is NonNullable<typeof img> => img !== undefined)
    .map((img) => ({ id: img.id, imagePath: img.imagePath }));

  const built =
    parsed !== null
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

  // STYLE.1.E.SURFACES.2 retake Round 1 — three-state injectability (see
  // ProjectStyleGenerationPreview.tsx's own doc comment): "pending" whenever
  // the canonical payload was not successfully built (here, only when the
  // workflow JSON itself failed to parse), never a false claim of
  // incompatibility for an unevaluated payload.
  const styleTextInjectability = built === null ? "pending" : built.ok ? (built.patch.patches.some((p) => p.kind === "text") ? "injected" : "not-compatible") : "pending";

  const mappings = built?.ok ? built.mappings : [];
  const imageMappings = mappings.filter((m) => m.mappingKind === "image");

  const displayImageMappings = batchDetectionOk
    ? imageMappings.filter((m) => !batchTemplateChainNodeIds.includes(m.input.nodeId))
    : imageMappings;

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
        variantState: img.variantState,
        approved: img.approved,
      })),
    };
  });

  // --- Runtime preview JSON — GEN.SEEDANCE.1: `built.patch` is the exact
  // same canonical computation the server re-runs at queue time. When a
  // Dynamic Batch node exists with nothing selected yet, `built` is a clean
  // `ok:false` (never a crash); no preview is shown rather than an
  // incomplete/misleading intermediate payload — DynamicBatchImageList's
  // own "Add at least one image" notice already covers that state. Any
  // other (unexpected) error is surfaced via batchError too. ---
  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

  // Build available images as BatchImageGroups
  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetectionOk) {
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
  if (batchDetectionOk && batchSelectedIds.length > 0) {
    selectionParams.set(`batchImages_${batchNodeId}`, batchSelectedIds.join(","));
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
  // GEN.MULTIOUT.1 — every file this job produced, in ComfyUI's own order.
  // Empty for jobs published before the table existed; the single-output
  // fallback below is what they keep using.
  let jobOutputs: Array<{ index: number; path: string }> = [];

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

      if (fetchedJob.status === "done") {
        const rows = await db
          .select({
            outputIndex: generationJobOutputs.outputIndex,
            path: generationJobOutputs.path,
          })
          .from(generationJobOutputs)
          .where(eq(generationJobOutputs.jobId, activeJobId))
          .orderBy(generationJobOutputs.outputIndex);
        jobOutputs = rows
          .filter((r) => ATTACH_EXTS.has(`.${r.path.split(".").pop()?.toLowerCase() ?? ""}`))
          .map((r) => ({ index: r.outputIndex, path: r.path }));
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
      <div className="px-5 py-4 flex flex-col gap-5 group/style">

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
                  contextType="asset"
                  projectId={pid}
                  workflowId={String(wid)}
                  assetId={aid}
                />
              </div>
            )}

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
                  contextType="asset"
                  projectId={pid}
                  workflowId={String(wid)}
                  assetId={aid}
                />
              </div>
            )}
          </>
        )}

        {/* GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — checked by default on every mount. */}
        <ProjectStyleAppendCheckbox formId="asset-panel-generation-form" />

        {/* STYLE.1.E.SURFACES.1 — inspectable Style source, before the payload preview. */}
        <ProjectStyleGenerationPreview sourceLabel="Project Style" prepared={preparedStyle} textInjectability={styleTextInjectability} />

        {payloadPreview !== null && (
          <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Preview
            </p>
            <p className="text-xs text-[#a4abb2]">
              {summarizeGenerationMutations(payloadPreview.patches)}
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
            {/* COMFY.PROVIDER.1 — see identical blocks in ShotGenerationPanel. */}
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
            {/* STYLE.1.E.SURFACES.1 — a resolver/corruption error disables
                Generate entirely; already visible above via
                ProjectStyleGenerationPreview. GEN.PROJECT_STYLE.APPEND.TOGGLE.1
                — but never while the user has unchecked "Append Project
                Style", since no resolution is attempted for that job at all. */}
            {!preparedStyle.ok && (
              <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3 group-has-[#appendProjectStyle:not(:checked)]/style:hidden">
                <p className="text-xs text-[#cf7b6b] leading-relaxed">
                  Generation is disabled: Project Style could not be resolved.
                </p>
              </div>
            )}
            {!cloudPreflightBlocksGeneration && (
            <PartnerNodeConfirmForm
              id="asset-panel-generation-form"
              action={runAssetGenerationFromForm}
              partnerNodeConfirmMessage={partnerNodeConfirmMessage}
              className={
                preparedStyle.ok
                  ? "flex flex-col gap-4"
                  : "hidden group-has-[#appendProjectStyle:not(:checked)]/style:flex flex-col gap-4"
              }
            >
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
              {/* GEN.SEEDANCE.1 — see identical comment in ShotGenerationPanel. */}
              {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                <input key={`text-${nodeId}`} type="hidden" name={`textNode_${nodeId}`} value={value} />
              ))}
              {batchDetectionOk && (
                <DynamicBatchFormSync batchNodeId={batchNodeId} workflowId={String(wid)} />
              )}
              {/* COMFY.PROVIDER.1 — confirmPartnerNodeCost is deliberately NOT
                  rendered here: PartnerNodeConfirmForm sets it itself, only on
                  the confirmed submit path, so it never exists in the SSR/
                  pre-hydration HTML. */}
              <WorkflowGenerateActions
                initialJsonText={payloadPreview.patchedJsonText}
                buttonLabel="Generate Image"
              />
            </PartnerNodeConfirmForm>
            )}
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
              <p className="text-xs text-[#6b9e72]">
                {attachedReference === "1"
                  ? "Reference image attached."
                  : `${attachedReference} reference images attached.`}
              </p>
            ) : canAttach ? (
              /* GEN.MULTIOUT.1 — a prompt can return several files (a grid split
                 into panels, for one). Every one of them is offered, in ComfyUI's
                 own order, all ticked by default. A job recorded before this
                 ticket has no rows and keeps the single-output form. */
              <form action={attachOutputAsAssetReference} id="asset-attach-outputs-form">
                <input type="hidden" name="projectId" value={String(pid)} />
                <input type="hidden" name="assetId" value={String(aid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input type="hidden" name="returnTo" value={approveReturnTo} />

                {jobOutputs.length > 1 && (
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                        {jobOutputs.length} outputs
                      </p>
                      <JobOutputSelectionToggle formId="asset-attach-outputs-form" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {jobOutputs.map((output) => (
                        <label
                          key={output.index}
                          className="group relative flex cursor-pointer flex-col gap-1 rounded border border-[#2c3035] bg-[#0d0e10] p-1.5 hover:border-[#3a4046] transition-colors"
                        >
                          <img
                            src={generatedOutputUrl(output.path) ?? `/${output.path}`}
                            alt={`Output ${output.index + 1}`}
                            className="w-full aspect-square rounded object-cover"
                          />
                          <span className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              name="outputIndex"
                              value={String(output.index)}
                              defaultChecked
                              className="accent-[#6b9e72]"
                            />
                            <span className="text-[10px] text-[#a4abb2]">
                              {output.index + 1}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

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