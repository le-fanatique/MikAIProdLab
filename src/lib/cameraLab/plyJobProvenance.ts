// ---------------------------------------------------------------------------
// plyJobProvenance.ts — CAMLAB.POLISH.1 retake (Codex P1 x2)
//
// The SINGLE server-side resolver for "what Shot reference image was
// actually used to generate this Gaussian PLY job" — shared by Refresh
// Viewer (Column 2) and Gaussian-to-image queueing (Column 3) so the two
// can never diverge or be tricked into combining a real PLY job with a
// reference image it was never generated from.
//
// Never trusts anything client-supplied beyond the job id itself: reloads
// the job's OWN workflow (the one actually used at queue time — never the
// current Settings default, so a later Default change never invalidates an
// old, legitimate job), re-parses it, re-derives its single required image
// input node, and requires the job's persisted `selectedImageByNodeId` to
// target that exact node. Only then is the recorded reference id resolved
// and re-verified against this Shot.
// ---------------------------------------------------------------------------

import "server-only";
import { db } from "@/db";
import { comfyWorkflows, generationJobs, shotReferenceImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { requireSingleImageInput } from "@/lib/cameraLab/workflowInputContract";
import { extractEligiblePlyOutput, type CameraLabJobCandidate } from "@/lib/cameraLab/eligibility";

export type PlyJobProvenance = {
  jobId: number;
  workflowId: number;
  plyFilename: string;
  sourceReferenceId: number;
  sourceImagePath: string;
  sourceLabel: string;
};

export type ResolvePlyJobProvenanceResult =
  | { ok: true; provenance: PlyJobProvenance }
  | { ok: false; error: string };

export async function resolvePlyJobProvenance(shotId: number, jobId: number): Promise<ResolvePlyJobProvenanceResult> {
  const [job] = await db
    .select({
      id: generationJobs.id,
      shotId: generationJobs.shotId,
      workflowId: generationJobs.workflowId,
      status: generationJobs.status,
      outputPath: generationJobs.outputPath,
      payloadSnapshot: generationJobs.payloadSnapshot,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  const jobCandidate: CameraLabJobCandidate | null = job
    ? { id: job.id, shotId: job.shotId, status: job.status, outputPath: job.outputPath }
    : null;
  const eligible = jobCandidate ? extractEligiblePlyOutput(jobCandidate, shotId) : null;
  if (!job || !eligible) {
    return {
      ok: false,
      error: "This Gaussian PLY job is not eligible for this Shot (not done, foreign, or its output is no longer a safe PLY).",
    };
  }

  // The workflow actually used to queue THIS job — never the current
  // Settings default. A later Default change must never invalidate an old,
  // legitimate job's provenance.
  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, job.workflowId));
  if (!workflow) {
    return { ok: false, error: "This job's workflow no longer exists — its provenance cannot be revalidated." };
  }
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (!parsed) {
    return { ok: false, error: "This job's workflow JSON could not be parsed — its provenance cannot be revalidated." };
  }
  const single = requireSingleImageInput(parsed.inputs);
  if (!single.ok) {
    return {
      ok: false,
      error: "This job's workflow no longer respects the Gaussian PLY contract (exactly one image input) — its provenance cannot be revalidated.",
    };
  }

  let snapshot: { selections?: { selectedImageByNodeId?: Record<string, string> } } | null = null;
  try {
    snapshot = job.payloadSnapshot ? JSON.parse(job.payloadSnapshot) : null;
  } catch {
    snapshot = null;
  }
  const selectedImageByNodeId = snapshot?.selections?.selectedImageByNodeId ?? {};
  const entries = Object.entries(selectedImageByNodeId);
  if (entries.length !== 1) {
    return { ok: false, error: "This job's recorded source image mapping is missing or ambiguous. Regenerate the PLY from Column 1." };
  }
  const [mappedNodeId, imageOptionId] = entries[0];
  if (mappedNodeId !== single.nodeId) {
    return {
      ok: false,
      error: "This job's recorded source image mapping does not target this workflow's image input node. Regenerate the PLY from Column 1.",
    };
  }
  const match = /^shot-(\d+)$/.exec(imageOptionId);
  if (!match) {
    return { ok: false, error: "This job's recorded source image is not a Shot reference image." };
  }
  const sourceReferenceId = Number.parseInt(match[1], 10);

  const [sourceRef] = await db
    .select({
      id: shotReferenceImages.id,
      shotId: shotReferenceImages.shotId,
      imagePath: shotReferenceImages.imagePath,
      label: shotReferenceImages.label,
      sourceFilename: shotReferenceImages.sourceFilename,
    })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, sourceReferenceId));
  if (!sourceRef || sourceRef.shotId !== shotId) {
    return { ok: false, error: "This job's source reference image no longer belongs to this Shot." };
  }

  return {
    ok: true,
    provenance: {
      jobId: job.id,
      workflowId: job.workflowId,
      plyFilename: eligible.filename,
      sourceReferenceId,
      sourceImagePath: sourceRef.imagePath,
      sourceLabel: sourceRef.label ?? sourceRef.sourceFilename ?? `Reference #${sourceReferenceId}`,
    },
  };
}
