// ---------------------------------------------------------------------------
// mediaLabel.ts — UX.MEDIA.PREVIEW.1 (Retake Round 1, Codex P2)
//
// Pure helper deriving the `mediaLabel` overlay text for
// `VideoFrameReviewPlayer`: a specific, durable name when the caller has
// one (including an id/version whenever multiple items could otherwise
// share the same context-only name — a bare Sequence/Shot title is NOT
// specific enough on its own), otherwise a decoded, length-bounded
// basename of the actual media path — NEVER a raw URL, and NEVER a silent
// wrong guess. Returns `undefined` when neither is available, so a caller
// with no identifiable media renders no label at all.
// ---------------------------------------------------------------------------

const MAX_LABEL_LENGTH = 120;

export function deriveMediaLabel(
  durableName: string | null | undefined,
  sourcePathOrUrl: string | null | undefined
): string | undefined {
  const trimmedDurable = durableName?.trim();
  if (trimmedDurable) return trimmedDurable.slice(0, MAX_LABEL_LENGTH);

  if (!sourcePathOrUrl) return undefined;

  // Strip any query string/hash, take the last path segment, decode
  // percent-encoding — a confined display basename, never the full
  // URL/path (which could reveal internal storage layout or be too long
  // to read as an overlay).
  const withoutQuery = sourcePathOrUrl.split(/[?#]/)[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return undefined;

  let decoded: string;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    decoded = last;
  }

  const trimmed = decoded.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}
