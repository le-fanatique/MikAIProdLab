import Link from "next/link";
import { db } from "@/db";
import { assets, comfyWorkflows, assetReferenceImages, generationJobs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import {
  getRuntimeImageLabel,
  mapWorkflowInputs,
  type RuntimeImageOption,
  type WorkflowInputMapping,
} from "@/lib/comfy/mapWorkflowInputs";
import { patchWorkflowPayload } from "@/lib/comfy/patchWorkflowPayload";
import { runAssetGenerationFromForm, attachOutputAsAssetReference } from "@/actions/generation";
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { uploadAssetSourceFromPanel } from "@/actions/panelUpload";

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
};

function buildImageOptionLabel(img: RuntimeImageOption): string {
  return img.role ? `${img.label} · ${img.role}` : img.label;
}

function InlinePanelImageForm({
  basePath,
  imageMappings,
  selectedImageByNodeId,
  passthroughParams,
  projectId,
  assetId,
}: {
  basePath: string;
  imageMappings: WorkflowInputMapping[];
  selectedImageByNodeId: Record<string, string>;
  passthroughParams: Record<string, string>;
  projectId: number;
  assetId: number;
}) {
  if (imageMappings.length === 0) return null;

  // Passthrough for GET preview form: exclude imageNode_* (select fields supply them) and jobId
  const passthrough = Object.entries(passthroughParams).filter(
    ([k]) => !k.startsWith("imageNode_") && k !== "jobId"
  );

  // Deduplicate labels
  const labelCount: Record<string, number> = {};
  for (const m of imageMappings) {
    const l = m.input.label || m.input.title || "Load Image";
    labelCount[l] = (labelCount[l] ?? 0) + 1;
  }
  const labelIndex: Record<string, number> = {};

  // returnTo for upload actions: preserve all params except jobId and the node being uploaded
  function buildUploadReturnTo(nodeId: string): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (k !== "jobId" && k !== `imageNode_${nodeId}`) {
        params.set(k, v);
      }
    }
    return `${basePath}?${params.toString()}`;
  }

  // Stable form ID — one panel per page, no collision risk
  const previewFormId = "asset-panel-preview-form";

  return (
    <div className="flex flex-col gap-5">
      {/* Standalone GET form — hidden inputs only, no visible UI.
          Selects and the submit button are linked via form={previewFormId}. */}
      <form id={previewFormId} method="GET" action={basePath}>
        {passthrough.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      </form>

      {imageMappings.map((mapping) => {
        const nodeId = mapping.input.nodeId;
        const rawLabel = mapping.input.label || mapping.input.title || "Load Image";
        const isDup = labelCount[rawLabel] > 1;
        labelIndex[rawLabel] = (labelIndex[rawLabel] ?? 0) + 1;
        const displayLabel = isDup ? `${rawLabel} ${labelIndex[rawLabel]}` : rawLabel;

        const images = mapping.availableImages;
        const selectedId = selectedImageByNodeId[nodeId] ?? "";
        const suggestedId = suggestImageForNode(rawLabel, images);
        const effectiveId = selectedId !== "" ? selectedId : (suggestedId ?? "");
        const effectiveImage = effectiveId !== "" ? images.find((img) => img.id === effectiveId) ?? null : null;

        const isSuggestion = selectedId === "" && suggestedId !== null;
        const uploadReturnTo = buildUploadReturnTo(nodeId);

        return (
          <div key={nodeId} className="flex flex-col gap-2">
            {/* Label + badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#e7e9ec]">{displayLabel}</span>
              {isSuggestion && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2535] text-[#5b93d6] border border-[#5b93d6]/20">
                  Suggested
                </span>
              )}
              {isDup && (
                <span className="text-[10px] font-mono text-[#3a4046]">node {nodeId}</span>
              )}
            </div>

            {images.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[#4b5158]">No sources available.</p>
                {/* Independent upload form — not nested */}
                <form action={uploadAssetSourceFromPanel} className="flex items-center gap-2">
                  <input type="hidden" name="assetId" value={String(assetId)} />
                  <input type="hidden" name="projectId" value={String(projectId)} />
                  <input type="hidden" name="nodeId" value={nodeId} />
                  <input type="hidden" name="returnTo" value={uploadReturnTo} />
                  <input
                    type="file"
                    name="imageFile"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                    className="flex-1 min-w-0 text-xs text-[#6e767d] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#1a1d20] file:px-2 file:py-1 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                  >
                    Upload Source
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Thumbnail + select row */}
                <div className="flex items-center gap-2">
                  {effectiveImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/${effectiveImage.imagePath}`}
                      alt={effectiveImage.label}
                      className="w-10 h-10 object-cover rounded border border-[#232629] shrink-0 bg-[#1a1d20]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded border border-[#232629] bg-[#1a1d20] shrink-0 flex items-center justify-center">
                      <span className="text-[10px] text-[#3a4046]">—</span>
                    </div>
                  )}
                  {/* form attribute links this select to the preview form above */}
                  <select
                    name={`imageNode_${nodeId}`}
                    defaultValue={effectiveId}
                    form={previewFormId}
                    className="flex-1 min-w-0 rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                  >
                    <option value="">
                      Auto · {images[0] ? buildImageOptionLabel(images[0]) : "first available"}
                    </option>
                    {images.map((img) => (
                      <option key={img.id} value={img.id}>
                        {buildImageOptionLabel(img)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Independent upload form — not nested */}
                <form action={uploadAssetSourceFromPanel} className="flex items-center gap-2">
                  <input type="hidden" name="assetId" value={String(assetId)} />
                  <input type="hidden" name="projectId" value={String(projectId)} />
                  <input type="hidden" name="nodeId" value={nodeId} />
                  <input type="hidden" name="returnTo" value={uploadReturnTo} />
                  <input
                    type="file"
                    name="imageFile"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                    className="flex-1 min-w-0 text-xs text-[#6e767d] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#1a1d20] file:px-2 file:py-1 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                  >
                    Upload Source
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}

      {/* Submit button linked to the preview form via form attribute */}
      <button
        type="submit"
        form={previewFormId}
        className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
      >
        Update Preview
      </button>
    </div>
  );
}

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

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  const mappings =
    parsed !== null
      ? mapWorkflowInputs(parsed.inputs, assetPromptText, availableImages, textOverrideByNodeId)
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
            href={`/projects/${pid}/assets/${aid}/workflows/${wid}/generate`}
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

        {/* Asset Prompt — compact link */}
        {assetPromptText ? (
          <p className="text-xs text-[#4b5158]">
            Asset prompt set.{" "}
            <Link
              href={`/projects/${pid}/assets/${aid}/edit`}
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
                href={`/projects/${pid}/assets/${aid}/edit`}
                className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                Edit Asset →
              </Link>
            </p>
          </div>
        )}

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
                  Image Sources
                </p>
                <InlinePanelImageForm
                  basePath={basePath}
                  imageMappings={imageMappings}
                  selectedImageByNodeId={selectedImageByNodeId}
                  passthroughParams={currentSearchParams}
                  projectId={pid}
                  assetId={aid}
                />
              </div>
            )}
          </>
        )}

        {/* Preview */}
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
              <WorkflowGenerateActions
                initialJsonText={payloadPreview.patchedJsonText}
                buttonLabel="Generate Image"
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
              <form action={attachOutputAsAssetReference}>
                <input type="hidden" name="projectId" value={String(pid)} />
                <input type="hidden" name="assetId" value={String(aid)} />
                <input type="hidden" name="jobId" value={String(activeJobId)} />
                <input
                  type="hidden"
                  name="returnTo"
                  value={`/projects/${pid}/assets/${aid}?attachedReference=1`}
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
        )}

      </div>
    </div>
  );
}
