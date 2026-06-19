"use server";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

const VALID_TYPES = [
  "character",
  "environment",
  "prop",
  "vehicle",
  "crowd",
  "other",
] as const;
type AssetType = (typeof VALID_TYPES)[number];

function isValidType(value: string): value is AssetType {
  return (VALID_TYPES as readonly string[]).includes(value);
}

export async function createAsset(projectId: number, formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const type = formData.get("type")?.toString() ?? "";

  if (!name) return;
  if (!isValidType(type)) return;

  const description = formData.get("description")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  const result = await db
    .select({ maxOrder: sql<number>`max(${assets.orderIndex})` })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  const orderIndex = (result[0]?.maxOrder ?? -1) + 1;

  const [created] = await db
    .insert(assets)
    .values({ projectId, name, type, description, notes, orderIndex })
    .returning({ id: assets.id });

  redirect(`/projects/${projectId}/assets/${created.id}`);
}

export async function updateAsset(
  assetId: number,
  projectId: number,
  formData: FormData
) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const type = formData.get("type")?.toString() ?? "";

  if (!name) return;
  if (!isValidType(type)) return;

  const description = formData.get("description")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  await db
    .update(assets)
    .set({ name, type, description, notes, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, assetId));

  redirect(`/projects/${projectId}/assets/${assetId}`);
}

export async function deleteAsset(assetId: number, projectId: number) {
  await db.delete(assets).where(eq(assets.id, assetId));
  redirect(`/projects/${projectId}/assets`);
}
