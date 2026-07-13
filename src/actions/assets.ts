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

// ── Inline (no redirect) — for batch panel ───────────────────────────────────

export async function updateAssetDescriptionFieldInline(input: {
  assetId: number;
  projectId: number;
  field: "description" | "notes";
  mode: "replace" | "append";
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { assetId, projectId, field, mode } = input;
  const content = input.content.trim();

  if (!(VALID_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: "Invalid field." };
  }
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "Invalid mode." };
  }
  if (!content) {
    return { ok: false, error: "Empty content." };
  }

  const [existing] = await db
    .select({ description: assets.description, notes: assets.notes, projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, assetId));

  if (!existing || existing.projectId !== projectId) {
    return { ok: false, error: "Asset not found." };
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

  return { ok: true };
}

export async function applyBatchAssetDescriptionDraftsInline(input: {
  projectId: number;
  mode: "replace" | "append";
  items: Array<{
    assetId: number;
    descriptionDraft: string;
    notesDraft: string;
  }>;
}): Promise<
  | {
      ok: true;
      applied: Array<{ assetId: number; descriptionApplied: boolean; notesApplied: boolean }>;
      errors: Array<{ assetId: number; error: string }>;
    }
  | { ok: false; error: string }
> {
  const { projectId, mode, items } = input;

  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "Invalid mode." };
  }
  if (items.length === 0) {
    return { ok: false, error: "No items to apply." };
  }
  if (items.length > 10) {
    return { ok: false, error: "Too many items. Limit is 10." };
  }

  const applied: Array<{ assetId: number; descriptionApplied: boolean; notesApplied: boolean }> = [];
  const errors: Array<{ assetId: number; error: string }> = [];

  for (const item of items) {
    try {
      const descDraft = item.descriptionDraft.trim();
      const notesDraft = item.notesDraft.trim();

      if (!descDraft && !notesDraft) {
        errors.push({ assetId: item.assetId, error: "Both drafts are empty." });
        continue;
      }

      const [existing] = await db
        .select({ description: assets.description, notes: assets.notes, projectId: assets.projectId })
        .from(assets)
        .where(eq(assets.id, item.assetId));

      if (!existing || existing.projectId !== projectId) {
        errors.push({ assetId: item.assetId, error: "Asset not found." });
        continue;
      }

      const updates: Record<string, string> = {};

      if (descDraft) {
        if (mode === "replace") {
          updates.description = descDraft;
        } else {
          const current = (existing.description ?? "").trim();
          updates.description = current ? `${current}\n\n${descDraft}` : descDraft;
        }
      }

      if (notesDraft) {
        if (mode === "replace") {
          updates.notes = notesDraft;
        } else {
          const current = (existing.notes ?? "").trim();
          updates.notes = current ? `${current}\n\n${notesDraft}` : notesDraft;
        }
      }

      await db
        .update(assets)
        .set({ ...updates, updatedAt: new Date().toISOString() })
        .where(eq(assets.id, item.assetId));

      applied.push({
        assetId: item.assetId,
        descriptionApplied: Boolean(descDraft),
        notesApplied: Boolean(notesDraft),
      });
    } catch (err) {
      errors.push({
        assetId: item.assetId,
        error: err instanceof Error ? err.message : "Unexpected error.",
      });
    }
  }

  return { ok: true, applied, errors };
}

// ── Inline asset details update (description + notes + Asset Bible fields,
//    no redirect) ─────────────────────────────────────────────────────────

export async function updateAssetDetailsInline(input: {
  assetId: number;
  projectId: number;
  description: string;
  notes: string;
  // Asset Bible (ASSET.BIBLE.1) — optional, independent of description/notes.
  visualIdentity: string;
  usageRules: string;
  forbiddenVariations: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { assetId, projectId, description, notes, visualIdentity, usageRules, forbiddenVariations } = input;

  const [existing] = await db
    .select({ projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, assetId));

  if (!existing || existing.projectId !== projectId) {
    return { ok: false, error: "Asset not found." };
  }

  await db
    .update(assets)
    .set({
      description: description.trim() || null,
      notes: notes.trim() || null,
      visualIdentity: visualIdentity.trim() || null,
      usageRules: usageRules.trim() || null,
      forbiddenVariations: forbiddenVariations.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(assets.id, assetId));

  return { ok: true };
}
