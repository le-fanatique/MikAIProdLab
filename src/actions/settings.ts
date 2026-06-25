"use server";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchOllamaModelNames } from "@/lib/llm/ollama";
import { redirect } from "next/navigation";
import type { ChatSystemPrompt } from "@/types/llm";

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

export async function saveChatSystemPrompt(input: {
  id?: string;
  name: string;
  prompt: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  const prompt = input.prompt.trim();

  if (!name) return { ok: false, error: "Prompt name is required." };
  if (!prompt) return { ok: false, error: "System prompt text is required." };
  if (prompt.length > MAX_PROMPT_LENGTH)
    return { ok: false, error: `Prompt must be under ${MAX_PROMPT_LENGTH} characters.` };

  const prompts = await readSystemPrompts();
  const now = new Date().toISOString();

  if (input.id) {
    // Update existing
    const idx = prompts.findIndex((p) => p.id === input.id);
    if (idx === -1) return { ok: false, error: "Prompt not found." };
    prompts[idx] = { ...prompts[idx], name, prompt, updatedAt: now };
  } else {
    // Create new
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    prompts.push({ id, name, prompt, createdAt: now, updatedAt: now });
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
