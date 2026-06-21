"use server";

import { db } from "@/db";
import { shots, sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function createShot(
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const shotCode = (formData.get("shot_code") as string) || null;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const durationRaw = formData.get("duration_seconds") as string;
  const durationSeconds = durationRaw ? parseFloat(durationRaw) : null;
  const actionPitch = (formData.get("action_pitch") as string) || null;
  const cameraPitch = (formData.get("camera_pitch") as string) || null;
  const continuityNotes = (formData.get("continuity_notes") as string) || null;
  const framing = (formData.get("framing") as string) || null;
  const cameraMovement = (formData.get("camera_movement") as string) || null;
  const continuityIn = (formData.get("continuity_in") as string) || null;
  const continuityOut = (formData.get("continuity_out") as string) || null;

  if (!title?.trim()) return;

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const orderIndex = (maxResult?.max ?? -1) + 1;

  await db.insert(shots).values({
    sequenceId,
    shotCode,
    title: title.trim(),
    description,
    durationSeconds,
    actionPitch,
    cameraPitch,
    continuityNotes,
    framing,
    cameraMovement,
    continuityIn,
    continuityOut,
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
  const shotCode = (formData.get("shot_code") as string) || null;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const durationRaw = formData.get("duration_seconds") as string;
  const durationSeconds = durationRaw ? parseFloat(durationRaw) : null;
  const actionPitch = (formData.get("action_pitch") as string) || null;
  const cameraPitch = (formData.get("camera_pitch") as string) || null;
  const continuityNotes = (formData.get("continuity_notes") as string) || null;
  const framing = (formData.get("framing") as string) || null;
  const cameraMovement = (formData.get("camera_movement") as string) || null;
  const continuityIn = (formData.get("continuity_in") as string) || null;
  const continuityOut = (formData.get("continuity_out") as string) || null;

  if (!title?.trim()) return;

  await db
    .update(shots)
    .set({
      shotCode,
      title: title.trim(),
      description,
      durationSeconds,
      actionPitch,
      cameraPitch,
      continuityNotes,
      framing,
      cameraMovement,
      continuityIn,
      continuityOut,
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

export async function updateShotPrompt(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const shotPromptRaw = formData.get("shotPrompt");
  const shotPrompt = typeof shotPromptRaw === "string" ? shotPromptRaw : "";
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotPromptError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Ownership: shot → sequence → project
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  // Store null when empty (avoids storing empty string)
  const value = shotPrompt.trim() === "" ? null : shotPrompt;

  await db
    .update(shots)
    .set({ shotPrompt: value, updatedAt: new Date().toISOString() })
    .where(eq(shots.id, shotId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotPromptSaved=1`);
}
