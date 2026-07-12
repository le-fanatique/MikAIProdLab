import { db } from "@/db";
import { refImageUrl } from "@/lib/refImageUrl";
import { projects, sequences, shots, assets, shotAssets, promptSegments, shotReferenceImages, assetReferenceImages, comfyWorkflows, generationJobs } from "@/db/schema";
import { eq, and, notInArray, inArray, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import CastingPanel from "@/components/CastingPanel";
import PromptSegmentsPanel from "@/components/PromptSegmentsPanel";
import ReferenceImagesPanel from "@/components/ReferenceImagesPanel";
import CompiledPromptPanel from "@/components/CompiledPromptPanel";
import PromptComposerPanel from "@/components/PromptComposerPanel";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import GenerationJobsPanel from "@/components/GenerationJobsPanel";
import ShotPromptForm from "@/components/ShotPromptForm";
import PromptSegmentsTimelineEditor from "@/components/PromptSegmentsTimelineEditor";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { buildDefaultShotPromptProposal } from "@/lib/prompts/defaultShotPrompt";
import { assignAssetToShot, removeAssetFromShot } from "@/actions/shotAssets";
import { deleteShotReferenceImage } from "@/actions/shotReferenceImages";
import {
  deletePromptSegment,
  movePromptSegmentUp,
  movePromptSegmentDown,
  updateSegmentPromptText,
} from "@/actions/promptSegments";
import WorkflowSelectorPanel from "@/components/WorkflowSelectorPanel";
import ShotGenerationPanel from "@/components/ShotGenerationPanel";
import GenerationPanelShell from "@/components/GenerationPanelShell";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";
import VideoFrameReviewPlayer, { type CaptureDestination } from "@/components/VideoFrameReviewPlayer";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-1">
        {label}
      </div>
      <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export default async function ShotDetailPage({ params, searchParams }: Props) {
  const { projectId, sequenceId, shotId } = await params;
  const resolvedSearchParams = await searchParams;

  function sp(key: string): string | undefined {
    const v = resolvedSearchParams[key];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  }

  const attachError = sp("attachError");
  const attachedReference = sp("attachedReference");
  const approvedVideo = sp("approvedVideo");
  const approveError = sp("approveError");
  const retryError = sp("retryError");
  const deleteError = sp("deleteError");
  const deleteSuccess = sp("deleteSuccess");
  const shotPromptSaved = sp("shotPromptSaved");
  const shotPromptError = sp("shotPromptError");

  const rawGeneration = resolvedSearchParams["generation"];
  const generationOpen =
    rawGeneration === "open" || (Array.isArray(rawGeneration) && rawGeneration[0] === "open");

  const rawWorkflowId = resolvedSearchParams["workflowId"];
  const selectedWorkflowId =
    typeof rawWorkflowId === "string"
      ? parseInt(rawWorkflowId, 10)
      : Array.isArray(rawWorkflowId)
      ? parseInt(rawWorkflowId[0], 10)
      : null;

  const forceSelector = sp("selector") === "1";

  const selectedImageByNodeId: Record<string, string> = {};
  const scalarValueByNodeId: Record<string, string> = {};
  const textOverrideByNodeId: Record<string, string> = {};

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (!strValue) continue;
    if (key.startsWith("imageNode_")) selectedImageByNodeId[key.slice("imageNode_".length)] = strValue;
    else if (key.startsWith("scalarNode_")) scalarValueByNodeId[key.slice("scalarNode_".length)] = strValue;
    else if (key.startsWith("textNode_")) textOverrideByNodeId[key.slice("textNode_".length)] = strValue;
  }

  const rawJobId = resolvedSearchParams["jobId"];
  const jobIdParam = typeof rawJobId === "string" ? rawJobId : Array.isArray(rawJobId) ? rawJobId[0] : undefined;
  const activeJobId = jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  const rawGenerationError = resolvedSearchParams["generationError"];
  const generationError =
    typeof rawGenerationError === "string"
      ? rawGenerationError
      : Array.isArray(rawGenerationError)
      ? rawGenerationError[0]
      : undefined;

  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  const assignedRows = await db
    .select({
      assignmentId: shotAssets.id,
      assetId: assets.id,
      assetName: assets.name,
      assetType: assets.type,
      assetDescription: assets.description,
      assetNotes: assets.notes,
    })
    .from(shotAssets)
    .innerJoin(assets, eq(shotAssets.assetId, assets.id))
    .where(eq(shotAssets.shotId, shid));

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  const availableAssets =
    assignedAssetIds.length > 0
      ? await db
          .select({ id: assets.id, name: assets.name, type: assets.type })
          .from(assets)
          .where(and(eq(assets.projectId, pid), notInArray(assets.id, assignedAssetIds)))
          .orderBy(asc(assets.orderIndex))
      : await db
          .select({ id: assets.id, name: assets.name, type: assets.type })
          .from(assets)
          .where(eq(assets.projectId, pid))
          .orderBy(asc(assets.orderIndex));

  const segmentList = await db
    .select()
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shid))
    .orderBy(asc(promptSegments.orderIndex));

  const segmentRows = segmentList.map((seg, idx) => ({
    id: seg.id,
    label: seg.label,
    promptText: seg.promptText,
    startSeconds: seg.startSeconds,
    durationSeconds: seg.durationSeconds,
    updatePromptTextAction: updateSegmentPromptText.bind(null, seg.id, shid, sid, pid),
    editHref: `/projects/${pid}/sequences/${sid}/shots/${shid}/segments/${seg.id}/edit`,
    deleteAction: deletePromptSegment.bind(null, seg.id, shid, sid, pid),
    moveUpAction:
      idx === 0 ? null : movePromptSegmentUp.bind(null, seg.id, shid, sid, pid),
    moveDownAction:
      idx === segmentList.length - 1
        ? null
        : movePromptSegmentDown.bind(null, seg.id, shid, sid, pid),
  }));

  const compiledPrompt = compilePromptSegments(segmentList);

  const castAssetRefImageRows =
    assignedAssetIds.length > 0
      ? await db
          .select({
            assetId: assetReferenceImages.assetId,
            imageRole: assetReferenceImages.imageRole,
            label: assetReferenceImages.label,
            sourceFilename: assetReferenceImages.sourceFilename,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, assignedAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex))
      : [];

  const refImages = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shid))
    .orderBy(asc(shotReferenceImages.orderIndex));

  // Resolve effective workflow — apply default if no explicit selection and no forced selector
  let effectiveWorkflowId: number | null = selectedWorkflowId;
  if (generationOpen && !selectedWorkflowId && !forceSelector) {
    const defaults = await getWorkflowDefaults();
    const candidates: Array<{ id: number | null; kind: "image" | "video" }> = [
      { id: defaults.shotImageId, kind: "image" },
      { id: defaults.shotVideoId, kind: "video" },
    ];
    for (const candidate of candidates) {
      if (candidate.id === null) continue;
      const [wf] = await db
        .select({ id: comfyWorkflows.id })
        .from(comfyWorkflows)
        .where(and(eq(comfyWorkflows.id, candidate.id), eq(comfyWorkflows.kind, candidate.kind)));
      if (wf) {
        effectiveWorkflowId = wf.id;
        break;
      }
    }
  }

  // Only load workflow list when the selector needs to be shown
  const savedWorkflows =
    generationOpen && !effectiveWorkflowId
      ? await db
          .select({
            id: comfyWorkflows.id,
            name: comfyWorkflows.name,
            kind: comfyWorkflows.kind,
            description: comfyWorkflows.description,
            updatedAt: comfyWorkflows.updatedAt,
          })
          .from(comfyWorkflows)
          .orderBy(desc(comfyWorkflows.updatedAt))
      : [];

  const generationJobRows = await db
    .select({
      id: generationJobs.id,
      status: generationJobs.status,
      workflowId: generationJobs.workflowId,
      outputPath: generationJobs.outputPath,
      errorMessage: generationJobs.errorMessage,
      startedAt: generationJobs.startedAt,
      completedAt: generationJobs.completedAt,
      createdAt: generationJobs.createdAt,
      updatedAt: generationJobs.updatedAt,
      workflowName: comfyWorkflows.name,
      workflowKind: comfyWorkflows.kind,
    })
    .from(generationJobs)
    .leftJoin(comfyWorkflows, eq(generationJobs.workflowId, comfyWorkflows.id))
    .where(eq(generationJobs.shotId, shid))
    .orderBy(desc(generationJobs.createdAt))
    .limit(24);

  const assignAction = assignAssetToShot.bind(null, shid, sid, pid);

  const assignedItems = assignedRows.map((row) => ({
    assignmentId: row.assignmentId,
    assetId: row.assetId,
    assetName: row.assetName,
    assetType: row.assetType,
    assetDescription: row.assetDescription ?? null,
    removeAction: removeAssetFromShot.bind(null, row.assignmentId, shid, sid, pid),
  }));

  const composedShotPrompt = composeShotPrompt({
    project: {
      name: project.name,
      pitch: project.pitch,
    },
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
    shotRefImages: refImages.map((img) => ({
      imageRole: img.imageRole,
      label: img.label,
      sourceFilename: img.sourceFilename,
    })),
    castAssetRefImages: castAssetRefImageRows.map((img) => {
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

  const defaultPromptProposal = buildDefaultShotPromptProposal({
    description: shot.description,
    actionPitch: shot.actionPitch,
    cameraPitch: shot.cameraPitch,
  });

  const composerIngredients: string[] = [];
  if (assignedRows.length > 0) {
    composerIngredients.push(`Cast: ${assignedRows.map((row) => row.assetName).join(", ")}`);
  }
  if (sequence.locationHint) {
    composerIngredients.push(`Location: ${sequence.locationHint}`);
  }
  if (sequence.mood) {
    composerIngredients.push(`Mood: ${sequence.mood}`);
  }
  if (shot.description) {
    composerIngredients.push(
      `Description: ${shot.description.slice(0, 60)}${shot.description.length > 60 ? "…" : ""}`
    );
  }
  if (shot.actionPitch) {
    composerIngredients.push(
      `Action: ${shot.actionPitch.slice(0, 60)}${shot.actionPitch.length > 60 ? "…" : ""}`
    );
  }
  if (shot.cameraPitch) {
    composerIngredients.push(
      `Camera: ${shot.cameraPitch.slice(0, 60)}${shot.cameraPitch.length > 60 ? "…" : ""}`
    );
  }
  if (shot.framing) {
    composerIngredients.push(`Framing: ${shot.framing}`);
  }
  if (shot.cameraMovement) {
    composerIngredients.push(`Movement: ${shot.cameraMovement}`);
  }

  const hasNarrativeContext = Boolean(
    sequence.summary || sequence.narrativePurpose || sequence.mood || sequence.locationHint ||
    shot.description || shot.actionPitch || shot.cameraPitch
  );
  const hasContinuity = Boolean(shot.continuityIn || shot.continuityOut || shot.continuityNotes);
  const hasCamera = Boolean(shot.framing || shot.cameraMovement);

  // ── Capture destinations ────────────────────────────────────────────────────
  const approvedVideoExt = shot.approvedVideoPath?.split(".").pop()?.toLowerCase() ?? "";
  const approvedVideoIsPlayable =
    shot.approvedVideoPath !== null &&
    ["mp4", "webm", "mov"].includes(approvedVideoExt);

  let captureDestinations: CaptureDestination[] = [];

  if (approvedVideoIsPlayable) {
    const allProjectSequences = await db
      .select({ id: sequences.id, title: sequences.title })
      .from(sequences)
      .where(eq(sequences.projectId, pid))
      .orderBy(asc(sequences.id));

    const allSequenceIds = allProjectSequences.map((s) => s.id);

    const allProjectShots = allSequenceIds.length > 0
      ? await db
          .select({
            id: shots.id,
            sequenceId: shots.sequenceId,
            title: shots.title,
            description: shots.description,
          })
          .from(shots)
          .where(inArray(shots.sequenceId, allSequenceIds))
          .orderBy(asc(shots.orderIndex))
      : [];

    const allProjectAssets = await db
      .select({ id: assets.id, name: assets.name, type: assets.type })
      .from(assets)
      .where(eq(assets.projectId, pid))
      .orderBy(asc(assets.type), asc(assets.name));

    // Current shot first
    captureDestinations.push({
      id: `shot:${shid}`,
      type: "shot",
      shotId: shid,
      sequenceId: sid,
      label: shot.title,
      subtitle: "Current shot",
      groupLabel: "Current Shot",
      isCurrent: true,
    });

    // Other shots, grouped by sequence order
    for (const seq of allProjectSequences) {
      for (const s of allProjectShots.filter(
        (sh) => sh.sequenceId === seq.id && sh.id !== shid
      )) {
        captureDestinations.push({
          id: `shot:${s.id}`,
          type: "shot",
          shotId: s.id,
          sequenceId: seq.id,
          label: `${seq.title} / ${s.title}`,
          subtitle: s.description?.slice(0, 80) ?? undefined,
          groupLabel: "Other Shots",
        });
      }
    }

    // Assets
    for (const asset of allProjectAssets) {
      captureDestinations.push({
        id: `asset:${asset.id}`,
        type: "asset",
        assetId: asset.id,
        label: asset.name,
        subtitle: asset.type,
        groupLabel: "Assets",
      });
    }
  }

  const detailBaseUrl = `/projects/${pid}/sequences/${sid}/shots/${shid}`;
  const closeUrl = detailBaseUrl;
  const openPanelUrl = `${detailBaseUrl}?generation=open`;
  const changePanelUrl = `${detailBaseUrl}?generation=open&selector=1`;

  return (
    <div className={generationOpen ? "flex gap-0 items-start" : ""}>
      <div className={generationOpen ? "flex-1 min-w-0 pr-6" : ""}>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: shot.shotCode ?? shot.title },
        ]}
      />

      <PageHeader
        title={
          shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title
        }
        meta={
          shot.durationSeconds != null ? `${shot.durationSeconds}s` : undefined
        }
        actions={
          <>
            <Link
              href={openPanelUrl}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Generate Content
            </Link>
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/${shid}/edit`}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Edit Shot
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">

        {/* ── Approved Output ───────────────────────────────────────── */}
        {shot.approvedVideoPath && (
          <Card title="Approved Output">
            <div className="flex flex-col gap-3">
              {approvedVideoIsPlayable ? (
                <VideoFrameReviewPlayer
                  src={refImageUrl(shot.approvedVideoPath)}
                  projectId={pid}
                  sequenceId={sid}
                  shotId={shid}
                  defaultFps={24}
                  captureDestinations={captureDestinations}
                />
              ) : (
                <video
                  src={refImageUrl(shot.approvedVideoPath)}
                  controls
                  className="w-full rounded border border-[#2c3035]"
                />
              )}
              <div className="flex items-center gap-4">
                <a
                  href={refImageUrl(shot.approvedVideoPath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  Open ↗
                </a>
                <a
                  href={refImageUrl(shot.approvedVideoPath)}
                  download
                  className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  Download ↓
                </a>
              </div>
            </div>
          </Card>
        )}

        {/* ── Narrative Context ─────────────────────────────────────── */}
        {hasNarrativeContext && (
          <Card title="Narrative Context">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Link
                  href={`/projects/${pid}/sequences/${sid}`}
                  className="text-xs font-medium text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  ↑ {sequence.title}
                </Link>
                {sequence.summary && (
                  <p className="text-sm text-[#a4abb2] leading-relaxed">{sequence.summary}</p>
                )}
                {(sequence.narrativePurpose || sequence.mood || sequence.locationHint) && (
                  <div className="flex flex-wrap gap-4 text-xs">
                    {sequence.narrativePurpose && (
                      <span>
                        <span className="text-[#4b5158]">Purpose </span>
                        <span className="text-[#6e767d]">{sequence.narrativePurpose}</span>
                      </span>
                    )}
                    {sequence.mood && (
                      <span>
                        <span className="text-[#4b5158]">Mood </span>
                        <span className="text-[#6e767d]">{sequence.mood}</span>
                      </span>
                    )}
                    {sequence.locationHint && (
                      <span>
                        <span className="text-[#4b5158]">Location </span>
                        <span className="text-[#6e767d]">{sequence.locationHint}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              {(shot.description || shot.actionPitch || shot.cameraPitch) && (
                <>
                  <div className="border-t border-[#1a1d20]" />
                  {shot.description && (
                    <Field label="Description" value={shot.description} />
                  )}
                  {shot.actionPitch && (
                    <Field label="Action Pitch" value={shot.actionPitch} />
                  )}
                  {shot.cameraPitch && (
                    <Field label="Camera Pitch" value={shot.cameraPitch} />
                  )}
                </>
              )}
            </div>
          </Card>
        )}

        {/* ── Continuity ────────────────────────────────────────────── */}
        {hasContinuity && (
          <Card title="Continuity">
            <div className="flex flex-col gap-4">
              {shot.continuityIn && (
                <Field label="Continuity In" value={shot.continuityIn} />
              )}
              {shot.continuityOut && (
                <Field label="Continuity Out" value={shot.continuityOut} />
              )}
              {shot.continuityNotes && (
                <Field label="Continuity Notes" value={shot.continuityNotes} />
              )}
            </div>
          </Card>
        )}

        {/* ── Camera ────────────────────────────────────────────────── */}
        {hasCamera && (
          <Card title="Camera">
            <div className="flex flex-col gap-4">
              {shot.framing && (
                <Field label="Framing" value={shot.framing} />
              )}
              {shot.cameraMovement && (
                <Field label="Camera Movement" value={shot.cameraMovement} />
              )}
            </div>
          </Card>
        )}

        {!hasNarrativeContext && !hasContinuity && !hasCamera && (
          <p className="text-sm text-[#6e767d]">
            No details recorded yet.{" "}
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/${shid}/edit`}
              className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Edit this shot
            </Link>{" "}
            to add them.
          </p>
        )}

        {/* ── Casting ───────────────────────────────────────────────── */}
        <SectionLabel label="Casting" />

        <Card title="Casting">
          <CastingPanel
            assignedItems={assignedItems}
            availableAssets={availableAssets}
            projectId={pid}
            assignAction={assignAction}
          />
          <p className="text-xs text-[#4b5158] mt-3">
            Cast assets and their reference images contribute to the Shot Prompt composition and generation.
          </p>
        </Card>

        {/* ── Prompt Workspace ──────────────────────────────────────── */}
        <SectionLabel label="Prompt Workspace" />

        <p className="mb-4 text-xs leading-relaxed text-[#4b5158]">
          Draft from context via Prompt Composer → save as Shot Prompt → optionally build a timed Prompt Timeline for video workflows.
        </p>

        <Card title="Prompt Composer">
          <PromptComposerPanel
            composed={composedShotPrompt}
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            returnTo={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
            hasExistingShotPrompt={Boolean(shot.shotPrompt?.trim())}
            segmentCount={segmentList.length}
            ingredients={composerIngredients}
          />
        </Card>

        <Card title="Shot Prompt">
          <ShotPromptForm
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            initialShotPrompt={shot.shotPrompt ?? null}
            returnTo={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
            saved={shotPromptSaved === "1"}
            error={shotPromptError ?? null}
            defaultPromptProposal={defaultPromptProposal || null}
          />
        </Card>

        <Card title="Prompt Timeline">
          <p className="mb-3 text-xs text-[#4b5158]">
            Prompt segments are used in video workflows only. For image generation, the Shot Prompt is used directly.
          </p>
          <PromptSegmentsPanel
            segments={segmentRows}
            addHref={`/projects/${pid}/sequences/${sid}/shots/${shid}/segments/new`}
          />
          <PromptSegmentsTimelineEditor
            segments={segmentList}
            shotDurationSeconds={shot.durationSeconds}
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
          />
        </Card>

        {segmentList.length > 0 && (
          <Card title="Segment Timeline Preview">
            <p className="text-xs text-[#4b5158] mb-3">
              Preview of how your timed segments compile into the timeline text used by video workflows.
            </p>
            <CompiledPromptPanel compiled={compiledPrompt} />
          </Card>
        )}

        {/* ── References ────────────────────────────────────────────── */}
        <SectionLabel label="References" />

        <Card title="Reference Images">
          <ReferenceImagesPanel
            images={refImages}
            addHref={`/projects/${pid}/sequences/${sid}/shots/${shid}/reference-images/new`}
            getEditHref={(imageId) =>
              `/projects/${pid}/sequences/${sid}/shots/${shid}/reference-images/${imageId}/edit`
            }
            getDeleteAction={(imageId) =>
              deleteShotReferenceImage.bind(null, imageId, shid, sid, pid)
            }
          />
        </Card>

        {/* ── Generation ────────────────────────────────────────────── */}
        <SectionLabel label="Generation" />
        {generationOpen ? (
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows`}
            className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Open full workflow page ↗
          </Link>
        ) : (
          <div className="flex items-center gap-4">
            <Link
              href={openPanelUrl}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Generate Content
            </Link>
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows`}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Open full workflow page ↗
            </Link>
          </div>
        )}

        <Card title="Generation Jobs">
          <GenerationJobsPanel
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            jobs={generationJobRows}
            retryError={retryError ?? null}
            deleteError={deleteError ?? null}
            deleteSuccess={deleteSuccess ?? null}
          />
        </Card>

      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link
          href={`/projects/${pid}/sequences/${sid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to {sequence.title}
        </Link>
        <Link
          href={`/projects/${pid}/story`}
          className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
        >
          ↑ Story Workspace
        </Link>
      </div>
      </div>

      {/* ── Generation Panel ──────────────────────────────────── */}
      {generationOpen && (
        <GenerationPanelShell scrollKey={`shot-${shid}`}>
          {effectiveWorkflowId ? (
            <ShotGenerationPanel
              projectId={pid}
              sequenceId={sid}
              shotId={shid}
              workflowId={effectiveWorkflowId}
              closeUrl={closeUrl}
              selectorUrl={changePanelUrl}
              basePath={detailBaseUrl}
              currentSearchParams={currentSearchParams}
              selectedImageByNodeId={selectedImageByNodeId}
              scalarValueByNodeId={scalarValueByNodeId}
              textOverrideByNodeId={textOverrideByNodeId}
              generationError={generationError}
              activeJobId={activeJobId}
              attachedReference={attachedReference === "1"}
              attachError={attachError ?? null}
              approvedVideo={approvedVideo === "1"}
              approveError={approveError ?? null}
              shotPromptSaved={shotPromptSaved === "1"}
              shotPromptError={shotPromptError ?? null}
            />
          ) : (
            <WorkflowSelectorPanel
              workflows={savedWorkflows}
              basePanelUrl={openPanelUrl}
              closeUrl={closeUrl}
              context="shot"
            />
          )}
        </GenerationPanelShell>
      )}
    </div>
  );
}
