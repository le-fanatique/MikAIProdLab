import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, comfyWorkflows, generationJobs, sequenceStoryboardImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowImageSelectionForm from "@/components/WorkflowImageSelectionForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import PartnerNodeConfirmForm from "@/components/PartnerNodeConfirmForm";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { classifyImageInputCompatibility } from "@/lib/comfy/imageInputCompatibility";
import {
  buildSequenceVideoGenerationContext,
  runSequenceVideoGenerationFromForm,
} from "@/actions/sequenceVideoGeneration";
import { saveSequenceVideoDraftFromJob } from "@/actions/sequenceVideo";
import { buildSequenceVideoPrompt } from "@/lib/prompts/buildSequenceVideoPrompt";
import { refImageUrl } from "@/lib/refImageUrl";
import { getComfySettings } from "@/lib/settings";
import { computeCloudPreflightForPanel } from "@/lib/comfy/cloudPreflight";

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">{label}</span>
    </div>
  );
}

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * SEQGEN.VIDEO.1 — Sequence-level VIDEO generate page: the twin of
 * `.../storyboard/workflows/[workflowId]/generate/page.tsx` (image). The
 * Sequence Storyboard board (`sourceStoryboardImageId`) is the mandatory
 * visual anchor, always @Image1 — never implicit, never displaced by
 * casting references. Reuses the exact same canonical pipeline
 * (buildGenerationPayload, detectDynamicBatchUiInfo, Dynamic Batch UI,
 * payload preview, job status, save-as-draft) — no second ComfyUI
 * protocol. Casting references (`storyboardRefs`) are optional and only
 * meaningful when this workflow actually supports more than one image.
 */
export default async function SequenceVideoGeneratePage({ params, searchParams }: Props) {
  const { projectId, sequenceId, workflowId } = await params;
  const resolvedSearchParams = await searchParams;

  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const wid = parseInt(workflowId, 10);

  const sp = (key: string): string | undefined => {
    const raw = resolvedSearchParams[key];
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  };

  const sourceStoryboardImageIdRaw = sp("sourceStoryboardImageId");
  const sourceStoryboardImageId = sourceStoryboardImageIdRaw ? parseInt(sourceStoryboardImageIdRaw, 10) : NaN;

  const jobIdParam = sp("jobId");
  const generationError = sp("generationError");
  const draftSaved = sp("sequenceVideoDraftSaved") === "1";
  const draftError = sp("sequenceVideoDraftError");
  const boardTargetNodeIdParam = sp("boardTargetNodeId");

  const scalarValueByNodeId: Record<string, string> = {};
  const textOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue === undefined) continue;
    if (key.startsWith("scalarNode_")) scalarValueByNodeId[key.slice("scalarNode_".length)] = strValue;
    if (key.startsWith("textNode_")) textOverrideByNodeId[key.slice("textNode_".length)] = strValue;
  }

  // Flash-only fields never re-propagated into passthrough params (same fix
  // already established on the image generate page).
  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key === "generationError" || key === "sequenceVideoDraftSaved" || key === "sequenceVideoDraftError") continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();
  if (workflow.kind !== "video") notFound();

  // COMFY.PROVIDER.1 — same Cloud preflight as ShotGenerationPanel.
  const comfySettings = await getComfySettings();
  const cloudPreflight = await computeCloudPreflightForPanel(workflow.workflowJson, comfySettings);
  const cloudPreflightBlocksGeneration =
    cloudPreflight !== null && ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0);
  const partnerNodeConfirmMessage =
    cloudPreflight !== null && !("error" in cloudPreflight) && cloudPreflight.apiNodeClasses.length > 0
      ? `This will call paid Comfy Cloud Partner Node(s): ${cloudPreflight.apiNodeClasses.join(", ")}. Continue and incur cost?`
      : null;

  if (!Number.isInteger(sourceStoryboardImageId) || sourceStoryboardImageId <= 0) notFound();
  const [board] = await db.select().from(sequenceStoryboardImages).where(eq(sequenceStoryboardImages.id, sourceStoryboardImageId));
  if (!board || board.sequenceId !== sid) notFound();

  const storyboardRefsParam = currentSearchParams["storyboardRefs"] ?? "";
  const selectedRefIds = storyboardRefsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  const batchUiInfo = parsed !== null ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const };
  const batchDetectionOk = batchUiInfo.kind === "ready";
  const batchNodeId = batchUiInfo.kind === "ready" ? batchUiInfo.batchNodeId : "";

  const imageInputNodeIds = parsed !== null ? parsed.inputs.filter((i) => i.kind === "image").map((i) => i.nodeId) : [];
  const compatibility = classifyImageInputCompatibility(imageInputNodeIds, batchDetectionOk);
  const multiImageSupported = compatibility.kind === "multi";

  const context = await buildSequenceVideoGenerationContext(pid, sid, sourceStoryboardImageId, multiImageSupported ? selectedRefIds : []);
  if (!context.ok) notFound();

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

  // SEQGEN.VIDEO.1 — the Dynamic Batch panel manages CASTING REFERENCES
  // ONLY; the board is never part of this selectable/removable list, and is
  // always prepended server-side (below) as the first sent image.
  let batchSelectedIds: string[] = [];
  if (batchDetectionOk) {
    const rawParam = currentSearchParams[`batchImages_${batchNodeId}`];
    batchSelectedIds = rawParam !== undefined ? rawParam.split(",").map((s) => s.trim()).filter(Boolean) : context.availableReferenceImages.map((img) => img.id);
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length + 1; // + board
      batchPreview.clonedNodeCount = (batchSelectedIds.length + 1) * batchPreview.templateChainTitles.length;
    }
  }

  const resolvedBatchImages: DynamicBatchExpansionImage[] = multiImageSupported
    ? [
        { id: "board", imagePath: context.boardImage.imagePath },
        ...batchSelectedIds
          .map((id) => context.availableReferenceImages.find((img) => img.id === id))
          .filter((img): img is NonNullable<typeof img> => img !== undefined)
          .map((img) => ({ id: img.id, imagePath: img.imagePath })),
      ]
    : [];

  const referenceInputsMeta = new Map(context.availableReferenceImages.map((img) => [img.id, img]));
  const orderedReferenceIds = multiImageSupported ? resolvedBatchImages.slice(1).map((img) => img.id) : [];
  const referenceInputs = orderedReferenceIds
    .map((id) => referenceInputsMeta.get(id))
    .filter((img): img is NonNullable<typeof img> => img !== undefined)
    .map((img) => ({
      refId: img.id,
      assetId: 0, // overwritten below from context metadata when available
      assetName: img.assetName ?? "Unknown",
      assetType: img.assetType ?? "",
      role: img.role,
      roleLabel: img.role,
      label: img.label,
      variantState: img.variantState ?? null,
      approvedForGeneration: img.approved ?? true,
    }));

  const promptResult = buildSequenceVideoPrompt({
    projectId: pid,
    sequenceId: sid,
    sequenceTitle: sequence.title,
    sequenceCode: sequence.sequenceCode,
    shotCount: context.shotCount,
    multiImageSupported,
    references: referenceInputs,
    packageText: context.packageText,
  });

  const basePath = `/projects/${pid}/sequences/${sid}/storyboard/video/workflows/${wid}/generate`;

  const selectedImageByNodeId: Record<string, string> = {};
  if (compatibility.kind === "mono") {
    selectedImageByNodeId[compatibility.nodeId] = "board";
  } else if (compatibility.kind === "ambiguous" && boardTargetNodeIdParam && compatibility.nodeIds.includes(boardTargetNodeIdParam)) {
    selectedImageByNodeId[boardTargetNodeIdParam] = "board";
  }

  const mappingBlocked =
    compatibility.kind === "none" ||
    (compatibility.kind === "ambiguous" && !(boardTargetNodeIdParam && compatibility.nodeIds.includes(boardTargetNodeIdParam)));

  const built =
    parsed !== null && !mappingBlocked
      ? buildGenerationPayload({
          workflowJson: workflow.workflowJson,
          inputs: parsed.inputs,
          suggestedText: promptResult.text,
          availableImages: context.availableImages,
          textOverrideByNodeId,
          selectedImageByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  const mappings = built?.ok ? built.mappings : [];
  const displayMappings = built?.ok ? built.displayMappings : mappings;
  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError) {
    batchError = { kind: "detection", message: built.error };
  }

  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetectionOk) {
    const items = context.availableReferenceImages.map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.assetName ? `${img.assetName}${img.role ? " · " + img.role : ""}` : (img.role ?? img.label),
      source: img.source,
      assetName: img.assetName,
    }));
    if (items.length > 0) batchImageGroups.push({ groupLabel: "Casting References (optional)", items });
  }

  const selectionParams = new URLSearchParams();
  selectionParams.set("sourceStoryboardImageId", String(sourceStoryboardImageId));
  for (const [nodeId, value] of Object.entries(scalarValueByNodeId)) selectionParams.set(`scalarNode_${nodeId}`, value);
  for (const [nodeId, value] of Object.entries(textOverrideByNodeId)) selectionParams.set(`textNode_${nodeId}`, value);
  if (batchDetectionOk && batchSelectedIds.length > 0) selectionParams.set(`batchImages_${batchNodeId}`, batchSelectedIds.join(","));
  if (storyboardRefsParam) selectionParams.set("storyboardRefs", storyboardRefsParam);
  if (compatibility.kind === "ambiguous" && boardTargetNodeIdParam) selectionParams.set("boardTargetNodeId", boardTargetNodeIdParam);
  const selectionQuery = selectionParams.toString();
  const returnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;

  const outputParams = new URLSearchParams(selectionParams);
  if (jobIdParam) outputParams.set("jobId", jobIdParam);
  const outputReturnTo = `${basePath}?${outputParams.toString()}`;

  const activeJobId = jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  const ATTACH_VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);
  let canSaveDraft = false;
  if (activeJobId !== null) {
    const [fetchedJob] = await db
      .select({ status: generationJobs.status, outputPath: generationJobs.outputPath, sequenceId: generationJobs.sequenceId })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));
    if (fetchedJob && fetchedJob.sequenceId === sid) {
      const outputPath = fetchedJob.outputPath ?? null;
      const ext = outputPath ? outputPath.split(".").pop()?.toLowerCase() ?? "" : "";
      canSaveDraft = fetchedJob.status === "done" && outputPath !== null && ATTACH_VIDEO_EXTS.has(`.${ext}`);
    }
  }

  const storyboardWorkspaceReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;
  const sequenceLabel = sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title;
  const workflowListLink = `/projects/${pid}/sequences/${sid}/storyboard/video/workflows?sourceStoryboardImageId=${sourceStoryboardImageId}${storyboardRefsParam ? `&storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""}`;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardWorkspaceReturnTo },
          { label: "Generate Sequence Video", href: workflowListLink },
          { label: workflow.name },
        ]}
      />

      <PageHeader title="Generate Sequence Video" meta={sequenceLabel} />

      <div className="flex flex-col gap-4">
        <Card title="Workflow">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <WorkflowKindBadge kind={workflow.kind} />
              <span className="text-sm font-medium text-[#e7e9ec]">{workflow.name}</span>
            </div>
            {workflow.description && <p className="text-xs text-[#a4abb2]">{workflow.description}</p>}
            {workflow.sourceFilename && <p className="text-xs font-mono text-[#6e767d]">{workflow.sourceFilename}</p>}
          </div>
        </Card>

        <SectionLabel label="Inputs" />

        <Card title="@Image1 — Sequence Storyboard Board (mandatory)">
          <div className="flex items-center gap-3">
            <div className="relative w-28 aspect-video bg-[#0d0e10] shrink-0 overflow-hidden rounded">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={refImageUrl(board.imagePath)} alt="" className="w-full h-full object-cover" />
            </div>
            <p className="text-xs text-[#a4abb2]">
              This board is always sent as @Image1 — the visual plan for staging, framing and Shot order. It is never
              replaced or displaced by casting references.
            </p>
          </div>

          {compatibility.kind === "none" && (
            <p className="mt-3 pt-3 border-t border-[#1e2124] text-xs text-[#cf7b6b]">
              This workflow has no compatible image input — a Sequence Video needs at least one. Choose a different
              workflow.
            </p>
          )}

          {compatibility.kind === "ambiguous" && (
            <div className="mt-3 pt-3 border-t border-[#1e2124] flex flex-col gap-2">
              <p className="text-xs text-[#b89a5a]">
                This workflow has multiple image inputs and no Dynamic Batch — choose explicitly which input receives
                the board before generating.
              </p>
              <form method="GET" action={basePath} className="flex items-end gap-2">
                <input type="hidden" name="sourceStoryboardImageId" value={String(sourceStoryboardImageId)} />
                {storyboardRefsParam && <input type="hidden" name="storyboardRefs" value={storyboardRefsParam} />}
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Board target input</span>
                  <select name="boardTargetNodeId" defaultValue={boardTargetNodeIdParam ?? ""} className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1">
                    <option value="">— Choose —</option>
                    {compatibility.nodeIds.map((nodeId) => {
                      const inputMeta = parsed?.inputs.find((i) => i.nodeId === nodeId);
                      return (
                        <option key={nodeId} value={nodeId}>
                          {inputMeta?.label ?? nodeId}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <button type="submit" className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors">
                  Set
                </button>
              </form>
            </div>
          )}

          {promptResult.warnings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#1e2124] flex flex-col gap-0.5">
              {promptResult.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-[#cda24f]">⚠ {w}</p>
              ))}
            </div>
          )}
        </Card>

        {multiImageSupported && (
          <Card title="Casting References (@Image2+, optional)">
            {promptResult.imageMappings.length <= 1 ? (
              <p className="text-xs text-[#6e767d]">
                No casting references added. Optional — select some in Storyboard Assets, or add them to the Dynamic
                Image Batch below.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {promptResult.imageMappings
                  .filter((m) => m.kind === "reference")
                  .map((m) => {
                    const img = context.availableReferenceImages.find((i) => i.id === m.refId);
                    return (
                      <div key={m.refId} className="flex flex-col gap-1 rounded border border-[#232629] p-1.5">
                        {img && (
                          <div className="relative aspect-square w-full bg-[#0d0e10] overflow-hidden rounded">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={refImageUrl(img.imagePath)} alt={m.assetName} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="text-[10px] font-mono text-[#5b93d6]">{m.imageLabel}</span>
                        <span className="text-xs text-[#a4abb2] truncate">{m.assetName}</span>
                      </div>
                    );
                  })}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-[#1e2124]">
              <Link href={`${storyboardWorkspaceReturnTo}&storyboardRefs=${encodeURIComponent(storyboardRefsParam)}`} className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
                Edit Selection in Storyboard Assets →
              </Link>
            </div>
          </Card>
        )}

        {!multiImageSupported && selectedRefIds.length > 0 && (
          <div className="rounded border border-[#5c4a24]/60 bg-[#141008] px-3 py-2.5">
            <p className="text-xs text-[#b89a5a]">
              This workflow accepts a single image — {selectedRefIds.length} selected casting reference
              {selectedRefIds.length !== 1 ? "s are" : " is"} not sent. Only the Sequence Storyboard board is used.
            </p>
          </div>
        )}

        <Card title="Suggested Inputs">
          {parsed === null ? (
            <p className="text-sm text-[#cf7b6b]">This workflow JSON could not be parsed.</p>
          ) : (
            <WorkflowRuntimeMappingPanel
              mappings={mappings}
              scalarValueByNodeId={scalarValueByNodeId}
              textOverrideByNodeId={textOverrideByNodeId}
              currentSearchParams={currentSearchParams}
              basePath={basePath}
            />
          )}
        </Card>

        {displayMappings.some((m) => m.mappingKind === "image") && compatibility.kind === "ambiguous" && (
          <Card title="Image Inputs">
            <WorkflowImageSelectionForm basePath={basePath} mappings={displayMappings} selectedImageByNodeId={selectedImageByNodeId} preserveParams={{ sourceStoryboardImageId: String(sourceStoryboardImageId) }} />
          </Card>
        )}

        {batchDetectionOk && (
          <Card title="Dynamic Image Batch (casting references only — board always sent separately as @Image1)">
            <DynamicBatchImageList
              batchNodeId={batchNodeId}
              preview={batchPreview}
              error={batchError}
              availableImages={batchImageGroups}
              selectedImageIds={batchSelectedIds}
              passthroughParams={currentSearchParams}
              basePath={basePath}
              contextType="sequence"
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

        {payloadPreview !== null && (
          <>
            <SectionLabel label="Preview" />
            <Card title="Payload Preview">
              <WorkflowPayloadPreviewPanel result={payloadPreview} />
            </Card>
          </>
        )}

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
                  action={runSequenceVideoGenerationFromForm}
                  partnerNodeConfirmMessage={partnerNodeConfirmMessage}
                  className="flex flex-col gap-4"
                >
                  <input type="hidden" name="projectId" value={String(pid)} />
                  <input type="hidden" name="sequenceId" value={String(sid)} />
                  <input type="hidden" name="workflowId" value={String(wid)} />
                  <input type="hidden" name="sourceStoryboardImageId" value={String(sourceStoryboardImageId)} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="storyboardRefs" value={storyboardRefsParam} />
                  {compatibility.kind === "ambiguous" && boardTargetNodeIdParam && (
                    <input type="hidden" name="boardTargetNodeId" value={boardTargetNodeIdParam} />
                  )}
                  {Object.entries(scalarValueByNodeId).map(([nodeId, value]) => (
                    <input key={`scalar-${nodeId}`} type="hidden" name={`scalarNode_${nodeId}`} value={value} />
                  ))}
                  {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                    <input key={`text-${nodeId}`} type="hidden" name={`textNode_${nodeId}`} value={value} />
                  ))}
                  {batchDetectionOk && (
                    <DynamicBatchFormSync batchNodeId={batchNodeId} workflowId={String(wid)} initialValue={batchSelectedIds.join(",")} />
                  )}
                  {/* COMFY.PROVIDER.1 — confirmPartnerNodeCost is deliberately
                      NOT rendered here: PartnerNodeConfirmForm sets it itself,
                      only on the confirmed submit path. */}

                  <WorkflowGenerateActions
                    initialJsonText={payloadPreview.patchedJsonText}
                    buttonLabel="Generate Sequence Video"
                  />
                </PartnerNodeConfirmForm>
                )}
              </div>
            </Card>
          </>
        )}

        {activeJobId !== null && (
          <>
            <SectionLabel label="Output" />
            <Card>
              <div className="flex flex-col gap-4">
                <GenerationJobStatusPanel jobId={activeJobId} />

                {draftError && <p className="text-xs text-[#cf7b6b]">{draftError}</p>}
                {draftSaved ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-[#6b9e72]">Saved as Sequence Video draft.</p>
                    <Link href={storyboardWorkspaceReturnTo} className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
                      ← Back to Storyboard Workspace
                    </Link>
                  </div>
                ) : canSaveDraft ? (
                  <form action={saveSequenceVideoDraftFromJob}>
                    <input type="hidden" name="sequenceId" value={String(sid)} />
                    <input type="hidden" name="jobId" value={String(activeJobId)} />
                    <input type="hidden" name="returnTo" value={outputReturnTo} />
                    <button type="submit" className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors">
                      Save as Sequence Video Draft
                    </button>
                  </form>
                ) : null}
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-6">
        <Link href={workflowListLink} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Workflows
        </Link>
        <Link href={storyboardWorkspaceReturnTo} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}
