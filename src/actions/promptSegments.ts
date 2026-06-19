"use server";

import { db } from "@/db";
import { promptSegments, shots, sequences } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

const VALID_SEGMENT_TYPES = [
  "shot",
  "action",
  "camera",
  "transition",
  "other",
] as const;
type SegmentType = (typeof VALID_SEGMENT_TYPES)[number];

function isValidSegmentType(value: string): value is SegmentType {
  return (VALID_SEGMENT_TYPES as readonly string[]).includes(value);
}

function parseOptionalFloat(raw: string): number | null {
  if (raw === "") return null;
  const n = parseFloat(raw);
  if (isNaN(n) || n < 0) return null;
  return n;
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

function parseFields(formData: FormData) {
  const label = formData.get("label")?.toString().trim() ?? "";
  const promptText = formData.get("promptText")?.toString().trim() ?? "";
  const startSeconds = parseOptionalFloat(
    formData.get("startSeconds")?.toString().trim() ?? ""
  );
  const durationSeconds = parseOptionalFloat(
    formData.get("durationSeconds")?.toString().trim() ?? ""
  );
  const segmentTypeRaw = formData.get("segmentType")?.toString().trim() ?? "";
  const segmentType =
    segmentTypeRaw && isValidSegmentType(segmentTypeRaw)
      ? segmentTypeRaw
      : null;
  const notes = formData.get("notes")?.toString().trim() || null;
  return { label, promptText, startSeconds, durationSeconds, segmentType, notes };
}

export async function createPromptSegment(
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  const { label, promptText, startSeconds, durationSeconds, segmentType, notes } =
    parseFields(formData);
  if (!label || !promptText) return;

  const result = await db
    .select({ maxOrder: sql<number>`max(${promptSegments.orderIndex})` })
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shotId));
  const orderIndex = (result[0]?.maxOrder ?? -1) + 1;

  await db.insert(promptSegments).values({
    shotId,
    orderIndex,
    label,
    promptText,
    startSeconds,
    durationSeconds,
    segmentType,
    notes,
  });

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function updatePromptSegment(
  segmentId: number,
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const [segment] = await db
    .select({ id: promptSegments.id, shotId: promptSegments.shotId })
    .from(promptSegments)
    .where(eq(promptSegments.id, segmentId));
  if (!segment || segment.shotId !== shotId) return;

  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  const { label, promptText, startSeconds, durationSeconds, segmentType, notes } =
    parseFields(formData);
  if (!label || !promptText) return;

  await db
    .update(promptSegments)
    .set({
      label,
      promptText,
      startSeconds,
      durationSeconds,
      segmentType,
      notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(promptSegments.id, segmentId));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function deletePromptSegment(
  segmentId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [segment] = await db
    .select({ id: promptSegments.id, shotId: promptSegments.shotId })
    .from(promptSegments)
    .where(eq(promptSegments.id, segmentId));
  if (!segment || segment.shotId !== shotId) return;

  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  await db.delete(promptSegments).where(eq(promptSegments.id, segmentId));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function movePromptSegmentUp(
  segmentId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [segment] = await db
    .select({ id: promptSegments.id, shotId: promptSegments.shotId })
    .from(promptSegments)
    .where(eq(promptSegments.id, segmentId));
  if (!segment || segment.shotId !== shotId) return;

  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  const rows = await db
    .select({ id: promptSegments.id, orderIndex: promptSegments.orderIndex })
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shotId))
    .orderBy(asc(promptSegments.orderIndex));

  const idx = rows.findIndex((r) => r.id === segmentId);
  if (idx <= 0) {
    redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  }

  const current = rows[idx];
  const prev = rows[idx - 1];

  await db
    .update(promptSegments)
    .set({ orderIndex: prev.orderIndex })
    .where(eq(promptSegments.id, current.id));
  await db
    .update(promptSegments)
    .set({ orderIndex: current.orderIndex })
    .where(eq(promptSegments.id, prev.id));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function movePromptSegmentDown(
  segmentId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [segment] = await db
    .select({ id: promptSegments.id, shotId: promptSegments.shotId })
    .from(promptSegments)
    .where(eq(promptSegments.id, segmentId));
  if (!segment || segment.shotId !== shotId) return;

  if (!(await verifyChain(shotId, sequenceId, projectId))) return;

  const rows = await db
    .select({ id: promptSegments.id, orderIndex: promptSegments.orderIndex })
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shotId))
    .orderBy(asc(promptSegments.orderIndex));

  const idx = rows.findIndex((r) => r.id === segmentId);
  if (idx < 0 || idx >= rows.length - 1) {
    redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  }

  const current = rows[idx];
  const next = rows[idx + 1];

  await db
    .update(promptSegments)
    .set({ orderIndex: next.orderIndex })
    .where(eq(promptSegments.id, current.id));
  await db
    .update(promptSegments)
    .set({ orderIndex: current.orderIndex })
    .where(eq(promptSegments.id, next.id));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}
