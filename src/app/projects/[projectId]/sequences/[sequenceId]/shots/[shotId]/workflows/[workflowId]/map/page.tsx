import Link from "next/link";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  comfyWorkflows,
  shotAssets,
  assets,
  motionBeats,
  promptSegments,
  shotReferenceImages,
  assetReferenceImages,
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
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import {
  buildRuntimeImageOptions,
  mapWorkflowInputs,
} from "@/lib/comfy/mapWorkflowInputs";
import { patchWorkflowPayload } from "@/lib/comfy/patchWorkflowPayload";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowImageSelectionForm from "@/components/WorkflowImageSelectionForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import { runWorkflowGenerationFromForm } from "@/actions/generation";

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
    })
    .from(shotAssets)
    .innerJoin(assets, eq(shotAssets.assetId, assets.id))
    .where(eq(shotAssets.shotId, shid))
    .orderBy(asc(assets.name));

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  // Motion beats
  const beatList = await db
    .select()
    .from(motionBeats)
    .where(eq(motionBeats.shotId, shid))
    .orderBy(asc(motionBeats.orderIndex));

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
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, assignedAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];

  // Derived data
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  const compiledPrompt = compilePromptSegments(segmentList);

  const composedShotPrompt = composeShotPrompt({
    project: { name: project.name },
    sequence: {
      title: sequence.title,
      mood: sequence.mood,
      locationHint: sequence.locationHint,
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
    })),
    motionBeats: beatList.map((b) => ({
      beatType: b.beatType,
      label: b.label,
      description: b.description,
      timingPosition: b.timingPosition,
    })),
    compiledPrompt,
    shotRefImages: shotRefImages.map((img) => ({
      imageRole: img.imageRole,
      label: img.label,
      sourceFilename: img.sourceFilename,
    })),
    castAssetRefImages: castAssetRefImages.map((img) => {
      const asset = assignedRows.find((r) => r.assetId === img.assetId);
      return {
        assetName: asset?.assetName ?? "Unknown",
        assetType: asset?.assetType ?? "other",
        imageRole: img.imageRole,
        label: img.label,
        sourceFilename: img.sourceFilename,
      };
    }),
  });

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
      ? mapWorkflowInputs(parsed.inputs, composedShotPrompt.text, availableImages)
      : [];

  const payloadPreview =
    parsed !== null
      ? patchWorkflowPayload(workflow.workflowJson, mappings, {
          selectedImageByNodeId,
        })
      : null;

  const shotLabel = shot.shotCode
    ? `${shot.shotCode} — ${shot.title}`
    : shot.title;

  const basePath = `/projects/${pid}/sequences/${sid}/shots/${shid}/workflows/${wid}/map`;

  const selectionParams = new URLSearchParams();
  for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
    selectionParams.set(`imageNode_${nodeId}`, imageId);
  }
  const selectionQuery = selectionParams.toString();
  const returnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;

  const activeJobId =
    jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

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
            label: "Workflow Input Mapping",
            href: `/projects/${pid}/sequences/${sid}/shots/${shid}/workflows`,
          },
          { label: workflow.name },
        ]}
      />

      <PageHeader
        title="Workflow Input Mapping"
        meta={shotLabel}
      />

      <div className="flex flex-col gap-4">
        {/* Workflow info */}
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

        {/* Suggested inputs */}
        <Card title="Suggested Inputs">
          {parsed === null ? (
            <p className="text-sm text-[#cf7b6b]">
              This workflow JSON could not be parsed.
            </p>
          ) : (
            <WorkflowRuntimeMappingPanel
              mappings={mappings}
              workflowKind={workflow.kind}
              timelinePromptText={compiledPrompt.text}
            />
          )}
        </Card>

        {/* Image input selection */}
        {mappings.some((m) => m.mappingKind === "image") && (
          <Card title="Image Inputs">
            <WorkflowImageSelectionForm
              basePath={basePath}
              mappings={mappings}
              selectedImageByNodeId={selectedImageByNodeId}
            />
          </Card>
        )}

        {/* Payload preview */}
        {payloadPreview !== null && (
          <Card title="Payload Preview">
            <WorkflowPayloadPreviewPanel result={payloadPreview} />
          </Card>
        )}

        {/* Generate */}
        {payloadPreview !== null && (
          <Card title="Generate">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-[#6e767d]">
                Queue this workflow in ComfyUI using the payload preview above.
              </p>

              {generationError && (
                <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
                  <p className="text-xs text-[#cf7b6b] leading-relaxed">
                    {generationError}
                  </p>
                </div>
              )}

              <form action={runWorkflowGenerationFromForm}>
                <input type="hidden" name="projectId" value={pid} />
                <input type="hidden" name="sequenceId" value={sid} />
                <input type="hidden" name="shotId" value={shid} />
                <input type="hidden" name="workflowId" value={wid} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                >
                  Generate
                </button>
              </form>

              {activeJobId !== null && (
                <div className="border-t border-[#232629] pt-4">
                  <GenerationJobStatusPanel jobId={activeJobId} />
                </div>
              )}
            </div>
          </Card>
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
