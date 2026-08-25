// ---------------------------------------------------------------------------
// dynamicBatchRoleOverrides.ts — REFROLE.INTENT.1
//
// The job-level role overlay for the Dynamic Batch "Selected Images" panel
// (`DynamicBatchImageList`). The library's own stored `image_role` is never
// written here — this module only reads/writes the URL param and the plain
// object shape every caller passes around, exactly like
// `pruneDynamicBatchSelection.ts` does for the selection itself.
//
// Persistence shape: a sibling URL param, `batchImageRoles_<nodeId>`, additive
// to `batchImages_<nodeId>` and never changing that param's own format
// (`pruneDynamicBatchSelection` and the existing selection-restore logic
// depend on it staying "id1,id2"). Format here: `id:role,id:role` — only the
// overridden ids, never the full selection.
//
// Pure: no DB, no browser, no network.
// ---------------------------------------------------------------------------

/** The sibling URL/form param key for a given batch node's role overlay. */
export function buildBatchRoleOverrideParamKey(batchNodeId: string): string {
  return `batchImageRoles_${batchNodeId}`;
}

/**
 * Parses `id:role,id:role` into a plain `{ id: role }` map. Never throws:
 * an entry missing an id or a role (or an empty/missing string) is silently
 * dropped rather than guessed. Absent/empty input yields `{}`, which is the
 * "no ticket without this param behaves exactly as before" case.
 */
export function parseBatchRoleOverridesParam(raw: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw) return result;
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0 || sep === trimmed.length - 1) continue;
    const id = trimmed.slice(0, sep).trim();
    const role = trimmed.slice(sep + 1).trim();
    if (!id || !role) continue;
    result[id] = role;
  }
  return result;
}

/** Inverse of `parseBatchRoleOverridesParam`. Entries with an empty id or role are skipped, so a round trip never emits a malformed pair. */
export function serializeBatchRoleOverridesParam(overrides: Record<string, string>): string {
  return Object.entries(overrides)
    .filter(([id, role]) => id.trim() && role.trim())
    .map(([id, role]) => `${id}:${role}`)
    .join(",");
}

/**
 * Keeps only the overrides whose id is still in `allowedIds` (the current
 * selection), mirroring `pruneDynamicBatchIds`'s own rule for the selection
 * itself: an override for an image no longer selected is elided along with
 * it, never resurrected.
 */
export function pruneBatchRoleOverrides(
  overrides: Record<string, string>,
  allowedIds: string[]
): Record<string, string> {
  const allowed = new Set(allowedIds);
  const result: Record<string, string> = {};
  for (const [id, role] of Object.entries(overrides)) {
    if (allowed.has(id)) result[id] = role;
  }
  return result;
}

/** The role a given reference id actually carries for prompt composition: the job-level override when present, else the library's own stored role. */
export function resolveOverriddenRole(
  refId: string,
  baseRole: string | null,
  overrides: Record<string, string> | undefined
): string | null {
  const override = overrides?.[refId];
  return override && override.trim() ? override : baseRole;
}
