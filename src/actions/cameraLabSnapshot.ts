"use server";

// ---------------------------------------------------------------------------
// cameraLabSnapshot.ts — CAMLAB.SHOTREF.1
//
// Dedicated Server Action: confirms a locally captured Gaussian Camera PNG
// as a `camera` Reference Image of the SAME Shot. Structured result (never a
// redirect) so the client can show success/failure without losing its local
// draft. Nothing here trusts the browser: ownership chain, PLY-job
// admissibility, target-reference confinement, PNG format, and exact
// dimensions are all re-established server-side before any write.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  shotReferenceImages,
  generationJobs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { extractEligiblePlyOutput } from "@/lib/cameraLab/eligibility";
import {
  validateSnapshotPng,
  isConfinableUploadsPath,
} from "@/lib/cameraLab/pngValidation";
import { runFfprobeJson, getFfmpegPath } from "@/lib/ffmpeg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DECODE_TIMEOUT_MS = 30_000;

/** Fully decodes the written PNG with the bundled FFmpeg (`-f null -`) — a probed header is not proof of a displayable image; a truncated or corrupt stream must fail here. */
async function isFullyDecodableImage(absolutePath: string): Promise<boolean> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return false;
  try {
    await execFileAsync(
      ffmpegPath,
      ["-v", "error", "-i", absolutePath, "-frames:v", "1", "-f", "null", "-"],
      { timeout: DECODE_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
    return true;
  } catch {
    return false;
  }
}

export type ConfirmCameraSnapshotResult =
  | { ok: true; referenceId: number; width: number; height: number }
  | { ok: false; error: string };

type FileLike = {
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["size"] === "number" &&
    typeof (value as Record<string, unknown>)["arrayBuffer"] === "function"
  );
}

function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

/** Probes the REAL pixel dimensions of the confined target reference image with the bundled ffprobe — client-reported dimensions are never accepted as proof. */
async function probeTargetDimensions(
  absolutePath: string
): Promise<{ width: number; height: number } | null> {
  try {
    const probe = (await runFfprobeJson(absolutePath)) as {
      streams?: Array<{ width?: unknown; height?: unknown }>;
    };
    const stream = probe.streams?.find(
      (s) => typeof s.width === "number" && typeof s.height === "number"
    );
    if (!stream) return null;
    const width = stream.width as number;
    const height = stream.height as number;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}

export async function confirmCameraSnapshot(input: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  jobId: number;
  refId: number;
  imageFile: File;
}): Promise<ConfirmCameraSnapshotResult> {
  const { projectId, sequenceId, shotId, jobId, refId, imageFile } = input;

  if (![projectId, sequenceId, shotId, jobId, refId].every(isValidId)) {
    return { ok: false, error: "Invalid identifiers." };
  }

  // ── Ownership chain: Project -> Sequence -> Shot ────────────────────────
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Shot not found." };
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return { ok: false, error: "Shot not found." };
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return { ok: false, error: "Shot not found." };

  // ── Target reference belongs to this Shot ───────────────────────────────
  const [targetRef] = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, refId));
  if (!targetRef || targetRef.shotId !== shotId) {
    return { ok: false, error: "Target reference image not found for this Shot." };
  }

  // ── PLY job belongs to this Shot, done, and still admissible ────────────
  const [job] = await db
    .select({
      id: generationJobs.id,
      shotId: generationJobs.shotId,
      status: generationJobs.status,
      outputPath: generationJobs.outputPath,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));
  if (!job || extractEligiblePlyOutput(job, shotId) === null) {
    return { ok: false, error: "Gaussian PLY job not found or not eligible for this Shot." };
  }

  // ── Confine and probe the target reference's REAL dimensions ────────────
  if (!isConfinableUploadsPath(targetRef.imagePath)) {
    return { ok: false, error: "The target reference image path cannot be used." };
  }
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const targetAbsolute = path.resolve(process.cwd(), "public", targetRef.imagePath);
  let targetReal: string;
  let uploadsRootReal: string;
  try {
    uploadsRootReal = await fs.realpath(uploadsRoot);
    targetReal = await fs.realpath(targetAbsolute);
  } catch {
    return { ok: false, error: "The target reference image could not be read." };
  }
  if (!targetReal.startsWith(uploadsRootReal + path.sep)) {
    return { ok: false, error: "The target reference image path cannot be used." };
  }
  const targetDimensions = await probeTargetDimensions(targetReal);
  if (!targetDimensions) {
    return { ok: false, error: "The target reference image's real dimensions could not be established." };
  }

  // ── Validate the uploaded PNG bytes against the probed dimensions ───────
  if (!isFileLike(imageFile) || imageFile.size <= 0) {
    return { ok: false, error: "No captured snapshot was provided." };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await imageFile.arrayBuffer());
  } catch {
    return { ok: false, error: "The captured snapshot could not be read." };
  }
  const pngCheck = validateSnapshotPng(buffer, targetDimensions);
  if (!pngCheck.ok) return { ok: false, error: pngCheck.error };

  // ── Publish: temp file then atomic rename, server-generated name ────────
  const relativeDir = `uploads/reference-images/shot-${shotId}`;
  const filename = `gaussian-camera-${randomUUID()}.png`;
  const relativePath = `${relativeDir}/${filename}`;
  const absoluteDir = path.resolve(process.cwd(), "public", relativeDir);
  const finalAbsolute = path.join(absoluteDir, filename);
  const tmpAbsolute = `${finalAbsolute}.tmp.png`;

  // Centralized, honest cleanup: collects every failed removal with its
  // path so a publish failure can never silently leave an orphan behind a
  // clean-looking error.
  async function cleanupPublishAttempt(): Promise<string[]> {
    const cleanupFailures: string[] = [];
    for (const p of [tmpAbsolute, finalAbsolute]) {
      try {
        await fs.rm(p, { force: true });
      } catch (rmErr) {
        cleanupFailures.push(
          `"${p}": ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`
        );
      }
    }
    return cleanupFailures;
  }

  function publishFailure(step: string, err: unknown, cleanupFailures: string[]): ConfirmCameraSnapshotResult {
    const base = `${step}: ${err instanceof Error ? err.message : "unknown error"}.`;
    if (cleanupFailures.length === 0) return { ok: false, error: base };
    return {
      ok: false,
      error: `${base} Additionally, cleanup failed and stray file(s) may remain — ${cleanupFailures.join("; ")}.`,
    };
  }

  try {
    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(tmpAbsolute, buffer, { flag: "wx" });
  } catch (err) {
    return publishFailure("Failed to store the snapshot file", err, await cleanupPublishAttempt());
  }

  // Decodability gate on the WRITTEN bytes: the pure IHDR parser is only a
  // fast rejection — a signature+IHDR-only buffer is not a displayable PNG.
  // The bundled ffprobe must decode an image stream from the temp file with
  // dimensions strictly equal to the probed target before anything is
  // published or inserted.
  const writtenDimensions = await probeTargetDimensions(tmpAbsolute);
  const fullyDecodable =
    writtenDimensions !== null && (await isFullyDecodableImage(tmpAbsolute));
  if (
    !writtenDimensions ||
    !fullyDecodable ||
    writtenDimensions.width !== targetDimensions.width ||
    writtenDimensions.height !== targetDimensions.height
  ) {
    const cleanupFailures = await cleanupPublishAttempt();
    const reason = !writtenDimensions || !fullyDecodable
      ? "The captured file is not a decodable PNG image (truncated or corrupt)."
      : `The decoded snapshot is ${writtenDimensions.width} x ${writtenDimensions.height} but the target reference image is ${targetDimensions.width} x ${targetDimensions.height}.`;
    if (cleanupFailures.length === 0) return { ok: false, error: reason };
    return {
      ok: false,
      error: `${reason} Additionally, cleanup failed and stray file(s) may remain — ${cleanupFailures.join("; ")}.`,
    };
  }

  try {
    await fs.rename(tmpAbsolute, finalAbsolute);
  } catch (err) {
    return publishFailure("Failed to publish the snapshot file", err, await cleanupPublishAttempt());
  }

  // ── DB write in one synchronous transaction; compensate the file on
  //    failure — never a success with a dangling or orphaned state ─────────
  const targetLabel = targetRef.label ?? targetRef.sourceFilename ?? `reference #${refId}`;
  let referenceId: number | null = null;
  try {
    db.transaction((tx) => {
      const [{ maxOrder }] = tx
        .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
        .from(shotReferenceImages)
        .where(eq(shotReferenceImages.shotId, shotId))
        .all();
      const [inserted] = tx
        .insert(shotReferenceImages)
        .values({
          shotId,
          orderIndex: maxOrder + 1,
          imagePath: relativePath,
          sourceFilename: "gaussian-camera-snapshot.png",
          label: "Gaussian Camera Snapshot",
          imageRole: "camera",
          notes: `Captured in Gaussian Camera from PLY job #${jobId}, framed against "${targetLabel}" (reference #${refId}) at ${pngCheck.width} x ${pngCheck.height}.`,
        })
        .returning({ id: shotReferenceImages.id })
        .all();
      referenceId = inserted.id;
    });
  } catch (err) {
    const dbMessage = err instanceof Error ? err.message : "database error";
    try {
      await fs.unlink(finalAbsolute);
    } catch (cleanupErr) {
      return {
        ok: false,
        error: `Saving the snapshot failed (${dbMessage}), and cleanup of the stored file also failed — a stray file may remain at ${relativePath}: ${cleanupErr instanceof Error ? cleanupErr.message : "unknown error"}.`,
      };
    }
    return { ok: false, error: `Saving the snapshot failed: ${dbMessage}.` };
  }

  if (referenceId === null) {
    // Defensive: the transaction committed but produced no id — report
    // honestly instead of fabricating a success.
    return { ok: false, error: "Saving the snapshot produced no reference id. Please check the Shot's Reference Images." };
  }

  const shotDetailPath = `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;
  revalidatePath(shotDetailPath);
  revalidatePath(`${shotDetailPath}/camera-lab`);

  return { ok: true, referenceId, width: pngCheck.width, height: pngCheck.height };
}
