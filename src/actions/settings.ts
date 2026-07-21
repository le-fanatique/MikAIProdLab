"use server";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchOllamaModelNames } from "@/lib/llm/ollama";
import { fetchOpenAICompatibleModelNames, testOpenAICompatibleConnection } from "@/lib/llm/openaiCompatible";
import { redirect } from "next/navigation";
import type { ChatSystemPrompt, LLMProvider } from "@/types/llm";
import { validateTemplate, DEFAULT_SEQUENCE_TEMPLATE, DEFAULT_SHOT_TEMPLATE } from "@/lib/nomenclature";
import type { RuntimeProvider } from "@/lib/comfy/runtimeProvider";
import { normalizeRuntimeProvider } from "@/lib/comfy/runtimeProvider";
import { COMFY_CLOUD_BASE_URL } from "@/lib/settings";
import { getCloudObjectInfo } from "@/lib/comfy/comfyCloudClient";

// ---------------------------------------------------------------------------
// Save LLM settings to DB (per-provider)
// ---------------------------------------------------------------------------

const PREFIXES: Record<LLMProvider, string> = {
  ollama: "llm_ollama_",
  openrouter: "llm_openrouter_",
  "openai-compatible": "llm_openai_compatible_",
};

const PROVIDER_DEFAULT_URLS: Record<LLMProvider, string> = {
  ollama: "http://localhost:11434",
  openrouter: "https://openrouter.ai/api/v1",
  "openai-compatible": "http://localhost:8000/v1",
};

function upsertSetting(key: string, value: string) {
  const now = new Date().toISOString();
  return db
    .insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: now },
    });
}

/**
 * Normalizes an API key before saving:
 * - trims surrounding whitespace
 * - strips a leading "Bearer " prefix (case-insensitive) if the user pasted
 *   from an Authorization header instead of a raw key
 */
function normalizeApiKey(raw: string): string {
  let k = raw.trim();
  if (k.toLowerCase().startsWith("bearer ")) {
    k = k.slice(7).trim();
  }
  return k;
}

export async function saveOllamaSettings(
  baseUrl: string,
  model: string,
  timeoutMs: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return saveLLMSettings("ollama", baseUrl, model, "", timeoutMs, "0.7");
}

/**
 * Saves settings for the given provider using per-provider keys.
 * apiKeyMode:
 *   "replace"  → replace saved key with the value (empty = clear)
 *   "keep"     → keep the existing saved key untouched
 */
export async function saveLLMSettings(
  provider: LLMProvider,
  baseUrl: string,
  model: string,
  apiKey: string,
  timeoutMs: string,
  temperature: string,
  apiKeyMode: "replace" | "keep" = "replace"
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const prefix = PREFIXES[provider];
    const cleanUrl = baseUrl.trim() || PROVIDER_DEFAULT_URLS[provider];
    const cleanModel = model.trim();
    const cleanTimeout = timeoutMs.trim() || "30000";
    const cleanTemp = parseFloat(temperature) ?? 0.7;

    await upsertSetting("llm_provider", provider);
    await upsertSetting(`${prefix}base_url`, cleanUrl);
    await upsertSetting(`${prefix}model`, cleanModel);
    await upsertSetting(`${prefix}timeout_ms`, cleanTimeout);
    await upsertSetting(`${prefix}temperature`, String(cleanTemp));

    if (apiKeyMode === "replace") {
      await upsertSetting(`${prefix}api_key`, normalizeApiKey(apiKey));
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save settings. Please try again." };
  }
}

/**
 * Loads the saved API key for a provider (server-side only).
 * Used to merge with form submission when user didn't touch the API key field.
 */
export async function getSavedApiKeyForProvider(
  provider: LLMProvider
): Promise<string | null> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const prefix = PREFIXES[provider];
  // DB key takes priority; fall back to provider-specific env var
  const dbKey = map.get(`${prefix}api_key`) || null;
  if (dbKey) return dbKey;
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY?.trim() || null;
  if (provider === "openai-compatible") return process.env.OPENAI_API_KEY?.trim() || null;
  return null;
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

/**
 * COMFY.PROVIDER.1 — saves the ComfyUI provider selection plus both key
 * material fields, each with its own keep/replace mode (mirrors
 * saveLLMSettings' apiKeyMode) so a Settings save never has to resend a
 * secret the form was never given in the first place (see
 * ComfyUISettingsForm.tsx / settings/page.tsx no-leak design). Neither key
 * is ever logged, echoed in the return value, or written anywhere but this
 * upsert.
 */
export async function saveComfySettings(
  provider: RuntimeProvider,
  baseUrl: string,
  apiKey: string,
  apiKeyMode: "replace" | "keep",
  cloudApiKey: string,
  cloudApiKeyMode: "replace" | "keep",
  localVramAutoManagement: boolean = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const trimmed = baseUrl.trim();
    const cleaned = trimmed.replace(/\/$/, "");
    const valid =
      cleaned.startsWith("http://") || cleaned.startsWith("https://");
    const finalUrl = cleaned && valid ? cleaned : COMFY_BASE_URL_DEFAULT;
    const finalProvider = normalizeRuntimeProvider(provider);

    await upsertSetting("comfyui_provider", finalProvider);
    await upsertSetting("comfyui_base_url", finalUrl);
    if (apiKeyMode === "replace") {
      await upsertSetting("comfyui_api_key", apiKey.trim());
    }
    if (cloudApiKeyMode === "replace") {
      await upsertSetting("comfyui_cloud_api_key", cloudApiKey.trim());
    }
    await upsertSetting("local_vram_auto_management_enabled", localVramAutoManagement ? "true" : "false");

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save ComfyUI settings. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Test ComfyUI connection (read-only ping via /system_stats)
// ---------------------------------------------------------------------------

async function testLocalComfyConnection(
  baseUrl: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return { ok: false, error: "Set a ComfyUI server URL before testing the connection." };
  }
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return { ok: false, error: "Invalid URL. Must start with http:// or https://." };
  }

  const url = `${trimmed}/system_stats`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Could not reach the ComfyUI server. Check the URL and make sure the server is running.",
      };
    }
    return {
      ok: false,
      error: "Could not reach the ComfyUI server. Check the URL and make sure the server is running.",
    };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: "ComfyUI connection failed. Check the API key or server access settings.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `ComfyUI server responded with HTTP ${response.status}. Check the URL and server configuration.`,
    };
  }

  return { ok: true, message: "ComfyUI connection successful." };
}

/**
 * COMFY.PROVIDER.1 — tests the Cloud connection with GET /api/object_info
 * (authenticated, read-only — never a generation). `cloudApiKeyOverride` is
 * the value currently typed in the form; when empty (field untouched), the
 * already-saved key is read server-side so "Test Connection" still works
 * without the client ever holding the saved secret (no-leak design).
 */
async function testCloudComfyConnection(
  cloudApiKeyOverride: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const typed = cloudApiKeyOverride.trim();
  let apiKey = typed;
  if (!apiKey) {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "comfyui_cloud_api_key"));
    apiKey = rows[0]?.value?.trim() ?? "";
  }
  if (!apiKey) {
    return { ok: false, error: "Set a Comfy Cloud API key before testing the connection." };
  }

  try {
    await getCloudObjectInfo(apiKey);
    return { ok: true, message: `Comfy Cloud connection successful (${COMFY_CLOUD_BASE_URL}).` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    if (/responded 401/.test(message)) {
      return { ok: false, error: "Comfy Cloud connection failed. Check the Comfy Cloud API key." };
    }
    return { ok: false, error: `Comfy Cloud connection failed: ${message}` };
  }
}

export async function testComfyConnection(
  provider: RuntimeProvider,
  baseUrl: string,
  cloudApiKeyOverride: string = ""
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const finalProvider = normalizeRuntimeProvider(provider);
  return finalProvider === "cloud"
    ? testCloudComfyConnection(cloudApiKeyOverride)
    : testLocalComfyConnection(baseUrl);
}

// ---------------------------------------------------------------------------
// Save OpenReel sidecar URL (OPENREEL.URL.1)
// ---------------------------------------------------------------------------

const OPENREEL_SIDECAR_URL_DEFAULT = "http://127.0.0.1:5173";

export async function saveOpenReelSidecarUrl(
  url: string
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const trimmed = url.trim();
  if (!trimmed) {
    // Empty on save restores the fallback rather than storing an unusable value.
    await upsertSetting("openreel_sidecar_url", OPENREEL_SIDECAR_URL_DEFAULT);
    return { ok: true, value: OPENREEL_SIDECAR_URL_DEFAULT };
  }

  const cleaned = trimmed.replace(/\/+$/, "");
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    return { ok: false, error: "Invalid URL. Must start with http:// or https://." };
  }

  try {
    await upsertSetting("openreel_sidecar_url", cleaned);
    return { ok: true, value: cleaned };
  } catch {
    return { ok: false, error: "Failed to save OpenReel Sidecar URL. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Save MikAI public base URL (MIKAI.ORIGIN.1)
// ---------------------------------------------------------------------------

const MIKAI_PUBLIC_BASE_URL_DEFAULT = "http://localhost:3000";

export async function saveMikAIPublicBaseUrl(
  url: string
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const trimmed = url.trim();
  if (!trimmed) {
    // Empty on save restores the fallback rather than storing an unusable value.
    await upsertSetting("mikai_public_base_url", MIKAI_PUBLIC_BASE_URL_DEFAULT);
    return { ok: true, value: MIKAI_PUBLIC_BASE_URL_DEFAULT };
  }

  const cleaned = trimmed.replace(/\/+$/, "");
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    return { ok: false, error: "Invalid URL. Must start with http:// or https://." };
  }

  try {
    await upsertSetting("mikai_public_base_url", cleaned);
    return { ok: true, value: cleaned };
  } catch {
    return { ok: false, error: "Failed to save MikAI Public Base URL. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Test LLM connection (server-side, multi-provider)
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
    return { ok: true, message: "Connected. Select a model to continue." };
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
      error: `Connected, but model "${cleanModel}" was not found.`,
    };
  }

  return {
    ok: true,
    message: `Connected. Model "${cleanModel}" is available.`,
  };
}

/**
 * Test connection for the given provider.
 * If apiKey is empty, tries to load the saved key from DB.
 */
export async function testLLMConnection(
  provider: LLMProvider,
  baseUrl: string,
  model: string,
  apiKey: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (provider === "ollama") {
    return testOllamaConnection(baseUrl, model);
  }
  // Use provided key, or fall back to saved key
  const effectiveKey = apiKey.trim() || (await getSavedApiKeyForProvider(provider));
  return testOpenAICompatibleConnection(
    baseUrl.trim().replace(/\/$/, ""),
    effectiveKey,
    model,
    15000
  );
}

// ---------------------------------------------------------------------------
// Fetch LLM models (multi-provider)
// ---------------------------------------------------------------------------

/**
 * Fetch models for the given provider.
 * If apiKey is empty, tries to load the saved key from DB.
 */
export async function fetchLLMModels(
  provider: LLMProvider,
  baseUrl: string,
  apiKey: string
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  if (provider === "ollama") {
    try {
      const cleanUrl = baseUrl.trim().replace(/\/$/, "") || "http://localhost:11434";
      const models = await fetchOllamaModelNames(cleanUrl);
      return { ok: true, models };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not reach server.",
      };
    }
  }
  // Use provided key, or fall back to saved key
  const effectiveKey = apiKey.trim() || (await getSavedApiKeyForProvider(provider));
  try {
    const models = await fetchOpenAICompatibleModelNames(
      baseUrl.trim().replace(/\/$/, ""),
      effectiveKey
    );
    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach server.",
    };
  }
}

// ---------------------------------------------------------------------------
// Get hasApiKey status for all providers (server-side only)
// ---------------------------------------------------------------------------

export async function getAllProviderApiKeyStatus(): Promise<{
  ollama: boolean;
  openrouter: boolean;
  "openai-compatible": boolean;
}> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    ollama: !!map.get("llm_ollama_api_key"),
    openrouter: !!map.get("llm_openrouter_api_key") || !!map.get("llm_api_key"),
    "openai-compatible": !!map.get("llm_openai_compatible_api_key") || !!map.get("llm_api_key"),
  };
}

// ---------------------------------------------------------------------------
// Save Chat LLM provider settings to DB
// ---------------------------------------------------------------------------

export async function saveChatProviderSettings(
  useSeparate: boolean,
  chatProvider: LLMProvider
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await upsertSetting("llm_chat_use_separate_provider", useSeparate ? "true" : "false");
    await upsertSetting("llm_chat_provider", chatProvider);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save chat provider settings." };
  }
}

// ---------------------------------------------------------------------------
// Save workflow generation defaults to DB
// ---------------------------------------------------------------------------

export async function saveWorkflowDefaults(formData: FormData): Promise<void> {
  const assetImageId = formData.get("assetImageWorkflowId")?.toString().trim() ?? "";
  const shotImageId = formData.get("shotImageWorkflowId")?.toString().trim() ?? "";
  const shotVideoId = formData.get("shotVideoWorkflowId")?.toString().trim() ?? "";

  const now = new Date().toISOString();
  const upsert = (key: string, value: string) =>
    db
      .insert(appSettings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });

  await upsert("default_workflow_asset_image", assetImageId);
  await upsert("default_workflow_shot_image", shotImageId);
  await upsert("default_workflow_shot_video", shotVideoId);

  redirect("/settings?defaultsSaved=1");
}

// ---------------------------------------------------------------------------
// System Prompt Library — stored as JSON in app_settings
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS_KEY = "llm_chat_system_prompts";
const MAX_PROMPT_LENGTH = 8000;

async function readSystemPrompts(): Promise<ChatSystemPrompt[]> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SYSTEM_PROMPTS_KEY));
  if (rows.length === 0) return [];
  try {
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSystemPrompts(prompts: ChatSystemPrompt[]): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: SYSTEM_PROMPTS_KEY, value: JSON.stringify(prompts), updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(prompts), updatedAt: now },
    });
}

export async function getChatSystemPrompts(): Promise<ChatSystemPrompt[]> {
  return readSystemPrompts();
}

const MAX_LANGUAGE_LENGTH = 60;

function sanitizeLanguage(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_LANGUAGE_LENGTH);
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function saveChatSystemPrompt(input: {
  id?: string;
  name: string;
  prompt: string;
  kind?: "chat" | "translation";
  targetLanguage?: string;
  sourceLanguage?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  const prompt = input.prompt.trim();

  if (!name) return { ok: false, error: "Prompt name is required." };
  if (!prompt) return { ok: false, error: "System prompt text is required." };
  if (prompt.length > MAX_PROMPT_LENGTH)
    return { ok: false, error: `Prompt must be under ${MAX_PROMPT_LENGTH} characters.` };

  const kind: "chat" | "translation" =
    input.kind === "translation" ? "translation" : "chat";
  const targetLanguage = kind === "translation" ? sanitizeLanguage(input.targetLanguage) : undefined;
  const sourceLanguage = kind === "translation" ? sanitizeLanguage(input.sourceLanguage) : undefined;

  if (kind === "translation" && !targetLanguage) {
    return { ok: false, error: "Target language is required for translation prompts." };
  }

  const prompts = await readSystemPrompts();
  const now = new Date().toISOString();

  if (input.id) {
    // Update existing — replace metadata fields explicitly so switching back
    // to "chat" clears stale translation metadata
    const idx = prompts.findIndex((p) => p.id === input.id);
    if (idx === -1) return { ok: false, error: "Prompt not found." };
    prompts[idx] = {
      ...prompts[idx],
      name,
      prompt,
      kind,
      targetLanguage,
      sourceLanguage,
      updatedAt: now,
    };
  } else {
    // Create new
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    prompts.push({ id, name, prompt, kind, targetLanguage, sourceLanguage, createdAt: now, updatedAt: now });
  }

  await writeSystemPrompts(prompts);
  return { ok: true, id: input.id ?? prompts[prompts.length - 1].id };
}

export async function deleteChatSystemPrompt(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const prompts = await readSystemPrompts();
  const filtered = prompts.filter((p) => p.id !== input.id);
  if (filtered.length === prompts.length) return { ok: false, error: "Prompt not found." };
  await writeSystemPrompts(filtered);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Nomenclature settings
// ---------------------------------------------------------------------------

export async function saveNomenclatureSettings(input: {
  sequenceTemplate: string;
  shotTemplate: string;
}): Promise<{ ok: true } | { ok: false; error: string; field?: "sequence" | "shot" }> {
  const seqTemplate = input.sequenceTemplate.trim() || DEFAULT_SEQUENCE_TEMPLATE;
  const shotTemplate = input.shotTemplate.trim() || DEFAULT_SHOT_TEMPLATE;

  const seqError = validateTemplate(seqTemplate);
  if (seqError) return { ok: false, error: `Sequence template: ${seqError}`, field: "sequence" };

  const shotError = validateTemplate(shotTemplate);
  if (shotError) return { ok: false, error: `Shot template: ${shotError}`, field: "shot" };

  try {
    await upsertSetting("nomenclature_sequence_template", seqTemplate);
    await upsertSetting("nomenclature_shot_template", shotTemplate);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save nomenclature settings." };
  }
}
