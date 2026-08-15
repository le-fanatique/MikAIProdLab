"use server";

// ---------------------------------------------------------------------------
// actions/llmWorkspace/bench.ts — LLMW.BENCH.RUN.1 (B6c1), §4.4
//
// The bench's two write-adjacent Server Actions: `runBenchOperation` (calls
// the model, never writes) and `commitBenchProposal` (the Approve that
// writes in `replace` mode, dispatched by `ActionId` onto the seven B5
// adapters — no second adapter layer). Both re-resolve the descriptor
// server-side from `templateId` via `loadBenchDescriptor`, the same
// resolution the page itself used to render — neither trusts a descriptor
// supplied by the client.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { loadBenchDescriptor } from "@/lib/llmWorkspace/benchDescriptor";
import { planBenchCommit, preservedAssetDetailColumns } from "@/lib/llmWorkspace/benchRun";
import { parseIntentInputFromSearchParams, type BenchSearchParams } from "@/lib/llmWorkspace/bench";
import {
  requiredAnchorIdKeys,
  runOperation,
  verifyAnchorChain,
  type AnchorIds,
} from "@/lib/llmWorkspace/runner";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import {
  buildApplyGeneratedOutlineArgs,
  buildApplyGeneratedStoryArgs,
  buildAssetBibleCommitArgs,
  buildAssetDescriptionFieldCommitArgs,
} from "@/lib/llmWorkspace/actions/proposalCommit";

function invalidTemplateError(reason: string): string {
  return `This template's stored JSON is not a valid operation descriptor and cannot be run: ${reason}`;
}

// ---------------------------------------------------------------------------
// `runBenchOperation` — never writes. The intention is re-parsed server-side
// from `searchParams` with `bench.ts`'s own pure `parseIntentInputFromSearchParams`
// — no second reading rule, no trust in a client-built `intent` object.
// ---------------------------------------------------------------------------

export async function runBenchOperation(input: {
  templateId: string;
  ids: AnchorIds;
  searchParams: BenchSearchParams;
}): Promise<{ ok: true; values: Record<string, string> } | { ok: false; error: string }> {
  const result = await loadBenchDescriptor(input.templateId);
  if (result.status === "notFound") return { ok: false, error: "Template not found." };
  if (result.status === "invalid") return { ok: false, error: invalidTemplateError(result.reason) };

  const descriptor = result.descriptor;
  const intent = parseIntentInputFromSearchParams(descriptor, input.searchParams);

  try {
    const result = await runOperation(descriptor, input.ids, intent);
    if (!result.ok) return result;
    // The bench's Run/Approve surface only knows the object shape today —
    // list-kind descriptors have no writer yet (B7b) and no bench UI yet
    // (B7c), forced here by `RunOperationResult`'s `kind` discriminant
    // (LLMW.OUTPUT.LIST.1, B7a). Never reachable against a real stored or
    // built-in descriptor as of this ticket.
    if (result.kind !== "object") {
      return { ok: false, error: "This template's output kind is not supported by the bench yet." };
    }
    return { ok: true, values: result.values };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// `commitBenchProposal` — the bench's Approve, `replace` mode only. Writes
// in base, following §4.4's five ordered steps.
// ---------------------------------------------------------------------------

export async function commitBenchProposal(input: {
  templateId: string;
  ids: AnchorIds;
  values: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Step 1 — re-resolve the descriptor.
  const result = await loadBenchDescriptor(input.templateId);
  if (result.status === "notFound") return { ok: false, error: "Template not found." };
  if (result.status === "invalid") return { ok: false, error: invalidTemplateError(result.reason) };
  const descriptor = result.descriptor;

  // Step 2 — plan the commit.
  const plan = planBenchCommit(descriptor);
  if (plan.kind === "unsupported") return { ok: false, error: plan.reason };
  if (plan.kind === "redirectOnly") {
    return { ok: false, error: "This operation is applied through its own form." };
  }

  // Step 3 — validate every required anchor identifier: integer > 0.
  const requiredKeys = requiredAnchorIdKeys(descriptor.anchor.entity);
  for (const key of requiredKeys) {
    const value = input.ids[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return { ok: false, error: descriptor.messages.invalidRequest ?? "Invalid request." };
    }
  }

  // Step 4 — the write guard. Not optional: an Approve request is distinct
  // from the Run that resolved the preview, and a client could call it with
  // arbitrary identifiers.
  const chain = await verifyAnchorChain(descriptor.anchor.entity, input.ids, descriptor.messages.chainNotFound);
  if (!chain.ok) return chain;

  const projectId = input.ids.projectId as number;

  // Step 5 — dispatch on the single commit action, reusing the seven B5
  // adapters. Exhaustive over `ActionId`: a future eighth id fails `tsc`.
  switch (plan.actionId) {
    case "applyGeneratedStory": {
      const args = buildApplyGeneratedStoryArgs(projectId, input.values.story ?? "");
      return ACTION_BINDINGS.applyGeneratedStory(...args);
    }

    case "applyGeneratedOutline": {
      const args = buildApplyGeneratedOutlineArgs(projectId, input.values.outline ?? "");
      return ACTION_BINDINGS.applyGeneratedOutline(...args);
    }

    case "updateAssetDescriptionFieldInline": {
      // Every descriptor reaching this case is `output.kind === "object"` in
      // practice (bench list-output commit does not exist yet — B7c);
      // narrowed defensively per `OperationDescriptor["output"]`'s
      // discriminant (LLMW.OUTPUT.LIST.1, B7a).
      const field = descriptor.output.kind === "object" ? descriptor.output.fields[0]?.field : undefined;
      if (field !== "description" && field !== "notes") {
        return { ok: false, error: "This template's output field cannot be routed to an update action." };
      }
      const assetId = input.ids.assetId as number;
      const args = buildAssetDescriptionFieldCommitArgs({
        assetId,
        projectId,
        field,
        mode: "replace",
        content: input.values[field] ?? "",
      });
      return ACTION_BINDINGS.updateAssetDescriptionFieldInline(...args);
    }

    case "updateAssetDetailsInline": {
      const assetId = input.ids.assetId as number;
      const preserved = preservedAssetDetailColumns(descriptor);

      const [existing] = await db
        .select({
          projectId: assets.projectId,
          description: assets.description,
          notes: assets.notes,
          visualIdentity: assets.visualIdentity,
          usageRules: assets.usageRules,
          forbiddenVariations: assets.forbiddenVariations,
        })
        .from(assets)
        .where(eq(assets.id, assetId));

      if (!existing || existing.projectId !== projectId) {
        return { ok: false, error: descriptor.messages.chainNotFound.asset ?? "Asset not found." };
      }

      // A declared output field (not preserved) is written from the
      // approved draft; a field this descriptor never generates is carried
      // through from the existing row, untouched (registry behaviour 3).
      const pick = (field: "description" | "notes" | "visualIdentity" | "usageRules" | "forbiddenVariations") =>
        preserved.includes(field) ? (existing[field] ?? "") : (input.values[field] ?? "");

      const args = buildAssetBibleCommitArgs({
        assetId,
        projectId,
        description: pick("description"),
        notes: pick("notes"),
        existingVisualIdentity: existing.visualIdentity,
        existingUsageRules: existing.usageRules,
        existingForbiddenVariations: existing.forbiddenVariations,
        visualIdentity: pick("visualIdentity"),
        usageRules: pick("usageRules"),
        forbiddenVariations: pick("forbiddenVariations"),
      });
      return ACTION_BINDINGS.updateAssetDetailsInline(...args);
    }

    // Never reachable: `planBenchCommit` refuses `entitySet` anchors and the
    // batch action before this switch runs, and both redirect-only actions
    // are refused as `redirectOnly` above. Kept as explicit branches, not a
    // `default`, so the switch stays exhaustive over `ActionId`.
    case "applyBatchAssetDescriptionDraftsInline":
      return { ok: false, error: "Batch operations cannot be approved from the bench." };
    case "updateShotPrompt":
    case "updateSequencePrompt":
      return { ok: false, error: "This operation is applied through its own form." };
  }
}
