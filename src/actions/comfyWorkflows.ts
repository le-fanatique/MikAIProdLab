"use server";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { validateComfyWorkflowJson } from "@/lib/comfy/parseWorkflow";
import {
  WORKFLOW_KINDS,
  WORKFLOW_STATUSES,
  type WorkflowKind,
  type WorkflowStatus,
  isWorkflowCategoryId,
  parseTagsInput,
  validateWorkflowContexts,
  validateWorkflowTags,
} from "@/lib/comfy/workflowCatalog";
import {
  saveReferenceImage,
  deleteStoredReferenceImage,
  SaveReferenceImageError,
} from "@/lib/uploadImage";

const MAX_WORKFLOW_JSON_LENGTH = 5_000_000;
const THUMBNAIL_SUBFOLDER = "workflow-thumbnails";

function isWorkflowKind(value: string): value is WorkflowKind {
  return (WORKFLOW_KINDS as readonly string[]).includes(value);
}

function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

function mapThumbnailUploadError(error: unknown): string {
  if (error instanceof SaveReferenceImageError) {
    switch (error.code) {
      case "missing_file": return "thumbnail_missing_file";
      case "invalid_file": return "thumbnail_invalid_file";
      case "file_too_large": return "thumbnail_too_large";
      case "invalid_file_type": return "thumbnail_invalid_type";
    }
  }
  return "thumbnail_invalid_file";
}

type CatalogFields = {
  category: string | null;
  tags: string | null;
  contexts: string | null;
  status: WorkflowStatus;
};

/**
 * Reads and validates the four catalog text fields (§4.1). Returns the error
 * code to redirect with, or the validated values to write.
 */
function readCatalogFields(formData: FormData): { error: string | null; value: CatalogFields | null } {
  const categoryRaw = getString(formData, "category");
  let category: string | null = null;
  if (categoryRaw.length > 0) {
    if (!isWorkflowCategoryId(categoryRaw)) {
      return { error: "invalid_category", value: null };
    }
    category = categoryRaw;
  }

  const tagsRaw = getString(formData, "tags");
  let tags: string | null = null;
  if (tagsRaw.length > 0) {
    const parsedTags = parseTagsInput(tagsRaw);
    if (parsedTags.length > 0) {
      const tagsResult = validateWorkflowTags(JSON.stringify(parsedTags));
      if (!tagsResult.ok) return { error: "invalid_tags", value: null };
      tags = JSON.stringify(tagsResult.value);
    }
  }

  // Checkboxes: an unchecked box submits nothing at all. No box checked ->
  // no "contexts" entries -> NULL, meaning "offered everywhere the kind
  // allows" — the pre-catalog default. This is deliberate (ticket §4.1):
  // never coerce the absence of a selection into an empty array.
  const contextsList = formData.getAll("contexts").map((v) => v.toString());
  let contexts: string | null = null;
  if (contextsList.length > 0) {
    const contextsResult = validateWorkflowContexts(JSON.stringify(contextsList));
    if (!contextsResult.ok) return { error: "invalid_contexts", value: null };
    contexts = JSON.stringify(contextsResult.value);
  }

  const statusRaw = getString(formData, "status");
  let status: WorkflowStatus = "active";
  if (statusRaw.length > 0) {
    if (!isWorkflowStatus(statusRaw)) return { error: "invalid_status", value: null };
    status = statusRaw;
  }

  return { error: null, value: { category, tags, contexts, status } };
}

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? "";
}

async function readWorkflowJson(
  formData: FormData,
  fallbackJson?: string
): Promise<{ raw: string; sourceFilename: string | null; error: string | null }> {
  const fileValue = formData.get("workflowFile");

  // Duck-type File to avoid TypeScript global availability issues
  if (
    fileValue !== null &&
    typeof fileValue === "object" &&
    "size" in fileValue &&
    "text" in fileValue &&
    "name" in fileValue
  ) {
    const file = fileValue as { size: number; text: () => Promise<string>; name: string };
    if (file.size > 0) {
      if (file.size > MAX_WORKFLOW_JSON_LENGTH) {
        return { raw: "", sourceFilename: null, error: "too_large" };
      }
      const raw = await file.text();
      const sourceFilename = file.name || null;
      if (raw.length > MAX_WORKFLOW_JSON_LENGTH) {
        return { raw: "", sourceFilename: null, error: "too_large" };
      }
      return { raw, sourceFilename, error: null };
    }
  }

  // Fallback to textarea
  const textareaJson = getString(formData, "workflowJson");
  if (textareaJson.length > 0) {
    if (textareaJson.length > MAX_WORKFLOW_JSON_LENGTH) {
      return { raw: "", sourceFilename: null, error: "too_large" };
    }
    return { raw: textareaJson, sourceFilename: null, error: null };
  }

  // Fallback to existing JSON (update only)
  if (fallbackJson !== undefined) {
    return { raw: fallbackJson, sourceFilename: null, error: null };
  }

  return { raw: "", sourceFilename: null, error: "missing_json" };
}

export async function createComfyWorkflow(formData: FormData) {
  const name = getString(formData, "name");
  const kind = getString(formData, "kind");
  const description = getString(formData, "description") || null;

  if (!name) redirect("/settings/workflows/new?error=missing_name");
  if (!isWorkflowKind(kind)) redirect("/settings/workflows/new?error=invalid_kind");

  const { raw, sourceFilename, error } = await readWorkflowJson(formData);

  if (error === "missing_json") redirect("/settings/workflows/new?error=missing_json");
  if (error === "too_large") redirect("/settings/workflows/new?error=too_large");
  if (!validateComfyWorkflowJson(raw)) redirect("/settings/workflows/new?error=invalid_json");

  const { error: catalogError, value: catalog } = readCatalogFields(formData);
  if (catalogError || !catalog) redirect(`/settings/workflows/new?error=${catalogError}`);

  const thumbnailFile = formData.get("thumbnailFile");
  const hasThumbnail =
    thumbnailFile !== null &&
    typeof thumbnailFile === "object" &&
    "size" in thumbnailFile &&
    (thumbnailFile as { size: number }).size > 0;

  let thumbnailPath: string | null = null;
  let thumbnailSourceFilename: string | null = null;

  if (hasThumbnail) {
    try {
      const result = await saveReferenceImage(thumbnailFile, THUMBNAIL_SUBFOLDER);
      thumbnailPath = result.imagePath;
      thumbnailSourceFilename = result.sourceFilename;
    } catch (err) {
      redirect(`/settings/workflows/new?error=${mapThumbnailUploadError(err)}`);
    }
  }

  try {
    await db.insert(comfyWorkflows).values({
      name,
      kind,
      description,
      workflowJson: raw,
      sourceFilename,
      category: catalog.category,
      tags: catalog.tags,
      contexts: catalog.contexts,
      status: catalog.status,
      thumbnailPath,
      thumbnailSourceFilename,
    });
  } catch {
    if (thumbnailPath) await deleteStoredReferenceImage(thumbnailPath);
    redirect("/settings/workflows/new?error=insert_failed");
  }

  redirect("/settings/workflows");
}

export async function updateComfyWorkflow(workflowId: number, formData: FormData) {
  const [existing] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, workflowId));

  if (!existing) redirect("/settings/workflows?error=not_found");

  const name = getString(formData, "name");
  const kind = getString(formData, "kind");
  const description = getString(formData, "description") || null;

  if (!name) redirect(`/settings/workflows/${workflowId}/edit?error=missing_name`);
  if (!isWorkflowKind(kind)) redirect(`/settings/workflows/${workflowId}/edit?error=invalid_kind`);

  // Determine which JSON source to use:
  // file > textarea > fallback (existing)
  const fileValue = formData.get("workflowFile");
  const hasFile =
    fileValue !== null &&
    typeof fileValue === "object" &&
    "size" in fileValue &&
    (fileValue as { size: number }).size > 0;

  const textareaJson = getString(formData, "workflowJson");
  const hasTextarea = textareaJson.length > 0;

  let finalJson = existing.workflowJson;
  let finalSourceFilename = existing.sourceFilename;

  if (hasFile || hasTextarea) {
    const fallback = hasFile || hasTextarea ? undefined : existing.workflowJson;
    const { raw, sourceFilename, error } = await readWorkflowJson(formData, fallback);

    if (error === "missing_json") redirect(`/settings/workflows/${workflowId}/edit?error=missing_json`);
    if (error === "too_large") redirect(`/settings/workflows/${workflowId}/edit?error=too_large`);
    if (!validateComfyWorkflowJson(raw)) redirect(`/settings/workflows/${workflowId}/edit?error=invalid_json`);

    finalJson = raw;
    finalSourceFilename = hasFile ? sourceFilename : null;
  }

  const { error: catalogError, value: catalog } = readCatalogFields(formData);
  if (catalogError || !catalog) redirect(`/settings/workflows/${workflowId}/edit?error=${catalogError}`);

  // Thumbnail (§4.2) — three cases:
  //   1. no file, "Remove thumbnail" unchecked -> keep the existing thumbnail;
  //   2. a new file provided -> it replaces the existing one, the old file is
  //      deleted from disk only after the row update succeeds;
  //   3. "Remove thumbnail" checked (and no new file) -> columns to NULL,
  //      existing file deleted from disk only after the row update succeeds.
  const thumbnailFile = formData.get("thumbnailFile");
  const hasNewThumbnail =
    thumbnailFile !== null &&
    typeof thumbnailFile === "object" &&
    "size" in thumbnailFile &&
    (thumbnailFile as { size: number }).size > 0;
  const removeThumbnail = formData.get("removeThumbnail") === "on";

  let newThumbnailPath: string | null = existing.thumbnailPath;
  let newThumbnailSourceFilename: string | null = existing.thumbnailSourceFilename;

  if (hasNewThumbnail) {
    try {
      const result = await saveReferenceImage(thumbnailFile, THUMBNAIL_SUBFOLDER);
      newThumbnailPath = result.imagePath;
      newThumbnailSourceFilename = result.sourceFilename;
    } catch (err) {
      redirect(`/settings/workflows/${workflowId}/edit?error=${mapThumbnailUploadError(err)}`);
    }
  } else if (removeThumbnail) {
    newThumbnailPath = null;
    newThumbnailSourceFilename = null;
  }

  try {
    await db
      .update(comfyWorkflows)
      .set({
        name,
        kind,
        description,
        workflowJson: finalJson,
        sourceFilename: finalSourceFilename,
        category: catalog.category,
        tags: catalog.tags,
        contexts: catalog.contexts,
        status: catalog.status,
        thumbnailPath: newThumbnailPath,
        thumbnailSourceFilename: newThumbnailSourceFilename,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(comfyWorkflows.id, workflowId));
  } catch {
    // The row update failed: the file we just wrote (if any) is orphaned,
    // not the row — clean it up, never touch the existing thumbnail.
    if (hasNewThumbnail && newThumbnailPath) await deleteStoredReferenceImage(newThumbnailPath);
    redirect(`/settings/workflows/${workflowId}/edit?error=update_failed`);
  }

  // Only after the update succeeded is it safe to remove the old file — a
  // file pointing nowhere is repairable, a row pointing at a missing file is
  // not (ticket §4.2 / .claude/rules/database.md).
  if ((hasNewThumbnail || removeThumbnail) && existing.thumbnailPath) {
    await deleteStoredReferenceImage(existing.thumbnailPath);
  }

  redirect(`/settings/workflows/${workflowId}`);
}

export async function deleteComfyWorkflow(workflowId: number) {
  const [existing] = await db
    .select({ id: comfyWorkflows.id, thumbnailPath: comfyWorkflows.thumbnailPath })
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, workflowId));

  if (!existing) redirect("/settings/workflows?error=not_found");

  await db.delete(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));

  if (existing.thumbnailPath) await deleteStoredReferenceImage(existing.thumbnailPath);

  redirect("/settings/workflows");
}
