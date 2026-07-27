import "server-only";

// ---------------------------------------------------------------------------
// generationActionHelpers.ts — shared, non-"use server" helpers reused by
// both the Asset and Shot generation actions (src/actions/generation.ts) and
// the Shot generation core (src/lib/comfy/runShotGeneration.ts).
//
// STYLE.1.E.SURFACES.1 retake — extracted so the Shot generation core can
// live in a plain module with no "use server" directive (see
// runShotGeneration.ts's own header for why that matters), without
// duplicating Cloud preflight, node-error summarization or job-failure
// bookkeeping that already existed once in generation.ts.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { generationJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runCloudPreflight } from "@/lib/comfy/cloudPreflight";

export type RunWorkflowGenerationResult =
  | { ok: true; jobId: number }
  | {
      ok: false;
      error: string;
      /** COMFY.PROVIDER.1 — set only when the block is specifically "this Comfy Cloud workflow calls paid Partner Node(s) and needs explicit confirmation", so the caller can offer a confirm-and-resubmit flow instead of a dead-end error. */
      requiresPartnerNodeConfirmation?: boolean;
      apiNodeClasses?: string[];
    };

/**
 * COMFY.PROVIDER.1 — runs the Cloud preflight (missing classes hard-block;
 * Partner Node classes require explicit confirmation) against a prepared
 * workflow payload. Returns null when queueing may proceed (local, or Cloud
 * with nothing blocking); otherwise the exact result to return to the
 * caller. Shared by every job-creation call site so Cloud safety can never
 * be bypassed by one of them forgetting the check.
 */
export async function checkCloudPreflightGate(
  workflow: Record<string, unknown>,
  cloudApiKey: string,
  confirmPartnerNodeCost: boolean | undefined
): Promise<RunWorkflowGenerationResult | null> {
  let preflight;
  try {
    preflight = await runCloudPreflight(workflow, cloudApiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return {
      ok: false,
      error: `Could not verify this workflow against Comfy Cloud before queueing: ${message}`,
    };
  }

  if (preflight.missingClasses.length > 0) {
    return {
      ok: false,
      error: `This workflow uses node type(s) not available on Comfy Cloud: ${preflight.missingClasses.join(", ")}. It cannot be queued on Comfy Cloud.`,
    };
  }

  if (preflight.apiNodeClasses.length > 0 && !confirmPartnerNodeCost) {
    return {
      ok: false,
      error: `This workflow calls paid Comfy Cloud Partner Node(s): ${preflight.apiNodeClasses.join(", ")}. Confirm the cost to continue.`,
      requiresPartnerNodeConfirmation: true,
      apiNodeClasses: preflight.apiNodeClasses,
    };
  }

  return null;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * STYLE.1.E.SURFACES.1 — when a non-empty Style was actually composed into
 * one or more text inputs (`textPatches`, the canonical `built.patch.patches`
 * entries of kind "text"), an explicitly edited Advanced Payload JSON must
 * still carry those exact composed values verbatim. Unrelated JSON edits
 * remain allowed; only removing/altering the Style-bearing text is refused,
 * and only before any `generation_jobs` row is created — never a silent
 * re-patch of what the user explicitly submitted.
 */
export function findEditedStyleTextMismatch(
  textPatches: { nodeId: string; inputKey: string; nextValue: unknown }[],
  finalPatchedJson: Record<string, unknown>
): string | null {
  for (const patch of textPatches) {
    const node = finalPatchedJson[patch.nodeId];
    const inputs = isPlainRecord(node) ? node["inputs"] : undefined;
    const actual = isPlainRecord(inputs) ? inputs[patch.inputKey] : undefined;
    if (actual !== patch.nextValue) {
      return "The edited Advanced Payload no longer contains the exact composed Project Style prompt text. Refresh or reset the Advanced Payload before generating.";
    }
  }
  return null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function summarizeComfyNodeErrors(nodeErrors: unknown): string | null {
  if (nodeErrors === null || nodeErrors === undefined) return null;

  if (typeof nodeErrors === "object" && !Array.isArray(nodeErrors)) {
    const entries = Object.entries(nodeErrors as Record<string, unknown>);
    if (entries.length === 0) return null;

    const parts: string[] = [];
    for (const [nodeId, details] of entries.slice(0, 3)) {
      if (typeof details === "object" && details !== null && !Array.isArray(details)) {
        const d = details as Record<string, unknown>;
        const classType = typeof d["class_type"] === "string" ? d["class_type"] : null;
        const errors = Array.isArray(d["errors"]) ? d["errors"] : null;
        const message = typeof d["message"] === "string" ? d["message"] : null;

        if (errors && errors.length > 0) {
          const firstErr = errors[0] as Record<string, unknown>;
          const errMsg =
            typeof firstErr?.["message"] === "string"
              ? firstErr["message"]
              : typeof firstErr?.["details"] === "string"
              ? firstErr["details"]
              : null;
          const label = classType ? `${nodeId} (${classType})` : nodeId;
          parts.push(errMsg ? `${label}: ${errMsg}` : label);
        } else if (message) {
          parts.push(classType ? `${nodeId} (${classType}): ${message}` : `${nodeId}: ${message}`);
        } else {
          parts.push(`${nodeId}: ${safeStringify(details).slice(0, 120)}`);
        }
      } else {
        parts.push(`${nodeId}: ${safeStringify(details).slice(0, 120)}`);
      }
    }

    const extra = entries.length > 3 ? ` (+${entries.length - 3} more)` : "";
    return `ComfyUI node warnings: ${parts.join("; ")}${extra}`.slice(0, 1000);
  }

  if (Array.isArray(nodeErrors)) {
    if (nodeErrors.length === 0) return null;
    return `ComfyUI node warnings: ${safeStringify(nodeErrors).slice(0, 1000)}`;
  }

  return `ComfyUI node warnings: ${String(nodeErrors).slice(0, 1000)}`;
}

export async function markJobFailed(jobId: number, message: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(generationJobs)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 1000),
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(generationJobs.id, jobId));
}
