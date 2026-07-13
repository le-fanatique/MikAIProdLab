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
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { type FillSource } from "@/lib/textInputKind";

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
  });

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

  const availableImages = buildRuntimeImageOptions(
    shotRefImages,
    castAssetRefImages,
    assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
    }))
  );

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
  const selectionQuery = selectionParams.toString();
  const returnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;

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
      </div>
    </div>
  );
}
