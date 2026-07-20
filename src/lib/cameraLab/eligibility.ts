/**
 * CAMLAB.VIEWER.1 — pure, deterministic admissibility rules for the Camera
 * Lab. Decides which generation jobs of a Shot expose an openable Gaussian
 * PLY, and builds the only URL the viewer is allowed to load it from (the
 * confined `/api/generated-outputs` route). Server-side only: reuses the
 * filename safety rule from the PLY artifact module.
 */

import { isSafePlyFilename } from "@/lib/comfy/plyArtifact";

/** The minimal job shape the eligibility rules need. */
export type CameraLabJobCandidate = {
  id: number;
  shotId: number | null;
  status: string;
  outputPath: string | null;
};

export type EligiblePlyOutput = {
  jobId: number;
  filename: string;
};

/**
 * Strict admissibility: the job must belong to the given Shot, be `done`,
 * and its outputPath must be exactly `outputs/jobs/<its own id>/<safe .ply>`.
 * Anything else — other Shot, non-terminal status, non-PLY output, foreign
 * or mismatched job directory, unsafe filename — is not eligible.
 */
export function extractEligiblePlyOutput(
  job: CameraLabJobCandidate,
  shotId: number
): EligiblePlyOutput | null {
  if (!Number.isInteger(shotId) || shotId <= 0) return null;
  if (job.shotId !== shotId) return null;
  if (job.status !== "done") return null;
  if (typeof job.outputPath !== "string") return null;

  const match = job.outputPath.match(/^outputs\/jobs\/(\d+)\/([^/\\]+)$/);
  if (!match) return null;

  const pathJobId = Number.parseInt(match[1], 10);
  if (!Number.isInteger(pathJobId) || pathJobId !== job.id) return null;

  const filename = match[2];
  if (!isSafePlyFilename(filename)) return null;

  return { jobId: job.id, filename };
}

/**
 * The only PLY URL the Camera Lab viewer may load: the existing confined
 * generated-outputs route. Throws on any input the eligibility rule would
 * not have produced — this must never build a URL for an arbitrary path.
 */
export function buildCameraLabPlyUrl(output: EligiblePlyOutput): string {
  if (!Number.isInteger(output.jobId) || output.jobId <= 0) {
    throw new Error("Invalid job id for Camera Lab PLY URL.");
  }
  if (!isSafePlyFilename(output.filename)) {
    throw new Error("Unsafe PLY filename for Camera Lab URL.");
  }
  return `/api/generated-outputs/${output.jobId}/${encodeURIComponent(output.filename)}`;
}

/**
 * Strict positive-integer URL parameter parsing (no signs, no whitespace,
 * no floats, bounded). Returns null on anything else.
 */
export function parseIdParam(value: string | undefined): number | null {
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 2_147_483_647) {
    return null;
  }
  return parsed;
}
