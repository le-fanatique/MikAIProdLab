// ---------------------------------------------------------------------------
// Film Result download filename (FILM.EXPORT.DOWNLOAD.1)
//
// Pure, tested naming for the file the author downloads: a readable name —
// project name + Film Result id — never the on-disk UUID
// (film_results.videoPath). The result of this function is placed straight
// into a Content-Disposition header by the download route
// (src/app/api/film-results/[filmResultId]/download/route.ts): a `"`, a
// newline, or any other unneutralized character here is a header-injection
// surface, not a cosmetic detail. No I/O — safe to unit-test directly.
// ---------------------------------------------------------------------------

const FALLBACK_STEM = "film-result";

// Bounds the whole filename (stem + "-<id>" + ".mp4"), not just the stem —
// a very long project name must not produce an unbounded filename.
const MAX_FILENAME_LENGTH = 80;

const EXTENSION = ".mp4";

/**
 * Builds a safe, human-readable download filename for a Film Result, given
 * its owning project's name and its own id. Never throws, never returns an
 * empty/whitespace-only stem, never contains a path separator, "..", a
 * quote, a control character (including newlines), or any of the
 * Windows-reserved `< > : " | ? *`. Also restricted to printable ASCII, so
 * the result is always a legal Content-Disposition header value without
 * further encoding.
 */
export function buildFilmResultDownloadFilename(projectName: string, filmResultId: number): string {
  const stem = sanitizeStem(projectName);
  const suffix = `-${filmResultId}${EXTENSION}`;

  const maxStemLength = Math.max(1, MAX_FILENAME_LENGTH - suffix.length);
  const boundedStem = stem.slice(0, maxStemLength).replace(/-+$/, "");

  return `${boundedStem}${suffix}`;
}

function sanitizeStem(rawName: string): string {
  const sanitized = rawName
    // NFD-decompose accented letters into base letter + combining
    // diacritical mark, then drop the marks — "é" -> "e", "ç" -> "c" —
    // so French project names stay readable instead of being dropped by
    // the ASCII filter below. Must run before that filter; harmless on
    // text with no diacritics, and non-Latin text (no Latin base letter to
    // decompose into) still falls through to it and then to the fallback.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Any run of 2+ dots (".." and beyond) can't survive as a substring —
    // collapses to a separator instead of just stripping the pair, so
    // "...." can't reassemble into ".." after this pass.
    .replace(/\.{2,}/g, "-")
    // Path separators.
    .replace(/[/\\]/g, "-")
    // Quote (header-breaking) and the Windows-reserved characters.
    .replace(/["<>:|?*]/g, "")
    // Anything outside printable ASCII (0x20-0x7E) — control characters
    // (including \n and \r, the other header-breaking case) and non-ASCII
    // text alike. A header value has to be representable without further
    // encoding; this keeps that true unconditionally.
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : FALLBACK_STEM;
}
