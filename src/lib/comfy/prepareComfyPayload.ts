import "server-only";

import { uploadImageToComfy } from "@/lib/comfy/comfyServerClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrepareComfyPayloadResult = {
  workflow: Record<string, unknown>;
  uploadedImages: {
    nodeId: string;
    originalPath: string;
    comfyFilename: string;
    subfolder?: string;
    type?: string;
  }[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// prepareComfyPayloadForQueue
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalAppImagePath(imagePath: string): boolean {
  return (
    imagePath.includes("/") ||
    imagePath.includes("\\") ||
    imagePath.startsWith("uploads/") ||
    imagePath.startsWith("/uploads/")
  );
}

export async function prepareComfyPayloadForQueue(
  workflow: Record<string, unknown>
): Promise<PrepareComfyPayloadResult> {
  const clone = JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;
  const uploadedImages: PrepareComfyPayloadResult["uploadedImages"] = [];
  const warnings: string[] = [];

  for (const [nodeId, node] of Object.entries(clone)) {
    if (!isRecord(node)) continue;

    const inputs = node["inputs"];
    if (!isRecord(inputs)) continue;

    const imagePath = inputs["image"];
    if (typeof imagePath !== "string") continue;
    if (!isLocalAppImagePath(imagePath)) continue;

    const uploaded = await uploadImageToComfy({ localImagePath: imagePath });

    inputs["image"] = uploaded.filename;

    uploadedImages.push({
      nodeId,
      originalPath: imagePath,
      comfyFilename: uploaded.filename,
      subfolder: uploaded.subfolder,
      type: uploaded.type,
    });
  }

  if (uploadedImages.length > 0) {
    warnings.push(
      "Local reference images were uploaded to ComfyUI and LoadImage inputs were rewritten to ComfyUI filenames."
    );
  }

  return { workflow: clone, uploadedImages, warnings };
}
