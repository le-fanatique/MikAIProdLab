"use server";

import { getLLMConfig } from "@/lib/settings";
import { callLLMChat } from "@/lib/llm";
import {
  PROMPT_COMPILER_PRESETS,
  type PromptCompilerPresetId,
  validatePresetRequirements,
  computePromptCompilerFingerprint,
  cleanDraftText,
  buildPromptCompilerUserMessage,
} from "@/lib/prompts/promptCompilerPresets";
import { buildPromptCompilerSystemPrompt } from "@/lib/prompts/promptCompilerSystemPrompt";
import {
  buildPromptCompilationContext,
  type BuildPromptCompilationContextInput,
  type PromptCompilationSourceFlags,
} from "@/lib/prompts/buildPromptCompilationContext";

export type GeneratePromptCompilerDraftInput = {
  presetId: PromptCompilerPresetId;
  sourceFlags: PromptCompilationSourceFlags;
  /** Already assembled from real Shot/project/sequence data by the calling page — no DB access happens here. */
  contextInput: Omit<BuildPromptCompilationContextInput, "sources">;
};

export type GeneratePromptCompilerDraftResult =
  | { ok: true; draft: string; fingerprint: string }
  | { ok: false; error: string };

/**
 * Generates a Prompt Compiler draft for one preset + source selection.
 * Never persists anything — the caller (PromptCompilerPanel) decides
 * whether/when to Replace or Append the draft into the Shot Prompt via the
 * existing updateShotPrompt action.
 */
export async function generatePromptCompilerDraft(
  input: GeneratePromptCompilerDraftInput
): Promise<GeneratePromptCompilerDraftResult> {
  try {
    const preset = PROMPT_COMPILER_PRESETS[input.presetId];
    if (!preset) {
      return { ok: false, error: "Unknown preset." };
    }

    const context = buildPromptCompilationContext({
      ...input.contextInput,
      sources: input.sourceFlags,
    });

    const validation = validatePresetRequirements(input.presetId, context);
    if (!validation.ok) {
      return { ok: false, error: validation.missing.join(" ") };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM not configured. Go to Settings to set up Ollama." };
    }

    const systemPrompt = buildPromptCompilerSystemPrompt(preset);
    const userMessage = buildPromptCompilerUserMessage(context);

    const response = await callLLMChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      config
    );

    const draft = cleanDraftText(response.text);
    if (!draft) {
      return { ok: false, error: "The model returned an empty draft. Try again." };
    }

    const fingerprint = computePromptCompilerFingerprint(input.presetId, input.sourceFlags, context);
    return { ok: true, draft, fingerprint };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
