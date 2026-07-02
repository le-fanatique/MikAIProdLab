"use server";

import { db } from "@/db";
import { sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";

export async function createSequence(projectId: number, formData: FormData) {
  const title = formData.get("title") as string;
  const summary = (formData.get("summary") as string) || null;
  const description = (formData.get("description") as string) || null;
  const narrativePurpose = (formData.get("narrative_purpose") as string) || null;
  const mood = (formData.get("mood") as string) || null;
  const locationHint = (formData.get("location_hint") as string) || null;
  const sequenceCodeRaw = (formData.get("sequence_code") as string)?.trim() || null;

  if (!title?.trim()) return;

  const [maxResult] = await db
    .select({ max: max(sequences.orderIndex) })
    .from(sequences)
    .where(eq(sequences.projectId, projectId));

  const orderIndex = (maxResult?.max ?? -1) + 1;

  // Auto-generate code if not provided
  let sequenceCode = sequenceCodeRaw;
  if (!sequenceCode) {
    const { sequenceTemplate } = await getNomenclatureSettings();
    const existingCodes = await db
      .select({ sequenceCode: sequences.sequenceCode })
      .from(sequences)
      .where(eq(sequences.projectId, projectId));
    sequenceCode = generateNextCode(sequenceTemplate, existingCodes.map((r) => r.sequenceCode));
  }

  const [seq] = await db
    .insert(sequences)
    .values({
      projectId,
      sequenceCode,
      title: title.trim(),
      summary,
      description,
      narrativePurpose,
      mood,
      locationHint,
      orderIndex,
    })
    .returning({ id: sequences.id });

  redirect(`/projects/${projectId}/sequences/${seq.id}`);
}

export async function updateSequence(
  id: number,
  projectId: number,
  formData: FormData
) {
  const title = formData.get("title") as string;
  const summary = (formData.get("summary") as string) || null;
  const description = (formData.get("description") as string) || null;
  const narrativePurpose = (formData.get("narrative_purpose") as string) || null;
  const mood = (formData.get("mood") as string) || null;
  const locationHint = (formData.get("location_hint") as string) || null;

  if (!title?.trim()) return;

  await db
    .update(sequences)
    .set({
      title: title.trim(),
      summary,
      description,
      narrativePurpose,
      mood,
      locationHint,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sequences.id, id));

  redirect(`/projects/${projectId}/sequences/${id}`);
}

export async function deleteSequence(id: number, projectId: number) {
  await db.delete(sequences).where(eq(sequences.id, id));
  redirect(`/projects/${projectId}`);
}

export async function deleteSequenceAndReturn(sequenceId: number, returnTo: string) {
  await db.delete(sequences).where(eq(sequences.id, sequenceId));
  redirect(returnTo);
}

export async function updateSequenceContext(
  sequenceId: number,
  projectId: number,
  data: {
    summary: string | null;
    description: string | null;
    narrativePurpose: string | null;
    mood: string | null;
    locationHint: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const [seq] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
    if (!seq) return { ok: false, error: "Sequence not found." };
    await db
      .update(sequences)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(sequences.id, sequenceId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save. Please try again." };
  }
}

export async function updateSequencePrompt(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const rawPrompt = formData.get("sequencePrompt");
  const sequencePromptValue = typeof rawPrompt === "string" ? rawPrompt : "";
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequencePromptError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  const value = sequencePromptValue.trim() === "" ? null : sequencePromptValue;

  await db
    .update(sequences)
    .set({ sequencePrompt: value, updatedAt: new Date().toISOString() })
    .where(eq(sequences.id, sequenceId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequencePromptSaved=1`);
}
