"use server";

import { db } from "@/db";
import { motionBeats, shots, sequences } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

const VALID_BEAT_TYPES = [
  "action",
  "camera",
  "performance",
  "transition",
  "continuity",
  "other",
] as const;
type BeatType = (typeof VALID_BEAT_TYPES)[number];

const VALID_TIMING_POSITIONS = ["start", "middle", "end"] as const;
type TimingPosition = (typeof VALID_TIMING_POSITIONS)[number];

function isValidBeatType(value: string): value is BeatType {
  return (VALID_BEAT_TYPES as readonly string[]).includes(value);
}

function isValidTimingPosition(value: string): value is TimingPosition {
  return (VALID_TIMING_POSITIONS as readonly string[]).includes(value);
}

async function verifyChain(
  shotId: number,
  sequenceId: number,
  projectId: number
): Promise<boolean> {
  const [shot] = await db
    .select({ id: shots.id, sequenceId: shots.sequenceId })
    .from(shots)
    .where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return false;

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return false;

  return true;
}

export async function createMotionBeat(
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  const beatType = formData.get("beatType")?.toString() ?? "";
  if (!isValidBeatType(beatType)) return;

  const label = formData.get("label")?.toString().trim() ?? "";
  if (!label) return;

  const description = formData.get("description")?.toString().trim() || null;

  const timingPositionRaw = formData.get("timingPosition")?.toString().trim() ?? "";
  const timingPosition =
    timingPositionRaw && isValidTimingPosition(timingPositionRaw)
      ? timingPositionRaw
      : null;

  const result = await db
    .select({ maxOrder: sql<number>`max(${motionBeats.orderIndex})` })
    .from(motionBeats)
    .where(eq(motionBeats.shotId, shotId));
  const orderIndex = (result[0]?.maxOrder ?? -1) + 1;

  await db
    .insert(motionBeats)
    .values({ shotId, beatType, label, description, timingPosition, orderIndex });

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function updateMotionBeat(
  beatId: number,
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const [beat] = await db
    .select({ id: motionBeats.id, shotId: motionBeats.shotId })
    .from(motionBeats)
    .where(eq(motionBeats.id, beatId));
  if (!beat || beat.shotId !== shotId) return;

  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  const beatType = formData.get("beatType")?.toString() ?? "";
  if (!isValidBeatType(beatType)) return;

  const label = formData.get("label")?.toString().trim() ?? "";
  if (!label) return;

  const description = formData.get("description")?.toString().trim() || null;

  const timingPositionRaw = formData.get("timingPosition")?.toString().trim() ?? "";
  const timingPosition =
    timingPositionRaw && isValidTimingPosition(timingPositionRaw)
      ? timingPositionRaw
      : null;

  await db
    .update(motionBeats)
    .set({ beatType, label, description, timingPosition, updatedAt: new Date().toISOString() })
    .where(eq(motionBeats.id, beatId));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function deleteMotionBeat(
  beatId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [beat] = await db
    .select({ id: motionBeats.id, shotId: motionBeats.shotId })
    .from(motionBeats)
    .where(eq(motionBeats.id, beatId));
  if (!beat || beat.shotId !== shotId) return;

  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  await db.delete(motionBeats).where(eq(motionBeats.id, beatId));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}
