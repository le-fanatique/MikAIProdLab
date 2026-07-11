# MikAI Project State

Last updated: 2026-07-11

## Repository Heads

- MikAI: `26f237b — Add file-based Codex supervision loop`
- OpenReel sidecar: `09a4a23 — Insert MikAI shots from OpenReel`

Verification on 2026-07-11:

- MikAI HEAD matches expected.
- OpenReel sidecar HEAD matches expected.
- OpenReel sidecar working tree is clean.
- MikAI working tree has one unrelated untracked local directory:
  `.agents/skills/`. Leave it untouched unless a future ticket explicitly
  scopes it.

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

## Last Validated Baseline

Latest reported validation before this handoff:

- `npx tsc --noEmit`: clean.
- `npm run build`: clean.
- `npm run ai:review`: validates Git failure handling and staged diff surface.

For this handoff ticket itself, validation is documentation-only:

- HEADs checked for both repos.
- Working trees checked for both repos.
- Existing docs audited.
- No app runtime, schema, migration, or package file changed.
