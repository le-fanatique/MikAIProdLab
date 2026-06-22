"use server";

import fs from "fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
  promptSegments,
  shotReferenceImages,
  assetReferenceImages,
} from "@/db/schema";
import { eq, asc, inArray, sql } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import {
  buildRuntimeImageOptions,
  getRuntimeImageLabel,
  mapWorkflowInputs,
  type RuntimeImageOption,
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

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeComfyNodeErrors(nodeErrors: unknown): string | null {
  if (nodeErrors === null || nodeErrors === undefined) return null;

  if (typeof nodeErrors === "object" && !Array.isArray(nodeErrors)) {
    const entries = Object.entries(nodeErrors as Record<string, unknown>);
    if (entries.length === 0) return null;

    const parts: string[] = [];
    for (const [nodeId, details] of entries.slice(0, 3)) {
      if (typeof details === "object" && details !== null && !Array.isArray(details)) {
        const d = details as Record<string, unknown>;
        const classType = typeof d["class_type"] === "string" ? d["class_type"] : null;
        const errors = Array.isArray(d["errors"]) ? d["errors"] : null;
        const message = typeof d["message"] === "string" ? d["message"] : null;

        if (errors && errors.length > 0) {
          const firstErr = errors[0] as Record<string, unknown>;
          const errMsg =
            typeof firstErr?.["message"] === "string"
              ? firstErr["message"]
              : typeof firstErr?.["details"] === "string"
              ? firstErr["details"]
              : null;
          const label = classType ? `${nodeId} (${classType})` : nodeId;
          parts.push(errMsg ? `${label}: ${errMsg}` : label);
        } else if (message) {
          parts.push(classType ? `${nodeId} (${classType}): ${message}` : `${nodeId}: ${message}`);
        } else {
          parts.push(`${nodeId}: ${safeStringify(details).slice(0, 120)}`);
        }
      } else {
        parts.push(`${nodeId}: ${safeStringify(details).slice(0, 120)}`);
      }
    }

    const extra = entries.length > 3 ? ` (+${entries.length - 3} more)` : "";
    return `ComfyUI node warnings: ${parts.join("; ")}${extra}`.slice(0, 1000);
  }

  if (Array.isArray(nodeErrors)) {
    if (nodeErrors.length === 0) return null;
    return `ComfyUI node warnings: ${safeStringify(nodeErrors).slice(0, 1000)}`;
  }

  return `ComfyUI node warnings: ${String(nodeErrors).slice(0, 1000)}`;
}

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
  selectedImageByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
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

  const mappings = mapWorkflowInputs(
    parsed.inputs,
    compiledShotPrompt.text,
    availableImages
  );

  const preview = patchWorkflowPayload(workflow.workflowJson, mappings, {
    selectedImageByNodeId: args.selectedImageByNodeId,
    scalarOverrideByNodeId: args.scalarOverrideByNodeId,
  });

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
    const nodeErrorSummary = summarizeComfyNodeErrors(queued.node_errors);
    await db
      .update(generationJobs)
      .set({
        status: "queued",
        promptId: queued.prompt_id,
        errorMessage: nodeErrorSummary,
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

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("imageNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("imageNode_".length).trim();
    const imageId = value.trim();
    if (!nodeId || !imageId) continue;
    selectedImageByNodeId[nodeId] = imageId;
  }

  const scalarOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("scalarNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("scalarNode_".length).trim();
    if (!nodeId) continue;
    scalarOverrideByNodeId[nodeId] = value;
  }

  const result = await runWorkflowGeneration({
    projectId,
    sequenceId,
    shotId,
    workflowId,
    selectedImageByNodeId,
    scalarOverrideByNodeId,
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

// ---------------------------------------------------------------------------
// buildAssetPromptText
// ---------------------------------------------------------------------------

function buildAssetPromptText(input: {
  description?: string | null;
  notes?: string | null;
}): string {
  return [input.description, input.notes]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// appendSearchParam
// ---------------------------------------------------------------------------

function appendSearchParam(url: string, key: string, value: string): string {
  const [pathPart, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${pathPart}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// runAssetGeneration
// ---------------------------------------------------------------------------

export async function runAssetGeneration(input: {
  projectId: number;
  assetId: number;
  workflowId: number;
  selectedImageByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
}): Promise<{ ok: true; jobId: number } | { ok: false; error: string }> {
  const { projectId, assetId, workflowId } = input;

  // --- 1. Validate numeric IDs ---
  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(assetId)   || assetId   <= 0 ||
    !Number.isInteger(workflowId) || workflowId <= 0
  ) {
    return { ok: false, error: "Invalid IDs provided." };
  }

  // --- 2. Fetch project ---
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  // --- 3. Fetch asset + verify ownership ---
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.projectId !== projectId)
    return { ok: false, error: "Asset does not belong to this project." };

  // --- 4. Fetch workflow ---
  const [workflow] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (workflow.kind !== "image")
    return { ok: false, error: "Asset generation supports image workflows only." };

  // --- 5. Parse workflow JSON ---
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null)
    return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };

  // --- 6. Fetch asset reference images ---
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
    .where(eq(assetReferenceImages.assetId, assetId))
    .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id));

  // --- 7. Build available images ---
  const availableImages: RuntimeImageOption[] = assetRefImages.map((image) => ({
    id: `asset-${image.assetId}-${image.id}`,
    source: "asset" as const,
    imagePath: image.imagePath,
    label: getRuntimeImageLabel(image),
    role: image.imageRole,
    assetName: asset.name,
    assetType: asset.type,
  }));

  // --- 8. Build prompt text from description + notes ---
  const assetPromptText = buildAssetPromptText({
    description: asset.description,
    notes: asset.notes,
  });

  // --- 9. Map inputs + patch payload ---
  const mappings = mapWorkflowInputs(parsed.inputs, assetPromptText, availableImages);

  const preview = patchWorkflowPayload(workflow.workflowJson, mappings, {
    selectedImageByNodeId: input.selectedImageByNodeId,
    scalarOverrideByNodeId: input.scalarOverrideByNodeId,
  });

  if (!preview.patchedJsonText || Object.keys(preview.patchedJson).length === 0) {
    return {
      ok: false,
      error: "No compatible payload could be generated from this workflow and asset.",
    };
  }

  // --- 10. Create job row (pending) ---
  const clientId = `mikai-asset-${assetId}-${workflowId}-${Date.now()}`;
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(generationJobs)
    .values({
      shotId: null,
      assetId,
      workflowId,
      status: "pending",
      clientId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: generationJobs.id });

  const jobId = inserted.id;

  // --- 11. Upload references + queue ---
  try {
    await db
      .update(generationJobs)
      .set({ status: "uploading", updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(preview.patchedJson);

    const queued = await queueComfyPrompt({
      workflow: prepared.workflow,
      clientId,
    });

    const nodeErrorSummary = summarizeComfyNodeErrors(queued.node_errors);
    await db
      .update(generationJobs)
      .set({
        status: "queued",
        promptId: queued.prompt_id,
        errorMessage: nodeErrorSummary,
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
// runAssetGenerationFromForm — form-compatible wrapper with redirect
// ---------------------------------------------------------------------------

export async function runAssetGenerationFromForm(formData: FormData): Promise<void> {
  const projectId  = parseInt(formData.get("projectId")  as string, 10);
  const assetId    = parseInt(formData.get("assetId")    as string, 10);
  const workflowId = parseInt(formData.get("workflowId") as string, 10);
  const returnTo   = (formData.get("returnTo") as string | null)?.trim() || "/";

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("imageNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId  = key.slice("imageNode_".length).trim();
    const imageId = value.trim();
    if (!nodeId || !imageId) continue;
    selectedImageByNodeId[nodeId] = imageId;
  }

  const scalarOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("scalarNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("scalarNode_".length).trim();
    if (!nodeId) continue;
    scalarOverrideByNodeId[nodeId] = value;
  }

  const result = await runAssetGeneration({
    projectId,
    assetId,
    workflowId,
    selectedImageByNodeId,
    scalarOverrideByNodeId,
  });

  if (result.ok) {
    redirect(appendSearchParam(returnTo, "jobId", String(result.jobId)));
  } else {
    redirect(
      appendSearchParam(returnTo, "generationError", encodeURIComponent(result.error))
    );
  }
}

// ---------------------------------------------------------------------------
// attachOutputAsShotReference
// ---------------------------------------------------------------------------

const ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export async function attachOutputAsShotReference(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const jobId = parseInt(formData.get("jobId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}attachError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0 ||
    !Number.isInteger(jobId) || jobId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Fetch job
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!job) errRedirect("Output not found.");
  if (job.shotId !== shotId) errRedirect("Output does not belong to this shot.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  if (!job.outputPath) errRedirect("Output path is missing.");
  if (!job.outputPath.startsWith("outputs/jobs/")) {
    errRedirect("Output path is not in the expected location.");
  }

  // Check extension
  const ext = path.extname(job.outputPath).toLowerCase();
  if (!ATTACHABLE_IMAGE_EXTS.has(ext)) {
    errRedirect("Only image outputs can be attached as references.");
  }

  // Resolve and validate source path
  const publicRoot = path.join(process.cwd(), "public");
  const allowedOutputsRoot = path.join(publicRoot, "outputs", "jobs");
  const sourceAbsolute = path.resolve(publicRoot, job.outputPath);

  if (
    !sourceAbsolute.startsWith(allowedOutputsRoot + path.sep) &&
    sourceAbsolute !== allowedOutputsRoot
  ) {
    errRedirect("Output path is not in the expected location.");
  }

  // Verify source file exists
  try {
    await fs.access(sourceAbsolute);
  } catch {
    errRedirect("Output file not found on disk.");
  }

  // Prepare destination
  const uuid = randomUUID();
  const destFilename = `${uuid}${ext}`;
  const destSubfolder = `shot-${shotId}`;
  const destRelative = `uploads/reference-images/${destSubfolder}/${destFilename}`;
  const destDir = path.join(publicRoot, "uploads", "reference-images", destSubfolder);
  const destAbsolute = path.join(destDir, destFilename);

  // Copy file
  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourceAbsolute, destAbsolute);
  } catch {
    errRedirect("Failed to copy output file. Please try again.");
  }

  // Insert shot_reference_images row
  try {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
      .from(shotReferenceImages)
      .where(eq(shotReferenceImages.shotId, shotId));

    await db.insert(shotReferenceImages).values({
      shotId,
      orderIndex: maxOrder + 1,
      imagePath: destRelative,
      sourceFilename: null,
      label: "Generated Output",
      imageRole: "keyframe",
    });
  } catch {
    // Best-effort cleanup of copied file
    try { await fs.unlink(destAbsolute); } catch { /* silent */ }
    errRedirect("Failed to save reference image. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}attachedReference=1`);
}

// ---------------------------------------------------------------------------
// attachOutputAsAssetReference
// ---------------------------------------------------------------------------

const ASSET_ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function attachOutputAsAssetReference(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const assetId   = parseInt(formData.get("assetId")   as string, 10);
  const jobId     = parseInt(formData.get("jobId")     as string, 10);
  const returnTo  =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/assets/${assetId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}attachError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(assetId)   || assetId   <= 0 ||
    !Number.isInteger(jobId)     || jobId     <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Fetch asset + verify project ownership
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) errRedirect("Asset not found.");
  if (asset.projectId !== projectId) errRedirect("Asset does not belong to this project.");

  // Fetch job + verify asset ownership
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!job) errRedirect("Output not found.");
  if (job.assetId !== assetId) errRedirect("Output does not belong to this asset.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  if (!job.outputPath) errRedirect("Output path is missing.");
  if (!job.outputPath.startsWith("outputs/jobs/")) {
    errRedirect("Output path is not in the expected location.");
  }

  // Check extension — images only, no video/gif
  const ext = path.extname(job.outputPath).toLowerCase();
  if (!ASSET_ATTACHABLE_IMAGE_EXTS.has(ext)) {
    errRedirect("Only image outputs (.png, .jpg, .jpeg, .webp) can be attached as references.");
  }

  // Resolve and validate source path
  const publicRoot = path.join(process.cwd(), "public");
  const allowedOutputsRoot = path.join(publicRoot, "outputs", "jobs");
  const sourceAbsolute = path.resolve(publicRoot, job.outputPath);

  if (
    !sourceAbsolute.startsWith(allowedOutputsRoot + path.sep) &&
    sourceAbsolute !== allowedOutputsRoot
  ) {
    errRedirect("Output path is not in the expected location.");
  }

  // Verify source file exists
  try {
    await fs.access(sourceAbsolute);
  } catch {
    errRedirect("Output file not found on disk.");
  }

  // Prepare destination
  const uuid = randomUUID();
  const destFilename = `${uuid}${ext}`;
  const destSubfolder = `asset-${assetId}`;
  const destRelative = `uploads/reference-images/${destSubfolder}/${destFilename}`;
  const destDir = path.join(publicRoot, "uploads", "reference-images", destSubfolder);
  const destAbsolute = path.join(destDir, destFilename);

  // Copy file (source is preserved)
  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourceAbsolute, destAbsolute);
  } catch {
    errRedirect("Failed to copy output file. Please try again.");
  }

  // Insert asset_reference_images row
  try {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
      .from(assetReferenceImages)
      .where(eq(assetReferenceImages.assetId, assetId));

    await db.insert(assetReferenceImages).values({
      assetId,
      orderIndex: maxOrder + 1,
      imagePath: destRelative,
      sourceFilename: null,
      label: "Generated Output",
      imageRole: "keyframe",
    });
  } catch {
    // Best-effort cleanup of copied file
    try { await fs.unlink(destAbsolute); } catch { /* silent */ }
    errRedirect("Failed to save reference image. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}attachedReference=1`);
}
