import { db } from "@/db";
import { appSettings } from "@/db/schema";
import type { LLMConfig } from "@/types/llm";

export interface OllamaSettings {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  isConfigured: boolean;
}

/**
 * Reads Ollama settings from DB, with env var fallback.
 * Priority: DB value → env var → hardcoded default.
 * Never reads LLM_API_KEY (not needed for Ollama).
 */
export async function getLLMSettings(): Promise<OllamaSettings> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const baseUrl =
    map.get("llm_base_url") ??
    process.env.LLM_BASE_URL ??
    "http://localhost:11434";

  const model =
    map.get("llm_model") ??
    process.env.LLM_MODEL ??
    "";

  const timeoutMs = parseInt(
    map.get("llm_timeout_ms") ?? process.env.LLM_TIMEOUT_MS ?? "30000",
    10
  );

  return {
    baseUrl,
    model,
    timeoutMs,
    isConfigured: !!model.trim(),
  };
}

/**
 * Returns a LLMConfig ready for callOllama(), or null if model is not set.
 */
export async function getLLMConfig(): Promise<LLMConfig | null> {
  const s = await getLLMSettings();
  if (!s.isConfigured) return null;
  return {
    provider: "ollama",
    baseUrl: s.baseUrl,
    model: s.model,
    apiKey: null,
    timeoutMs: s.timeoutMs,
  };
}
