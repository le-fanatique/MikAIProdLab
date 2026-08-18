import "server-only";

import type { ChatCallOptions, ChatImageGenerationRequest, ChatImageGenerationResponse, ChatLLMResponse, ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";
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
 * Calls the configured LLM provider for freeform text output — LLMW.TEXT.1
 * (B12b-1). `callLLMJson` forces JSON on both provider families
 * (`response_format: {type:"json_object"}` in `openaiCompatible.ts`,
 * `format: "json"` in `ollama.ts`), which would ask the model for a
 * narrative prompt encoded as JSON — exactly wrong for a text-output
 * operation (`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.3). `callLLMChat`
 * already routes both provider families with nothing forced, so this
 * function is only the `LLMPrompt` -> `ChatMessage[]` adapter — the same two
 * messages `callOllama` already builds in-line for its own JSON request —
 * not a second provider router.
 */
export async function callLLMText(
  prompt: LLMPrompt,
  config: LLMConfig
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
  const response = await callLLMChat(messages, config);
  return response.text;
}

/**
 * Calls the configured LLM provider for freeform chat.
 * Returns the full response including any image content parts from the provider.
 */
export async function callLLMChat(
  messages: ChatMessage[],
  config: LLMConfig,
  callOptions?: ChatCallOptions
): Promise<ChatLLMResponse> {
  if (config.provider === "ollama") {
    await maybePurgeComfyBeforeOllama();
    const text = await callOllamaChat(messages, config, callOptions);
    return { text, images: [] };
  }
  // OpenAI-compatible path reads temperature from config — map it when provided
  const effectiveConfig =
    typeof callOptions?.temperature === "number"
      ? { ...config, temperature: callOptions.temperature }
      : config;
  return callOpenAICompatibleChat(messages, effectiveConfig);
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