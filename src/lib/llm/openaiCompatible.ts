import type { ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";

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
 */
export async function callOpenAICompatibleChat(
  messages: ChatMessage[],
  config: LLMConfig
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
    throw new Error(
      `LLM server returned HTTP ${response.status}. ${body.slice(0, 200)}`
    );
  }

  return parseOpenAIChatResponse(await response.json());
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
  }
  throw new Error("LLM server returned an unexpected response shape.");
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
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
      try {
        const content = await callOpenAICompatibleChat(
          [{ role: "user", content: "OK" }],
          {
            provider: "openai-compatible",
            baseUrl,
            model: model.trim(),
            apiKey,
            timeoutMs,
          }
        );
        return {
          ok: true,
          message: `Connected. Model "${model.trim()}" responded (${content.length} chars).`,
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