// INVOKE.PUSH.1-FIX2 — the MIME type sent with an uploaded image.
//
// `POST /api/v1/images/upload` rejects the request outright when the
// multipart part carries no image content type:
//
//   if not file.content_type or not file.content_type.startswith("image"):
//       raise HTTPException(status_code=415, detail="Not an image")
//
// (`images.py`, InvokeAI 6.14.0). A `Blob` built without a `type` option
// defaults to the empty string, which `fetch` sends as
// `application/octet-stream` — so every push failed with
// `415 {"detail":"Not an image"}` until this module existed. Found against a
// real Invoke instance, not in a test.

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".avif": "image/avif",
};

/**
 * Pure. Maps a filename to the content type to send to Invoke.
 *
 * Falls back to `image/png` rather than to `application/octet-stream`: every
 * path that reaches this function has already been stored by MikAI as an
 * image, and a wrong-but-image type is read correctly by Pillow (which
 * sniffs the bytes), whereas a non-image type is refused before the bytes are
 * ever looked at.
 */
export function invokeImageContentType(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "image/png";
  const extension = filename.slice(dot).toLowerCase();
  return EXTENSION_CONTENT_TYPES[extension] ?? "image/png";
}
