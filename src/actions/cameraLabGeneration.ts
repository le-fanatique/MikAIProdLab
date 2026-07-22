"use server";

// ---------------------------------------------------------------------------
// cameraLabGeneration.ts — CAMLAB.POLISH.1
//
// Two thin, structurally-validated callers around the canonical
// `runWorkflowGeneration` (src/actions/generation.ts) — no second patcher,
// no second job runner. Each function re-derives its own inputs from the
// DB/filesystem and never trusts a client-supplied path, dimension, or
// mapping.
//
//   - queueGaussianPlyGeneration  — Column 1: exactly one image input.
//   - queueGaussianToImageGeneration — Column 3: exactly two image inputs,
//     input 1 = a transient snapshot upload (never a persisted Shot
//     reference), input 2 = the Shot reference image used as Column 1's
//     source. Provenance recorded on the job's payloadSnapshot.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences, shots, comfyWorkflows, shotReferenceImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";
import { runWorkflowGeneration, type RunWorkflowGenerationResult } from "@/actions/generation";
import { requireSingleImageInput, resolveGaussianToImageMapping, classifyNonImageInputs } from "@/lib/cameraLab/workflowInputContract";
import { resolvePlyJobProvenance } from "@/lib/cameraLab/plyJobProvenance";
import { parsePngDimensions } from "@/lib/cameraLab/pngValidation";
import { isFullyDecodableImage } from "@/lib/cameraLab/decodePng";
import { MAX_REFERENCE_IMAGE_SIZE_BYTES } from "@/lib/uploadImage";

function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

type OwnershipChain = { ok: true } | { ok: false; error: string };

/** Re-verifies Project -> Sequence -> Shot on every call — never trusts that a caller's earlier check is still valid. */
async function verifyShotOwnership(projectId: number, sequenceId: number, shotId: number): Promise<OwnershipChain> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    return { ok: false, error: "Sequence not found or does not belong to this project." };
  }
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    return { ok: false, error: "Shot not found or does not belong to this sequence." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Column 1 — Generate Gaussian PLY
// ---------------------------------------------------------------------------

export async function queueGaussianPlyGeneration(input: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  sourceReferenceId: number;
  /** CAMLAB.POLISH.1 retake round 2 — non-image `(Input)` node overrides. Every key is re-validated server-side against the workflow's real structure below; an unknown or kind-incompatible node id refuses the whole request. */
  textOverrideByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
  confirmPartnerNodeCost?: boolean;
}): Promise<RunWorkflowGenerationResult> {
  const { projectId, sequenceId, shotId, sourceReferenceId } = input;
  if (![projectId, sequenceId, shotId, sourceReferenceId].every(isValidId)) {
    return { ok: false, error: "Invalid identifiers." };
  }

  const chain = await verifyShotOwnership(projectId, sequenceId, shotId);
  if (!chain.ok) return { ok: false, error: chain.error };

  const [sourceRef] = await db
    .select({ id: shotReferenceImages.id, shotId: shotReferenceImages.shotId })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, sourceReferenceId));
  if (!sourceRef || sourceRef.shotId !== shotId) {
    return { ok: false, error: "Selected source image not found for this Shot." };
  }

  const defaults = await getWorkflowDefaults();
  if (!defaults.gaussianPlyId) {
    return {
      ok: false,
      error: "No Default Gaussian PLY workflow is configured. Set one in Settings → Generation Defaults.",
    };
  }

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, defaults.gaussianPlyId));
  if (!workflow) {
    return { ok: false, error: "The configured Default Gaussian PLY workflow no longer exists." };
  }

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (!parsed) {
    return { ok: false, error: "The Default Gaussian PLY workflow's JSON could not be parsed." };
  }

  const single = requireSingleImageInput(parsed.inputs);
  if (!single.ok) {
    return { ok: false, error: single.error };
  }

  // ── Codex retake round 2 — every non-image `(Input)` node the workflow
  //    ACTUALLY has right now, re-derived server-side; never trust the
  //    client's set of override keys blindly. An unrecognized kind hard-
  //    blocks (never silently ignored); an override key that doesn't match
  //    a real node of the right kind is refused before any job is created. ─
  const classified = classifyNonImageInputs(parsed.inputs);
  if (!classified.ok) {
    return { ok: false, error: classified.error };
  }
  const textNodeIds = new Set(classified.inputs.filter((c) => c.formKind === "text").map((c) => c.input.nodeId));
  const scalarNodeIds = new Set(classified.inputs.filter((c) => c.formKind === "scalar").map((c) => c.input.nodeId));

  const textOverrideByNodeId = input.textOverrideByNodeId ?? {};
  for (const nodeId of Object.keys(textOverrideByNodeId)) {
    if (!textNodeIds.has(nodeId)) {
      return { ok: false, error: `Unknown or incompatible text override for node ${nodeId}.` };
    }
  }
  const scalarOverrideByNodeId = input.scalarOverrideByNodeId ?? {};
  for (const nodeId of Object.keys(scalarOverrideByNodeId)) {
    if (!scalarNodeIds.has(nodeId)) {
      return { ok: false, error: `Unknown or incompatible scalar override for node ${nodeId}.` };
    }
  }

  return runWorkflowGeneration({
    projectId,
    sequenceId,
    shotId,
    workflowId: defaults.gaussianPlyId,
    textOverrideByNodeId: Object.keys(textOverrideByNodeId).length > 0 ? textOverrideByNodeId : undefined,
    scalarOverrideByNodeId: Object.keys(scalarOverrideByNodeId).length > 0 ? scalarOverrideByNodeId : undefined,
    selectedImageByNodeId: { [single.nodeId]: `shot-${sourceReferenceId}` },
    confirmPartnerNodeCost: input.confirmPartnerNodeCost,
  });
}

// ---------------------------------------------------------------------------
// Column 2 — Refresh Viewer (server revalidation only; never mutates DB)
// ---------------------------------------------------------------------------

export type RefreshGaussianViewerResult =
  | {
      ok: true;
      jobId: number;
      plyFilename: string;
      sourceReferenceId: number;
      sourceImagePath: string;
      sourceLabel: string;
    }
  | { ok: false; error: string };

/**
 * Re-derives the viewer's PLY + source image strictly from the given job's
 * own persisted state — never the "latest" PLY of the Shot, never another
 * Shot's job, never the current (possibly stale) UI selection.
 */
export async function refreshGaussianViewer(input: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  jobId: number;
}): Promise<RefreshGaussianViewerResult> {
  const { projectId, sequenceId, shotId, jobId } = input;
  if (![projectId, sequenceId, shotId, jobId].every(isValidId)) {
    return { ok: false, error: "Invalid identifiers." };
  }

  const chain = await verifyShotOwnership(projectId, sequenceId, shotId);
  if (!chain.ok) return { ok: false, error: chain.error };

  const resolved = await resolvePlyJobProvenance(shotId, jobId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  return {
    ok: true,
    jobId: resolved.provenance.jobId,
    plyFilename: resolved.provenance.plyFilename,
    sourceReferenceId: resolved.provenance.sourceReferenceId,
    sourceImagePath: resolved.provenance.sourceImagePath,
    sourceLabel: resolved.provenance.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Column 3 — Gaussian-to-image
// ---------------------------------------------------------------------------

function isFileLike(value: unknown): value is { size: number; arrayBuffer: () => Promise<ArrayBuffer> } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["size"] === "number" &&
    typeof (value as Record<string, unknown>)["arrayBuffer"] === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type QueueGaussianToImageResult =
  | { ok: true; jobId: number; cleanupWarning?: string }
  | {
      ok: false;
      error: string;
      requiresPartnerNodeConfirmation?: boolean;
      apiNodeClasses?: string[];
    };

export async function queueGaussianToImageGeneration(input: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  sourcePlyJobId: number;
  snapshotFile: File;
  /** CAMLAB.POLISH.1 retake round 2 — which draft `snapshotFile` actually is; recorded verbatim in `cameraLabProvenance`, never inferred. */
  snapshotSource: "captured-snapshot" | "uploaded-override";
  confirmPartnerNodeCost?: boolean;
}): Promise<QueueGaussianToImageResult> {
  const { projectId, sequenceId, shotId, sourcePlyJobId, snapshotSource } = input;
  if (![projectId, sequenceId, shotId, sourcePlyJobId].every(isValidId)) {
    return { ok: false, error: "Invalid identifiers." };
  }
  if (snapshotSource !== "captured-snapshot" && snapshotSource !== "uploaded-override") {
    return { ok: false, error: "Invalid snapshot source." };
  }

  const chain = await verifyShotOwnership(projectId, sequenceId, shotId);
  if (!chain.ok) return { ok: false, error: chain.error };

  // ── Codex P1 retake — the source reference is NEVER accepted from the
  //    caller. It is derived exclusively from the PLY job's own recorded
  //    provenance (same resolver Refresh uses), so a direct Server Action
  //    call can never combine a PLY generated from reference A with a
  //    different reference B of the same Shot. ────────────────────────────
  const resolved = await resolvePlyJobProvenance(shotId, sourcePlyJobId);
  if (!resolved.ok) {
    return { ok: false, error: `The Gaussian PLY job for this snapshot is not eligible: ${resolved.error}` };
  }
  const sourceReferenceId = resolved.provenance.sourceReferenceId;
  const sourceImagePath = resolved.provenance.sourceImagePath;

  // ── Default workflow + exactly-two-inputs structural gate ───────────────
  const defaults = await getWorkflowDefaults();
  if (!defaults.gaussianToImageId) {
    return {
      ok: false,
      error: "No Default Gaussian-to-image workflow is configured. Set one in Settings → Generation Defaults.",
    };
  }
  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, defaults.gaussianToImageId));
  if (!workflow) {
    return { ok: false, error: "The configured Default Gaussian-to-image workflow no longer exists." };
  }
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (!parsed) {
    return { ok: false, error: "The Default Gaussian-to-image workflow's JSON could not be parsed." };
  }
  const mapping = resolveGaussianToImageMapping(parsed.inputs);
  if (!mapping.ok) {
    return { ok: false, error: mapping.error };
  }

  // ── Validate the captured snapshot bytes (no target dims to match here —
  //    Gaussian-to-image accepts the snapshot at whatever exact resolution
  //    it was captured, only real decodability/size are gated) ────────────
  if (!isFileLike(input.snapshotFile) || input.snapshotFile.size <= 0) {
    return { ok: false, error: "No captured snapshot was provided." };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await input.snapshotFile.arrayBuffer());
  } catch {
    return { ok: false, error: "The captured snapshot could not be read." };
  }
  if (buffer.length > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      error: `The captured PNG is ${(buffer.length / (1024 * 1024)).toFixed(1)} MB, above the 10 MB limit.`,
    };
  }
  const declaredDimensions = parsePngDimensions(buffer);
  if (!declaredDimensions) {
    return { ok: false, error: "The captured file is not a valid PNG." };
  }

  // ── Confined, unique temp path — never persisted, never a Shot reference ─
  const tmpDir = `uploads/camera-lab-tmp/shot-${shotId}`;
  const tmpFilename = `gaussian-snapshot-${randomUUID()}.png`;
  const tmpRelativePath = `${tmpDir}/${tmpFilename}`;
  const absoluteDir = path.resolve(process.cwd(), "public", tmpDir);
  const finalAbsolute = path.join(absoluteDir, tmpFilename);
  const writeAttemptAbsolute = `${finalAbsolute}.writing`;

  async function cleanup(): Promise<string[]> {
    const failures: string[] = [];
    for (const p of [writeAttemptAbsolute, finalAbsolute]) {
      try {
        await fs.rm(p, { force: true });
      } catch (err) {
        failures.push(`"${p}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return failures;
  }

  function withCleanupNote(error: string, failures: string[]): string {
    if (failures.length === 0) return error;
    return `${error} Additionally, cleanup failed and stray file(s) may remain — ${failures.join("; ")}.`;
  }

  try {
    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(writeAttemptAbsolute, buffer, { flag: "wx" });
    await fs.rename(writeAttemptAbsolute, finalAbsolute);
  } catch (err) {
    const failures = await cleanup();
    return {
      ok: false,
      error: withCleanupNote(
        `Failed to store the transient snapshot file: ${err instanceof Error ? err.message : "unknown error"}.`,
        failures
      ),
    };
  }

  // Confine + real-decode gate on the written bytes, same discipline as the
  // Shot-reference confirmation path (CAMLAB.SHOTREF.1).
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  let confined = false;
  try {
    const uploadsRootReal = await fs.realpath(uploadsRoot);
    const finalReal = await fs.realpath(finalAbsolute);
    confined = finalReal.startsWith(uploadsRootReal + path.sep);
  } catch {
    confined = false;
  }
  const decodable = confined && (await isFullyDecodableImage(finalAbsolute));
  if (!decodable) {
    const failures = await cleanup();
    return {
      ok: false,
      error: withCleanupNote("The captured snapshot is not a decodable PNG image (truncated or corrupt).", failures),
    };
  }

  // ── Build the exact payload override: node-by-node, never a second
  //    generic patcher — only the two structurally-identified nodes are
  //    touched, everything else in the workflow JSON is passed through as-is.
  let patchedJson: Record<string, unknown>;
  try {
    patchedJson = JSON.parse(workflow.workflowJson) as Record<string, unknown>;
  } catch {
    const failures = await cleanup();
    return { ok: false, error: withCleanupNote("The Default Gaussian-to-image workflow's JSON could not be parsed.", failures) };
  }

  const applyImage = (nodeId: string, imagePath: string): string | null => {
    const node = patchedJson[nodeId];
    if (!isRecord(node)) return `Node ${nodeId} not found in workflow JSON.`;
    const inputs = node["inputs"];
    if (!isRecord(inputs) || !("image" in inputs)) {
      return `Image input node ${nodeId} has no compatible image field.`;
    }
    inputs["image"] = imagePath;
    return null;
  };

  const snapshotErr = applyImage(mapping.snapshotNodeId, tmpRelativePath);
  const sourceErr = snapshotErr ? null : applyImage(mapping.sourceNodeId, sourceImagePath);
  const patchErr = snapshotErr ?? sourceErr;
  if (patchErr) {
    const failures = await cleanup();
    return { ok: false, error: withCleanupNote(patchErr, failures) };
  }

  // ── Queue via the canonical pipeline. Whatever happens (success or
  //    failure), the transient file is no longer needed afterwards: either
  //    it was already uploaded to the provider, or queueing never reached
  //    the upload step. Cleanup always runs, failures are reported honestly
  //    rather than silently dropped. ─────────────────────────────────────
  let result: RunWorkflowGenerationResult;
  try {
    result = await runWorkflowGeneration({
      projectId,
      sequenceId,
      shotId,
      workflowId: defaults.gaussianToImageId,
      patchedJsonOverride: patchedJson,
      confirmPartnerNodeCost: input.confirmPartnerNodeCost,
      cameraLabProvenance: {
        sourcePlyJobId,
        sourceReferenceId,
        snapshotWidth: declaredDimensions.width,
        snapshotHeight: declaredDimensions.height,
        snapshotSource,
        inputMapping: { snapshotNodeId: mapping.snapshotNodeId, sourceNodeId: mapping.sourceNodeId },
      },
    });
  } catch (err) {
    const failures = await cleanup();
    return {
      ok: false,
      error: withCleanupNote(err instanceof Error ? err.message : "Unknown error during generation.", failures),
    };
  }

  const cleanupFailures = await cleanup();
  if (!result.ok) {
    return {
      ...result,
      error: withCleanupNote(result.error, cleanupFailures),
    };
  }
  if (cleanupFailures.length > 0) {
    // The generation itself succeeded — never turn that into a failure —
    // but a stray temp file must never be swallowed silently either.
    return {
      ok: true,
      jobId: result.jobId,
      cleanupWarning: `Stray temporary file(s) may remain: ${cleanupFailures.join("; ")}.`,
    };
  }
  return result;
}
