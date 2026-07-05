import "server-only";

import type { ImageModelInfo, LLMConfig } from "@/types/llm";

// ---------------------------------------------------------------------------
// OpenRouter image model discovery — GET {baseUrl}/images/models
// ---------------------------------------------------------------------------

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

// supported_parameters entries: { type: "enum", values: [...] } or { type: "range", min, max }
function enumValues(param: unknown): string[] | undefined {
  if (!isRecord(param)) return undefined;
  return asStringArray(param["values"]);
}

function rangeMax(param: unknown): number | undefined {
  if (!isRecord(param)) return undefined;
  return asPositiveNumber(param["max"]);
}

/**
 * Normalizes one raw model entry defensively. Returns null when no usable id.
 * Unknown fields are ignored; absent capabilities stay undefined so the UI
 * falls back to safe defaults.
 */
function normalizeImageModel(raw: unknown): ImageModelInfo | null {
  if (!isRecord(raw)) return null;

  const id =
    typeof raw["id"] === "string" && raw["id"].trim()
      ? raw["id"].trim()
      : typeof raw["slug"] === "string" && raw["slug"].trim()
        ? raw["slug"].trim()
        : null;
  if (!id) return null;

  // Real OpenRouter schema (verified): typed params under supported_parameters —
  // e.g. aspect_ratio {enum, values}, n {range, min, max}, input_references {range}.
  // Legacy/alternate shapes (capabilities object, root fields) kept as fallbacks.
  const params = isRecord(raw["supported_parameters"]) ? raw["supported_parameters"] : {};
  const capabilities = isRecord(raw["capabilities"]) ? raw["capabilities"] : {};
  const architecture = isRecord(raw["architecture"]) ? raw["architecture"] : {};

  const aspectRatios =
    enumValues(params["aspect_ratio"]) ??
    asStringArray(capabilities["aspect_ratios"]) ??
    asStringArray(raw["aspect_ratios"]);
  const resolutions =
    enumValues(params["resolution"]) ??
    asStringArray(capabilities["resolutions"]) ??
    asStringArray(raw["resolutions"]);
  const outputFormats =
    enumValues(params["output_format"]) ??
    asStringArray(capabilities["output_formats"]) ??
    asStringArray(raw["output_formats"]);
  const qualities =
    enumValues(params["quality"]) ??
    asStringArray(capabilities["qualities"]) ??
    asStringArray(raw["qualities"]);
  const maxImages =
    rangeMax(params["n"]) ??
    asPositiveNumber(capabilities["max_images"]) ??
    asPositiveNumber(raw["max_images"]);

  // References support: input_references range (max > 0), explicit flags,
  // then image listed as an input modality as a last resort
  let supportsReferences: boolean | undefined;
  const refsMax = rangeMax(params["input_references"]);
  if (refsMax !== undefined) {
    supportsReferences = refsMax > 0;
  } else if (isRecord(params["input_references"])) {
    supportsReferences = false; // present but max 0 / unparseable
  } else if (typeof capabilities["input_references"] === "boolean") {
    supportsReferences = capabilities["input_references"];
  } else if (typeof capabilities["supports_references"] === "boolean") {
    supportsReferences = capabilities["supports_references"];
  } else {
    const inputModalities =
      asStringArray(architecture["input_modalities"]) ?? asStringArray(raw["input_modalities"]);
    if (inputModalities) {
      supportsReferences = inputModalities.includes("image");
    }
  }

  return {
    id,
    name: typeof raw["name"] === "string" && raw["name"].trim() ? raw["name"].trim() : undefined,
    description:
      typeof raw["description"] === "string" && raw["description"].trim()
        ? raw["description"].trim()
        : undefined,
    aspectRatios,
    resolutions,
    outputFormats,
    qualities,
    maxImages,
    supportsReferences,
  };
}

/**
 * Fetches the list of image generation models from OpenRouter.
 * Only call this for provider === "openrouter".
 * Throws a clear error when the API key is missing or the request fails.
 */
export async function fetchOpenRouterImageModels(
  config: LLMConfig,
  timeoutMs = 10000
): Promise<ImageModelInfo[]> {
  if (!config.apiKey?.trim()) {
    throw new Error("OpenRouter API key required for image generation.");
  }

  const url = buildUrl(config.baseUrl, "/images/models");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "MikAI Production Lab",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Image model discovery timed out.");
    }
    throw new Error("Could not reach OpenRouter for image model discovery.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        `OpenRouter rejected the request with 401. The API key used by MikAI is missing or invalid. Re-save the OpenRouter API key in Settings, without "Bearer ".`
      );
    }
    throw new Error(`Image model discovery returned HTTP ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("Image model discovery returned an unparseable response.");
  }

  // Accept data[], models[], or a bare array
  let rawList: unknown[] = [];
  if (Array.isArray(json)) {
    rawList = json;
  } else if (isRecord(json)) {
    if (Array.isArray(json["data"])) rawList = json["data"];
    else if (Array.isArray(json["models"])) rawList = json["models"];
  }

  return rawList
    .map(normalizeImageModel)
    .filter((m): m is ImageModelInfo => m !== null);
}
