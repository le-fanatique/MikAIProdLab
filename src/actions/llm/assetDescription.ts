"use server";

import { db } from "@/db";
import { assets, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";
import { assetNotesGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetNotes";
import { assetDescriptionBatchDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescriptionBatch";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedAssetDescriptionDraft } from "@/types/llm";

const BATCH_LIMIT = 10;

// ── Independent single-field actions (UX.PRODUCTIVITY.POLISH.1 — Lot C) ────
//
// Thin adapters over `runOperation` (LLMW.MIGRATE.FLATJSON.1b, B3b):
// translate `FormData` into `AnchorIds`, then translate `values` back to the
// exact `{ok:true, draft}` return shape their components depend on. Id
// validation, ownership, and context assembly — previously
// `fetchAssetContextInput` (deleted in this same diff, its two callers were
// this file's `generateForAsset` and `generateFieldForAsset`) — now happen
// inside the runner, against each descriptor's own declared `messages`.

async function generateSingleField(
  formData: FormData,
  field: "description" | "notes"
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);

    const descriptor = field === "description" ? assetDescriptionGenerateDescriptor : assetNotesGenerateDescriptor;
    const result = await runOperation(descriptor, { projectId, assetId });
    if (!result.ok) return { ok: false, error: result.error };
    // Both descriptors' `output.kind` is always `"object"` — the guard
    // exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateSingleField: expected an object-kind result.");
    }
    return { ok: true, draft: field === "description" ? result.values.description : result.values.notes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

export async function generateAssetDescriptionOnlyDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  return generateSingleField(formData, "description");
}

export async function generateAssetNotesOnlyDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  return generateSingleField(formData, "notes");
}

// ── Batch action ─────────────────────────────────────────────────────────────

export type BatchAssetDraftResult = {
  assetId: number;
  assetName: string;
  assetType: string;
  hasExistingDescription: boolean;
  hasExistingNotes: boolean;
  draft: GeneratedAssetDescriptionDraft;
};

export type BatchAssetDraftError = {
  assetId: number;
  assetName?: string;
  error: string;
};

/**
 * The batch keeps its own loop (LLMW.MIGRATE.FLATJSON.1b, B3b): reading
 * `assetIds`, refusing beyond `BATCH_LIMIT`, iterating, and applying
 * partially when one item fails is a documented contract (§11.2), not
 * something the runner expresses — `assetDescriptionBatchDescriptor`'s
 * `entitySet` anchor exists for the descriptor's own bookkeeping
 * (`maxSize`), but the runner dispatches on `anchor.entity` alone and never
 * loops itself. Only the *per-asset* pipeline — id/ownership check, context
 * assembly, builder call, parse — is replaced by one `runOperation` call per
 * item, in the same sequential loop as before (to avoid overloading Ollama).
 */
export async function generateBatchAssetDescriptionDrafts(
  formData: FormData
): Promise<
  | {
      ok: true;
      results: BatchAssetDraftResult[];
      errors: BatchAssetDraftError[];
    }
  | { ok: false; error: string }
> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, error: "Invalid request." };
    }

    const rawIds = formData.get("assetIds");
    let assetIds: number[] = [];
    if (typeof rawIds === "string" && rawIds.trim()) {
      try {
        const parsed = JSON.parse(rawIds);
        if (Array.isArray(parsed)) {
          assetIds = parsed
            .map((v) => parseInt(String(v), 10))
            .filter((n) => Number.isInteger(n) && n > 0);
        }
      } catch {
        return { ok: false, error: "Invalid asset selection." };
      }
    }

    if (assetIds.length === 0) {
      return { ok: false, error: "No assets selected." };
    }
    if (assetIds.length > BATCH_LIMIT) {
      return { ok: false, error: `Select up to ${BATCH_LIMIT} assets at a time.` };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const results: BatchAssetDraftResult[] = [];
    const errors: BatchAssetDraftError[] = [];

    // Sequential to avoid overloading Ollama
    for (const assetId of assetIds) {
      try {
        const [assetRow] = await db
          .select({ name: assets.name, type: assets.type, description: assets.description, notes: assets.notes, projectId: assets.projectId })
          .from(assets)
          .where(eq(assets.id, assetId));

        if (!assetRow || assetRow.projectId !== projectId) {
          errors.push({ assetId, error: "Asset not found." });
          continue;
        }

        const result = await runOperation(assetDescriptionBatchDescriptor, { projectId, assetId });
        if (!result.ok) {
          errors.push({ assetId, assetName: assetRow.name, error: result.error });
          continue;
        }
        // `assetDescriptionBatchDescriptor.output.kind` is always `"object"`
        // — the guard exists because `RunOperationResult` is
        // `kind`-discriminated (LLMW.OUTPUT.LIST.1, B7a), not because this
        // branch is reachable here.
        if (result.kind !== "object") {
          throw new Error("generateBatchAssetDescriptionDrafts: expected an object-kind result.");
        }

        results.push({
          assetId,
          assetName: assetRow.name,
          assetType: assetRow.type,
          hasExistingDescription: Boolean(assetRow.description?.trim()),
          hasExistingNotes: Boolean(assetRow.notes?.trim()),
          draft: { descriptionDraft: result.values.description, notesDraft: result.values.notes },
        });
      } catch (err) {
        const [assetRow] = await db
          .select({ name: assets.name })
          .from(assets)
          .where(eq(assets.id, assetId))
          .catch(() => [undefined]);
        errors.push({
          assetId,
          assetName: assetRow?.name,
          error: err instanceof Error ? err.message : "Unexpected error.",
        });
      }
    }

    return { ok: true, results, errors };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
