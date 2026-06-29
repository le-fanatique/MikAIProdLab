import "server-only";

import fs from "fs/promises";
import path from "path";
import { getComfySettings } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComfyQueuePromptResponse = {
  prompt_id: string;
  number?: number;
  node_errors?: unknown;
};

export type ComfyOutputFile = {
  filename: string;
  subfolder?: string;
  type?: string;
};

export type ComfyHistoryOutput = {
  images?: ComfyOutputFile[];
  videos?: ComfyOutputFile[];
  gifs?: ComfyOutputFile[];
  [key: string]: unknown;
};

export type ComfyHistoryEntry = {
  outputs?: Record<string, ComfyHistoryOutput>;
  status?: unknown;
  prompt?: unknown;
  [key: string]: unknown;
};

export type ComfyHistoryResponse = Record<string, ComfyHistoryEntry>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return "(could not read response body)";
  }
}

// ---------------------------------------------------------------------------
// normalizeComfyBaseUrl
// ---------------------------------------------------------------------------

export function normalizeComfyBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "http://127.0.0.1:8188";

  const stripped = trimmed.replace(/\/+$/, "");

  if (!stripped.startsWith("http://") && !stripped.startsWith("https://")) {
    throw new Error(
      `Invalid ComfyUI base URL: "${stripped}". Must start with http:// or https://.`
    );
  }

  return stripped;
}

// ---------------------------------------------------------------------------
// getConfiguredComfyBaseUrl
// ---------------------------------------------------------------------------

export async function getConfiguredComfyBaseUrl(): Promise<string> {
  const settings = await getComfySettings();
  return normalizeComfyBaseUrl(settings.baseUrl);
}

// ---------------------------------------------------------------------------
// queueComfyPrompt
// ---------------------------------------------------------------------------

export async function queueComfyPrompt(args: {
  workflow: Record<string, unknown>;
  clientId: string;
}): Promise<ComfyQueuePromptResponse> {
  const settings = await getComfySettings();
  const baseUrl = normalizeComfyBaseUrl(settings.baseUrl);

  const payload: {
    client_id: string;
    prompt: Record<string, unknown>;
    extra_data?: { api_key_comfy_org: string };
  } = {
    client_id: args.clientId,
    prompt: args.workflow,
  };

  const apiKey = settings.apiKey.trim();
  if (apiKey) {
    payload.extra_data = { api_key_comfy_org: apiKey };
  }

  const body = JSON.stringify(payload);

  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(
      `ComfyUI /prompt responded ${response.status}: ${excerpt}`
    );
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json) || typeof json["prompt_id"] !== "string") {
    throw new Error(
      `ComfyUI /queue/prompt response missing prompt_id: ${JSON.stringify(json).slice(0, 200)}`
    );
  }

  return {
    prompt_id: json["prompt_id"] as string,
    number: typeof json["number"] === "number" ? json["number"] : undefined,
    node_errors: json["node_errors"],
  };
}

// ---------------------------------------------------------------------------
// getComfyHistory
// ---------------------------------------------------------------------------

export async function getComfyHistory(
  promptId: string
): Promise<ComfyHistoryResponse> {
  const baseUrl = await getConfiguredComfyBaseUrl();

  const response = await fetch(
    `${baseUrl}/history/${encodeURIComponent(promptId)}`
  );

  if (response.status === 404) return {};

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(
      `ComfyUI /history responded ${response.status}: ${excerpt}`
    );
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) return {};

  return json as ComfyHistoryResponse;
}

// ---------------------------------------------------------------------------
// buildComfyViewUrl
// ---------------------------------------------------------------------------

export function buildComfyViewUrl(args: {
  baseUrl: string;
  file: ComfyOutputFile;
}): string {
  const params = new URLSearchParams();
  params.set("filename", args.file.filename);
  if (args.file.subfolder) params.set("subfolder", args.file.subfolder);
  params.set("type", args.file.type ?? "output");
  return `${args.baseUrl}/view?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// uploadImageToComfy
// ---------------------------------------------------------------------------

export async function uploadImageToComfy(args: {
  localImagePath: string;
  filename?: string;
}): Promise<ComfyOutputFile> {
  const baseUrl = await getConfiguredComfyBaseUrl();

  // Resolve to absolute path inside public/
  const rawPath = args.localImagePath.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");

  // Paths coming from DB are like "uploads/reference-images/..."
  // We resolve relative to public/
  const absolutePath = path.resolve(publicRoot, rawPath);

  // Security: ensure we stay inside public/
  if (!absolutePath.startsWith(publicRoot + path.sep) && absolutePath !== publicRoot) {
    throw new Error(
      `uploadImageToComfy: path "${args.localImagePath}" escapes the public/ directory.`
    );
  }

  // Verify file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(
      `uploadImageToComfy: file not found at "${absolutePath}".`
    );
  }

  const filename = args.filename ?? path.basename(absolutePath);
  const fileBuffer = await fs.readFile(absolutePath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append("image", blob, filename);

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(
      `ComfyUI /upload/image responded ${response.status}: ${excerpt}`
    );
  }

  const json = (await response.json()) as unknown;
  const result = isRecord(json) ? json : {};

  return {
    filename: typeof result["name"] === "string" ? result["name"] : filename,
    subfolder: typeof result["subfolder"] === "string" ? result["subfolder"] : "",
    type: typeof result["type"] === "string" ? result["type"] : "input",
  };
}

// ---------------------------------------------------------------------------
// freeComfyVRAM
// ---------------------------------------------------------------------------

/**
 * Calls ComfyUI POST /free to unload models and free VRAM.
 * Never throws — returns a safe result object.
 * Returns { ok: false } silently on 404/405 (older ComfyUI builds without /free).
 */
export async function freeComfyVRAM(
  baseUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  let resolvedUrl: string;
  try {
    resolvedUrl = baseUrl ?? (await getConfiguredComfyBaseUrl());
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resolve ComfyUI base URL.",
    };
  }

  try {
    const response = await fetch(`${resolvedUrl}/free`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });

    if (!response.ok) {
      const excerpt = await readResponseText(response);
      return {
        ok: false,
        error: `ComfyUI /free responded ${response.status}: ${excerpt}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error calling /free.",
    };
  }
}

// ---------------------------------------------------------------------------
// extractFirstComfyOutput
// ---------------------------------------------------------------------------

export function extractFirstComfyOutput(
  history: ComfyHistoryResponse,
  promptId: string
): ComfyOutputFile | null {
  const entry = history[promptId];
  if (!entry || !isRecord(entry["outputs"])) return null;

  const outputNodes = Object.values(
    entry["outputs"] as Record<string, ComfyHistoryOutput>
  );

  // Priority: videos → gifs → images
  for (const output of outputNodes) {
    if (Array.isArray(output.videos) && output.videos.length > 0) {
      return output.videos[0];
    }
  }
  for (const output of outputNodes) {
    if (Array.isArray(output.gifs) && output.gifs.length > 0) {
      return output.gifs[0];
    }
  }
  for (const output of outputNodes) {
    if (Array.isArray(output.images) && output.images.length > 0) {
      return output.images[0];
    }
  }

  return null;
}
