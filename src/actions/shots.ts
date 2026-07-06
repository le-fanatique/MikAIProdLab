"use server";

import { db } from "@/db";
import { shots, sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveShotPromptWithDefault } from "@/lib/prompts/defaultShotPrompt";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";

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

  // Auto-generate shot code if not provided
  let resolvedShotCode = shotCode;
  if (!resolvedShotCode) {
    const { shotTemplate } = await getNomenclatureSettings();
    const existingCodes = await db
      .select({ shotCode: shots.shotCode })
      .from(shots)
      .where(eq(shots.sequenceId, sequenceId));
    resolvedShotCode = generateNextCode(shotTemplate, existingCodes.map((r) => r.shotCode));
  }

  const shotPrompt = resolveShotPromptWithDefault({ description, actionPitch, cameraPitch });

  await db.insert(shots).values({
    sequenceId,
    shotCode: resolvedShotCode,
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
    shotPrompt,
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

  const [existing] = await db.select({ shotPrompt: shots.shotPrompt }).from(shots).where(eq(shots.id, id));
  const resolvedShotPrompt = resolveShotPromptWithDefault({
    shotPrompt: existing?.shotPrompt,
    description,
    actionPitch,
    cameraPitch,
  });

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
      shotPrompt: resolvedShotPrompt,
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

export async function updateSequenceShotDurations(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));

  if (!sequence || sequence.projectId !== projectId) return;

  const shotList = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  for (const shot of shotList) {
    const raw = formData.get(`duration_${shot.id}`);
    if (raw === null) continue;
    const rawStr = (raw as string).trim();

    let durationSeconds: number | null;
    if (rawStr === "") {
      durationSeconds = null;
    } else {
      const parsed = parseFloat(rawStr);
      if (isNaN(parsed) || parsed < 0) continue;
      durationSeconds = parsed;
    }

    await db
      .update(shots)
      .set({ durationSeconds, updatedAt: new Date().toISOString() })
      .where(eq(shots.id, shot.id));
  }

  // Optional returnTo — defaults to the existing Sequence Detail redirect
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}`;

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// updateSequenceShotOrder — batch rewrite of orderIndex for a sequence
// ---------------------------------------------------------------------------

export async function updateSequenceShotOrder(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const orderedIdsRaw = (formData.get("orderedIds") as string | null) ?? "";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  // Parse ordered ids (comma-separated)
  const orderedIds = orderedIdsRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  // The ordered set must match the sequence's shots exactly:
  // no missing id, no extra id, no duplicate
  const currentShots = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const currentIds = new Set(currentShots.map((s) => s.id));

  if (orderedIds.length !== currentIds.size) return;
  const seen = new Set<number>();
  for (const id of orderedIds) {
    if (seen.has(id) || !currentIds.has(id)) return;
    seen.add(id);
  }

  // Idempotent rewrite 0..n-1 — also flattens any pre-existing collisions
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(shots)
      .set({ orderIndex: i, updatedAt: now })
      .where(eq(shots.id, orderedIds[i]));
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// createPlaceholderShot — minimal editorial placeholder at the end of a sequence
// ---------------------------------------------------------------------------

export async function createPlaceholderShot(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const durationRaw = (formData.get("durationSeconds") as string | null) ?? "";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  const parsedDuration = parseFloat(durationRaw);
  const durationSeconds =
    Number.isFinite(parsedDuration) && parsedDuration > 0 && parsedDuration <= 600
      ? parsedDuration
      : 1.0;

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const orderIndex = (maxResult?.max ?? -1) + 1;

  // Auto-generate shot code with the existing nomenclature logic
  const { shotTemplate } = await getNomenclatureSettings();
  const existingCodes = await db
    .select({ shotCode: shots.shotCode })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const shotCode = generateNextCode(shotTemplate, existingCodes.map((r) => r.shotCode));

  await db.insert(shots).values({
    sequenceId,
    shotCode,
    title: "Placeholder",
    durationSeconds,
    orderIndex,
  });

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
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
