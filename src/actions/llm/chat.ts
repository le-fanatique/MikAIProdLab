"use server";

import { callLLMChat, fetchLLMModelNames } from "@/lib/llm";
import {
  getChatLLMConfig,
  getChatLLMConfigForListing,
  getChatProviderInfo,
} from "@/lib/settings";
import { getChatSystemPrompts } from "@/actions/settings";
import type { ChatGeneratedImage, ChatMessage, ChatSystemPrompt, LLMConfig, LLMProvider } from "@/types/llm";

// ---------------------------------------------------------------------------
// Send a chat message using the effective chat LLM provider
// ---------------------------------------------------------------------------

export async function sendChatMessage(input: {
  model: string;
  messages: ChatMessage[];
}): Promise<
  | { ok: true; content: string; images?: ChatGeneratedImage[] }
  | { ok: false; error: string }
> {
  try {
    const config = await getChatLLMConfig();
    if (!config) {
      return { ok: false, error: "No LLM model configured for chat. Check Settings." };
    }

    if (!input.model?.trim()) {
      return { ok: false, error: "No model selected." };
    }

    // Validate & sanitize messages
    const valid = input.messages.filter(
      (m) =>
        ["user", "assistant", "system"].includes(m.role) &&
        (typeof m.content === "string"
          ? m.content.trim().length > 0
          : m.content.length > 0)
    );

    if (valid.length === 0) {
      return { ok: false, error: "No valid messages to send." };
    }

    // Keep system message if present + last N user/assistant messages
    const systemMsgs = valid.filter((m) => m.role === "system");
    const chatMsgs = valid.filter((m) => m.role !== "system").slice(-12);
    const trimmed = [...systemMsgs, ...chatMsgs];

    const chatConfig: LLMConfig = {
      ...config,
      model: input.model.trim(),
    };

    const response = await callLLMChat(trimmed, chatConfig);
    return { ok: true, content: response.text, images: response.images };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// List available system prompts for sidebar chat
// ---------------------------------------------------------------------------

export async function listChatSystemPrompts(): Promise<
  | { ok: true; prompts: ChatSystemPrompt[] }
  | { ok: false; error: string }
> {
  try {
    const prompts = await getChatSystemPrompts();
    return { ok: true, prompts };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load system prompts.";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// List available models for the effective chat provider
// ---------------------------------------------------------------------------

const PROVIDER_DISPLAY_NAMES: Record<LLMProvider, string> = {
  ollama: "Ollama",
  openrouter: "OpenRouter",
  "openai-compatible": "OpenAI-compatible",
};

export async function listChatModels(): Promise<
  | {
      ok: true;
      models: string[];
      defaultModel: string | null;
      effectiveProvider: LLMProvider;
      useSeparate: boolean;
      providerLabel: string;
    }
  | { ok: false; error: string }
> {
  try {
    const [info, listConfig] = await Promise.all([
      getChatProviderInfo(),
      getChatLLMConfigForListing(),
    ]);

    const models = await fetchLLMModelNames({
      provider: listConfig.provider,
      baseUrl: listConfig.baseUrl,
      model: listConfig.model || "placeholder",
      apiKey: listConfig.apiKey,
      timeoutMs: listConfig.timeoutMs,
    });

    return {
      ok: true,
      models,
      defaultModel: listConfig.model.trim() ? listConfig.model : null,
      effectiveProvider: info.effectiveProvider,
      useSeparate: info.useSeparate,
      providerLabel: PROVIDER_DISPLAY_NAMES[info.effectiveProvider] ?? info.effectiveProvider,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reach server.";
    return { ok: false, error: message };
  }
}
