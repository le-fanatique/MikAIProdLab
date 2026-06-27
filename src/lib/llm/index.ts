import type { ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";
import {
  callOllama,
  callOllamaChat,
  fetchOllamaModelNames,
} from "./ollama";
import {
  callOpenAICompatibleJson,
  callOpenAICompatibleChat,
  fetchOpenAICompatibleModelNames,
} from "./openaiCompatible";

// ---------------------------------------------------------------------------
// Provider router — dispatches to the correct caller based on provider
// ---------------------------------------------------------------------------

/**
 * Calls the configured LLM provider for structured JSON output.
 */
export async function callLLMJson(
  prompt: LLMPrompt,
  config: LLMConfig
): Promise<string> {
  if (config.provider === "ollama") {
    return callOllama(prompt, config);
  }
  // openrouter and openai-compatible both use OpenAI-compatible protocol
  return callOpenAICompatibleJson(prompt, config);
}

/**
 * Calls the configured LLM provider for freeform chat.
 */
export async function callLLMChat(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<string> {
  if (config.provider === "ollama") {
    return callOllamaChat(messages, config);
  }
  return callOpenAICompatibleChat(messages, config);
}

/**
 * Fetches model names from the configured provider.
 */
export async function fetchLLMModelNames(
  config: LLMConfig
): Promise<string[]> {
  if (config.provider === "ollama") {
    return fetchOllamaModelNames(config.baseUrl);
  }
  return fetchOpenAICompatibleModelNames(config.baseUrl, config.apiKey);
}