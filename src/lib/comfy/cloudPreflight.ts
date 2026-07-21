import "server-only";

import { getCloudObjectInfoCached, type CloudObjectInfo } from "@/lib/comfy/comfyCloudClient";

// ---------------------------------------------------------------------------
// COMFY.PROVIDER.1 — Cloud preflight: before ever queueing a prompt against
// Comfy Cloud, verify its node classes against the real, freshly-read
// object_info (never assumed compatible from local availability) and flag
// any Partner Node (api_node: true) so the caller can require an explicit
// cost confirmation instead of a silent paid submission.
// ---------------------------------------------------------------------------

export type CloudPreflightResult = {
  /** class_type values referenced by the workflow that Cloud's object_info does not expose at all — must hard-block queueing. */
  missingClasses: string[];
  /** class_type values Cloud exposes with api_node: true — must require explicit user confirmation before queueing. */
  apiNodeClasses: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extracts the distinct class_type values referenced by an API-format ComfyUI workflow (node-id-keyed dict). Pure, tolerant of malformed nodes. */
export function extractWorkflowClassTypes(workflow: Record<string, unknown>): string[] {
  const classTypes = new Set<string>();
  for (const node of Object.values(workflow)) {
    if (!isRecord(node)) continue;
    const classType = node["class_type"];
    if (typeof classType === "string" && classType.length > 0) {
      classTypes.add(classType);
    }
  }
  return [...classTypes];
}

/** Pure: given the workflow's class_type set and a real object_info snapshot, decides what blocks queueing and what requires cost confirmation. Never infers availability — a class absent from objectInfo is always "missing", regardless of local presence. */
export function checkWorkflowAgainstCloudObjectInfo(
  classTypes: string[],
  objectInfo: CloudObjectInfo
): CloudPreflightResult {
  const missingClasses: string[] = [];
  const apiNodeClasses: string[] = [];

  for (const classType of classTypes) {
    const info = objectInfo[classType];
    if (!info) {
      missingClasses.push(classType);
      continue;
    }
    if (info.api_node === true) {
      apiNodeClasses.push(classType);
    }
  }

  return { missingClasses, apiNodeClasses };
}

/**
 * Live wrapper: fetches (cached) Cloud object_info with the given key and
 * runs the pure check above against the given workflow. Throws if
 * object_info itself cannot be read — callers must treat that as a hard
 * block (never assume a workflow is safe when Cloud couldn't be consulted).
 */
export async function runCloudPreflight(
  workflow: Record<string, unknown>,
  cloudApiKey: string
): Promise<CloudPreflightResult> {
  const objectInfo = await getCloudObjectInfoCached(cloudApiKey);
  const classTypes = extractWorkflowClassTypes(workflow);
  return checkWorkflowAgainstCloudObjectInfo(classTypes, objectInfo);
}

export type PanelCloudPreflight = CloudPreflightResult | { error: string };

/**
 * Shared server-side computation for every generation panel (Shot, Asset,
 * Sequence Storyboard, Sequence Video): given the workflow's STORED JSON
 * text (unaffected by per-request Dynamic Batch/input overrides — those
 * never introduce a new class_type) and the active Comfy settings, returns
 * what the panel should render. `null` means "local provider, nothing to
 * show". Never throws — a read/parse failure becomes a `{error}` result so
 * the panel can block Generate with a clear message instead of crashing.
 */
export async function computeCloudPreflightForPanel(
  workflowJsonText: string,
  comfySettings: { provider: "local" | "cloud"; hasCloudApiKey: boolean; cloudApiKey: string }
): Promise<PanelCloudPreflight | null> {
  if (comfySettings.provider !== "cloud") return null;
  if (!comfySettings.hasCloudApiKey) {
    return { error: "Comfy Cloud is selected but no Comfy Cloud API key is configured." };
  }
  let rawWorkflow: unknown;
  try {
    rawWorkflow = JSON.parse(workflowJsonText);
  } catch {
    return { error: "This workflow's stored JSON could not be parsed for the Comfy Cloud preflight check." };
  }
  if (!rawWorkflow || typeof rawWorkflow !== "object" || Array.isArray(rawWorkflow)) {
    return { error: "This workflow's stored JSON could not be parsed for the Comfy Cloud preflight check." };
  }
  try {
    return await runCloudPreflight(rawWorkflow as Record<string, unknown>, comfySettings.cloudApiKey);
  } catch (err) {
    return { error: `Could not verify this workflow against Comfy Cloud: ${err instanceof Error ? err.message : "unknown error"}.` };
  }
}
