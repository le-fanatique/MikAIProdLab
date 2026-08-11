// ---------------------------------------------------------------------------
// resolveShotDurationScalarDefault.ts — SHOT.GENERATION.DURATION.DEFAULT.1
//
// Pure, client/server-safe helper: given a workflow's parsed inputs, the
// owning Shot's target duration (seconds), and whatever explicit
// `scalarNode_<nodeId>` overrides are already present in the URL, returns
// the effective scalar value map every surface (ShotGenerationPanel, the
// standalone /map page) should feed into buildGenerationPayload, the
// runtime mapping panel, and the Generate form's hidden inputs — so all
// three can never structurally diverge.
//
// Never mutates its inputs. Adds at most one automatic value, and only when
// no explicit override already exists for that node (an explicit override
// wins even if empty/invalid — its mere key presence blocks the default).
// ---------------------------------------------------------------------------

import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";

const DURATION_LABELS = new Set(["duration", "duration seconds"]);
const MAX_SHOT_DURATION_SECONDS = 600;

function isCompatibleDurationInput(input: WorkflowInput): boolean {
  if (input.kind !== "integer" && input.kind !== "float") return false;
  return DURATION_LABELS.has(input.label.trim().toLowerCase());
}

function isValidShotDurationSeconds(durationSeconds: number | null): durationSeconds is number {
  return (
    durationSeconds !== null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds <= MAX_SHOT_DURATION_SECONDS
  );
}

/**
 * Returns a new map: `explicitScalarValueByNodeId` plus, at most, one
 * `Duration`/`Duration Seconds` scalar default derived from the Shot's own
 * `durationSeconds`. Every explicit entry is copied byte-identical; nothing
 * already present is ever overwritten.
 */
export function resolveShotDurationScalarDefault(
  inputs: WorkflowInput[],
  shotDurationSeconds: number | null,
  explicitScalarValueByNodeId: Record<string, string>
): Record<string, string> {
  const effective = { ...explicitScalarValueByNodeId };

  if (!isValidShotDurationSeconds(shotDurationSeconds)) return effective;

  const candidates = inputs.filter(isCompatibleDurationInput);
  if (candidates.length !== 1) return effective;

  const [candidate] = candidates;
  if (candidate.nodeId in explicitScalarValueByNodeId) return effective;

  if (candidate.kind === "integer") {
    if (!Number.isInteger(shotDurationSeconds)) return effective;
    effective[candidate.nodeId] = String(shotDurationSeconds);
    return effective;
  }

  // float — canonical JS decimal representation, e.g. 5.5 -> "5.5", 5 -> "5".
  effective[candidate.nodeId] = String(shotDurationSeconds);
  return effective;
}
