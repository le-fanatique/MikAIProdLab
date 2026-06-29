import { db } from "@/db";
import { appSettings } from "@/db/schema";
import type { LLMConfig, LLMProvider, ProviderSettings } from "@/types/llm";

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
// ComfyUI (unchanged)
// ---------------------------------------------------------------------------

export interface ComfySettings {
  baseUrl: string;
  apiKey: string;
}

const COMFY_BASE_URL_DEFAULT = "http://127.0.0.1:8188";

export async function getComfySettings(): Promise<ComfySettings> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const baseUrl = map.get("comfyui_base_url") ?? COMFY_BASE_URL_DEFAULT;
  const apiKey = map.get("comfyui_api_key") ?? "";
  return { baseUrl, apiKey };
}