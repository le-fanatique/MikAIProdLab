"use server";

import { callLLMChat, callLLMImageGeneration, fetchLLMModelNames } from "@/lib/llm";
import {
  getChatLLMConfig,
  getChatLLMConfigForListing,
  getChatProviderInfo,
} from "@/lib/settings";
import { getChatSystemPrompts } from "@/actions/settings";
import type { ChatGeneratedImage, ChatImageReference, ChatImageSize, ChatMessage, ChatSystemPrompt, LLMConfig, LLMProvider } from "@/types/llm";

// ---------------------------------------------------------------------------
// Send a chat message using the effective chat LLM provider
// ---------------------------------------------------------------------------

function messageTextContent(m: ChatMessage): string {
  return typeof m.content === "string"
    ? m.content
    : m.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
}

function buildTranslationTask(args: {
  sourceText: string;
  targetLanguage: string;
  sourceLanguage?: string;
}): string {
  const from = args.sourceLanguage ? ` from ${args.sourceLanguage}` : "";
  return (
    `Task: Translate the following text${from} into ${args.targetLanguage}. ` +
    `Return only the translation. Do not answer, explain, summarize, or comment.\n\n` +
    `Text:\n"""\n${args.sourceText}\n"""`
  );
}

const TRANSLATION_NUM_PREDICT = 2048;

export async function sendChatMessage(input: {
  model: string;
  messages: ChatMessage[];
  systemPromptId?: string;
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

    const chatConfig: LLMConfig = {
      ...config,
      model: input.model.trim(),
    };

    // Translation mode: server-side lookup of the selected system prompt's
    // metadata. Falls back to normal chat when the prompt is not a translation
    // prompt or has no target language.
    if (input.systemPromptId) {
      const prompts = await getChatSystemPrompts();
      const selected = prompts.find((p) => p.id === input.systemPromptId);
      const targetLanguage = selected?.targetLanguage?.trim();

      if (selected?.kind === "translation" && targetLanguage) {
        const lastUser = [...valid].reverse().find((m) => m.role === "user");
        const sourceText = lastUser ? messageTextContent(lastUser).trim() : "";
        if (!sourceText) {
          return { ok: false, error: "No text to translate." };
        }

        // No history: system prompt + single wrapped user message only
        const translationMessages: ChatMessage[] = [
          { role: "system", content: selected.prompt },
          {
            role: "user",
            content: buildTranslationTask({
              sourceText,
              targetLanguage,
              sourceLanguage: selected.sourceLanguage?.trim() || undefined,
            }),
          },
        ];

        const response = await callLLMChat(translationMessages, chatConfig, {
          temperature: 0,
          numPredict: TRANSLATION_NUM_PREDICT,
          think: false,
        });
        return { ok: true, content: response.text, images: response.images };
      }
    }

    // Normal chat: keep system message if present + last N user/assistant messages
    const systemMsgs = valid.filter((m) => m.role === "system");
    const chatMsgs = valid.filter((m) => m.role !== "system").slice(-12);
    const trimmed = [...systemMsgs, ...chatMsgs];

    const response = await callLLMChat(trimmed, chatConfig);
    return { ok: true, content: response.text, images: response.images };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Generate images using the effective chat provider's image generation endpoint
// ---------------------------------------------------------------------------

const ALLOWED_REF_IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);

const MAX_IMAGES_PER_REQUEST = 8;

// Simple option values like "1K", "high", "png" — defensive server-side guard
const IMAGE_OPTION_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/;

function validateImageOption(
  value: string | undefined,
  label: string
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!IMAGE_OPTION_PATTERN.test(trimmed)) {
    return { ok: false, error: `Invalid ${label} value.` };
  }
  return { ok: true, value: trimmed };
}

export async function generateChatImages(input: {
  model: string;
  prompt: string;
  size: ChatImageSize;
  referenceImages?: Array<{ dataUrl: string; mimeType: string; name?: string; sizeBytes?: number }>;
  n?: number;
  resolution?: string;
  quality?: string;
  outputFormat?: string;
  background?: string;
}): Promise<
  | { ok: true; images: ChatGeneratedImage[]; text: string }
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
    if (!input.prompt?.trim()) {
      return { ok: false, error: "No prompt provided." };
    }

    let n: number | undefined;
    if (input.n !== undefined) {
      if (
        !Number.isInteger(input.n) ||
        input.n < 1 ||
        input.n > MAX_IMAGES_PER_REQUEST
      ) {
        return {
          ok: false,
          error: `Number of images must be between 1 and ${MAX_IMAGES_PER_REQUEST}.`,
        };
      }
      n = input.n > 1 ? input.n : undefined;
    }

    const resolutionCheck = validateImageOption(input.resolution, "resolution");
    if (!resolutionCheck.ok) return { ok: false, error: resolutionCheck.error };
    const qualityCheck = validateImageOption(input.quality, "quality");
    if (!qualityCheck.ok) return { ok: false, error: qualityCheck.error };
    const outputFormatCheck = validateImageOption(input.outputFormat, "output format");
    if (!outputFormatCheck.ok) return { ok: false, error: outputFormatCheck.error };
    const backgroundCheck = validateImageOption(input.background, "background");
    if (!backgroundCheck.ok) return { ok: false, error: backgroundCheck.error };

    // Server-side validation for reference images
    const refs = input.referenceImages ?? [];
    if (refs.length > 4) {
      return { ok: false, error: "Too many reference images. Maximum 4 allowed." };
    }
    const MAX_REF_IMAGE_BYTES = 5 * 1024 * 1024;
    const validatedRefs: ChatImageReference[] = [];
    for (const ref of refs) {
      const mime = ref.mimeType?.toLowerCase().trim() ?? "";
      if (!ALLOWED_REF_IMAGE_MIMES.has(mime)) {
        return { ok: false, error: `Reference image type "${mime}" is not allowed. Use PNG, JPEG, WebP, or GIF.` };
      }
      if (!ref.dataUrl.startsWith("data:image/")) {
        return { ok: false, error: "Invalid reference image data URL." };
      }
      if (typeof ref.sizeBytes === "number" && ref.sizeBytes > MAX_REF_IMAGE_BYTES) {
        return { ok: false, error: `Reference image exceeds the 5 MB limit.` };
      }
      validatedRefs.push({ dataUrl: ref.dataUrl, mimeType: mime, name: ref.name, sizeBytes: ref.sizeBytes });
    }

    const chatConfig: LLMConfig = { ...config, model: input.model.trim() };
    const result = await callLLMImageGeneration(chatConfig, {
      model: input.model.trim(),
      prompt: input.prompt.trim(),
      size: input.size,
      referenceImages: validatedRefs.length > 0 ? validatedRefs : undefined,
      n,
      resolution: resolutionCheck.value,
      quality: qualityCheck.value,
      outputFormat: outputFormatCheck.value,
      background: backgroundCheck.value,
    });
    return { ok: true, images: result.images, text: result.text };
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
