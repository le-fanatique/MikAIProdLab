// ---------------------------------------------------------------------------
// paths.ts — STYLE.1.G.CORE.1 (Scope E)
//
// Server-only. Confined-path convention for a durable Look Development
// result — mirrors src/lib/shotVideoLibrary/paths.ts's own convention
// exactly (`uploads/look-development/project-<id>/<uuid>.<ext>`), a
// dedicated root distinct from every other durable-output root in this
// codebase.
// ---------------------------------------------------------------------------

import path from "node:path";

export const LOOK_DEVELOPMENT_ROOT_RELATIVE = "uploads/look-development";

export function lookDevelopmentResultPathFor(projectId: number, uuid: string, ext: string): { relative: string; absolute: string } {
  const relative = `${LOOK_DEVELOPMENT_ROOT_RELATIVE}/project-${projectId}/${uuid}${ext}`;
  const absolute = path.resolve(process.cwd(), "public", relative);
  return { relative, absolute };
}

/** Confines an arbitrary DB-stored relative path to this root — mirrors every other `*RootRelative` confinement check in this codebase. */
export function isWithinLookDevelopmentRoot(absolutePath: string): boolean {
  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, LOOK_DEVELOPMENT_ROOT_RELATIVE);
  return absolutePath.startsWith(allowedRoot + path.sep) || absolutePath === allowedRoot;
}
