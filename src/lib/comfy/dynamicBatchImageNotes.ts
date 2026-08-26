// ---------------------------------------------------------------------------
// dynamicBatchImageNotes.ts — SHOTPROMPT.REFS.2
//
// A sibling of `dynamicBatchRoleOverrides.ts`: the job-level free-text note
// overlay for the Dynamic Batch "Selected Images" panel
// (`DynamicBatchImageList`). Never written to the library — only the URL's
// `batchImageNotes_<nodeId>` sibling param, sessionStorage, and the plain
// object shape every caller passes around. Additive to `batchImages_<nodeId>`
// and `batchImageRoles_<nodeId>`; never changes either of their own formats
// (`pruneDynamicBatchSelection` and the existing role-restore logic depend on
// them staying exactly as they are), and a URL without this new param behaves
// exactly as before this ticket.
//
// **The encoding trap this module exists to avoid.** The role overlay's own
// `id:role,id:role` format is safe only because a role is always one of a
// closed catalogue of ASCII tokens with neither a comma nor a colon in it. A
// free-text note is none of those: the author's own example already has a
// colon ("reference for the first image of the shot") and a comma/colon/
// accent combination is the exact filet case below. Reusing that format
// unescaped would silently corrupt the URL param the moment a note contains
// any of the three. Each note is therefore `encodeURIComponent`-encoded
// before being joined with the outer `,`/`:` delimiters, and decoded back on
// parse — `encodeURIComponent` escapes `,`, `:`, and every non-ASCII
// character, so none of the three can ever collide with this format's own
// delimiters. Ids are never encoded: every id this module receives is a
// caller-generated `shot-<n>`/`asset-<n>-<m>` token, never free text.
//
// Pure: no DB, no browser, no network.
// ---------------------------------------------------------------------------

/**
 * A note lives in a URL query param. Bounded to a sentence, not a paragraph —
 * long enough for "reference for the first image of the shot", short enough
 * that a batch of several noted images does not risk the URL length limits
 * `serializeBatchImageNotesParam`'s own caller (the URL-driven Dynamic Batch
 * surfaces) already relies on staying well under.
 */
export const MAX_BATCH_IMAGE_NOTE_LENGTH = 200;

/** The sibling URL/form param key for a given batch node's note overlay. */
export function buildBatchNoteParamKey(batchNodeId: string): string {
  return `batchImageNotes_${batchNodeId}`;
}

/**
 * Parses `id:encodedNote,id:encodedNote` into a plain `{ id: note }` map.
 * Never throws: an entry missing an id, whose note decodes to blank, or
 * whose note fails to decode (malformed percent-encoding) is silently
 * dropped rather than guessed. Absent/empty input yields `{}` — the "no
 * ticket without this param behaves exactly as before" case.
 */
export function parseBatchImageNotesParam(raw: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw) return result;
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0 || sep === trimmed.length - 1) continue;
    const id = trimmed.slice(0, sep).trim();
    const encodedNote = trimmed.slice(sep + 1);
    if (!id) continue;
    let note: string;
    try {
      note = decodeURIComponent(encodedNote).trim();
    } catch {
      continue;
    }
    if (!note) continue;
    result[id] = note.length > MAX_BATCH_IMAGE_NOTE_LENGTH ? note.slice(0, MAX_BATCH_IMAGE_NOTE_LENGTH) : note;
  }
  return result;
}

/**
 * Inverse of `parseBatchImageNotesParam`. Each note is trimmed, truncated to
 * `MAX_BATCH_IMAGE_NOTE_LENGTH`, then `encodeURIComponent`-encoded before
 * joining — this is what survives a comma, a colon, or an accented character
 * without corrupting the outer `id:note,id:note` structure. Entries with an
 * empty id or a blank note are skipped, so a round trip never emits a
 * malformed pair.
 */
export function serializeBatchImageNotesParam(notes: Record<string, string>): string {
  return Object.entries(notes)
    .map(([id, note]) => [id.trim(), note.trim()] as const)
    .filter(([id, note]) => id && note)
    .map(([id, note]) => {
      const bounded = note.length > MAX_BATCH_IMAGE_NOTE_LENGTH ? note.slice(0, MAX_BATCH_IMAGE_NOTE_LENGTH) : note;
      return `${id}:${encodeURIComponent(bounded)}`;
    })
    .join(",");
}

/**
 * Keeps only the notes whose id is still in `allowedIds` (the current
 * selection), mirroring `pruneBatchRoleOverrides`'s own rule: a note for an
 * image no longer selected is elided along with it, never resurrected.
 */
export function pruneBatchImageNotes(
  notes: Record<string, string>,
  allowedIds: string[]
): Record<string, string> {
  const allowed = new Set(allowedIds);
  const result: Record<string, string> = {};
  for (const [id, note] of Object.entries(notes)) {
    if (allowed.has(id)) result[id] = note;
  }
  return result;
}

/**
 * The note a given reference id actually carries for prompt composition, or
 * `null` when none was written for it. Unlike `resolveOverriddenRole`, there
 * is no library-stored fallback: a note is job-level only, so absence means
 * no note at all, not "read from the library instead".
 */
export function resolveNoteOverride(
  refId: string,
  notes: Record<string, string> | undefined
): string | null {
  const note = notes?.[refId];
  return note && note.trim() ? note.trim() : null;
}
