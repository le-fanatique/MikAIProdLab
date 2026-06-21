"use server";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { fetchOllamaModelNames } from "@/lib/llm/ollama";

// ---------------------------------------------------------------------------
// Save Ollama settings to DB
// ---------------------------------------------------------------------------

export async function saveOllamaSettings(
  baseUrl: string,
  model: string,
  timeoutMs: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const cleanUrl = baseUrl.trim() || "http://localhost:11434";
    const cleanModel = model.trim();
    const cleanTimeout = timeoutMs.trim() || "30000";

    const now = new Date().toISOString();

    const upsert = (key: string, value: string) =>
      db
        .insert(appSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now },
        });

    await upsert("llm_base_url", cleanUrl);
    await upsert("llm_model", cleanModel);
    await upsert("llm_timeout_ms", cleanTimeout);

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save settings. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Fetch installed Ollama model names (Server Action)
// ---------------------------------------------------------------------------

export async function fetchOllamaModels(
  baseUrl: string
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  try {
    const cleanUrl = baseUrl.trim().replace(/\/$/, "") || "http://localhost:11434";
    const models = await fetchOllamaModelNames(cleanUrl);
    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach Ollama. Make sure Ollama is running.",
    };
  }
}

// ---------------------------------------------------------------------------
// Save ComfyUI settings to DB
// ---------------------------------------------------------------------------

const COMFY_BASE_URL_DEFAULT = "http://127.0.0.1:8188";

export async function saveComfySettings(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const trimmed = baseUrl.trim();
    const cleaned = trimmed.replace(/\/$/, "");
    const valid =
      cleaned.startsWith("http://") || cleaned.startsWith("https://");
    const finalUrl = cleaned && valid ? cleaned : COMFY_BASE_URL_DEFAULT;

    const finalApiKey = apiKey.trim();

    const now = new Date().toISOString();

    const upsert = (key: string, value: string) =>
      db
        .insert(appSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now },
        });

    await upsert("comfyui_base_url", finalUrl);
    await upsert("comfyui_api_key", finalApiKey);

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save ComfyUI settings. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Test Ollama connection (server-side only — never called from browser fetch)
// ---------------------------------------------------------------------------

export async function testOllamaConnection(
  baseUrl: string,
  model: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const cleanUrl = baseUrl.trim().replace(/\/$/, "") || "http://localhost:11434";
  const cleanModel = model.trim();

  let models: string[];
  try {
    models = await fetchOllamaModelNames(cleanUrl);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Could not connect to Ollama at ${cleanUrl}. Make sure Ollama is running.`,
    };
  }

  if (!cleanModel) {
    return { ok: true, message: "Connected to Ollama. Select a model to continue." };
  }

  const found = models.some(
    (name) =>
      name === cleanModel ||
      name.startsWith(cleanModel + ":") ||
      name.split(":")[0] === cleanModel
  );

  if (!found) {
    return {
      ok: false,
      error: `Connected to Ollama, but model "${cleanModel}" was not found. Run: ollama pull ${cleanModel}`,
    };
  }

  return {
    ok: true,
    message: `Connected to Ollama. Model "${cleanModel}" is available.`,
  };
}
