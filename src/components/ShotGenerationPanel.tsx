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
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { uploadShotSourceFromPanel } from "@/actions/panelUpload";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { type FillSource } from "@/lib/textInputKind";

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
  shotId,
  sequenceId,
}: {
  basePath: string;
  imageMappings: WorkflowInputMapping[];
  selectedImageByNodeId: Record<string, string>;
  passthroughParams: Record<string, string>;
  projectId: number;
  shotId: number;
  sequenceId: number;
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
  const previewFormId = "shot-panel-preview-form";

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
        let badgeLabel: string | null = null;
        if (isSuggestion && suggestedId) {
          if (suggestedId.startsWith("shot-")) badgeLabel = "Suggested from shot";
          else if (suggestedId.startsWith("asset-")) badgeLabel = "Suggested from cast";
          else badgeLabel = "Suggested";
        }

        const shotImages = images.filter((img) => img.source === "shot");
        const assetImages = images.filter((img) => img.source === "asset");
        const uploadReturnTo = buildUploadReturnTo(nodeId);

        return (
          <div key={nodeId} className="flex flex-col gap-2">
            {/* Label + badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#e7e9ec]">{displayLabel}</span>
              {badgeLabel && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2535] text-[#5b93d6] border border-[#5b93d6]/20">
                  {badgeLabel}
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
                <form action={uploadShotSourceFromPanel} className="flex items-center gap-2">
                  <input type="hidden" name="shotId" value={String(shotId)} />
                  <input type="hidden" name="sequenceId" value={String(sequenceId)} />
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
                    {shotImages.length > 0 && (
                      <optgroup label="Shot Sources">
                        {shotImages.map((img) => (
                          <option key={img.id} value={img.id}>
                            {buildImageOptionLabel(img)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {assetImages.length > 0 && (
                      <optgroup label="Cast Sources">
                        {assetImages.map((img) => (
                          <option key={img.id} value={img.id}>
                            {img.assetName ? `${img.assetName} · ` : ""}
                            {buildImageOptionLabel(img)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* Independent upload form — not nested */}
                <form action={uploadShotSourceFromPanel} className="flex items-center gap-2">
                  <input type="hidden" name="shotId" value={String(shotId)} />
                  <input type="hidden" name="sequenceId" value={String(sequenceId)} />
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
    compiledShotPrompt.text.trim()
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

  // approveReturnTo keeps the panel open with the current jobId visible
  const approveParams = new URLSearchParams(selectionParams);
  if (activeJobId !== null) {
    approveParams.set("jobId", String(activeJobId));
  }
  const approveReturnTo = `${basePath}?${approveParams.toString()}`;

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
                fillSources={fillSources}
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
                  shotId={shid}
                  sequenceId={sid}
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
          </div>
        )}

      </div>
    </div>
  );
}
