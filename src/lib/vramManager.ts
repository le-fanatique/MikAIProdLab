import "server-only";

import { db } from "@/db";
import { generationJobs, appSettings } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { getComfySettings } from "@/lib/settings";
import { freeComfyVRAM } from "@/lib/comfy/comfyServerClient";
import { unloadOllamaModel } from "@/lib/llm/ollama";
import type { LLMProvider } from "@/types/llm";

// Terminal statuses: done, failed, timeout.
// Everything else (pending, uploading, queued, running) counts as active.
async function hasActiveComfyJobs(): Promise<boolean> {
  const rows = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      or(
        eq(generationJobs.status, "pending"),
        eq(generationJobs.status, "uploading"),
        eq(generationJobs.status, "queued"),
        eq(generationJobs.status, "running")
      )
    );
  return rows.length > 0;
}

/**
 * Called before routing an LLM request to Ollama.
 * If local VRAM auto-management is enabled and no ComfyUI job is currently active,
 * purges ComfyUI models from VRAM so the Ollama request has maximum VRAM available.
 * Never throws — logs safe warnings on failure.
 */
export async function maybePurgeComfyBeforeOllama(): Promise<void> {
  try {
    const comfySettings = await getComfySettings();
    if (!comfySettings.localVramAutoManagement) return;

    if (await hasActiveComfyJobs()) {
      console.warn("[VRAM] ComfyUI purge skipped — active job is queued or running.");
      return;
    }

    const result = await freeComfyVRAM();
    if (result.ok) {
      console.log("[VRAM] ComfyUI models purged before Ollama request.");
    } else {
      console.warn(`[VRAM] ComfyUI purge failed: ${result.error}`);
    }
  } catch (err) {
    console.warn(
      "[VRAM] unexpected error in maybePurgeComfyBeforeOllama:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Called before queuing a ComfyUI generation prompt.
 * Unloads the Ollama model from VRAM if Ollama is in use — either as the
 * production LLM provider or as the separate chat LLM provider.
 * Never throws — logs safe warnings on failure.
 */
export async function maybeUnloadOllamaBeforeComfy(): Promise<void> {
  try {
    const comfySettings = await getComfySettings();
    if (!comfySettings.localVramAutoManagement) return;

    // Read provider config in one query to check both production and chat
    const rows = await db.select().from(appSettings);
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const productionProvider =
      (map.get("llm_provider") as LLMProvider) ??
      (process.env.LLM_PROVIDER as LLMProvider | undefined) ??
      "ollama";
    const useSeparateChat = map.get("llm_chat_use_separate_provider") === "true";
    const chatProvider: LLMProvider = useSeparateChat
      ? ((map.get("llm_chat_provider") as LLMProvider) ?? productionProvider)
      : productionProvider;

    // Unload if Ollama is used in production OR as separate chat provider
    const ollamaInUse =
      productionProvider === "ollama" || (useSeparateChat && chatProvider === "ollama");
    if (!ollamaInUse) return;

    const ollamaBaseUrl =
      map.get("llm_ollama_base_url") ??
      map.get("llm_base_url") ??
      process.env.LLM_BASE_URL ??
      "http://localhost:11434";
    const ollamaModel =
      map.get("llm_ollama_model") ??
      map.get("llm_model") ??
      process.env.LLM_MODEL ??
      "";

    if (!ollamaBaseUrl || !ollamaModel) {
      console.warn("[VRAM] Ollama unload skipped — baseUrl or model not configured.");
      return;
    }

    const result = await unloadOllamaModel(ollamaBaseUrl, ollamaModel);
    if (result.ok) {
      console.log(`[VRAM] Ollama model "${ollamaModel}" unloaded before ComfyUI generation.`);
    } else {
      console.warn(`[VRAM] Ollama unload failed: ${result.error}`);
    }
  } catch (err) {
    console.warn(
      "[VRAM] unexpected error in maybeUnloadOllamaBeforeComfy:",
      err instanceof Error ? err.message : err
    );
  }
}
