import "server-only";

import { getInvokeBaseUrl } from "@/lib/settings";
import type { InvokeWorkflowDocument, InvokeWorkflowDocumentWithId } from "@/lib/invoke/invokeSendToMikaiWorkflow";
import { invokeImageContentType } from "@/lib/invoke/invokeImageContentType";

// ---------------------------------------------------------------------------
// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §3.2. Modeled on
// src/lib/comfy/comfyServerClient.ts: URL normalization, an excerpt of the
// response body on error, error messages in English naming the HTTP status.
//
// Endpoint signatures read from the InvokeAI 6.14.0 install
// (F:\AI\Invoke\.venv\Lib\site-packages\invokeai\app\api\routers\
// {app_info,boards,images,workflows}.py), not supposed. Each function below
// names its source lines. None of these calls has been exercised against a
// running InvokeAI instance — it did not respond on 127.0.0.1:9090 on
// 2026-09-17 — see the executor report for what remains network-unverified,
// endpoint by endpoint.
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
// normalizeInvokeBaseUrl / getConfiguredInvokeBaseUrl
// ---------------------------------------------------------------------------

const INVOKE_BASE_URL_FALLBACK = "http://127.0.0.1:9090";

/** Pure — same contract as `normalizeComfyBaseUrl`: trims, drops trailing slashes, throws on a value that isn't http(s). */
export function normalizeInvokeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return INVOKE_BASE_URL_FALLBACK;

  const stripped = trimmed.replace(/\/+$/, "");

  if (!stripped.startsWith("http://") && !stripped.startsWith("https://")) {
    throw new Error(`Invalid InvokeAI base URL: "${stripped}". Must start with http:// or https://.`);
  }

  return stripped;
}

export async function getConfiguredInvokeBaseUrl(): Promise<string> {
  const baseUrl = await getInvokeBaseUrl();
  return normalizeInvokeBaseUrl(baseUrl);
}

// ---------------------------------------------------------------------------
// Pure request-URL builders — testable without network.
// ---------------------------------------------------------------------------

export function buildInvokeVersionUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/app/version`;
}

/** `GET /api/v1/app/runtime_config` (`app_info.py`, `AdminUserOrDefault`) — the only endpoint this version exposes that carries the `multiuser` flag. In single-user mode, `AdminUserOrDefault` resolves without any credentials; a 401/403 here is itself the multi-user signal. */
export function buildInvokeRuntimeConfigUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/app/runtime_config`;
}

/** `GET /api/v1/boards/` (`boards.py`, `list_boards`) — requires either `all=true` or both `offset` and `limit`, or it 400s; this client always asks for the full list. */
export function buildInvokeBoardsListUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/boards/?all=true`;
}

/** `POST /api/v1/boards/` (`boards.py`, `create_board`) — `board_name` is a query param, not a JSON/form body field. */
export function buildInvokeCreateBoardUrl(baseUrl: string, name: string): string {
  const params = new URLSearchParams({ board_name: name });
  return `${baseUrl}/api/v1/boards/?${params.toString()}`;
}

/** `POST /api/v1/images/upload` (`images.py`, `upload_image`). */
export function buildInvokeUploadUrl(baseUrl: string, args: { boardId: string }): string {
  const params = new URLSearchParams({
    image_category: "user",
    is_intermediate: "false",
    board_id: args.boardId,
  });
  return `${baseUrl}/api/v1/images/upload?${params.toString()}`;
}

// INVOKE.SYNC.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.3, ticket §1.2. Same
// `GET /api/v1/images/?board_id=…` route as the board gallery uses
// (`images.py`, `list_image_dtos`), with `limit=0` for the count-only poll
// (`{"limit":0,"offset":0,"total":N,"items":[]}`, verified against the
// author's own Invoke 6.14.0) and `limit=MAX_PAGE_SIZE` (1000,
// `pagination.py`) to actually list a board's images once its total has
// moved. A board past 1000 images is out of scope for this ticket — see the
// executor report.
export const INVOKE_IMAGES_LIST_MAX_PAGE_SIZE = 1000;

export function buildInvokeImagesPageUrl(
  baseUrl: string,
  args: { boardId: string; limit: number }
): string {
  const params = new URLSearchParams({
    board_id: args.boardId,
    is_intermediate: "false",
    limit: String(args.limit),
    offset: "0",
  });
  return `${baseUrl}/api/v1/images/?${params.toString()}`;
}

/** `GET /api/v1/images/i/{image_name}/full` (`images.py`, `get_image_full`). */
export function buildInvokeImageFullUrl(baseUrl: string, imageName: string): string {
  return `${baseUrl}/api/v1/images/i/${encodeURIComponent(imageName)}/full`;
}

export function buildInvokeWorkflowsCreateUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/workflows/`;
}

/** `PATCH /api/v1/workflows/i/{workflow_id}` — the URL segment is required by the route, but `update_workflow` (`workflows.py`) reads the target workflow from the body's `workflow.id`, not from this path segment. */
export function buildInvokeWorkflowsUpdateUrl(baseUrl: string, workflowId: string): string {
  return `${baseUrl}/api/v1/workflows/i/${encodeURIComponent(workflowId)}`;
}

// ---------------------------------------------------------------------------
// Pure response parsers — testable without network.
// ---------------------------------------------------------------------------

export function parseInvokeAppVersion(json: unknown): { version: string } {
  if (!isRecord(json) || typeof json["version"] !== "string") {
    throw new Error(`InvokeAI /app/version response missing "version": ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { version: json["version"] };
}

export function parseInvokeRuntimeConfigMultiuser(json: unknown): boolean {
  if (!isRecord(json) || !isRecord(json["config"]) || typeof json["config"]["multiuser"] !== "boolean") {
    throw new Error(
      `InvokeAI /app/runtime_config response missing "config.multiuser": ${JSON.stringify(json).slice(0, 200)}`
    );
  }
  return json["config"]["multiuser"];
}

export function parseInvokeBoardDto(json: unknown): { boardId: string; boardName: string } {
  if (!isRecord(json) || typeof json["board_id"] !== "string" || typeof json["board_name"] !== "string") {
    throw new Error(`InvokeAI board response missing "board_id"/"board_name": ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { boardId: json["board_id"], boardName: json["board_name"] };
}

export function parseInvokeBoardDtoList(json: unknown): { boardId: string; boardName: string }[] {
  if (!Array.isArray(json)) {
    throw new Error(`InvokeAI board list response was not an array: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.map((entry) => parseInvokeBoardDto(entry));
}

export function parseInvokeImageDto(json: unknown): { imageName: string } {
  if (!isRecord(json) || typeof json["image_name"] !== "string") {
    throw new Error(`InvokeAI image upload response missing "image_name": ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { imageName: json["image_name"] };
}

/** The paginated `/images/` response shape (`OffsetPaginatedResults[ImageDTO]`): only `total` and each item's `image_name` are read — every other ImageDTO field is ignored by this ticket. */
export function parseInvokeImagesPage(json: unknown): { total: number; items: { imageName: string }[] } {
  if (!isRecord(json) || typeof json["total"] !== "number" || !Array.isArray(json["items"])) {
    throw new Error(`InvokeAI /images/ (list) response missing "total"/"items": ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { total: json["total"], items: json["items"].map((entry) => parseInvokeImageDto(entry)) };
}

export function parseInvokeWorkflowRecordDto(json: unknown): { workflowId: string } {
  if (!isRecord(json) || typeof json["workflow_id"] !== "string") {
    throw new Error(`InvokeAI workflow response missing "workflow_id": ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { workflowId: json["workflow_id"] };
}

// ---------------------------------------------------------------------------
// getInvokeAppVersion
// ---------------------------------------------------------------------------

export async function getInvokeAppVersion(): Promise<{ version: string }> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeVersionUrl(baseUrl));
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`InvokeAI /app/version responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeAppVersion(await response.json());
}

// ---------------------------------------------------------------------------
// assertInvokeSingleUser — throws on a detected multi-user Invoke instance.
// ---------------------------------------------------------------------------

export async function assertInvokeSingleUser(baseUrl: string): Promise<void> {
  const response = await fetch(buildInvokeRuntimeConfigUrl(baseUrl));

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "InvokeAI appears to be running in multi-user mode (authentication required). MikAI does not support Invoke authentication yet."
    );
  }

  if (!response.ok) {
    // Any other failure (404 on an older/newer build, network hiccup already
    // surfaced as a rejected fetch, …) is not itself evidence of multi-user
    // mode — do not fail a push over an endpoint this ticket cannot fully
    // verify against a running Invoke. See the executor report.
    return;
  }

  const multiuser = parseInvokeRuntimeConfigMultiuser(await response.json());
  if (multiuser) {
    throw new Error(
      "InvokeAI is running in multi-user mode. MikAI does not support Invoke authentication yet."
    );
  }
}

// ---------------------------------------------------------------------------
// createInvokeBoard / listInvokeBoards
// ---------------------------------------------------------------------------

export async function createInvokeBoard(name: string): Promise<{ boardId: string; boardName: string }> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeCreateBoardUrl(baseUrl, name), { method: "POST" });
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`InvokeAI /boards/ (create) responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeBoardDto(await response.json());
}

export async function listInvokeBoards(): Promise<{ boardId: string; boardName: string }[]> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeBoardsListUrl(baseUrl));
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`InvokeAI /boards/ (list) responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeBoardDtoList(await response.json());
}

// ---------------------------------------------------------------------------
// uploadInvokeImage
// ---------------------------------------------------------------------------

export interface UploadInvokeImageArgs {
  boardId: string;
  bytes: Buffer | Uint8Array;
  filename: string;
  /** Arbitrary provenance metadata — MikAI's own choice of shape (docs/INVOKE_ROUNDTRIP_SPEC.md §5.1 step 3: project, entity type/id, source path). Sent as a stringified JSON body field, per `images.py`'s `metadata: Optional[str] = Body(..., embed=True)`. */
  metadata: Record<string, unknown>;
}

/**
 * `POST /api/v1/images/upload`. The endpoint mixes an `UploadFile` (`file`)
 * with `Body(embed=True)` fields (`metadata`) in the same signature —
 * FastAPI serves that combination as a single multipart/form-data request,
 * where `metadata` is a form field whose value is the metadata object
 * JSON-stringified (never a nested JSON body — a file upload and a JSON
 * body cannot coexist on one request). This shape follows directly from
 * `images.py`'s signature but was not exercised against a running Invoke —
 * see the executor report.
 */
export async function uploadInvokeImage(args: UploadInvokeImageArgs): Promise<{ imageName: string }> {
  const baseUrl = await getConfiguredInvokeBaseUrl();

  const form = new FormData();
  // INVOKE.PUSH.1-FIX2 — the type is not optional: a Blob built without one
  // is sent as application/octet-stream, and `upload_image` answers
  // `415 {"detail":"Not an image"}` before reading a single byte.
  form.append(
    "file",
    new Blob([new Uint8Array(args.bytes)], { type: invokeImageContentType(args.filename) }),
    args.filename
  );
  form.append("metadata", JSON.stringify(args.metadata));

  const response = await fetch(buildInvokeUploadUrl(baseUrl, { boardId: args.boardId }), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`InvokeAI /images/upload responded ${response.status}: ${excerpt}`);
  }

  return parseInvokeImageDto(await response.json());
}

// ---------------------------------------------------------------------------
// getInvokeBoardImageCount / listInvokeBoardImages / downloadInvokeImageBytes
// ---------------------------------------------------------------------------

function isInvokeBoardNotFoundError(status: number, excerpt: string): boolean {
  // `list_image_dtos` (images.py) does not itself validate `board_id` against
  // the boards table — a deleted board's id simply matches zero images, a
  // 200 with `total: 0`, not a 404. The only realistic 404 on this route is a
  // malformed request; treated as "board gone" per ticket §1.5/spec §6 so a
  // stale `invoke_boards` row does not sync forever against nothing.
  return status === 404 || /not found/i.test(excerpt);
}

/** `GET /api/v1/images/?board_id=…&limit=0&is_intermediate=false` (ticket §1.2) — the count-only poll: no `items`, so no image is ever listed or downloaded when nothing changed. */
export async function getInvokeBoardImageCount(boardId: string): Promise<number> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeImagesPageUrl(baseUrl, { boardId, limit: 0 }));
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    if (isInvokeBoardNotFoundError(response.status, excerpt)) {
      throw new Error(`InvokeAI board "${boardId}" was not found (responded ${response.status}).`);
    }
    throw new Error(`InvokeAI /images/ (count) responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeImagesPage(await response.json()).total;
}

/** `GET /api/v1/images/?board_id=…&limit=1000&is_intermediate=false` — only called once the count-only poll above has found a change (ticket §1.2). */
export async function listInvokeBoardImages(boardId: string): Promise<{ imageName: string }[]> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(
    buildInvokeImagesPageUrl(baseUrl, { boardId, limit: INVOKE_IMAGES_LIST_MAX_PAGE_SIZE })
  );
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    if (isInvokeBoardNotFoundError(response.status, excerpt)) {
      throw new Error(`InvokeAI board "${boardId}" was not found (responded ${response.status}).`);
    }
    throw new Error(`InvokeAI /images/ (list) responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeImagesPage(await response.json()).items;
}

/** `GET /api/v1/images/i/{image_name}/full` (`images.py`, `get_image_full`). */
export async function downloadInvokeImageBytes(imageName: string): Promise<Buffer> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeImageFullUrl(baseUrl, imageName));
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    if (isInvokeBoardNotFoundError(response.status, excerpt)) {
      throw new Error(`InvokeAI image "${imageName}" was not found (responded ${response.status}).`);
    }
    throw new Error(`InvokeAI /images/i/${imageName}/full responded ${response.status}: ${excerpt}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// createInvokeWorkflow / updateInvokeWorkflow
// ---------------------------------------------------------------------------

/** `POST /api/v1/workflows/` — body is `{ "workflow": <WorkflowWithoutID> }` (`Body(embed=True)` in `workflows.py`'s `create_workflow`). */
export async function createInvokeWorkflow(workflow: InvokeWorkflowDocument): Promise<{ workflowId: string }> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeWorkflowsCreateUrl(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`InvokeAI /workflows/ (create) responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeWorkflowRecordDto(await response.json());
}

/** `PATCH /api/v1/workflows/i/{workflow_id}` — body is `{ "workflow": <Workflow> }` (`workflow.id` must equal `id`; `update_workflow` resolves the target from the body, the URL segment is unused by the handler but still required by the route). */
export async function updateInvokeWorkflow(
  id: string,
  workflow: InvokeWorkflowDocumentWithId
): Promise<{ workflowId: string }> {
  const baseUrl = await getConfiguredInvokeBaseUrl();
  const response = await fetch(buildInvokeWorkflowsUpdateUrl(baseUrl, id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!response.ok) {
    const excerpt = await readResponseText(response);
    throw new Error(`InvokeAI /workflows/i/${id} (update) responded ${response.status}: ${excerpt}`);
  }
  return parseInvokeWorkflowRecordDto(await response.json());
}
