"use server";

import { callLLMChat, fetchLLMModelNames } from "@/lib/llm";
import { getLLMConfig, getActiveLLMSettings } from "@/lib/settings";
import { getChatSystemPrompts } from "@/actions/settings";
import type { ChatMessage, ChatSystemPrompt, LLMConfig } from "@/types/llm";

// ---------------------------------------------------------------------------
// Send a chat message to Ollama (free-form, no JSON format enforced)
// ---------------------------------------------------------------------------

export async function sendChatMessage(input: {
  model: string;
  messages: ChatMessage[];
}): Promise<
  | { ok: true; content: string }
  | { ok: false; error: string }
> {
  try {
    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "Configure Ollama in Settings first." };
    }

    if (!input.model?.trim()) {
      return { ok: false, error: "No model selected." };
    }

    // Validate & sanitize messages
    const valid = input.messages.filter(
      (m) =>
        ["user", "assistant", "system"].includes(m.role) &&
        m.content?.trim().length > 0
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

    const content = await callLLMChat(trimmed, chatConfig);
    return { ok: true, content };
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
// List available Ollama models + the currently configured default
// ---------------------------------------------------------------------------

export async function listChatModels(): Promise<
  | { ok: true; models: string[]; defaultModel: string | null }
  | { ok: false; error: string }
> {
  try {
    const [{ provider, settings }, config] = await Promise.all([
      getActiveLLMSettings(),
      getLLMConfig(),
    ]);
    const models = await fetchLLMModelNames({
      provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: config?.apiKey ?? null,
      timeoutMs: settings.timeoutMs,
    });
    return {
      ok: true,
      models,
      defaultModel: settings.model.trim() ? settings.model : null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reach server.";
    return { ok: false, error: message };
  }
}