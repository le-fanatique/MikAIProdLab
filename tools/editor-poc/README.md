# MikAI Editorial Export POC

`NLE.PLUGIN.POC` / `NLE.PLUGIN.POC.2` — a minimal, isolated proof of concept
that reads a `mikai-editorial-export-v1` JSON document (the contract
produced by `src/lib/editorial/editorialExport.ts`), renders it as a
proportional timeline, and lets you make **local-only** timing edits that
can be exported as a `mikai-editorial-timing-patch-v1` JSON patch —
entirely outside MikAI Production Lab's app.

## Objective

Prove that MikAI's `EditorialDocument` export contract (see
`docs/NLE_PLUGIN_A_AUDIT.md`) is complete and legible enough to be
understood by something that isn't `/nle-prototype`, and that timing
edits made externally can be captured as a clean, minimal patch — the
smallest possible step toward "MikAI = data layer, advanced editor =
separate concern," before any real round-trip back into MikAI is built.

This POC intentionally does **not** attempt a real editing UI or a real
import. It only proves the export can be parsed, visualized, edited in
memory, and turned into a patch a human can inspect.

## How to open it

No build step, no package, no framework. Two ways to run it:

**Directly in a browser** — open `tools/editor-poc/index.html` as a local
file. The "Load sample export" button works via `fetch`, which some
browsers restrict for `file://` pages; if the sample doesn't load this
way, use the file picker instead ("Load export file") and select
`sample-editorial-export.json` manually, or use a static server:

**Via a static server** (recommended, avoids `file://` fetch restrictions):

```bash
cd tools/editor-poc
npx --yes serve .
# or: python -m http.server 8080
```

Then open the printed local URL in a browser.

## How to generate a real export from MikAI

With the MikAI dev server running:

```text
GET /api/projects/{projectId}/sequences/{sequenceId}/editorial-export
```

For example: `http://localhost:3000/api/projects/4/sequences/30/editorial-export`.

Save the response body as a `.json` file and load it via the POC's
"Load export file" picker.

## How to edit timings locally

1. Load a document (sample or your own export).
2. Click a shot on the timeline — the "Selected item" panel shows its
   details plus an "Edit timing (local only)" form with two inputs:
   **Start seconds** and **Duration seconds**.
3. Change either value and click **Apply**. The edit is validated
   immediately (see "Local validation" below); on success it's applied
   only to the in-memory copy of the document — nothing is sent
   anywhere. The timeline re-renders, empty spaces are recomputed, and
   the edited shot gets a small accent dot marker so modified items
   stay visible at a glance.
4. Repeat for as many shots as needed. The "Timing patch preview" panel
   at the bottom updates live and always reflects exactly the current
   set of local edits.
5. Click **Reset Changes** at any time to discard every local edit and
   restore the document exactly as it was first loaded.

### Local validation

Applying an edit is rejected (with a clear English error message, no
partial write) when:

- `startSeconds` is not a number, or is negative;
- `durationSeconds` is not a number, or is not greater than 0;
- the new `[startSeconds, startSeconds + durationSeconds)` interval
  overlaps another shot on the same track (a small epsilon, matching
  MikAI's own `OVERLAP_EPSILON_SECONDS`, allows touching edges).

There is no pass-through/neighbor-bounds clamp here (unlike
`/nle-prototype`'s `moveEditorialItem`) — this POC only rejects actual
overlaps, since its purpose is to test arbitrary timing edits and patch
generation, not to replicate MikAI's move semantics.

## How to export a patch

Click **Export Timing Patch** in the toolbar. It downloads a
`mikai-sequence-{sequenceId}-timing-patch-v1.json` file containing
**only** the items you actually edited (not the full document). If
nothing has been changed yet, the button reports "No local changes to
export" instead of downloading an empty patch.

### What the patch contains

```json
{
  "schemaVersion": "mikai-editorial-timing-patch-v1",
  "sourceSchemaVersion": "mikai-editorial-export-v1",
  "projectId": 4,
  "sequenceId": 30,
  "createdAt": "2026-07-09T00:00:00.000Z",
  "items": [
    { "id": 1, "shotId": 36, "startSeconds": 0, "durationSeconds": 6.2 }
  ]
}
```

Deliberately minimal — timing only:

- no `prompt`, no `description`, no media path;
- no unmodified items;
- no secrets, no absolute filesystem paths;
- `id` is the `sequence_editorial_items` id, `shotId` is included for
  cross-checking but is not itself editable in this POC.

## What this POC validates

- The export contract (`schemaVersion`, `project`, `sequence`, `tracks`,
  `emptySpaces`) is self-contained and requires no MikAI-internal
  knowledge to render.
- Shots and derived empty spaces can be laid out on a proportional
  timeline using only `startSeconds`/`durationSeconds` from the JSON.
- Per-item metadata useful to an external editor (status, trim range,
  media path/URL, prompt, description) round-trips through the export
  intact and legibly.
- A loose schema check (`schemaVersion` match + required top-level
  fields) is enough to reject an obviously wrong or malformed file.
- Local timing edits can be validated, applied to an in-memory
  document, and distilled into a small, clean, MikAI-independent patch
  format — without ever touching MikAI's database.

## What it does not do

- No drag, no resize handles, no reorder — timing is edited via number
  inputs only.
- No video playback / no media preview — media path and URL are shown
  as text only.
- No save, no import, no round-trip to MikAI in any direction — the
  exported patch is a local file only; nothing is sent to any MikAI
  route.
- No write access to MikAI's database, filesystem, or app routes —
  this tool never talks to the MikAI dev server except to fetch an
  export JSON a human explicitly requests.
- No external library, no npm package, no bundler.

## Limits

- Single-track rendering was only exercised against `trackIndex: 0`
  data (MikAI's current schema is single-track in practice); multiple
  tracks render as stacked rows but multi-track compositing semantics
  (overlays, PiP) are not represented.
- The schema check is structural, not a strict JSON Schema validation —
  a malformed but structurally-similar file could still render
  incorrectly rather than being rejected outright.
- Timeline layout is linear-proportional only; no zoom, no snapping,
  no frame-accurate grid.
- Overlap validation only considers shots on the same track within the
  in-memory document; it has no knowledge of what may have changed on
  the MikAI side since the export was generated (that's a conflict
  question for `NLE.PLUGIN.SYNC` to answer, not this POC).

## Next step

`NLE.PLUGIN.SYNC` is the next ticket: closing the loop by importing a
timing patch like the one this POC produces back into
`sequence_editorial_items` via a new, carefully bounded server action,
reusing the ownership/validation patterns already established in
`moveEditorialItem`/`updateEditorialItemTrim` — see
`docs/NLE_PLUGIN_A_AUDIT.md` section 7 for the full proposed roadmap
and scope guardrails for that ticket.
