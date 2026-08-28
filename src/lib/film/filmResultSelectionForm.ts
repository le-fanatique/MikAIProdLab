// ---------------------------------------------------------------------------
// Film Result selection form parsing (FILM.EXPORT.SELECT.UI.1)
//
// Pure FormData -> ordered sequence id list. This is the only real logic
// this ticket adds; it knows nothing about React, the DB, or Next — see
// src/app/projects/[projectId]/page.tsx for the <form> that produces this
// FormData, and src/actions/filmResults.ts / src/actions/filmPublish.ts for
// the thin Server Actions that call this then delegate to the existing
// selection-aware actions (FILM.EXPORT.SELECT.CORE.1).
//
// It deliberately does NOT validate that an id belongs to the project —
// buildFilmResultManifest (src/lib/film/filmResultManifest.ts) already does
// that and throws FilmResultManifestError on a foreign id. Duplicating that
// check here would be the same rule written twice
// (docs/WHERE_THE_RULES_LIVE.md §3).
//
// Form field contract:
//   - "sequenceIds"   — one entry per CHECKED sequence checkbox, value = id;
//   - "projectOrder"  — one hidden entry per sequence OF THE PROJECT
//                       (checked or not), in project order. Used as the
//                       fallback/tie-break reference — never the arrival
//                       order of the submitted fields, which HTML form
//                       submission does not guarantee to preserve
//                       meaningfully once a user has edited fields;
//   - "position-<id>" — optional numeric position field per sequence.
//
// A submitted form is an untrusted, possibly-malformed input: this function
// never throws. An unreadable position (absent, empty, non-numeric,
// negative) silently falls back to the sequence's project order instead.
// ---------------------------------------------------------------------------

/** Reads a positive-integer id from a FormData string value, or null if it isn't one. */
function parsePositiveIntegerId(raw: FormDataEntryValue | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Reads a non-negative integer position, or null (caller falls back to project order) if unreadable. */
function parsePosition(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const position = Number(trimmed);
  return Number.isInteger(position) && position >= 0 ? position : null;
}

/**
 * A sequence id's place in the project order, or the fallback used when the
 * id isn't in "projectOrder" at all (untrusted input; shouldn't happen from
 * the real form). Kept as a {known, value} pair rather than merged into a
 * single number: ids unknown to the project must sort after every known
 * one and be tie-broken deterministically among themselves by their own
 * value — arithmetic like `Number.MAX_SAFE_INTEGER + id` cannot do that
 * (float precision collapses distinct ids into the same value beyond
 * MAX_SAFE_INTEGER), so "known" is compared first, and never mixed with
 * "value" across the two groups.
 */
function projectPositionOf(id: number, projectOrderIndex: Map<number, number>): { known: boolean; value: number } {
  const index = projectOrderIndex.get(id);
  return index !== undefined ? { known: true, value: index } : { known: false, value: id };
}

/**
 * Builds the ordered, deduplicated list of selected sequence ids from a
 * submitted Film Result selection form. See the file header for the field
 * contract and every guarantee (never throws, rejects non-positive-integer
 * ids, deterministic tie-break, no duplicates).
 */
export function parseSelectedSequenceIds(formData: FormData): number[] {
  const projectOrderIds = formData.getAll("projectOrder");
  const projectOrderIndex = new Map<number, number>();
  projectOrderIds.forEach((raw, index) => {
    const id = parsePositiveIntegerId(raw);
    if (id !== null && !projectOrderIndex.has(id)) projectOrderIndex.set(id, index);
  });

  const seen = new Set<number>();
  const candidates: { id: number; position: number; tieBreakKnown: boolean; tieBreakValue: number }[] = [];

  for (const raw of formData.getAll("sequenceIds")) {
    const id = parsePositiveIntegerId(raw);
    if (id === null || seen.has(id)) continue;
    seen.add(id);

    const projectPosition = projectPositionOf(id, projectOrderIndex);
    // A known project position doubles as the position fallback value; an
    // unknown one falls back to a shared "after everything" bucket for the
    // position dimension — the tie-break below is what keeps unknown ids
    // deterministic relative to each other, not this bucket value.
    const fallbackPosition = projectPosition.known ? projectPosition.value : Number.MAX_SAFE_INTEGER;
    const position = parsePosition(formData.get(`position-${id}`)) ?? fallbackPosition;
    candidates.push({ id, position, tieBreakKnown: projectPosition.known, tieBreakValue: projectPosition.value });
  }

  candidates.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.tieBreakKnown !== b.tieBreakKnown) return a.tieBreakKnown ? -1 : 1;
    return a.tieBreakValue - b.tieBreakValue;
  });
  return candidates.map((c) => c.id);
}
