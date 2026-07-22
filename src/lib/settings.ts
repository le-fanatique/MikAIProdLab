import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LLMConfig, LLMProvider, ProviderSettings } from "@/types/llm";
import type { RuntimeProvider } from "@/lib/comfy/runtimeProvider";
import { normalizeRuntimeProvider } from "@/lib/comfy/runtimeProvider";

// ---------------------------------------------------------------------------
// Module-level provider prefix map (used by new chat config functions)
// ---------------------------------------------------------------------------

const PROVIDER_PREFIXES: Record<LLMProvider, string> = {
  ollama: "llm_ollama_",
  openrouter: "llm_openrouter_",
  "openai-compatible": "llm_openai_compatible_",
};

// ---------------------------------------------------------------------------
// Per-provider settings interfaces
// ---------------------------------------------------------------------------

export interface AllLLMSettings {
  activeProvider: LLMProvider;
  ollama: ProviderSettings;
  openrouter: ProviderSettings;
  "openai-compatible": ProviderSettings;
}

// ---------------------------------------------------------------------------
// Provider defaults
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULTS: Record<LLMProvider, Omit<ProviderSettings, "hasApiKey">> = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "",
    timeoutMs: 30000,
    temperature: 0.7,
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "",
    timeoutMs: 30000,
    temperature: 0.7,
  },
  "openai-compatible": {
    baseUrl: "http://localhost:8000/v1",
    model: "",
    timeoutMs: 30000,
    temperature: 0.7,
  },
};

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function key(prefix: string, name: string): string {
  return `${prefix}${name}`;
}

/**
 * Reads all LLM settings per provider.
 * Priority: provider-specific key → legacy key → env var → hardcoded default.
 */
async function readAllLLMSettings(): Promise<AllLLMSettings> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  // Active provider
  const activeProvider =
    (map.get("llm_provider") as LLMProvider) ??
    (process.env.LLM_PROVIDER as LLMProvider | undefined) ??
    "ollama";

  // Legacy fallback values (only used when per-provider keys missing)
  const legacyBase =
    map.get("llm_base_url") ??
    process.env.LLM_BASE_URL ??
    null;
  const legacyModel =
    map.get("llm_model") ??
    process.env.LLM_MODEL ??
    null;
  const legacyTimeout =
    map.get("llm_timeout_ms") ??
    process.env.LLM_TIMEOUT_MS ??
    null;
  const legacyTemp =
    map.get("llm_temperature") ??
    process.env.LLM_TEMPERATURE ??
    null;

  // Provider-specific key prefixes
  const PREFIXES: Record<LLMProvider, string> = {
    ollama: "llm_ollama_",
    openrouter: "llm_openrouter_",
    "openai-compatible": "llm_openai_compatible_",
  };

  function readProvider(p: LLMProvider): ProviderSettings {
    const prefix = PREFIXES[p];
    const def = PROVIDER_DEFAULTS[p];

    // Per-provider key, fallback to legacy, fallback to default
    const baseUrl =
      map.get(key(prefix, "base_url")) ??
      legacyBase ??
      def.baseUrl;
    const model =
      map.get(key(prefix, "model")) ??
      legacyModel ??
      def.model;
    const timeoutMs = parseInt(
      map.get(key(prefix, "timeout_ms")) ??
      legacyTimeout ??
      String(def.timeoutMs),
      10
    );
    const temperature = parseFloat(
      map.get(key(prefix, "temperature")) ??
      legacyTemp ??
      String(def.temperature)
    );

    // API key priority: provider-specific DB key → provider env var → legacy DB key.
    // Use || not ?? so a stored "" is treated as absent.
    const specificKey = map.get(key(prefix, "api_key")) || null;
    const envKey =
      p === "openrouter"
        ? (process.env.OPENROUTER_API_KEY?.trim() || null)
        : p === "openai-compatible"
          ? (process.env.OPENAI_API_KEY?.trim() || null)
          : null;
    const legacyKey = p !== "ollama" ? (map.get("llm_api_key") || null) : null;
    const apiKey = specificKey ?? envKey ?? legacyKey;
    const hasApiKey = !!apiKey;

    return { baseUrl, model, timeoutMs, temperature, hasApiKey };
  }

  return {
    activeProvider,
    ollama: readProvider("ollama"),
    openrouter: readProvider("openrouter"),
    "openai-compatible": readProvider("openai-compatible"),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads settings for a specific provider.
 */
export async function getLLMSettings(
  provider?: LLMProvider
): Promise<ProviderSettings> {
  const all = await readAllLLMSettings();
  const p = provider ?? all.activeProvider;
  return all[p];
}

/**
 * Returns the active provider and its settings.
 */
export async function getActiveLLMSettings(): Promise<{
  provider: LLMProvider;
  settings: ProviderSettings;
}> {
  const all = await readAllLLMSettings();
  return {
    provider: all.activeProvider,
    settings: all[all.activeProvider],
  };
}

/**
 * Returns all provider settings (used for Settings page).
 */
export async function getAllLLMSettings(): Promise<AllLLMSettings> {
  return readAllLLMSettings();
}

/**
 * Returns the currently active provider.
 */
export async function getActiveProvider(): Promise<LLMProvider> {
  const all = await readAllLLMSettings();
  return all.activeProvider;
}

/**
 * Returns a LLMConfig ready for the provider router, or null if model is not set.
 * Uses the active provider's config + its saved API key.
 */
export async function getLLMConfig(): Promise<LLMConfig | null> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const provider =
    (map.get("llm_provider") as LLMProvider) ??
    (process.env.LLM_PROVIDER as LLMProvider | undefined) ??
    "ollama";

  const prefix =
    provider === "ollama"
      ? "llm_ollama_"
      : provider === "openrouter"
        ? "llm_openrouter_"
        : "llm_openai_compatible_";

  const legacyBase = map.get("llm_base_url") ?? process.env.LLM_BASE_URL;
  const legacyModel = map.get("llm_model") ?? process.env.LLM_MODEL;
  const legacyTimeout = map.get("llm_timeout_ms") ?? process.env.LLM_TIMEOUT_MS;
  const legacyTemp = map.get("llm_temperature") ?? process.env.LLM_TEMPERATURE;
  const def = PROVIDER_DEFAULTS[provider];

  const baseUrl =
    map.get(key(prefix, "base_url")) ?? legacyBase ?? def.baseUrl;
  const model =
    map.get(key(prefix, "model")) ?? legacyModel ?? def.model;
  const timeoutMs = parseInt(
    map.get(key(prefix, "timeout_ms")) ?? legacyTimeout ?? String(def.timeoutMs),
    10
  );
  const temperature = parseFloat(
    map.get(key(prefix, "temperature")) ?? legacyTemp ?? String(def.temperature)
  );

  if (!model.trim()) return null;

  // API key priority: provider-specific DB key → provider env var → legacy DB key.
  // Use || not ?? so a stored "" is treated as absent.
  const specificKey = map.get(key(prefix, "api_key")) || null;
  const envKey =
    provider === "openrouter"
      ? (process.env.OPENROUTER_API_KEY?.trim() || null)
      : provider === "openai-compatible"
        ? (process.env.OPENAI_API_KEY?.trim() || null)
        : null;
  const legacyKey = provider !== "ollama" ? (map.get("llm_api_key") || null) : null;
  const apiKey = specificKey ?? envKey ?? legacyKey;

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    timeoutMs,
    temperature,
  };
}

/**
 * Checks if an API key is saved for a given provider (server-side only).
 */
export async function hasApiKeyForProvider(
  provider: LLMProvider
): Promise<boolean> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const prefix =
    provider === "ollama"
      ? "llm_ollama_"
      : provider === "openrouter"
        ? "llm_openrouter_"
        : "llm_openai_compatible_";

  const apiKey = map.get(key(prefix, "api_key"));
  return !!apiKey;
}

// ---------------------------------------------------------------------------
// Chat LLM provider — separate from production LLM
// ---------------------------------------------------------------------------

export interface ChatProviderInfo {
  useSeparate: boolean;
  chatProvider: LLMProvider;
  effectiveProvider: LLMProvider;
}

/**
 * Returns the effective chat provider and whether a separate one is configured.
 */
export async function getChatProviderInfo(): Promise<ChatProviderInfo> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const useSeparate = map.get("llm_chat_use_separate_provider") === "true";
  const productionProvider =
    (map.get("llm_provider") as LLMProvider) ??
    (process.env.LLM_PROVIDER as LLMProvider | undefined) ??
    "ollama";
  const chatProvider =
    (map.get("llm_chat_provider") as LLMProvider) ?? productionProvider;

  return {
    useSeparate,
    chatProvider,
    effectiveProvider: useSeparate ? chatProvider : productionProvider,
  };
}

/**
 * Builds a chat LLMConfig from the map (sync helper).
 * Model may be "" — callers decide whether to reject that.
 */
function buildChatConfigFromMap(map: Map<string, string>): LLMConfig {
  const useSeparate = map.get("llm_chat_use_separate_provider") === "true";
  const productionProvider =
    (map.get("llm_provider") as LLMProvider) ??
    (process.env.LLM_PROVIDER as LLMProvider | undefined) ??
    "ollama";
  const provider: LLMProvider = useSeparate
    ? ((map.get("llm_chat_provider") as LLMProvider) ?? productionProvider)
    : productionProvider;

  const prefix = PROVIDER_PREFIXES[provider];
  const def = PROVIDER_DEFAULTS[provider];

  const legacyBase = map.get("llm_base_url") ?? process.env.LLM_BASE_URL;
  const legacyModel = map.get("llm_model") ?? process.env.LLM_MODEL;
  const legacyTimeout = map.get("llm_timeout_ms") ?? process.env.LLM_TIMEOUT_MS;
  const legacyTemp = map.get("llm_temperature") ?? process.env.LLM_TEMPERATURE;

  const baseUrl = map.get(`${prefix}base_url`) ?? legacyBase ?? def.baseUrl;
  const model = map.get(`${prefix}model`) ?? legacyModel ?? def.model;
  const timeoutMs = parseInt(
    map.get(`${prefix}timeout_ms`) ?? legacyTimeout ?? String(def.timeoutMs),
    10
  );
  const temperature = parseFloat(
    map.get(`${prefix}temperature`) ?? legacyTemp ?? String(def.temperature)
  );

  const specificKey = map.get(`${prefix}api_key`) || null;
  const envKey =
    provider === "openrouter"
      ? (process.env.OPENROUTER_API_KEY?.trim() || null)
      : provider === "openai-compatible"
        ? (process.env.OPENAI_API_KEY?.trim() || null)
        : null;
  const legacyKey = provider !== "ollama" ? (map.get("llm_api_key") || null) : null;
  const apiKey = specificKey ?? envKey ?? legacyKey;

  return { provider, baseUrl, model: model || "", apiKey, timeoutMs, temperature };
}

/**
 * Returns a full LLMConfig for the effective chat provider, including API key.
 * Unlike getLLMConfig(), model may be "" — callers must check.
 * Intended for model listing (does not require model to be set).
 */
export async function getChatLLMConfigForListing(): Promise<LLMConfig> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return buildChatConfigFromMap(map);
}

/**
 * Returns the effective chat LLMConfig, or null if no model is configured.
 * Use this for sending chat messages.
 */
export async function getChatLLMConfig(): Promise<LLMConfig | null> {
  const cfg = await getChatLLMConfigForListing();
  return cfg.model.trim() ? cfg : null;
}

// ---------------------------------------------------------------------------
// ComfyUI (unchanged)
// ---------------------------------------------------------------------------

export interface ComfySettings {
  /** COMFY.PROVIDER.1 — which backend new generations queue against. Existing behavior ("local") is the default and non-regression reference. */
  provider: RuntimeProvider;
  baseUrl: string;
  /**
   * CAMLAB.POLISH.1 retake — the single canonical Comfy.org key. Serves BOTH
   * as the Partner Node billing key (`extra_data.api_key_comfy_org`, local
   * and Cloud) AND as Comfy Cloud's own `X-API-Key` auth header. Only one
   * visible Settings field writes this going forward
   * (`comfyui_api_key`); the legacy `comfyui_cloud_api_key` row (if any) is
   * read here ONLY as a fallback when the canonical key was never set, so an
   * account that previously only filled in the old "Comfy Cloud API Key"
   * field keeps working without re-entry. Never rendered in HTML.
   */
  apiKey: string;
  /** True iff `apiKey` is non-empty. Settings UI must render this, never the raw value, to avoid putting a secret in rendered HTML. */
  hasApiKey: boolean;
  /**
   * @deprecated CAMLAB.POLISH.1 retake — kept only so existing Cloud call
   * sites (`comfyCloudClient.ts`, `cloudPreflight.ts`, etc.) keep compiling
   * and behaving correctly without touching every one of them; always equal
   * to `apiKey` now. Do not read this for anything new — use `apiKey`.
   */
  cloudApiKey: string;
  /** @deprecated always equal to `hasApiKey` now — kept for existing call sites. */
  hasCloudApiKey: boolean;
  localVramAutoManagement: boolean;
}

const COMFY_BASE_URL_DEFAULT = "http://127.0.0.1:8188";

/** Comfy Cloud's fixed base URL — never user-configurable (see docs/audits/COMFY_CLOUD_SPIKE.md). */
export const COMFY_CLOUD_BASE_URL = "https://cloud.comfy.org";

export async function getComfySettings(): Promise<ComfySettings> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const provider = normalizeRuntimeProvider(map.get("comfyui_provider"));
  const baseUrl = map.get("comfyui_base_url") ?? COMFY_BASE_URL_DEFAULT;
  const canonicalKeyRaw = map.get("comfyui_api_key") ?? "";
  // Legacy fallback: only consulted when the canonical key was never set —
  // never overrides a real canonical value, never written back here (a
  // write only happens on the next explicit Save, see saveComfySettings).
  const legacyCloudKeyRaw = map.get("comfyui_cloud_api_key") ?? "";
  const apiKey = canonicalKeyRaw.trim().length > 0 ? canonicalKeyRaw : legacyCloudKeyRaw;
  const localVramAutoManagement = map.get("local_vram_auto_management_enabled") === "true";
  return {
    provider,
    baseUrl,
    apiKey,
    hasApiKey: apiKey.trim().length > 0,
    cloudApiKey: apiKey,
    hasCloudApiKey: apiKey.trim().length > 0,
    localVramAutoManagement,
  };
}

// ---------------------------------------------------------------------------
// OpenReel sidecar URL (OPENREEL.URL.1)
// ---------------------------------------------------------------------------

const OPENREEL_SIDECAR_URL_DEFAULT = "http://127.0.0.1:5173";

/**
 * Full URL (protocol + host + port, no trailing slash) of the OpenReel
 * sidecar editor, as reachable from the *user's browser* — not necessarily
 * the same as how the MikAI server itself would reach it (e.g. behind
 * Tailscale, the sidecar's LAN/tailnet address differs from `localhost`).
 *
 * Priority: DB setting -> NEXT_PUBLIC_MIKAI_OPENREEL_SIDECAR_URL env var
 * (previous configuration mechanism) -> hardcoded 127.0.0.1 default.
 * 127.0.0.1 (not localhost) is the default because it has proven more
 * reliable than `localhost` in this project's dev environment.
 */
export async function getOpenReelSidecarUrl(): Promise<string> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "openreel_sidecar_url"));
  const stored = rows[0]?.value?.trim().replace(/\/+$/, "");
  if (stored) return stored;

  const fromEnv = process.env.NEXT_PUBLIC_MIKAI_OPENREEL_SIDECAR_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  return OPENREEL_SIDECAR_URL_DEFAULT;
}

// ---------------------------------------------------------------------------
// MikAI public base URL (MIKAI.ORIGIN.1)
// ---------------------------------------------------------------------------

const MIKAI_PUBLIC_BASE_URL_DEFAULT = "http://localhost:3000";

/**
 * Full URL (protocol + host + port, no trailing slash) of this MikAI
 * instance, as reachable from the *user's browser* — used to build
 * absolute URLs (e.g. mikaiExportUrl) handed to the OpenReel sidecar,
 * which fetches them from the browser, not from the MikAI server process.
 * Behind Tailscale/a remote server, this differs from whatever origin the
 * MikAI server itself is bound to.
 *
 * Priority: DB setting -> NEXT_PUBLIC_MIKAI_ORIGIN env var (previous
 * configuration mechanism) -> hardcoded http://localhost:3000 default
 * (historical behavior, keeps existing setups working unchanged).
 */
export async function getMikAIPublicBaseUrl(): Promise<string> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "mikai_public_base_url"));
  const stored = rows[0]?.value?.trim().replace(/\/+$/, "");
  if (stored) return stored;

  const fromEnv = process.env.NEXT_PUBLIC_MIKAI_ORIGIN?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  return MIKAI_PUBLIC_BASE_URL_DEFAULT;
}

// ---------------------------------------------------------------------------
// Nomenclature settings
// ---------------------------------------------------------------------------

export interface NomenclatureSettings {
  sequenceTemplate: string;
  shotTemplate: string;
}

const NOMENCLATURE_DEFAULTS: NomenclatureSettings = {
  sequenceTemplate: "Sq_1XXX",
  shotTemplate: "Sh_1XX",
};

export async function getNomenclatureSettings(): Promise<NomenclatureSettings> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    sequenceTemplate: map.get("nomenclature_sequence_template") || NOMENCLATURE_DEFAULTS.sequenceTemplate,
    shotTemplate: map.get("nomenclature_shot_template") || NOMENCLATURE_DEFAULTS.shotTemplate,
  };
}