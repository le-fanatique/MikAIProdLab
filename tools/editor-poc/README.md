# MikAI Editorial Export POC

`NLE.PLUGIN.POC` — a minimal, isolated proof of concept that reads a
`mikai-editorial-export-v1` JSON document (the contract produced by
`src/lib/editorial/editorialExport.ts`) and renders it as a read-only,
proportional timeline, entirely outside MikAI Production Lab's app.

## Objective

Prove that MikAI's `EditorialDocument` export contract (see
`docs/NLE_PLUGIN_A_AUDIT.md`) is complete and legible enough to be
understood by something that isn't `/nle-prototype` — the smallest
possible step toward "MikAI = data layer, advanced editor = separate
concern."

This POC intentionally does **not** attempt a real editing UI. It only
proves the export can be parsed and visualized correctly.

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

## What it does not do

- No drag, no resize, no reorder, no editing of any kind.
- No video playback / no media preview — media path and URL are shown
  as text only.
- No save, no export-back, no round-trip to MikAI in any direction.
- No write access to MikAI's database, filesystem, or app routes —
  this tool never talks to the MikAI dev server except to fetch a
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

## Next step

If this POC's rendering is judged sufficient, `NLE.PLUGIN.SYNC` is the
next ticket: closing the loop by importing edited timing data (at
minimum `startSeconds`/trim changes) back into
`sequence_editorial_items` via a new, carefully bounded server action —
see `docs/NLE_PLUGIN_A_AUDIT.md` section 7 for the full proposed
roadmap and scope guardrails for that ticket.
