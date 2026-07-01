import "server-only";

import type { ChatImageGenerationRequest, ChatImageGenerationResponse, ChatLLMResponse, ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";
import {
  callOllama,
  callOllamaChat,
  fetchOllamaModelNames,
} from "./ollama";
import {
  callOpenAICompatibleJson,
  callOpenAICompatibleChat,
  callOpenAICompatibleImageGeneration,
  fetchOpenAICompatibleModelNames,
} from "./openaiCompatible";
import { maybePurgeComfyBeforeOllama } from "@/lib/vramManager";

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
    await maybePurgeComfyBeforeOllama();
    return callOllama(prompt, config);
  }
  // openrouter and openai-compatible both use OpenAI-compatible protocol
  return callOpenAICompatibleJson(prompt, config);
}

/**
 * Calls the configured LLM provider for freeform chat.
 * Returns the full response including any image content parts from the provider.
 */
export async function callLLMChat(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<ChatLLMResponse> {
  if (config.provider === "ollama") {
    await maybePurgeComfyBeforeOllama();
    const text = await callOllamaChat(messages, config);
    return { text, images: [] };
  }
  return callOpenAICompatibleChat(messages, config);
}

/**
 * Calls the configured LLM provider's dedicated image generation endpoint.
 * Ollama does not support this — throws a clear user-facing error.
 */
export async function callLLMImageGeneration(
  config: LLMConfig,
  request: ChatImageGenerationRequest
): Promise<ChatImageGenerationResponse> {
  if (config.provider === "ollama") {
    throw new Error(
      "This provider does not support dedicated image generation in Sidebar Chat yet."
    );
  }
  return callOpenAICompatibleImageGeneration(config, request);
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