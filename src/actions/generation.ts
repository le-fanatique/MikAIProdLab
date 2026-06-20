"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  generationJobs,
  projects,
  sequences,
  shots,
  comfyWorkflows,
  assets,
  shotAssets,
  motionBeats,
  promptSegments,
  shotReferenceImages,
  assetReferenceImages,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import {
  buildRuntimeImageOptions,
  mapWorkflowInputs,
} from "@/lib/comfy/mapWorkflowInputs";
import { patchWorkflowPayload } from "@/lib/comfy/patchWorkflowPayload";
import { prepareComfyPayloadForQueue } from "@/lib/comfy/prepareComfyPayload";
import { queueComfyPrompt } from "@/lib/comfy/comfyServerClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunWorkflowGenerationResult =
  | { ok: true; jobId: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markJobFailed(
  jobId: number,
  message: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(generationJobs)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 1000),
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(generationJobs.id, jobId));
}

// ---------------------------------------------------------------------------
// runWorkflowGeneration
// ---------------------------------------------------------------------------

export async function runWorkflowGeneration(args: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  workflowId: number;
}): Promise<RunWorkflowGenerationResult> {
  const { projectId, sequenceId, shotId, workflowId } = args;

  // --- 1. Validate numeric IDs ---
  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(sequenceId) ||
    !Number.isInteger(shotId) ||
    !Number.isInteger(workflowId) ||
    projectId <= 0 ||
    sequenceId <= 0 ||
    shotId <= 0 ||
    workflowId <= 0
  ) {
    return { ok: false, error: "Invalid IDs provided." };
  }

  // --- 2. Fetch and validate hierarchy ---
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId)
    return { ok: false, error: "Sequence not found or does not belong to this project." };

  const [shot] = await db
    .select()
    .from(shots)
    .where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId)
    return { ok: false, error: "Shot not found or does not belong to this sequence." };

  const [workflow] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };

  // --- 3. Parse workflow JSON ---
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null)
    return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };

  // --- 4. Fetch shot context (mirrors map page logic) ---
  const assignedRows = await db
    .select({
      assetId: assets.id,
      assetName: assets.name,
      assetType: assets.type,
      assetDescription: assets.description,
    })
    .from(shotAssets)
    .innerJoin(assets, eq(shotAssets.assetId, assets.id))
    .where(eq(shotAssets.shotId, shotId))
    .orderBy(asc(assets.name));

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  const beatList = await db
    .select()
    .from(motionBeats)
    .where(eq(motionBeats.shotId, shotId))
    .orderBy(asc(motionBeats.orderIndex));

  const segmentList = await db
    .select()
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shotId))
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
    .where(eq(shotReferenceImages.shotId, shotId))
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
          .orderBy(
            asc(assetReferenceImages.orderIndex),
            asc(assetReferenceImages.id)
          )
      : [];

  // --- 5. Recompute prompt + mappings + payload (mirrors map page) ---
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

  const mappings = mapWorkflowInputs(
    parsed.inputs,
    composedShotPrompt.text,
    availableImages
  );

  const preview = patchWorkflowPayload(workflow.workflowJson, mappings);

  if (!preview.patchedJsonText || Object.keys(preview.patchedJson).length === 0) {
    return {
      ok: false,
      error: "No compatible payload could be generated from this workflow and shot.",
    };
  }

  // --- 6. Create generation_jobs row (pending) ---
  const clientId = `mikai-${shotId}-${workflowId}-${Date.now()}`;
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(generationJobs)
    .values({
      shotId,
      workflowId,
      status: "pending",
      clientId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: generationJobs.id });

  const jobId = inserted.id;

  // --- 7. Prepare payload — upload local images to ComfyUI ---
  try {
    await db
      .update(generationJobs)
      .set({ status: "uploading", updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(preview.patchedJson);

    // --- 8. Queue prompt ---
    const queued = await queueComfyPrompt({
      workflow: prepared.workflow,
      clientId,
    });

    // --- 9. Update job → queued ---
    await db
      .update(generationJobs)
      .set({
        status: "queued",
        promptId: queued.prompt_id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(generationJobs.id, jobId));

    return { ok: true, jobId };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during generation.";
    await markJobFailed(jobId, message);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// runWorkflowGenerationFromForm — form-compatible wrapper with redirect
// ---------------------------------------------------------------------------

export async function runWorkflowGenerationFromForm(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const workflowId = parseInt(formData.get("workflowId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null) ?? "";

  // Build safe return URL base (never allow empty — fall back to home)
  const base = returnTo.trim() || "/";

  const result = await runWorkflowGeneration({
    projectId,
    sequenceId,
    shotId,
    workflowId,
  });

  if (result.ok) {
    const sep = base.includes("?") ? "&" : "?";
    redirect(`${base}${sep}jobId=${result.jobId}`);
  } else {
    const sep = base.includes("?") ? "&" : "?";
    redirect(
      `${base}${sep}generationError=${encodeURIComponent(result.error)}`
    );
  }
}
