"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function createProject(formData: FormData) {
  const name = formData.get("name") as string;
  const pitch = (formData.get("pitch") as string) || null;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "draft";

  if (!name?.trim()) return;

  const [project] = await db
    .insert(projects)
    .values({ name: name.trim(), pitch, description, status: status as "draft" | "active" | "archived" })
    .returning({ id: projects.id });

  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: number, formData: FormData) {
  const name = formData.get("name") as string;
  const pitch = (formData.get("pitch") as string) || null;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "draft";

  if (!name?.trim()) return;

  await db
    .update(projects)
    .set({
      name: name.trim(),
      pitch,
      description,
      status: status as "draft" | "active" | "archived",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id));

  redirect(`/projects/${id}`);
}

export async function deleteProject(id: number) {
  await db.delete(projects).where(eq(projects.id, id));
  redirect("/projects");
}
