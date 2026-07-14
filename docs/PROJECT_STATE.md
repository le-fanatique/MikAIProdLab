# MikAI Project State

Last updated: 2026-07-14

## Repository Heads

- MikAI: `c37e603 — Add audio controls to VideoFrameReviewPlayer`
- OpenReel sidecar: `e1c36d1 — fix: make MikAI Bridge panel collapsible`

Verification on 2026-07-13:

- MikAI committed HEAD is `c37e603`; its working tree has persistent
  `AGENTS.md` workflow change plus unrelated `.agents/skills/` and `.vscode/`.
- OpenReel sidecar remains at committed HEAD `e1c36d1`.

## Product Shape

MikAI is the production and narrative brain.

OpenReel is the advanced editorial sidecar.

Main output model:

```text
Shots
→ Sequence Results
→ Film Results
```

Two editorial paths produce the same type of sequence output:

```text
Basic Editorial
→ Sequence Result sourceMode = basic

OpenReel Advanced
→ Sequence Result sourceMode = advanced
```

Active Sequence Results are assembled into Film Results.

## Completed Capabilities

### Sequence Results

- Multi-version `sequence_results` model.
- One active result per sequence by application logic.
- Statuses: `draft`, `published`, `active`, `archived`, `outdated`.
- Sequence Detail viewer.
- Previous Results collapsed by default.
- Basic FFmpeg publish.
- OpenReel WebCodecs publish.
- Snapshot and staleness safety.

### Basic Editorial

- Sequence Detail is the main entry.
- Publish Basic Sequence Result.
- Insert Shot Here.
- Real Shot creation.
- Default duration: 5 seconds.
- Mirror write into `sequence_editorial_items`.
- Generate Shot Brief from Neighbors through Ollama.
- Sequence Result and Film Result invalidation.

The `/editorial` route remains useful for trims and fallback controls.

The `/nle-prototype` route is secondary/debug.

### OpenReel

- Open in Advanced Editor from Sequence Detail.
- Export Editorial JSON.
- Validate Patch.
- Apply Patch start-only.
- Publish Sequence Result to MikAI.
- Insert New Shot at Playhead.
- Push production target duration to MikAI without invalidating existing
  Sequence/Film Results.
- Collapsible MikAI Bridge panel.
- Stale HTTP 409.
- Reload from MikAI.

### Film Results

- Film Result model.
- Project Detail viewer.
- MP4 render through bundled FFmpeg.
- Multi-sequence render validated.
- Automatic invalidation when a Sequence Result changes.

### Infrastructure

- Combined launcher:
  - `npm run dev:all`
  - `npm run prod:all`
- Bundled FFmpeg via `ffmpeg-ffprobe-static@6.1.1`.
- File-based supervision loop:
  - `npm run ai:init`
  - `npm run ai:review`

## Current Seedance State

- Latest committed MikAI HEAD for this session: `46f46ef`.
- The previous repository-head lines above are historical handoff metadata;
  this checkpoint is the authoritative current state.
- The Seedance MVP block is complete through `GEN.SEEDANCE.3`.
- `GEN.SEEDANCE.3` found no real First/Last Frame workflow in the current
  library, so no active profile was invented.
- `THEME.TOPBAR.MASK.1` is complete: dedicated TopBar color with alpha-mask
  texture rendering.

## Known Limits

- The supervision loop is file-based. Codex review is manual in the connected
  Codex session; no untested Codex CLI automation is assumed.
- Live `.agents/*` files are per-ticket scratch state and gitignored.
- `sequence_results` active uniqueness is enforced by application transaction,
  not a DB partial unique index.
- OpenReel V1 timing patches are start-only. Duration changes are not pushed
  as general timeline edits.
- OpenReel split does not automatically create a MikAI Shot.
- Some legacy OpenReel patches without snapshots can still be accepted with
  warnings for backward compatibility.
- Runtime media/storage cleanup remains future work.
- Recent completed polish includes `THEME.MIKROS.1` through `.5` (Custom
  palette, fonts and logo) and `PLAYER.AUDIO.1` (audio controls in the
  frame-aware player).
- Active implementation ticket: `UX.AUDIT.1`, a read-only ergonomics and
  information-architecture audit before the next major product redesign.

## Last Validated Baseline

Latest reported validation before this handoff:

- `npx tsc --noEmit`: clean.
- `npm run build`: clean.
- `npm run ai:review`: validates Git failure handling and staged diff surface.
- `PLAYER.AUDIO.1`: `npx tsc --noEmit`, `npm run build`, and
  `git diff --check` clean; audio controls validated on Film Result, Sequence
  Result, and Shot Detail surfaces.

For this handoff ticket itself, validation is documentation-only:

- HEADs checked for both repos.
- Working trees checked for both repos.
- Existing docs audited.
- No app runtime, schema, migration, or package file changed.
