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

const VALID_FIELDS = ["description", "notes"] as const;
type DescriptionField = (typeof VALID_FIELDS)[number];
const VALID_MODES = ["replace", "append"] as const;
type UpdateMode = (typeof VALID_MODES)[number];

export async function updateAssetDescriptionField(
  assetId: number,
  projectId: number,
  formData: FormData
): Promise<void> {
  const rawField = formData.get("field")?.toString() ?? "";
  const rawMode = formData.get("mode")?.toString() ?? "";
  const content = formData.get("content")?.toString().trim() ?? "";
  const returnTo =
    formData.get("returnTo")?.toString() || `/projects/${projectId}/assets/${assetId}`;

  if (!(VALID_FIELDS as readonly string[]).includes(rawField)) {
    redirect(`${returnTo}?assetDescriptionError=invalid`);
  }
  if (!(VALID_MODES as readonly string[]).includes(rawMode)) {
    redirect(`${returnTo}?assetDescriptionError=invalid`);
  }

  const field = rawField as DescriptionField;
  const mode = rawMode as UpdateMode;

  if (!content) {
    redirect(`${returnTo}?assetDescriptionError=empty`);
  }

  const [existing] = await db
    .select({ description: assets.description, notes: assets.notes, projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, assetId));

  if (!existing || existing.projectId !== projectId) {
    redirect(`${returnTo}?assetDescriptionError=notfound`);
  }

  let newValue: string;
  if (mode === "replace") {
    newValue = content;
  } else {
    const current = (existing[field] ?? "").trim();
    newValue = current ? `${current}\n\n${content}` : content;
  }

  await db
    .update(assets)
    .set({ [field]: newValue, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, assetId));

  const feedbackParam = field === "description" ? "descriptionUpdated=1" : "notesUpdated=1";
  redirect(`${returnTo}?${feedbackParam}`);
}
