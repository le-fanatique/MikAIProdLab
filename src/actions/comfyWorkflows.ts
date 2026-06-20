"use server";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { validateComfyWorkflowJson } from "@/lib/comfy/parseWorkflow";

const WORKFLOW_KINDS = ["image", "video"] as const;
const MAX_WORKFLOW_JSON_LENGTH = 5_000_000;

type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

function isWorkflowKind(value: string): value is WorkflowKind {
  return (WORKFLOW_KINDS as readonly string[]).includes(value);
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

  await db.insert(comfyWorkflows).values({
    name,
    kind,
    description,
    workflowJson: raw,
    sourceFilename,
  });

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

  await db
    .update(comfyWorkflows)
    .set({
      name,
      kind,
      description,
      workflowJson: finalJson,
      sourceFilename: finalSourceFilename,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(comfyWorkflows.id, workflowId));

  redirect(`/settings/workflows/${workflowId}`);
}

export async function deleteComfyWorkflow(workflowId: number) {
  const [existing] = await db
    .select({ id: comfyWorkflows.id })
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, workflowId));

  if (!existing) redirect("/settings/workflows?error=not_found");

  await db.delete(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));

  redirect("/settings/workflows");
}
