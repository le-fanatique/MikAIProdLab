"use server";

import { db } from "@/db";
import { sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function createSequence(projectId: number, formData: FormData) {
  const title = formData.get("title") as string;
  const summary = (formData.get("summary") as string) || null;
  const description = (formData.get("description") as string) || null;

  if (!title?.trim()) return;

  const [maxResult] = await db
    .select({ max: max(sequences.orderIndex) })
    .from(sequences)
    .where(eq(sequences.projectId, projectId));

  const orderIndex = (maxResult?.max ?? -1) + 1;

  const [seq] = await db
    .insert(sequences)
    .values({ projectId, title: title.trim(), summary, description, orderIndex })
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

  if (!title?.trim()) return;

  await db
    .update(sequences)
    .set({
      title: title.trim(),
      summary,
      description,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sequences.id, id));

  redirect(`/projects/${projectId}/sequences/${id}`);
}

export async function deleteSequence(id: number, projectId: number) {
  await db.delete(sequences).where(eq(sequences.id, id));
  redirect(`/projects/${projectId}`);
}
