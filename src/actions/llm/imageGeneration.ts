"use server";

import { fetchOpenRouterImageModels } from "@/lib/llm/openrouterImages";
import { getChatLLMConfigForListing } from "@/lib/settings";
import type { ImageModelInfo } from "@/types/llm";

/**
 * Lists image generation models for the effective chat provider.
 * Discovery is only available for OpenRouter — other providers get a clear
 * error so the UI can fall back or disable accordingly.
 */
export async function listImageModels(): Promise<
  | { ok: true; models: ImageModelInfo[] }
  | { ok: false; error: string }
> {
  try {
    const config = await getChatLLMConfigForListing();

    if (config.provider !== "openrouter") {
      return { ok: false, error: "Image model discovery requires OpenRouter." };
    }

    if (!config.apiKey?.trim()) {
      return { ok: false, error: "OpenRouter API key required for image generation." };
    }

    const models = await fetchOpenRouterImageModels(config);
    return { ok: true, models };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load image models.";
    return { ok: false, error: message };
  }
}
