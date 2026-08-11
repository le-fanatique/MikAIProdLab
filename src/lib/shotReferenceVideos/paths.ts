// ---------------------------------------------------------------------------
// paths.ts — SHOT.VIDEO.REFERENCES.1
//
// Server-only. Confined-path convention for a Shot's Video Reference files —
// mirrors `src/lib/shotVideoLibrary/paths.ts`'s own shape exactly, under its
// own dedicated root so a Video Reference file can never collide with (or be
// mistaken for) a `shot_videos` library file.
// ---------------------------------------------------------------------------

import path from "node:path";

export const SHOT_REFERENCE_VIDEOS_ROOT_RELATIVE = "uploads/shot-reference-videos";

export function shotReferenceVideoPathFor(shotId: number, uuid: string, ext: string): { relative: string; absolute: string } {
  const relative = `${SHOT_REFERENCE_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/${uuid}${ext}`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

/** Confines an arbitrary DB-stored relative path to this collection's own root — mirrors `isWithinShotVideosRoot`. */
export function isWithinShotReferenceVideosRoot(absolutePath: string): boolean {
  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, SHOT_REFERENCE_VIDEOS_ROOT_RELATIVE);
  return absolutePath.startsWith(allowedRoot + path.sep) || absolutePath === allowedRoot;
}

/** Owner-aware: the path must sit under THIS Shot's own `shot-<id>` subfolder, not merely somewhere under the shared root. */
export function isConfinedShotReferenceVideoPathForShot(relativePath: string, shotId: number): boolean {
  if (relativePath.includes("..") || relativePath.includes("\\") || path.isAbsolute(relativePath)) return false;
  if (!relativePath.startsWith(`${SHOT_REFERENCE_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/`)) return false;
  const absolute = path.resolve(process.cwd(), "public", relativePath);
  return isWithinShotReferenceVideosRoot(absolute);
}
