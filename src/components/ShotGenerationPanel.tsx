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
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import CompiledShotPromptPreviewPanel from "@/components/CompiledShotPromptPreviewPanel";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import {
  buildRuntimeImageOptions,
  mapWorkflowInputs,
  type RuntimeImageOption,
  type WorkflowInputMapping,
} from "@/lib/comfy/mapWorkflowInputs";
import { patchWorkflowPayload } from "@/lib/comfy/patchWorkflowPayload";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import {
  runWorkflowGenerationFromForm,
  attachOutputAsShotReference,
} from "@/actions/generation";

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
};

function buildImageOptionLabel(img: RuntimeImageOption): string {
  return img.role ? `${img.label} · ${img.role}` : img.label;
}

function InlinePanelImageForm({
  basePath,
  imageMappings,
  selectedImageByNodeId,
  passthroughParams,
}: {
  basePath: string;
  imageMappings: WorkflowInputMapping[];
  selectedImageByNodeId: Record<string, string>;
  passthroughParams: Record<string, string>;
}) {
  if (imageMappings.length === 0) return null;
  const passthrough = Object.entries(passthroughParams).filter(
    ([k]) => !k.startsWith("imageNode_")
  );

  return (
    <form method="GET" action={basePath} className="flex flex-col gap-4">
      {passthrough.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {imageMappings.map((mapping) => {
        const nodeId = mapping.input.nodeId;
        const label = mapping.input.label || mapping.input.title || `Node ${nodeId}`;
        const selectedId = selectedImageByNodeId[nodeId] ?? "";
        const images = mapping.availableImages;
        const shotImages = images.filter((img) => img.source === "shot");
        const assetImages = images.filter((img) => img.source === "asset");

        return (
          <div key={nodeId} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#e7e9ec]">{label}</span>
              <span className="text-[10px] font-mono text-[#4b5158]">· node {nodeId}</span>
            </div>
            {images.length === 0 ? (
              <p className="text-xs text-[#4b5158]">No reference images available.</p>
            ) : (
              <select
                name={`imageNode_${nodeId}`}
                defaultValue={selectedId}
                className="w-full rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                <option value="">
                  Auto · {images[0] ? buildImageOptionLabel(images[0]) : "first available"}
                </option>
                {shotImages.length > 0 && (
                  <optgroup label="Shot References">
                    {shotImages.map((img) => (
                      <option key={img.id} value={img.id}>
                        {buildImageOptionLabel(img)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {assetImages.length > 0 && (
                  <optgroup label="Cast References">
                    {assetImages.map((img) => (
                      <option key={img.id} value={img.id}>
                        {img.assetName ? `${img.assetName} · ` : ""}
                        {buildImageOptionLabel(img)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
        );
      })}

      <button
        type="submit"
        className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
      >
        Update Preview
      </button>
    </form>
  );
}

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
}: Props) {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot) return null;

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) return null;

  const assignedRows = await db
    .select({
      assetId: assets.id,
      assetName: assets.name,
      assetType: assets.type,
    })
    .from(shotAssets)
    .innerJoin(assets, eq(shotAssets.assetId, assets.id))
    .where(eq(shotAssets.shotId, shid))
    .orderBy(asc(assets.name));

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

  const payloadPreview =
    parsed !== null
      ? patchWorkflowPayload(workflow.workflowJson, mappings, {
          selectedImageByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
        })
      : null;

  const imageMappings = mappings.filter((m) => m.mappingKind === "image");

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
  const returnTo = `${basePath}?${selectionParams.toString()}`;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
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
            href={selectorUrl}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Change
          </Link>
          <Link
            href={closeUrl}
            className="text-[#4b5158] hover:text-[#a4abb2] transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
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
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Edit Shot Prompt →
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
              />
            </div>

            {imageMappings.length > 0 && (
              <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                  Image Inputs
                </p>
                <InlinePanelImageForm
                  basePath={basePath}
                  imageMappings={imageMappings}
                  selectedImageByNodeId={selectedImageByNodeId}
                  passthroughParams={currentSearchParams}
                />
              </div>
            )}
          </>
        )}

        {/* Payload Preview */}
        {payloadPreview !== null && (
          <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Payload Preview
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
            {canAttach && (
              <form action={attachOutputAsShotReference}>
                <input type="hidden" name="projectId" value={String(pid)} />
                <input type="hidden" name="sequenceId" value={String(sid)} />
                <input type="hidden" name="shotId" value={String(shid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input
                  type="hidden"
                  name="returnTo"
                  value={`/projects/${pid}/sequences/${sid}/shots/${shid}?attachedReference=1`}
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
        )}

      </div>
    </div>
  );
}
