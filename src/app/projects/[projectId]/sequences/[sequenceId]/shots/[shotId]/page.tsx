import { db } from "@/db";
import { projects, sequences, shots, assets, shotAssets, motionBeats, promptSegments, shotReferenceImages, assetReferenceImages, comfyWorkflows, generationJobs } from "@/db/schema";
import { eq, and, notInArray, inArray, asc, desc, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import CastingPanel from "@/components/CastingPanel";
import MotionBeatsPanel from "@/components/MotionBeatsPanel";
import PromptSegmentsPanel from "@/components/PromptSegmentsPanel";
import ReferenceImagesPanel from "@/components/ReferenceImagesPanel";
import CompiledPromptPanel from "@/components/CompiledPromptPanel";
import ShotPromptDraftPanel from "@/components/ShotPromptDraftPanel";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import GeneratedOutputsPanel from "@/components/GeneratedOutputsPanel";
import type { GeneratedOutputItem } from "@/components/GeneratedOutputsPanel";
import GenerationJobsPanel from "@/components/GenerationJobsPanel";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { assignAssetToShot, removeAssetFromShot } from "@/actions/shotAssets";
import { deleteMotionBeat } from "@/actions/motionBeats";
import { deleteShotReferenceImage } from "@/actions/shotReferenceImages";
import {
  deletePromptSegment,
  movePromptSegmentUp,
  movePromptSegmentDown,
} from "@/actions/promptSegments";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
  searchParams: Promise<{ attachError?: string; attachedReference?: string; retryError?: string; deleteError?: string; deleteSuccess?: string }>;
};

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
  const { attachError, attachedReference, retryError, deleteError, deleteSuccess } = await searchParams;
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

  const beatList = await db
    .select()
    .from(motionBeats)
    .where(eq(motionBeats.shotId, shid))
    .orderBy(asc(motionBeats.orderIndex));

  const beatRows = beatList.map((beat) => ({
    id: beat.id,
    beatType: beat.beatType,
    label: beat.label,
    description: beat.description,
    timingPosition: beat.timingPosition,
    editHref: `/projects/${pid}/sequences/${sid}/shots/${shid}/beats/${beat.id}/edit`,
    deleteAction: deleteMotionBeat.bind(null, beat.id, shid, sid, pid),
  }));

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
    segmentType: seg.segmentType,
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

  const savedWorkflows = await db
    .select({
      id: comfyWorkflows.id,
      name: comfyWorkflows.name,
      kind: comfyWorkflows.kind,
      description: comfyWorkflows.description,
      updatedAt: comfyWorkflows.updatedAt,
    })
    .from(comfyWorkflows)
    .orderBy(desc(comfyWorkflows.updatedAt));

  const rawGeneratedOutputs = await db
    .select({
      id: generationJobs.id,
      outputPath: generationJobs.outputPath,
      completedAt: generationJobs.completedAt,
      createdAt: generationJobs.createdAt,
      workflowName: comfyWorkflows.name,
      workflowKind: comfyWorkflows.kind,
    })
    .from(generationJobs)
    .leftJoin(comfyWorkflows, eq(generationJobs.workflowId, comfyWorkflows.id))
    .where(
      and(
        eq(generationJobs.shotId, shid),
        eq(generationJobs.status, "done"),
        isNotNull(generationJobs.outputPath)
      )
    )
    .orderBy(desc(generationJobs.completedAt), desc(generationJobs.createdAt))
    .limit(24);

  const generatedOutputItems: GeneratedOutputItem[] = rawGeneratedOutputs
    .filter((item) => item.outputPath !== null)
    .map((item) => ({ ...item, outputPath: item.outputPath! }));

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
    assetName: row.assetName,
    assetType: row.assetType,
    removeAction: removeAssetFromShot.bind(null, row.assignmentId, shid, sid, pid),
  }));

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

  const hasDetails =
    shot.description || shot.actionPitch || shot.cameraPitch || shot.continuityNotes;
  const hasProduction =
    shot.framing || shot.cameraMovement || shot.continuityIn || shot.continuityOut;

  return (
    <div>
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
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}/edit`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Edit Shot
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        {hasDetails && (
          <Card title="Details">
            <div className="flex flex-col gap-4">
              {shot.description && (
                <Field label="Description" value={shot.description} />
              )}
              {shot.actionPitch && (
                <Field label="Action Pitch" value={shot.actionPitch} />
              )}
              {shot.cameraPitch && (
                <Field label="Camera Pitch" value={shot.cameraPitch} />
              )}
              {shot.continuityNotes && (
                <Field label="Continuity Notes" value={shot.continuityNotes} />
              )}
            </div>
          </Card>
        )}

        {hasProduction && (
          <Card title="Production">
            <div className="flex flex-col gap-4">
              {shot.framing && (
                <Field label="Framing" value={shot.framing} />
              )}
              {shot.cameraMovement && (
                <Field label="Camera Movement" value={shot.cameraMovement} />
              )}
              {shot.continuityIn && (
                <Field label="Continuity In" value={shot.continuityIn} />
              )}
              {shot.continuityOut && (
                <Field label="Continuity Out" value={shot.continuityOut} />
              )}
            </div>
          </Card>
        )}

        {!hasDetails && !hasProduction && (
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

        <Card title="Casting">
          <CastingPanel
            assignedItems={assignedItems}
            availableAssets={availableAssets}
            projectId={pid}
            assignAction={assignAction}
          />
          <p className="text-xs text-[#4b5158] mt-3">
            Casting here describes what appears in this specific shot.
          </p>
        </Card>

        <Card title="Motion Beats">
          <MotionBeatsPanel
            beats={beatRows}
            addHref={`/projects/${pid}/sequences/${sid}/shots/${shid}/beats/new`}
          />
        </Card>

        <Card title="Prompt Timeline">
          <PromptSegmentsPanel
            segments={segmentRows}
            addHref={`/projects/${pid}/sequences/${sid}/shots/${shid}/segments/new`}
          />
        </Card>

        <Card title="Compiled Prompt">
          <CompiledPromptPanel compiled={compiledPrompt} />
        </Card>

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

        <Card title="Generated Outputs">
          <GeneratedOutputsPanel
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            outputs={generatedOutputItems}
            attachError={attachError ?? null}
            attachedReference={attachedReference === "1"}
          />
        </Card>

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

        <Card title="Shot Prompt Draft">
          <ShotPromptDraftPanel composed={composedShotPrompt} />
        </Card>

        <Card title="Workflow Mapping">
          {savedWorkflows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#2c3035] px-6 py-10 text-center">
              <p className="text-[#a4abb2] text-sm font-medium mb-1">No workflows saved.</p>
              <p className="text-[#6e767d] text-xs mt-1">
                Upload a ComfyUI API workflow in Settings before mapping shot inputs.
              </p>
              <div className="mt-4">
                <Link
                  href="/settings/workflows"
                  className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  Manage Workflows
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {savedWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-start justify-between gap-4 border-b border-[#232629] last:border-0 pb-3 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <WorkflowKindBadge kind={wf.kind} />
                      <span className="text-sm font-medium text-[#e7e9ec] truncate">
                        {wf.name}
                      </span>
                    </div>
                    {wf.description && (
                      <p className="text-xs text-[#a4abb2]">{wf.description}</p>
                    )}
                  </div>
                  <Link
                    href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows/${wf.id}/map`}
                    className="shrink-0 text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                  >
                    Map Inputs
                  </Link>
                </div>
              ))}
              <div className="pt-1">
                <Link
                  href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows`}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  View All Workflows →
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}/sequences/${sid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to {sequence.title}
        </Link>
      </div>
    </div>
  );
}
