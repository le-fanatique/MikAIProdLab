// UX.PRODUCTIVITY.POLISH.1 — Lot A. Pure parsing/normalization/validation for
// named local ComfyUI endpoint presets. No I/O. Shared by the read model
// (src/lib/settings.ts), the Server Actions (src/actions/settings.ts) and the
// client UI (src/components/ComfyUISettingsForm.tsx) so all three agree on
// the exact same contract.

export const COMFY_LOCAL_PRESETS_SETTINGS_KEY = "comfyui_local_endpoint_presets_v1";

export const COMFY_LOCAL_PRESETS_MAX_COUNT = 20;
export const COMFY_LOCAL_PRESET_NAME_MAX_LENGTH = 60;
export const COMFY_LOCAL_PRESET_URL_MAX_LENGTH = 2048;

export interface ComfyLocalEndpointPreset {
  id: string;
  name: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Versioned envelope persisted as the single `app_settings` row value (JSON). */
export interface ComfyLocalPresetsDocument {
  version: 1;
  revision: number;
  presets: ComfyLocalEndpointPreset[];
}

export function emptyComfyLocalPresetsDocument(): ComfyLocalPresetsDocument {
  return { version: 1, revision: 0, presets: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

/**
 * Validates/normalizes one preset record read back from storage. Returns
 * null (never throws) for a malformed entry — the caller
 * (`parseComfyLocalPresetsDocument`) treats ANY malformed entry inside an
 * otherwise well-formed document as whole-document corruption (see below),
 * never as a silently-dropped row.
 */
function parsePresetRecord(raw: unknown): ComfyLocalEndpointPreset | null {
  if (!isPlainObject(raw)) return null;
  const allowedKeys = new Set(["id", "name", "baseUrl", "createdAt", "updatedAt"]);
  if (!Object.keys(raw).every((k) => allowedKeys.has(k))) return null;
  if (!Object.hasOwn(raw, "id") || !Object.hasOwn(raw, "name") || !Object.hasOwn(raw, "baseUrl")) return null;
  const { id, name, baseUrl } = raw;
  if (!isNonEmptyBoundedString(id, 64)) return null;
  if (!isNonEmptyBoundedString(name, COMFY_LOCAL_PRESET_NAME_MAX_LENGTH)) return null;
  const urlResult = normalizeLocalBaseUrl(typeof baseUrl === "string" ? baseUrl : "");
  if (!urlResult.ok) return null;
  // Timestamps are backward-compatible-optional (absent = older document,
  // defaults to the epoch) but a PRESENT value must be a valid ISO string —
  // a present-and-invalid timestamp rejects the whole entry rather than
  // being silently replaced by the epoch.
  let createdAt = new Date(0).toISOString();
  if (Object.hasOwn(raw, "createdAt")) {
    if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) return null;
    createdAt = raw.createdAt;
  }
  let updatedAt = createdAt;
  if (Object.hasOwn(raw, "updatedAt")) {
    if (typeof raw.updatedAt !== "string" || Number.isNaN(Date.parse(raw.updatedAt))) return null;
    updatedAt = raw.updatedAt;
  }
  return { id, name, baseUrl: urlResult.url, createdAt, updatedAt };
}

export type ParsedComfyLocalPresetsResult =
  | { ok: true; document: ComfyLocalPresetsDocument }
  | { ok: false; error: string };

/**
 * Parses the raw `app_settings.value` string for
 * `COMFY_LOCAL_PRESETS_SETTINGS_KEY`. Never throws, but distinguishes two
 * very different situations:
 *
 * - the row simply doesn't exist yet (`raw` is null/undefined) — nothing has
 *   ever been saved, so this returns `{ok:true}` with an empty document;
 * - the row EXISTS but is corrupted in any way (broken JSON, wrong
 *   version/shape, a malformed entry, a duplicate id, or a collection over
 *   the cap) — this returns `{ok:false}` explicitly. Callers that mutate
 *   (`mutateComfyLocalPresets`) MUST refuse the write on `ok:false` rather
 *   than silently canonicalizing/truncating and persisting a "corrected"
 *   document — the stored value must stay byte-identical until a human
 *   resolves the corruption.
 */
export function parseComfyLocalPresetsDocument(raw: string | null | undefined): ParsedComfyLocalPresetsResult {
  // Only a truly ABSENT row (never saved) is "empty, nothing saved yet" —
  // a present-but-empty-string row is not valid JSON and falls through to
  // the JSON.parse failure below, explicitly corrupted rather than treated
  // as if nothing had ever been saved.
  if (raw === null || raw === undefined) return { ok: true, document: emptyComfyLocalPresetsDocument() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Stored ComfyUI presets are not valid JSON." };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Stored ComfyUI presets have an invalid shape." };
  }
  if (!Object.keys(parsed).every((k) => ["version", "revision", "presets"].includes(k))) {
    return { ok: false, error: "Stored ComfyUI presets contain an unknown field." };
  }
  if (!Object.hasOwn(parsed, "version") || parsed.version !== 1) {
    return { ok: false, error: "Stored ComfyUI presets have an unsupported version." };
  }
  if (
    !Object.hasOwn(parsed, "revision") ||
    typeof parsed.revision !== "number" ||
    !Number.isInteger(parsed.revision) ||
    parsed.revision < 0
  ) {
    return { ok: false, error: "Stored ComfyUI presets have an invalid revision." };
  }
  if (!Object.hasOwn(parsed, "presets") || !Array.isArray(parsed.presets)) {
    return { ok: false, error: "Stored ComfyUI presets have an invalid collection." };
  }
  if (parsed.presets.length > COMFY_LOCAL_PRESETS_MAX_COUNT) {
    return { ok: false, error: "Stored ComfyUI presets exceed the maximum allowed count." };
  }
  const presets: ComfyLocalEndpointPreset[] = [];
  const seenIds = new Set<string>();
  for (const entry of parsed.presets) {
    const preset = parsePresetRecord(entry);
    if (!preset) return { ok: false, error: "Stored ComfyUI presets contain an invalid entry." };
    if (seenIds.has(preset.id)) return { ok: false, error: "Stored ComfyUI presets contain a duplicate id." };
    seenIds.add(preset.id);
    presets.push(preset);
  }
  return { ok: true, document: { version: 1, revision: parsed.revision, presets } };
}

export function serializeComfyLocalPresetsDocument(doc: ComfyLocalPresetsDocument): string {
  return JSON.stringify(doc);
}

export type NormalizeUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validates a candidate Local ComfyUI Base URL for a preset: must parse as
 * an absolute http(s) URL, no embedded credentials, no query string, no
 * fragment; trailing slash normalized away. Mirrors (deliberately
 * stricter than) the ad-hoc validation `saveComfySettings` applies to the
 * active Base URL.
 */
export function normalizeLocalBaseUrl(raw: string): NormalizeUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Base URL is required." };
  if (trimmed.length > COMFY_LOCAL_PRESET_URL_MAX_LENGTH) {
    return { ok: false, error: "Base URL is too long." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid URL, e.g. http://127.0.0.1:8188." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Base URL must start with http:// or https://." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Base URL must not include credentials." };
  }
  if (parsed.search) {
    return { ok: false, error: "Base URL must not include a query string." };
  }
  if (parsed.hash) {
    return { ok: false, error: "Base URL must not include a fragment." };
  }
  const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
  return { ok: true, url: normalized };
}

export type ValidateNameResult = { ok: true; name: string } | { ok: false; error: string };

export function normalizePresetName(raw: string): ValidateNameResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Preset name is required." };
  if (trimmed.length > COMFY_LOCAL_PRESET_NAME_MAX_LENGTH) {
    return { ok: false, error: `Preset name must be ${COMFY_LOCAL_PRESET_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

export function generateComfyLocalPresetId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `cp_${globalThis.crypto.randomUUID()}`;
  }
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type MutatePresetsResult =
  | { ok: true; presets: ComfyLocalEndpointPreset[] }
  | { ok: false; error: string };

/** Pure helper: validates + appends a new preset, enforcing the 20-preset cap. */
export function addPreset(
  presets: ComfyLocalEndpointPreset[],
  input: { name: string; baseUrl: string },
  now: string
): MutatePresetsResult {
  if (presets.length >= COMFY_LOCAL_PRESETS_MAX_COUNT) {
    return { ok: false, error: `Maximum ${COMFY_LOCAL_PRESETS_MAX_COUNT} presets reached.` };
  }
  const nameResult = normalizePresetName(input.name);
  if (!nameResult.ok) return nameResult;
  const urlResult = normalizeLocalBaseUrl(input.baseUrl);
  if (!urlResult.ok) return urlResult;
  const preset: ComfyLocalEndpointPreset = {
    id: generateComfyLocalPresetId(),
    name: nameResult.name,
    baseUrl: urlResult.url,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, presets: [...presets, preset] };
}

export function renamePreset(
  presets: ComfyLocalEndpointPreset[],
  id: string,
  input: { name: string; baseUrl: string },
  now: string
): MutatePresetsResult {
  const idx = presets.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, error: "Preset not found." };
  const nameResult = normalizePresetName(input.name);
  if (!nameResult.ok) return nameResult;
  const urlResult = normalizeLocalBaseUrl(input.baseUrl);
  if (!urlResult.ok) return urlResult;
  const next = [...presets];
  next[idx] = { ...next[idx], name: nameResult.name, baseUrl: urlResult.url, updatedAt: now };
  return { ok: true, presets: next };
}

export function deletePreset(presets: ComfyLocalEndpointPreset[], id: string): MutatePresetsResult {
  const next = presets.filter((p) => p.id !== id);
  if (next.length === presets.length) return { ok: false, error: "Preset not found." };
  return { ok: true, presets: next };
}
