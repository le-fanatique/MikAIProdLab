# MikAI Roadmap

Last updated: 2026-07-11

## Active Order

1. `FILM.RESULT.2`
2. `OPENREEL.TIMING.1`
3. `OPENREEL.PUBLISH.2`
4. `FILM.RESULT.3`
5. `BASIC.EDITORIAL.2`
6. `STORAGE.CLEANUP.1`

## Required User Question Before `FILM.RESULT.2`

Before preparing `FILM.RESULT.2`, Codex must ask the user which polish items
to include.

Candidate polish list:

- Previous Film Results collapsed by default.
- Film Result player more compact.
- Clearer Render Again button.
- Warning before render when sequences are missing or outdated.
- Better warning presentation.
- More readable summary of included sequences.
- Direct links to Sequence pages.
- Expected duration vs actual duration.
- Better organized Set Active / Archive actions.
- Deletion work coordinated with `STORAGE.CLEANUP.1`.

Do not prepare the Claude implementation ticket for `FILM.RESULT.2` before this
product discussion.

## Recently Completed Tickets

MikAI recent commits:

- `26f237b` — Add file-based Codex supervision loop.
- `b650409` — Allow OpenReel to insert shots.
- `4c887a6` — Add one-command launcher for MikAI and OpenReel.
- `0696460` — Unify editorial access on sequence page.
- `ab0ebbf` — Validate multi-sequence film results.
- `8e0814e` — Render film results from active sequence results.
- `368a132` — Add film result model and viewer.
- `e7f0fc9` — Add basic editorial shot insertion.
- `c9333e5` — Publish advanced sequence results from OpenReel.
- `30fe974` — Publish basic sequence results.
- `aec63fd` — Add bundled FFmpeg health check.

OpenReel sidecar recent commits:

- `09a4a23` — Insert MikAI shots from OpenReel.
- `5dfdc4e` — Publish MikAI sequence results from OpenReel.
- `b701875` — Include MikAI editorial snapshots in patches.
- `50bfde1` — Keep MikAI timing patches start-only.
- `e105720` — Fix MikAI media hydration in OpenReel.
- `eb66b0e` — Polish MikAI bridge patch UI.

## Roadmap Rules

- Product and UX discussion happens with Codex first.
- Codex writes the implementation ticket in `.agents/current_task.md`.
- Claude implements only that ticket.
- Codex reviews the report and diff before any commit.
- UI tickets need a user-validation checklist before commit.
- Deletion/storage behavior belongs in `STORAGE.CLEANUP.1` unless explicitly
  pulled forward.
