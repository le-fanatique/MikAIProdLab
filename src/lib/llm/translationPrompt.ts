import type { ChatMessage } from "@/types/llm";

/**
 * Builds the two-message payload for a standalone text field translation.
 * No history, no dependency on LLM Chat conversation state.
 */
export function buildTranslationMessages({
  sourceText,
  targetLanguage,
  sourceLanguage,
}: {
  sourceText: string;
  targetLanguage: string;
  sourceLanguage?: string;
}): ChatMessage[] {
  const from = sourceLanguage ? ` from ${sourceLanguage}` : "";
  return [
    {
      role: "system",
      content:
        "You are a translation engine. You translate text exactly. " +
        "You never answer, explain, summarize, or comment.",
    },
    {
      role: "user",
      content:
        `Translate the text between triple quotes${from} into ${targetLanguage}.\n` +
        `Return only the translated text. Do not add labels or quotes.\n\n` +
        `Text:\n"""\n${sourceText}\n"""`,
    },
  ];
}
