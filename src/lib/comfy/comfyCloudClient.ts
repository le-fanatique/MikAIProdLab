import "server-only";

import fs from "fs/promises";
import path from "path";
import { COMFY_CLOUD_BASE_URL } from "@/lib/settings";
import type { ComfyOutputFile, ComfyQueuePromptResponse } from "@/lib/comfy/comfyServerClient";

// ---------------------------------------------------------------------------
// COMFY.PROVIDER.1 — Comfy Cloud REST client (https://cloud.comfy.org).
//
// Mirrors comfyServerClient.ts's local functions in naming/shape (same
// return types where possible) but is entirely separate: comfyServerClient.ts
// is left untouched as the non-regression reference for local behavior. Every
// contract detail here (prefix, headers, statuses, redirect handling) is
// taken from the real, live-verified findings in
// docs/audits/COMFY_CLOUD_SPIKE.md — never invented.
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

function cloudHeaders(cloudApiKey: string, extra?: Record<string, string>): Record<string, string> {
  return { "X-API-Key": cloudApiKey, ...extra };
}

// ---------------------------------------------------------------------------
// queueCloudPrompt — POST /api/prompt
// ---------------------------------------------------------------------------

export async function queueCloudPrompt(args: {
  workflow: Record<string, unknown>;
  cloudApiKey: string;
  /** Comfy.org Partner Node billing key — same value/semantics as the local extra_data.api_key_comfy_org. */
  partnerNodeApiKey?: string;
}): Promise<ComfyQueuePromptResponse> {
  const payload: {
    prompt: Record<string, unknown>;
    extra_data?: { api_key_comfy_org: string };
  } = { prompt: args.workflow };

  const partnerKey = args.partnerNodeApiKey?.trim();
  if (partnerKey) payload.extra_data = { api_key_comfy_org: partnerKey };

  const response = await fetch(`${COMFY_CLOUD_BASE_URL}/api/prompt`, {
    method: "POST",
    headers: cloudHeaders(args.cloudApiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`Comfy Cloud /api/prompt responded ${response.status}: ${excerpt}`);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json) || typeof json["prompt_id"] !== "string") {
    throw new Error(
      `Comfy Cloud /api/prompt response missing prompt_id: ${JSON.stringify(json).slice(0, 200)}`
    );
  }

  return {
    prompt_id: json["prompt_id"] as string,
    number: typeof json["number"] === "number" ? json["number"] : undefined,
    node_errors: json["node_errors"],
  };
}

// ---------------------------------------------------------------------------
// uploadImageToCloud — POST /api/upload/image (content-addressed by hash;
// the returned "filename" is opaque, never the original name — see spike).
// ---------------------------------------------------------------------------

export async function uploadImageToCloud(args: {
  localImagePath: string;
  filename?: string;
  cloudApiKey: string;
}): Promise<ComfyOutputFile> {
  const rawPath = args.localImagePath.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, rawPath);

  if (!absolutePath.startsWith(publicRoot + path.sep) && absolutePath !== publicRoot) {
    throw new Error(
      `uploadImageToCloud: path "${args.localImagePath}" escapes the public/ directory.`
    );
  }

  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`uploadImageToCloud: file not found at "${absolutePath}".`);
  }

  const filename = args.filename ?? path.basename(absolutePath);
  const fileBuffer = await fs.readFile(absolutePath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append("image", blob, filename);
  formData.append("type", "input");

  const response = await fetch(`${COMFY_CLOUD_BASE_URL}/api/upload/image`, {
    method: "POST",
    headers: cloudHeaders(args.cloudApiKey),
    body: formData,
  });

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`Comfy Cloud /api/upload/image responded ${response.status}: ${excerpt}`);
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
// getCloudJobDetail — GET /api/jobs/{id}, the ONLY authoritative terminal-
// state endpoint (per spike: GET /api/job/{id}/status uses an undocumented,
// non-terminal-safe status vocabulary — never used here for that reason).
// ---------------------------------------------------------------------------

export type CloudExecutionError = {
  nodeId?: string;
  nodeType?: string;
  exceptionMessage?: string;
  exceptionType?: string;
};

export type CloudJobDetail = {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  outputs: Record<string, ComfyHistoryLikeOutput> | null;
  executionError: CloudExecutionError | null;
};

/** Same shape as comfyServerClient.ts's ComfyHistoryOutput — images/videos/gifs arrays of ComfyOutputFile. */
export type ComfyHistoryLikeOutput = {
  images?: ComfyOutputFile[];
  videos?: ComfyOutputFile[];
  gifs?: ComfyOutputFile[];
  [key: string]: unknown;
};

const CLOUD_JOB_STATUSES = new Set(["pending", "in_progress", "completed", "failed", "cancelled"]);

export async function getCloudJobDetail(
  promptId: string,
  cloudApiKey: string
): Promise<CloudJobDetail> {
  const response = await fetch(
    `${COMFY_CLOUD_BASE_URL}/api/jobs/${encodeURIComponent(promptId)}`,
    { headers: cloudHeaders(cloudApiKey) }
  );

  if (response.status === 404) {
    // Not yet visible on Cloud's side — mirrors local's getComfyHistory()
    // treating a 404 as "nothing yet" rather than an error.
    return { id: promptId, status: "pending", outputs: null, executionError: null };
  }

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`Comfy Cloud /api/jobs/{id} responded ${response.status}: ${excerpt}`);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Comfy Cloud /api/jobs/{id} returned a non-object response.");
  }

  const statusRaw = json["status"];
  const status = typeof statusRaw === "string" && CLOUD_JOB_STATUSES.has(statusRaw)
    ? (statusRaw as CloudJobDetail["status"])
    : "pending";

  const outputs = isRecord(json["outputs"])
    ? (json["outputs"] as Record<string, ComfyHistoryLikeOutput>)
    : null;

  let executionError: CloudExecutionError | null = null;
  if (isRecord(json["execution_error"])) {
    const e = json["execution_error"] as Record<string, unknown>;
    executionError = {
      nodeId: typeof e["node_id"] === "string" ? e["node_id"] : undefined,
      nodeType: typeof e["node_type"] === "string" ? e["node_type"] : undefined,
      exceptionMessage: typeof e["exception_message"] === "string" ? e["exception_message"] : undefined,
      exceptionType: typeof e["exception_type"] === "string" ? e["exception_type"] : undefined,
    };
  }

  return { id: promptId, status, outputs, executionError };
}

// ---------------------------------------------------------------------------
// getCloudObjectInfo — GET /api/object_info, with a short-lived in-process
// cache (per ticket: "lire/cacher"). Every class carries an `api_node`
// boolean distinguishing free/local-compute nodes from paid Partner Nodes.
// ---------------------------------------------------------------------------

export type CloudNodeInfo = { api_node?: boolean; [key: string]: unknown };
export type CloudObjectInfo = Record<string, CloudNodeInfo>;

export async function getCloudObjectInfo(cloudApiKey: string): Promise<CloudObjectInfo> {
  const response = await fetch(`${COMFY_CLOUD_BASE_URL}/api/object_info`, {
    headers: cloudHeaders(cloudApiKey),
  });

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`Comfy Cloud /api/object_info responded ${response.status}: ${excerpt}`);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Comfy Cloud /api/object_info returned a non-object response.");
  }
  return json as CloudObjectInfo;
}

const OBJECT_INFO_CACHE_TTL_MS = 5 * 60 * 1000;
let objectInfoCache: { apiKey: string; data: CloudObjectInfo; expiresAt: number } | null = null;

/** Cached wrapper — keyed by the exact API key used, so switching Cloud keys never serves a stale cross-account cache. */
export async function getCloudObjectInfoCached(cloudApiKey: string): Promise<CloudObjectInfo> {
  const now = Date.now();
  if (objectInfoCache && objectInfoCache.apiKey === cloudApiKey && objectInfoCache.expiresAt > now) {
    return objectInfoCache.data;
  }
  const data = await getCloudObjectInfo(cloudApiKey);
  objectInfoCache = { apiKey: cloudApiKey, data, expiresAt: now + OBJECT_INFO_CACHE_TTL_MS };
  return data;
}

/** Test-only escape hatch — never used by production code paths. */
export function __resetCloudObjectInfoCacheForTests(): void {
  objectInfoCache = null;
}

// ---------------------------------------------------------------------------
// downloadCloudOutputBytes — GET /api/view, manual redirect, then a SECOND,
// header-free request to the signed URL. Per spike + OpenAPI: the API key
// must never be sent past the redirect boundary.
// ---------------------------------------------------------------------------

/**
 * Resolves GET /api/view's redirect and returns the SECOND, not-yet-consumed
 * `Response` (the signed GCS URL, fetched with no headers at all). Callers
 * choose how to consume the body — buffered (small outputs) or streamed
 * (large ones, e.g. PLY — see downloadAndSavePlyOutput in the jobs route).
 */
export async function fetchCloudOutputResponse(args: {
  filename: string;
  cloudApiKey: string;
}): Promise<Response> {
  const params = new URLSearchParams();
  params.set("filename", args.filename);
  params.set("type", "output");

  const first = await fetch(`${COMFY_CLOUD_BASE_URL}/api/view?${params.toString()}`, {
    headers: cloudHeaders(args.cloudApiKey),
    redirect: "manual",
  });

  if (first.status === 200) {
    // Tolerate a direct 200 (e.g. a future non-redirecting deployment) —
    // still never applicable to the `channel` param path MikAI doesn't use.
    return first;
  }

  if (first.status !== 302) {
    const excerpt = await readResponseText(first);
    throw new Error(`Comfy Cloud /api/view responded ${first.status}: ${excerpt}`);
  }

  const location = first.headers.get("location");
  if (!location) {
    throw new Error("Comfy Cloud /api/view returned a redirect with no Location header.");
  }

  // Deliberately NO headers at all on this second request — the signed GCS
  // URL carries its own auth in the query string; sending X-API-Key here
  // would leak it to a third-party host.
  const signed = await fetch(location);
  if (!signed.ok) {
    throw new Error(`Signed Cloud output URL responded ${signed.status}.`);
  }
  return signed;
}

export async function downloadCloudOutputBytes(args: {
  filename: string;
  cloudApiKey: string;
}): Promise<ArrayBuffer> {
  const response = await fetchCloudOutputResponse(args);
  return response.arrayBuffer();
}
