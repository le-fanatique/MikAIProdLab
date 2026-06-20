import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_REFERENCE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export type SaveReferenceImageResult = {
  imagePath: string;
  sourceFilename: string | null;
};

export type SaveReferenceImageErrorCode =
  | "missing_file"
  | "invalid_file"
  | "file_too_large"
  | "invalid_file_type";

export class SaveReferenceImageError extends Error {
  code: SaveReferenceImageErrorCode;

  constructor(code: SaveReferenceImageErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "SaveReferenceImageError";
  }
}

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const SAFE_SUBFOLDER = /^[a-zA-Z0-9_-]+$/;

type FileLike = {
  size: number;
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["size"] === "number" &&
    typeof (value as Record<string, unknown>)["name"] === "string" &&
    typeof (value as Record<string, unknown>)["arrayBuffer"] === "function"
  );
}

export async function saveReferenceImage(
  fileValue: FormDataEntryValue | null,
  subfolder: string
): Promise<SaveReferenceImageResult> {
  if (!SAFE_SUBFOLDER.test(subfolder)) {
    throw new SaveReferenceImageError("invalid_file", "Invalid subfolder name");
  }

  if (!isFileLike(fileValue)) {
    throw new SaveReferenceImageError("missing_file", "No file provided");
  }

  if (fileValue.size <= 0) {
    throw new SaveReferenceImageError("missing_file", "File is empty");
  }

  if (fileValue.size > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
    throw new SaveReferenceImageError("file_too_large", "File exceeds 10 MB limit");
  }

  const ext = path.extname(fileValue.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new SaveReferenceImageError("invalid_file_type", `File type not allowed: ${ext || "(none)"}`);
  }

  const uuid = randomUUID();
  const filename = `${uuid}${ext}`;
  const relativeDir = path.join("uploads", "reference-images", subfolder);
  const absoluteDir = path.join(process.cwd(), "public", relativeDir);
  const absolutePath = path.join(absoluteDir, filename);

  const buffer = await fileValue.arrayBuffer();

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, Buffer.from(buffer));

  const imagePath = `uploads/reference-images/${subfolder}/${filename}`;
  const sourceFilename = fileValue.name || null;

  return { imagePath, sourceFilename };
}

export async function deleteStoredReferenceImage(imagePath: string | null): Promise<void> {
  try {
    if (!imagePath) return;
    if (!imagePath.startsWith("uploads/reference-images/")) return;
    if (imagePath.includes("..") || imagePath.includes("\\") || path.isAbsolute(imagePath)) return;

    const absolutePath = path.join(process.cwd(), "public", imagePath);
    const safeBase = path.join(process.cwd(), "public", "uploads", "reference-images");

    if (!absolutePath.startsWith(safeBase + path.sep) && absolutePath !== safeBase) return;

    await unlink(absolutePath);
  } catch {
    // best-effort — silent failure
  }
}
