"use server";

import { callLLMChat } from "@/lib/llm";
import { getChatLLMConfig } from "@/lib/settings";
import { buildTranslationMessages } from "@/lib/llm/translationPrompt";

const MAX_SOURCE_LENGTH = 8000;
const TRANSLATION_NUM_PREDICT = 2048;

/**
 * Translates a single text field value. Standalone — no chat history,
 * no DB writes. Uses the effective chat LLM provider configuration.
 */
export async function translateTextField(input: {
  sourceText: string;
  targetLanguage: string;
  sourceLanguage?: string;
}): Promise<
  | { ok: true; translation: string }
  | { ok: false; error: string }
> {
  try {
    const sourceText = input.sourceText?.trim() ?? "";
    if (!sourceText) {
      return { ok: false, error: "Nothing to translate." };
    }
    if (sourceText.length > MAX_SOURCE_LENGTH) {
      return {
        ok: false,
        error: `Text is too long to translate (max ${MAX_SOURCE_LENGTH} characters).`,
      };
    }

    const targetLanguage = input.targetLanguage?.trim() ?? "";
    if (!targetLanguage) {
      return { ok: false, error: "No target language selected." };
    }

    const config = await getChatLLMConfig();
    if (!config || !config.model?.trim()) {
      return { ok: false, error: "No LLM model configured. Check Settings." };
    }

    const messages = buildTranslationMessages({
      sourceText,
      targetLanguage,
      sourceLanguage: input.sourceLanguage?.trim() || undefined,
    });

    const response = await callLLMChat(messages, config, {
      temperature: 0,
      numPredict: TRANSLATION_NUM_PREDICT,
      think: false,
    });

    const translation = response.text.trim();
    if (!translation) {
      return { ok: false, error: "The model returned no translation. Try another model." };
    }

    return { ok: true, translation };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return { ok: false, error: message };
  }
}
