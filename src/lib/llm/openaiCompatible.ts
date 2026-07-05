import type { ChatGeneratedImage, ChatImageGenerationRequest, ChatImageGenerationResponse, ChatImageSize, ChatLLMResponse, ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";

// ---------------------------------------------------------------------------
// OpenAI-compatible caller (OpenRouter, vLLM, any OpenAI API server)
// ---------------------------------------------------------------------------

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${path}`;
}

/**
 * Calls an OpenAI-compatible /chat/completions endpoint.
 * Forces JSON output via response_format when jsonMode="strict".
 * Falls back to jsonMode="prompt-only" if provider rejects response_format.
 */
export async function callOpenAICompatibleJson(
  prompt: LLMPrompt,
  config: LLMConfig
): Promise<string> {
  return callOpenAICompatibleCore(prompt, config, { jsonMode: "strict" });
}

/**
 * Calls an OpenAI-compatible /chat/completions endpoint.
 * Freeform chat, no JSON enforcement.
 * Returns the full response including any image content parts.
 */
export async function callOpenAICompatibleChat(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<ChatLLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const url = buildUrl(config.baseUrl, "/chat/completions");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "MikAI Production Lab";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: config.temperature ?? 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${config.timeoutMs}ms. The model may be loading or overloaded.`
      );
    }
    throw new Error(
      `Cannot connect to LLM server at ${config.baseUrl}. Check your settings.`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 && config.provider === "openrouter") {
      throw new Error(
        `OpenRouter rejected the request with 401. The API key used by MikAI is missing or invalid. Re-save the OpenRouter API key in Settings, without "Bearer ".`
      );
    }
    throw new Error(
      `LLM server returned HTTP ${response.status}. ${body.slice(0, 200)}`
    );
  }

  return parseOpenAIChatResponseFull(await response.json());
}

// ---------------------------------------------------------------------------
// Core JSON caller with fallback
// ---------------------------------------------------------------------------

async function callOpenAICompatibleCore(
  prompt: LLMPrompt,
  config: LLMConfig,
  opts: { jsonMode: "strict" | "prompt-only" }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const url = buildUrl(config.baseUrl, "/chat/completions");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "MikAI Production Lab";
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: config.temperature ?? 0.7,
    stream: false,
  };

  if (opts.jsonMode === "strict") {
    body.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${config.timeoutMs}ms. The model may be loading or overloaded.`
      );
    }
    throw new Error(
      `Cannot connect to LLM server at ${config.baseUrl}. Check your settings.`
    );
  } finally {
    clearTimeout(timer);
  }

  // If response_format is rejected (400/422), retry without it
  if (opts.jsonMode === "strict" && (response.status === 400 || response.status === 422)) {
    return callOpenAICompatibleCore(prompt, config, { jsonMode: "prompt-only" });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 && config.provider === "openrouter") {
      throw new Error(
        `OpenRouter rejected the request with 401. The API key used by MikAI is missing or invalid. Re-save the OpenRouter API key in Settings, without "Bearer ".`
      );
    }
    throw new Error(
      `LLM server returned HTTP ${response.status}. ${body.slice(0, 200)}`
    );
  }

  return parseOpenAIChatResponse(await response.json());
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseOpenAIChatResponse(json: unknown): string {
  if (
    json &&
    typeof json === "object" &&
    "choices" in json &&
    Array.isArray((json as any).choices) &&
    (json as any).choices.length > 0
  ) {
    const content = (json as any).choices[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((p: unknown) => p && typeof p === "object" && (p as any).type === "text" && typeof (p as any).text === "string")
        .map((p: unknown) => (p as any).text as string)
        .join("\n");
    }
  }
  throw new Error("LLM server returned an unexpected response shape.");
}

// ---------------------------------------------------------------------------
// Full chat response parser — extracts text AND image content parts
// ---------------------------------------------------------------------------

const SAFE_RESPONSE_IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);

function isAllowedResponseImageUrl(url: unknown): url is string {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("https://") || url.startsWith("http://")) return true;
  if (url.startsWith("data:")) {
    const mime = url.slice(5).split(";")[0]?.toLowerCase() ?? "";
    return SAFE_RESPONSE_IMAGE_MIMES.has(mime);
  }
  return false;
}

function parseOpenAIChatResponseFull(json: unknown): ChatLLMResponse {
  if (
    json &&
    typeof json === "object" &&
    "choices" in json &&
    Array.isArray((json as any).choices) &&
    (json as any).choices.length > 0
  ) {
    const message = (json as any).choices[0]?.message;
    if (message) {
      const content = message.content;

      if (typeof content === "string") {
        return { text: content, images: [] };
      }

      if (Array.isArray(content)) {
        const textParts: string[] = [];
        const images: ChatGeneratedImage[] = [];

        for (const part of content) {
          if (!part || typeof part !== "object") continue;
          const p = part as Record<string, unknown>;

          if (p.type === "text" && typeof p.text === "string") {
            textParts.push(p.text);
          } else if (p.type === "image_url") {
            const imageUrl = (p.image_url as Record<string, unknown> | undefined)?.url;
            if (isAllowedResponseImageUrl(imageUrl)) {
              if (imageUrl.startsWith("data:")) {
                const mimeType = imageUrl.slice(5).split(";")[0]?.toLowerCase();
                images.push({ dataUrl: imageUrl, mimeType });
              } else {
                images.push({ url: imageUrl });
              }
            }
          }
        }

        return { text: textParts.join("\n"), images };
      }
    }
  }
  throw new Error("LLM server returned an unexpected response shape.");
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

// Standard OpenAI-compatible size strings
const IMAGE_SIZE_MAP: Record<ChatImageSize, string> = {
  square: "1024x1024",
  landscape: "1536x1024",
  portrait: "1024x1536",
};

// OpenRouter uses aspect_ratio instead of size
const IMAGE_ASPECT_RATIO_MAP: Record<ChatImageSize, string> = {
  square: "1:1",
  landscape: "16:9",
  portrait: "9:16",
};

// baseUrl suffixes that indicate a full endpoint path instead of an API root
const BAD_BASE_URL_SUFFIXES = [
  "/chat/completions",
  "/images/generations",
  "/images",
  "/completions",
];

export async function callOpenAICompatibleImageGeneration(
  config: LLMConfig,
  request: ChatImageGenerationRequest
): Promise<ChatImageGenerationResponse> {
  // Sanity-check: baseUrl must be an API root, not a specific endpoint path
  const normalizedBase = config.baseUrl.replace(/\/+$/, "").toLowerCase();
  for (const suffix of BAD_BASE_URL_SUFFIXES) {
    if (normalizedBase.endsWith(suffix)) {
      throw new Error(
        `The configured base URL ends with "${suffix}", which looks like a specific endpoint path. ` +
        `Set the base URL to the API root instead (e.g. https://openrouter.ai/api/v1) and update it in Settings.`
      );
    }
  }

  const effectiveTimeout = Math.max(config.timeoutMs, 60_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  // OpenRouter image endpoint is /images; standard OpenAI-compat uses /images/generations
  const imagePath = config.provider === "openrouter" ? "/images" : "/images/generations";
  const url = buildUrl(config.baseUrl, imagePath);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "MikAI Production Lab";
  }

  // Provider-specific payload: OpenRouter uses aspect_ratio, others use size + n
  const payload: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
  };
  if (config.provider === "openrouter") {
    payload.aspect_ratio = IMAGE_ASPECT_RATIO_MAP[request.size];

    if (typeof request.n === "number" && request.n > 1) {
      payload.n = request.n;
    }

    // Capability-driven options — only sent when explicitly set
    if (request.resolution) payload.resolution = request.resolution;
    if (request.quality) payload.quality = request.quality;
    if (request.outputFormat) payload.output_format = request.outputFormat;
    if (request.background) payload.background = request.background;

    // Reference images: full data URL, wrapped in input_references array
    if (request.referenceImages && request.referenceImages.length > 0) {
      payload.input_references = request.referenceImages.map((ref) => ({
        type: "image_url",
        image_url: { url: ref.dataUrl },
      }));
    }
  } else {
    payload.n = 1;
    payload.size = IMAGE_SIZE_MAP[request.size];

    if (request.referenceImages && request.referenceImages.length > 0) {
      throw new Error(
        "Reference images are not supported for this provider yet. Use OpenRouter with an image-editing model."
      );
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Image generation timed out after ${effectiveTimeout}ms. The model may be loading or overloaded.`
      );
    }
    throw new Error(
      `Cannot connect to LLM server at ${config.baseUrl}. Check your settings.`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    if (response.status === 401 && config.provider === "openrouter") {
      throw new Error(
        `OpenRouter rejected the request with 401. The API key used by MikAI is missing or invalid. Re-save the OpenRouter API key in Settings, without "Bearer ".`
      );
    }

    if (response.status === 404) {
      const modelHint =
        config.provider === "openrouter"
          ? ` For OpenRouter, use an image-output model (e.g. google/gemini-3.1-flash-lite-image). The currently selected model (${request.model}) may not support image generation.`
          : ` Verify the selected model (${request.model}) supports image generation at this provider, and that the base URL is an API root (e.g. https://provider/api/v1).`;
      throw new Error(
        `Image generation returned 404 — endpoint or model not found.${modelHint} (URL: ${url})`
      );
    }

    if (response.status === 400 || response.status === 422) {
      const modelHint =
        config.provider === "openrouter"
          ? ` For OpenRouter, use an image-output model (e.g. google/gemini-3.1-flash-lite-image).`
          : "";
      throw new Error(
        `Image generation returned HTTP ${response.status}.${modelHint} ${body.slice(0, 150)}`
      );
    }

    throw new Error(
      `Image generation returned HTTP ${response.status}. ${body.slice(0, 200)}`
    );
  }

  const json: unknown = await response.json();
  const images = parseImageGenerationResponse(json, { url, model: request.model });
  const count = images.length;
  return { images, text: `Generated ${count} image${count !== 1 ? "s" : ""}.` };
}

function parseImageGenerationResponse(
  json: unknown,
  context: { url: string; model: string }
): ChatGeneratedImage[] {
  const topKeys =
    json && typeof json === "object"
      ? Object.keys(json as Record<string, unknown>).join(", ")
      : "none";

  if (!json || typeof json !== "object") {
    throw new Error(
      `Image generation returned an unexpected response shape. ` +
      `Expected data[].b64_json or data[].url. ` +
      `(URL: ${context.url}, model: ${context.model})`
    );
  }

  const data = (json as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    throw new Error(
      `Image generation response missing \`data\` array. ` +
      `Expected data[].b64_json or data[].url. ` +
      `Received keys: ${topKeys}. (URL: ${context.url}, model: ${context.model})`
    );
  }

  const images: ChatGeneratedImage[] = [];
  let rejectedByMediaType = 0;

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;

    if (typeof entry.url === "string" && isAllowedResponseImageUrl(entry.url)) {
      images.push({ url: entry.url });
    } else if (typeof entry.b64_json === "string") {
      if (typeof entry.media_type === "string") {
        // media_type explicitly provided — accept only if in allowlist, hard-reject otherwise
        const rawMime = entry.media_type.toLowerCase().trim();
        if (!SAFE_RESPONSE_IMAGE_MIMES.has(rawMime)) {
          rejectedByMediaType++;
          continue;
        }
        const dataUrl = `data:${rawMime};base64,${entry.b64_json}`;
        images.push({ dataUrl, mimeType: rawMime });
      } else {
        // media_type absent — safe fallback to image/png
        const dataUrl = `data:image/png;base64,${entry.b64_json}`;
        images.push({ dataUrl, mimeType: "image/png" });
      }
    }
  }

  if (images.length === 0) {
    if (rejectedByMediaType > 0) {
      throw new Error(
        `Image generation returned images with unsupported media types. ` +
        `(URL: ${context.url}, model: ${context.model})`
      );
    }
    throw new Error(
      `Image generation returned no usable images. ` +
      `Received keys: ${topKeys}. (URL: ${context.url}, model: ${context.model})`
    );
  }
  return images;
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

export async function fetchOpenAICompatibleModelNames(
  baseUrl: string,
  apiKey: string | null,
  timeoutMs = 8000
): Promise<string[]> {
  const url = buildUrl(baseUrl, "/models");

  const isOpenRouter = baseUrl.includes("openrouter.ai");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (isOpenRouter) {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "MikAI Production Lab";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Connection timed out.");
    }
    throw new Error("Could not reach LLM server.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401 && baseUrl.includes("openrouter.ai")) {
      throw new Error(
        `OpenRouter rejected the request with 401. The API key used by MikAI is missing or invalid. Re-save the OpenRouter API key in Settings, without "Bearer ".`
      );
    }
    throw new Error(`Server returned HTTP ${response.status}.`);
  }

  const data = await response.json();

  // OpenAI-compatible: { data: [{ id: "model-name" }] }
  if (data && typeof data === "object" && Array.isArray((data as any).data)) {
    return (data as any).data.map(
      (m: { id: string; name?: string }) => m.id ?? m.name ?? ""
    );
  }

  throw new Error("Unexpected response from /models endpoint.");
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testOpenAICompatibleConnection(
  baseUrl: string,
  apiKey: string | null,
  model: string,
  timeoutMs = 10000
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  // Try cheap /models call first
  try {
    const models = await fetchOpenAICompatibleModelNames(baseUrl, apiKey, timeoutMs);
    if (models.length > 0) {
      return {
        ok: true,
        message: `Connected. ${models.length} model(s) available.`,
      };
    }
    return { ok: true, message: "Connected. No models listed (use manual model ID)." };
  } catch (err) {
    // If /models fails, try minimal chat
    if (model.trim()) {
      // Infer the provider from the URL so OpenRouter-specific headers and error messages work
      const inferredProvider = baseUrl.includes("openrouter.ai") ? "openrouter" as const : "openai-compatible" as const;
      try {
        const chatResponse = await callOpenAICompatibleChat(
          [{ role: "user", content: "OK" }],
          {
            provider: inferredProvider,
            baseUrl,
            model: model.trim(),
            apiKey,
            timeoutMs,
          }
        );
        return {
          ok: true,
          message: `Connected. Model "${model.trim()}" responded (${chatResponse.text.length} chars).`,
        };
      } catch (chatErr) {
        return {
          ok: false,
          error:
            chatErr instanceof Error
              ? chatErr.message
              : "Connection test failed.",
        };
      }
    }
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Connection test failed.",
    };
  }
}