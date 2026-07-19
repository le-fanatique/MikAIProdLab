// ---------------------------------------------------------------------------
// paths.ts — SHOT.VIDEO.LIBRARY.1
//
// Server-only. Confined-path convention for a "generation"-sourced Shot
// Video Library entry's durable file — the exact same
// `uploads/shot-videos/shot-<id>/<uuid>.<ext>` layout `approveVideoOutput`
// (src/actions/generation.ts) already used before this ticket, extracted
// here so both the save-to-library and the (still-supported) direct-approve
// paths agree on one convention rather than two independently hardcoded ones.
// ---------------------------------------------------------------------------

import path from "node:path";

export const SHOT_VIDEOS_ROOT_RELATIVE = "uploads/shot-videos";

export function shotVideoLibraryPathFor(shotId: number, uuid: string, ext: string): { relative: string; absolute: string } {
  const relative = `${SHOT_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/${uuid}${ext}`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

/** Confines an arbitrary DB-stored relative path to the library's own root — mirrors every other `*RootRelative` confinement check in this codebase (e.g. `SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE` in `cutSegmentClip.ts`). */
export function isWithinShotVideosRoot(absolutePath: string): boolean {
  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, SHOT_VIDEOS_ROOT_RELATIVE);
  return absolutePath.startsWith(allowedRoot + path.sep) || absolutePath === allowedRoot;
}
