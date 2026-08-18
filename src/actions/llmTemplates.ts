"use server";

// ---------------------------------------------------------------------------
// llmTemplates.ts — LLMW.STORAGE.1 (B6a), widened by LLMW.EDITOR.CORE.1 (E1a)
//
// Write side for `llm_templates` (`src/db/schema/llmWorkspace.ts`). Five
// paths now:
//   - createLlmTemplateFromDescriptor — duplicate one of the eight code
//     descriptors into an editable row. The primary creation path: without
//     it, the only way to get a template would be importing a file nobody
//     yet owns.
//   - importLlmTemplate — a JSON file, validated by
//     `templateStorage.ts`'s `validateLlmTemplateJson`.
//   - updateLlmTemplateMetadata — name / description / projectId only. No
//     JSON edit here — that is `updateLlmTemplateContent` below (E1a) and the
//     editor screen it will back (E1b).
//   - updateLlmTemplateContent (E1a) — the one path that touches
//     `templateJson` after creation. It does not accept a descriptor: it
//     accepts a *patch* of the editable surface only
//     (`templateEditor.ts`'s `EditableTemplatePatch`), narrows it, merges it
//     onto the stored descriptor (`applyEditablePatch` — the one place the
//     coupled triangle `anchor`/`output`/`commit`/`messages`/`preconditions`
//     is guaranteed to pass through unchanged), and refuses to write unless
//     the merged result passes `validateLlmTemplateJson` — the one portal.
//     See `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md` §4 (E1) for why the
//     triangle stays out of scope.
//   - deleteLlmTemplate — by id, refusing silently-successful deletion of a
//     row that does not exist.
//
// Convention imitated literally: `src/actions/comfyWorkflows.ts` — same
// `redirect(...)` + `?error=` shape, same duck-typed file read, same
// named-constant size ceiling.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { llmTemplates, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import { applyEditablePatch, parseEditableTemplatePatch } from "@/lib/llmWorkspace/templateEditor";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

const MAX_TEMPLATE_JSON_LENGTH = 5_000_000; // mirrors MAX_WORKFLOW_JSON_LENGTH (comfyWorkflows.ts)

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? "";
}

/** Duplicates one of the eight code descriptors into an editable `llm_templates` row. */
export async function createLlmTemplateFromDescriptor(descriptorId: string) {
  const descriptor = (DESCRIPTORS as Record<string, OperationDescriptor>)[descriptorId];
  if (!descriptor) redirect("/settings/llm-workflows?error=unknown_descriptor");

  await db.insert(llmTemplates).values({
    name: descriptor.name,
    description: null,
    anchorKind: descriptor.anchor.entity,
    projectId: null,
    templateJson: JSON.stringify(descriptor),
    sourceFilename: null,
  });

  redirect("/settings/llm-workflows");
}

async function readTemplateJson(
  formData: FormData
): Promise<{ raw: string; sourceFilename: string | null; error: string | null }> {
  const fileValue = formData.get("templateFile");

  // Duck-type File to avoid TypeScript global availability issues, same as readWorkflowJson.
  if (
    fileValue !== null &&
    typeof fileValue === "object" &&
    "size" in fileValue &&
    "text" in fileValue &&
    "name" in fileValue
  ) {
    const file = fileValue as { size: number; text: () => Promise<string>; name: string };
    if (file.size > 0) {
      if (file.size > MAX_TEMPLATE_JSON_LENGTH) return { raw: "", sourceFilename: null, error: "too_large" };
      const raw = await file.text();
      const sourceFilename = file.name || null;
      if (raw.length > MAX_TEMPLATE_JSON_LENGTH) return { raw: "", sourceFilename: null, error: "too_large" };
      return { raw, sourceFilename, error: null };
    }
  }

  return { raw: "", sourceFilename: null, error: "missing_json" };
}

/** Imports a JSON file, validated by `validateLlmTemplateJson` before it is stored. */
export async function importLlmTemplate(formData: FormData) {
  const { raw, sourceFilename, error } = await readTemplateJson(formData);

  if (error === "missing_json") redirect("/settings/llm-workflows?error=missing_json");
  if (error === "too_large") redirect("/settings/llm-workflows?error=too_large");

  const result = validateLlmTemplateJson(raw);
  if (!result.ok) {
    redirect(`/settings/llm-workflows?error=invalid_json&detail=${encodeURIComponent(result.reason)}`);
  }

  await db.insert(llmTemplates).values({
    name: result.descriptor.name,
    description: null,
    anchorKind: result.descriptor.anchor.entity,
    projectId: null,
    templateJson: raw,
    sourceFilename,
  });

  redirect("/settings/llm-workflows");
}

/** Updates only name / description / projectId of an existing row. Never the stored JSON. */
export async function updateLlmTemplateMetadata(templateId: number, formData: FormData) {
  const [existing] = await db.select({ id: llmTemplates.id }).from(llmTemplates).where(eq(llmTemplates.id, templateId));
  if (!existing) redirect("/settings/llm-workflows?error=not_found");

  const name = getString(formData, "name");
  const description = getString(formData, "description") || null;
  const projectIdRaw = getString(formData, "projectId");

  if (!name) redirect("/settings/llm-workflows?error=missing_name");

  // R2 (supervisor review, tour 1): `projectId` is an untrusted foreign key
  // reference — an empty value means "Global" (null), but a non-integer or
  // a nonexistent project id must be refused before the write, not let
  // SQLite's `foreign_keys = ON` (src/db/index.ts:22) throw a 500.
  let projectId: number | null = null;
  if (projectIdRaw) {
    const parsed = parseInt(projectIdRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      redirect("/settings/llm-workflows?error=invalid_project");
    }
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, parsed));
    if (!project) redirect("/settings/llm-workflows?error=invalid_project");
    projectId = parsed;
  }

  await db
    .update(llmTemplates)
    .set({
      name,
      description,
      projectId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(llmTemplates.id, templateId));

  redirect("/settings/llm-workflows");
}

/**
 * Updates `templateJson`, and only the editable surface of it —
 * `.agents/supervised_task.md` §1. `formData`'s `"patch"` field is a JSON
 * string of `EditableTemplatePatch`'s shape (or a superset — see
 * `parseEditableTemplatePatch`, which reads only the eight editable property
 * names off it and ignores the rest, so a patch that also carries `commit` /
 * `output` / `anchor` never has those keys reach `applyEditablePatch`). The
 * merged descriptor is serialized and passed through
 * `validateLlmTemplateJson` before anything is written; a patch that fails
 * validation (an unknown variable id, an unknown render form, a malformed
 * merged shape) is refused and the row is left untouched.
 */
export async function updateLlmTemplateContent(templateId: number, formData: FormData) {
  const [existing] = await db
    .select({ id: llmTemplates.id, templateJson: llmTemplates.templateJson })
    .from(llmTemplates)
    .where(eq(llmTemplates.id, templateId));
  if (!existing) redirect("/settings/llm-workflows?error=not_found");

  const rawPatch = getString(formData, "patch");
  if (!rawPatch) redirect(`/settings/llm-workflows/${templateId}?error=missing_patch`);

  let parsedPatch: unknown;
  try {
    parsedPatch = JSON.parse(rawPatch);
  } catch {
    redirect(`/settings/llm-workflows/${templateId}?error=invalid_patch_json`);
  }

  // The stored row's own `templateJson` was already validated by
  // `validateLlmTemplateJson` at creation/import time (the only two prior
  // writers), so parsing it here is not a second gate — it is reading back a
  // shape already known good, to serve as `applyEditablePatch`'s base.
  const stored = JSON.parse(existing.templateJson) as OperationDescriptor;

  const editablePatch = parseEditableTemplatePatch(parsedPatch);
  const merged = applyEditablePatch(stored, editablePatch);
  const serialized = JSON.stringify(merged);

  const result = validateLlmTemplateJson(serialized);
  if (!result.ok) {
    redirect(`/settings/llm-workflows/${templateId}?error=invalid_json&detail=${encodeURIComponent(result.reason)}`);
  }

  // R1.2 (retake): `name` is part of the editable surface, so a patch may
  // change `descriptor.name` — and the column must move with it, the same
  // invariant `createLlmTemplateFromDescriptor` and `importLlmTemplate` keep.
  // Sourced from the *validated* descriptor (`result.descriptor.name`), never
  // from the raw patch, so a patch that dropped `name` (kept by
  // `applyEditablePatch`'s fallback) still writes the row's true current name.
  await db
    .update(llmTemplates)
    .set({ name: result.descriptor.name, templateJson: serialized, updatedAt: new Date().toISOString() })
    .where(eq(llmTemplates.id, templateId));

  redirect(`/settings/llm-workflows/${templateId}`);
}

/**
 * Deletes an `llm_templates` row by id. Verifies existence first — a
 * deletion that finds nothing redirects with an error; it never succeeds
 * silently (permanent deletion-safety rule).
 */
export async function deleteLlmTemplate(templateId: number) {
  const [existing] = await db.select({ id: llmTemplates.id }).from(llmTemplates).where(eq(llmTemplates.id, templateId));
  if (!existing) redirect("/settings/llm-workflows?error=not_found");

  await db.delete(llmTemplates).where(eq(llmTemplates.id, templateId));

  redirect("/settings/llm-workflows");
}
