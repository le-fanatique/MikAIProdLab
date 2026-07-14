"use server";

import { callLLMJson } from "@/lib/llm";
import { buildAssetBibleFromContextPrompt } from "@/lib/prompts/asset-bible-from-context";
import { resolveAssetBibleContext } from "@/lib/prompts/assetBibleContext";
import { parseAssetBibleDraft } from "@/lib/prompts/assetBibleDraft";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedAssetBibleDraft } from "@/types/llm";

export async function generateAssetBibleDraft(
  formData: FormData
): Promise<{ ok: true; draft: GeneratedAssetBibleDraft } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);

    const context = await resolveAssetBibleContext(projectId, assetId);
    if (!context.ok) return context;

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const llmPrompt = buildAssetBibleFromContextPrompt({ asset: context.asset });

    const raw = await callLLMJson(llmPrompt, config);
    const draft = parseAssetBibleDraft(raw);

    return { ok: true, draft };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
