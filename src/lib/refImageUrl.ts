/**
 * Converts a stored imagePath (e.g. "uploads/reference-images/...")
 * to a URL served by the /api/uploads/[...path] route.
 * Falls back to prepending "/" for any path not under uploads/.
 */
export function refImageUrl(imagePath: string): string {
  if (imagePath.startsWith("uploads/")) {
    return `/api/uploads/${imagePath.slice("uploads/".length)}`;
  }
  return `/${imagePath}`;
}
