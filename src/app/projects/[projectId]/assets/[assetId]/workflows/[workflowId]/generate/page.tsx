import Link from "next/link";
import { db } from "@/db";
import { projects, assets, comfyWorkflows, assetReferenceImages, generationJobs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowImageSelectionForm from "@/components/WorkflowImageSelectionForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import {
  getRuntimeImageLabel,
  type RuntimeImageOption,
} from "@/lib/comfy/mapWorkflowInputs";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import { runAssetGenerationFromForm, attachOutputAsAssetReference } from "@/actions/generation";
import type { FillSource } from "@/lib/textInputKind";
import { getComfySettings } from "@/lib/settings";
import { computeCloudPreflightForPanel } from "@/lib/comfy/cloudPreflight";
import PartnerNodeConfirmForm from "@/components/PartnerNodeConfirmForm";

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
    assetId: string;
    workflowId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AssetGeneratePage({ params, searchParams }: Props) {
  const { projectId, assetId, workflowId } = await params;
  const resolvedSearchParams = await searchParams;

  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);
  const wid = parseInt(workflowId, 10);

  // --- jobId / generationError from URL ---
  const rawJobId = resolvedSearchParams["jobId"];
  const jobIdParam =
    typeof rawJobId === "string" ? rawJobId
    : Array.isArray(rawJobId) ? rawJobId[0]
    : undefined;

  const rawGenerationError = resolvedSearchParams["generationError"];
  const generationError =
    typeof rawGenerationError === "string" ? rawGenerationError
    : Array.isArray(rawGenerationError) ? rawGenerationError[0]
    : undefined;

  const rawAttachedReference = resolvedSearchParams["attachedReference"];
  const attachedReference =
    rawAttachedReference === "1" ||
    (Array.isArray(rawAttachedReference) && rawAttachedReference[0] === "1");

  // --- imageNode_* / scalarNode_* from URL ---
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

  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  // --- DB fetches ---
  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();
  if (workflow.kind !== "image") notFound();

  // COMFY.PROVIDER.1 — same Cloud preflight as AssetGenerationPanel; this
  // page is a separate, standalone Asset generation surface (not the panel
  // embedded via ?generation=open) and needs the identical gate.
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
    })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, aid))
    .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id));

  // --- Derived data ---
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
  ].filter((source): source is FillSource => source !== null);

  const parsed = parseComfyWorkflow(workflow.workflowJson);

  const basePath = `/projects/${pid}/assets/${aid}/workflows/${wid}/generate`;

  // --- Dynamic Batch UI info (GEN.SEEDANCE.1) — this page previously never
  // detected or expanded Dynamic Batch at all (the same gap the shot /map
  // page had). Uses the exact same canonical helpers as AssetGenerationPanel. ---
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
          suggestedText: assetPromptText,
          availableImages,
          textOverrideByNodeId,
          selectedImageByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  const mappings = built?.ok ? built.mappings : [];
  const displayMappings = built?.ok ? built.displayMappings : mappings;

  // Same "no misleading intermediate payload" rule as the panels.
  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

  // Build available images as BatchImageGroups for DynamicBatchImageList
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
  const selectionQuery = selectionParams.toString();
  const returnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;
  const approveReturnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;

  const activeJobId =
    jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  // Fetch job server-side to decide whether to show Attach button
  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

  let activeJobOutputPath: string | null = null;
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

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets", href: `/projects/${pid}/assets` },
          { label: asset.name, href: `/projects/${pid}/assets/${aid}` },
          {
            label: "Image Workflows",
            href: `/projects/${pid}/assets/${aid}/workflows`,
          },
          { label: workflow.name },
        ]}
      />

      <PageHeader
        title="Generate Asset Image"
        badge={<AssetTypeBadge type={asset.type} />}
        meta={asset.name}
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
          </div>
        </Card>

        {/* ── Inputs ────────────────────────────────────────── */}
        <SectionLabel label="Inputs" />

        <Card title="Asset Prompt">
          {assetPromptText ? (
            <textarea
              readOnly
              value={assetPromptText}
              rows={6}
              className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none cursor-default focus:outline-none leading-relaxed"
            />
          ) : (
            <p className="text-xs text-[#b89a5a]">
              Asset prompt is empty. Add description or notes to this asset.
            </p>
          )}
          <div className="mt-3 pt-3 border-t border-[#1e2124]">
            <Link
              href={`/projects/${pid}/assets/${aid}/edit`}
              className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Edit Asset →
            </Link>
          </div>
        </Card>

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
            />
          </Card>
        )}

        {/* ── Dynamic Image Batch (GEN.SEEDANCE.1) ─────────────── */}
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
              contextType="asset"
              projectId={pid}
              workflowId={String(wid)}
              assetId={aid}
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
              contextType="asset"
              projectId={pid}
              workflowId={String(wid)}
              assetId={aid}
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
                {!cloudPreflightBlocksGeneration && (
                <PartnerNodeConfirmForm
                  action={runAssetGenerationFromForm}
                  partnerNodeConfirmMessage={partnerNodeConfirmMessage}
                  className="flex flex-col gap-4"
                >
                  <input type="hidden" name="projectId" value={String(pid)} />
                  <input type="hidden" name="assetId" value={String(aid)} />
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
                  {/* GEN.SEEDANCE.1 — previously never submitted. */}
                  {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                    <input
                      key={`text-${nodeId}`}
                      type="hidden"
                      name={`textNode_${nodeId}`}
                      value={value}
                    />
                  ))}
                  {batchDetectionOk && (
                    <DynamicBatchFormSync batchNodeId={batchNodeId} workflowId={String(wid)} />
                  )}

                  <WorkflowGenerateActions
                    initialJsonText={payloadPreview.patchedJsonText}
                    buttonLabel="Generate Asset Image"
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
            <Card>
              <div className="flex flex-col gap-4">
                {attachedReference && (
                  <div className="mb-4 rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-4 py-3">
                    <p className="text-sm text-[#6b9e72]">Reference image attached.</p>
                  </div>
                )}
                <GenerationJobStatusPanel jobId={activeJobId} />

                {canAttach && (
                  <form action={attachOutputAsAssetReference}>
                    <input type="hidden" name="projectId" value={String(pid)} />
                    <input type="hidden" name="assetId" value={String(aid)} />
                    <input type="hidden" name="jobId" value={String(activeJobId)} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={approveReturnTo}
                    />
                    <button
                      type="submit"
                      className="rounded border border-[#6b9e72]/40 text-[#6b9e72] px-3 py-1.5 text-sm hover:border-[#6b9e72]/70 hover:text-[#8fbf96] transition-colors"
                    >
                      Attach as Reference
                    </button>
                  </form>
                )}
              </div>
            </Card>
          </>
        )}

      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-6">
        <Link
          href={`/projects/${pid}/assets/${aid}/workflows`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Image Workflows
        </Link>
        <Link
          href={`/projects/${pid}/assets/${aid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Asset
        </Link>
      </div>
    </div>
  );
}
