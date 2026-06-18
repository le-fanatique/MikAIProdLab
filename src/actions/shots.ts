"use server";

import { db } from "@/db";
import { shots } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function createShot(
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const durationRaw = formData.get("duration_seconds") as string;
  const durationSeconds = durationRaw ? parseFloat(durationRaw) : null;
  const actionPitch = (formData.get("action_pitch") as string) || null;
  const cameraPitch = (formData.get("camera_pitch") as string) || null;
  const continuityNotes = (formData.get("continuity_notes") as string) || null;

  if (!title?.trim()) return;

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const orderIndex = (maxResult?.max ?? -1) + 1;

  await db.insert(shots).values({
    sequenceId,
    title: title.trim(),
    description,
    durationSeconds,
    actionPitch,
    cameraPitch,
    continuityNotes,
    orderIndex,
  });

  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}

export async function updateShot(
  id: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const durationRaw = formData.get("duration_seconds") as string;
  const durationSeconds = durationRaw ? parseFloat(durationRaw) : null;
  const actionPitch = (formData.get("action_pitch") as string) || null;
  const cameraPitch = (formData.get("camera_pitch") as string) || null;
  const continuityNotes = (formData.get("continuity_notes") as string) || null;

  if (!title?.trim()) return;

  await db
    .update(shots)
    .set({
      title: title.trim(),
      description,
      durationSeconds,
      actionPitch,
      cameraPitch,
      continuityNotes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(shots.id, id));

  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}

export async function deleteShot(
  id: number,
  sequenceId: number,
  projectId: number
) {
  await db.delete(shots).where(eq(shots.id, id));
  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}
