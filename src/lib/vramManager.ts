import "server-only";

import { db } from "@/db";
import { generationJobs } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { getComfySettings, getActiveProvider, getLLMSettings } from "@/lib/settings";
import { freeComfyVRAM } from "@/lib/comfy/comfyServerClient";
import { unloadOllamaModel } from "@/lib/llm/ollama";

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
 * If local VRAM auto-management is enabled and the active LLM provider is Ollama,
 * unloads the configured Ollama model from VRAM so ComfyUI has maximum VRAM available.
 * Never throws — logs safe warnings on failure.
 */
export async function maybeUnloadOllamaBeforeComfy(): Promise<void> {
  try {
    const comfySettings = await getComfySettings();
    if (!comfySettings.localVramAutoManagement) return;

    const provider = await getActiveProvider();
    if (provider !== "ollama") return;

    const ollamaSettings = await getLLMSettings("ollama");
    if (!ollamaSettings.baseUrl || !ollamaSettings.model) {
      console.warn("[VRAM] Ollama unload skipped — baseUrl or model not configured.");
      return;
    }

    const result = await unloadOllamaModel(ollamaSettings.baseUrl, ollamaSettings.model);
    if (result.ok) {
      console.log(`[VRAM] Ollama model "${ollamaSettings.model}" unloaded before ComfyUI generation.`);
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
