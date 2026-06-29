import type { ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";

/**
 * Calls the Ollama /api/chat endpoint.
 * Returns the raw content string from the assistant message.
 * Throws a descriptive Error on network failure, timeout, or unexpected response shape.
 */
export async function callOllama(
  prompt: LLMPrompt,
  config: LLMConfig
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const url = `${config.baseUrl}/api/chat`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        format: "json",
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
      `Cannot connect to Ollama at ${config.baseUrl}. Make sure Ollama is running.`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 404 && body.includes("model")) {
      throw new Error(
        `Model "${config.model}" not found. Run: ollama pull ${config.model}`
      );
    }
    throw new Error(
      `Ollama returned an error (HTTP ${response.status}).`
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("Ollama returned a response that could not be parsed.");
  }

  const content =
    json &&
    typeof json === "object" &&
    "message" in json &&
    json.message &&
    typeof json.message === "object" &&
    "content" in json.message &&
    typeof (json.message as { content: unknown }).content === "string"
      ? (json.message as { content: string }).content
      : null;

  if (content === null) {
    throw new Error("Ollama returned an unexpected response shape.");
  }

  return content;
}

export async function callOllamaChat(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const url = `${config.baseUrl}/api/chat`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages,
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
      `Cannot connect to Ollama at ${config.baseUrl}. Make sure Ollama is running.`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 404 && body.includes("model")) {
      throw new Error(
        `Model "${config.model}" not found. Run: ollama pull ${config.model}`
      );
    }
    throw new Error(`Ollama returned an error (HTTP ${response.status}).`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("Ollama returned a response that could not be parsed.");
  }

  const content =
    json &&
    typeof json === "object" &&
    "message" in json &&
    json.message &&
    typeof json.message === "object" &&
    "content" in json.message &&
    typeof (json.message as { content: unknown }).content === "string"
      ? (json.message as { content: string }).content
      : null;

  if (content === null) {
    throw new Error("Ollama returned an unexpected response shape.");
  }

  return content;
}

/**
 * Unloads an Ollama model from VRAM by sending a generate request with keep_alive: 0.
 * Uses /api/generate (simpler than /api/chat for a no-output unload — no messages array needed).
 * Never throws — returns a safe result object.
 */
export async function unloadOllamaModel(
  baseUrl: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  if (!baseUrl || !model) {
    return { ok: false, error: "Missing baseUrl or model for Ollama unload." };
  }
  const cleanUrl = baseUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${cleanUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", keep_alive: 0, stream: false }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Ollama /api/generate responded ${response.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error unloading Ollama model.",
    };
  }
}

export async function fetchOllamaModelNames(
  baseUrl: string,
  timeoutMs = 8000
): Promise<string[]> {
  const cleanUrl = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${cleanUrl}/api/tags`, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Connection timed out. Make sure Ollama is running.");
    }
    throw new Error("Could not reach Ollama. Make sure Ollama is running.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}.`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Ollama returned an unexpected response.");
  }
  const models = (data as { models?: { name: string }[] })?.models ?? [];
  return models.map((m) => m.name);
}
