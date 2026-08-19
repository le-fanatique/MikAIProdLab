// ---------------------------------------------------------------------------
// storyboardExtraction/actionHelpers.ts — SEQGEN.STORYBOARD.EXTRACT.1
//
// Pure helpers shared by the storyboard-extraction Server Actions (split
// from the former `src/actions/storyboardExtraction.ts` by IND.SPLIT.1):
// redirect-target constructors and the source-image path resolver. No DB
// access. `resolveSourceImageAbsolutePath` touches no filesystem either —
// it only validates a path string against the expected containment root.
// ---------------------------------------------------------------------------

import path from "node:path";
import { redirect } from "next/navigation";
import { OPENCV_INPUT_IMAGE_EXTS, OpenCvWorkerError } from "@/lib/storyboardExtraction/opencvWorker";

export function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

export function okRedirectTo(returnTo: string, param: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=1`);
}

/** Resolves+validates a `sequence_storyboard_images` relative path against the same publicRoot/uploads containment pattern used across the codebase. */
export async function resolveSourceImageAbsolutePath(relativePath: string): Promise<string> {
  const publicRoot = path.join(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, "uploads", "sequence-storyboard-images");
  const absolute = path.resolve(publicRoot, relativePath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    throw new OpenCvWorkerError("Source image path is not in the expected location.");
  }
  const ext = path.extname(absolute).toLowerCase();
  if (!OPENCV_INPUT_IMAGE_EXTS.has(ext)) {
    throw new OpenCvWorkerError("Source image has an unsupported format.");
  }
  return absolute;
}
