"use server";

import { db } from "@/db";
import { sequences, sequenceEditorialItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const MAX_TRIM_SECONDS = 36000; // generic server bound — video duration is client-side only

// ---------------------------------------------------------------------------
// updateEditorialItemTrim — per-item non-destructive trim (editorial layer)
// ---------------------------------------------------------------------------

/**
 * Sets or clears the trim of a "shot" editorial item. Trims live on the item
 * (per occurrence), never on the shot — shots.trim* is legacy and untouched.
 * Gap items are rejected without writing.
 */
export async function updateEditorialItemTrim(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const itemId = parseInt(formData.get("itemId") as string, 10);
  const clearTrim = formData.get("clearTrim") === "1";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/editorial`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(itemId) || itemId <= 0
  ) {
    return;
  }

  // Ownership: sequence → project
  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  // Item must belong to the sequence and be a shot item — gaps carry no trim
  const [item] = await db
    .select({
      id: sequenceEditorialItems.id,
      sequenceId: sequenceEditorialItems.sequenceId,
      type: sequenceEditorialItems.type,
    })
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.id, itemId));
  if (!item || item.sequenceId !== sequenceId) return;
  if (item.type !== "shot") return;

  let trimInSeconds: number | null = null;
  let trimOutSeconds: number | null = null;

  if (!clearTrim) {
    const trimIn = parseFloat((formData.get("trimInSeconds") as string | null) ?? "");
    const trimOut = parseFloat((formData.get("trimOutSeconds") as string | null) ?? "");
    if (
      !Number.isFinite(trimIn) ||
      !Number.isFinite(trimOut) ||
      trimIn < 0 ||
      trimOut <= trimIn ||
      trimOut > MAX_TRIM_SECONDS
    ) {
      // Invalid values — no write, return to the page unchanged
      redirect(returnTo);
    }
    trimInSeconds = trimIn;
    trimOutSeconds = trimOut;
  }

  await db
    .update(sequenceEditorialItems)
    .set({ trimInSeconds, trimOutSeconds, updatedAt: new Date().toISOString() })
    .where(eq(sequenceEditorialItems.id, itemId));

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
}
