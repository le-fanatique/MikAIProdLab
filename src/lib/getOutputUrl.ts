/**
 * Converts a stored outputPath to a URL suitable for <img src> / <video src>.
 *
 * Rewrites:
 *   - `outputs/jobs/{jobId}/{filename}`       → `/api/generated-outputs/{jobId}/{filename}`
 *   - `/outputs/jobs/{jobId}/{filename}`      → same rewrite
 *
 * Passes through unchanged:
 *   - Already `/api/generated-outputs/...`
 *   - Already `/uploads/...` or other absolute paths
 *   - `http://`, `https://`, `data:` URLs
 *
 * Fallback:
 *   - Relative non-job paths → prepend `/`
 */
export function generatedOutputUrl(
  outputPath: string | null | undefined
): string | null {
  if (!outputPath) return null;

  // Pass through absolute external URLs and data URIs
  if (outputPath.startsWith("http://") || outputPath.startsWith("https://") || outputPath.startsWith("data:")) {
    return outputPath;
  }

  // Pass through API-generated-output URLs
  if (outputPath.startsWith("/api/generated-outputs/")) {
    return outputPath;
  }

  // Strip leading slashes for normalisation
  const normalized = outputPath.replace(/^\/+/, "");

  // Match job output paths: outputs/jobs/{jobId}/{filename}
  const match = normalized.match(/^outputs\/jobs\/([^/]+)\/(.+)$/);
  if (match) {
    const [, jobId, filename] = match;
    return `/api/generated-outputs/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`;
  }

  // Already absolute (e.g. /uploads/...) — keep as-is
  if (outputPath.startsWith("/")) {
    return outputPath;
  }

  // Fallback: relative non-job path → prepend slash
  return `/${normalized}`;
}
