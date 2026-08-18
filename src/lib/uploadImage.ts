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

export const REFERENCE_IMAGES_RELATIVE_ROOT = "uploads/reference-images";

/**
 * String-level confinement predicate for an `imagePath` stored by
 * `saveReferenceImage` above — the Asset/Shot reference-image family's own
 * rule, owned by the module that owns the storage root.
 *
 * LLMW.DESCRIPTOR.IMAGE.1 (B16a) exported it. The rule itself is not new: it
 * was written inline inside `deleteStoredReferenceImage` below, which now
 * calls this function instead, so there is exactly one definition of what
 * "confined to this family's root" means. A second caller
 * (`src/lib/llmWorkspace/images/registry.ts`) needs the same rule *before a
 * read* rather than before a delete, and a family whose confinement rule can
 * only be reached through a deletion helper invites a divergent copy — the
 * precedent `isConfinedReferenceImagePath`
 * (`src/lib/projectStyle/uploadReferenceImage.ts`) already set for Project
 * Style's own, separate root.
 *
 * The absolute-path check is kept alongside the string check because they
 * refuse different things: the string form catches a traversal or a foreign
 * prefix in the stored value, and `path.join`'s normalisation catches what
 * survives it.
 */
export function isConfinedUploadedReferenceImagePath(imagePath: string | null | undefined): boolean {
  if (typeof imagePath !== "string" || imagePath.length === 0 || imagePath.length > 1024) return false;
  if (!imagePath.startsWith(`${REFERENCE_IMAGES_RELATIVE_ROOT}/`)) return false;
  if (imagePath.includes("..") || imagePath.includes("\\") || imagePath.includes("\0")) return false;
  if (path.isAbsolute(imagePath)) return false;
  // A value naming the root directory rather than a file inside it. Caught
  // explicitly because `path.join` preserves a trailing separator, so the
  // prefix comparison below would otherwise accept `uploads/reference-images/`
  // itself — harmless for a read (opening a directory fails), not harmless for
  // the deletion helper that shares this rule.
  if (imagePath.endsWith("/")) return false;

  const absolutePath = path.join(process.cwd(), "public", imagePath);
  const safeBase = path.join(process.cwd(), "public", REFERENCE_IMAGES_RELATIVE_ROOT);
  return absolutePath.startsWith(safeBase + path.sep);
}

export async function deleteStoredReferenceImage(imagePath: string | null): Promise<void> {
  try {
    if (!isConfinedUploadedReferenceImagePath(imagePath)) return;
    await unlink(path.join(process.cwd(), "public", imagePath as string));
  } catch {
    // best-effort — silent failure
  }
}
