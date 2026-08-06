// ---------------------------------------------------------------------------
// legacyNavigationBackground.ts — UX.MEDIA.PREVIEW.1-RETARGET1
//
// The "fonds personnalises Project/Sequence" feature (upload/edit UI, Server
// Actions, opacity) has been cancelled and fully removed. What remains here
// is the smallest legacy-compatibility surface: any installation that
// already applied migration 0048 may still have real rows pointing at real
// files under `uploads/navigation-backgrounds/`. Such a row/file must stay
// exactly as it is — read-only — but if its owning Project/Sequence is ever
// deleted, the existing quarantine-then-cleanup lifecycle in
// `src/actions/projects.ts`/`src/actions/sequences.ts` still needs to know
// the file is confined to THAT owner's own subfolder before touching it, so
// it is never orphaned nor, symmetrically, mistaken for a different owner's
// file. No new file is ever created through this module anymore.
// ---------------------------------------------------------------------------

import path from "node:path";

type NavigationBackgroundOwnerKind = "project" | "sequence";

const SAFE_ROOT = path.join("uploads", "navigation-backgrounds").split(path.sep).join("/");

/** String-level confinement predicate for a stored `imagePath` — global-root only, private to this module. `isConfinedNavigationBackgroundPathForOwner` below is the owner-aware check every caller must actually use. */
function isConfinedNavigationBackgroundPath(imagePath: string): boolean {
  if (typeof imagePath !== "string" || imagePath.length === 0 || imagePath.length > 1024) return false;
  if (!imagePath.startsWith(`${SAFE_ROOT}/`)) return false;
  if (imagePath.includes("..") || imagePath.includes("\\") || imagePath.includes("\0")) return false;
  return true;
}

// The exact legacy published filename shape: a v4 UUID plus one of the three
// formerly-accepted extensions. Rejects anything else (including a bare
// directory traversal disguised as a filename) once the owner subfolder
// itself has already matched.
const PUBLISHED_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i;

/**
 * Owner-aware confinement predicate — the ONE every legacy-cleanup path in
 * `deleteProject`/`deleteSequenceRow` must call before touching a stored
 * path on disk. The global-root check alone only proves the path is
 * somewhere under the shared `uploads/navigation-backgrounds/` root; it
 * says nothing about WHICH owner's subfolder it's actually in. A
 * corrupted/forged row pointing at a DIFFERENT Project's or Sequence's
 * subfolder (or even a differently-typed owner, e.g. a Project row pointing
 * at a `sequence-*` path) would pass the global check and let a mutation
 * delete another owner's file. This requires the path to be EXACTLY
 * `uploads/navigation-backgrounds/{ownerKind}-{ownerId}/{uuid}.{ext}` — one
 * path segment for the owner subfolder, one for a validly-shaped published
 * filename, nothing more.
 */
export function isConfinedNavigationBackgroundPathForOwner(
  imagePath: string,
  ownerKind: NavigationBackgroundOwnerKind,
  ownerId: number
): boolean {
  if (!isConfinedNavigationBackgroundPath(imagePath)) return false;
  const expectedPrefix = `${SAFE_ROOT}/${ownerKind}-${ownerId}/`;
  if (!imagePath.startsWith(expectedPrefix)) return false;
  const rest = imagePath.slice(expectedPrefix.length);
  if (rest.length === 0 || rest.includes("/")) return false;
  return PUBLISHED_FILENAME_RE.test(rest);
}
