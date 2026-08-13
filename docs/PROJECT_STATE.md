# MikAI Project State

Last updated: 2026-08-13

## Repository Heads

## LLM Workspace Phase A — COMPLETE (2026-08-13)

Phase A of `docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 is delivered, committed and
pushed. It was the "work that will not be redone" gate before the workspace.

| Item | Commit | Result |
| --- | --- | --- |
| A1 — schema split | `0074f2e` | `src/db/schema.ts` → 13 domain modules + barrel; `db:generate` reports no schema change |
| A4 — LLM operations inventory | `6a730b6`, `f31416a` | `docs/LLM_OPERATIONS_INVENTORY.md`, 26 rows |
| A3 — orphan deletions | `6a730b6`, `ba41bb3` | `sequences-from-story.ts`, `generateAssetDescriptionDraft` |
| A2 — snapshot tests | `cfc8745` | **first test suite in the repository**: 22 builders, 99 tests, 86 snapshots |

Also pushed in the same window: `82428bd` (ignore local `.agents/` material),
`22208b8` (ComfyUI `PrimitiveString` write fix), `0949d48` (pnpm 11.7.0 in the
OpenReel start command), `6bf2abd` (project tab order, Editorial Actions above
the timeline). The last three were authored directly by Codex outside the
supervision loop and validated manually by the user before commit.

**New durable capability:** `npm test`. The repository had no tests before
`cfc8745`. Any change to a prompt builder now fails a snapshot instead of
passing silently.

**Two defects are frozen, not fixed**, deliberately and on record in
`docs/LLM_WORKSPACE_ARCHITECTURE.md` §9: `composeShotPrompt` emits double
punctuation, and `getPromptCompilerPreset` is a third confirmed orphan.

**Phase B is not authorised by this**, but nothing in §10 blocks it either.
Migration order is settled, `userAdjustable` is deferred to the
descriptor-format work, Auto Casting is off the critical path, and the
Settings-naming question dissolved: `FB-20260715-013` is an unpromoted
`USER_FEEDBACK` observation, and the workspace's bench and variable library
likely supersede it. Phase B now needs a prepared ticket, not another
decision.

## DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1 - Implemented, awaiting Codex review (2026-08-10)

`install.bat`/`.sh`, `start.bat`/`.sh`, `update.bat`/`.sh` added at repo root
as thin wrappers around one new Node ESM orchestrator,
`scripts/mikai-deploy.mjs`. It reads `config/openreel-sidecar-release.json`
through a closed, runtime-validated schema (unknown keys, wrong types, a
non-40-hex commit/upstreamCommit, an out-of-range port, or any repository
other than the exact pinned GitHub identity are all refused before any
side effect); resolves the sidecar directory from `MIKAI_OPENREEL_DIR` or
the default sibling path with symlink-safety checks; preserves an existing
`.env.local` byte-for-byte; creates only the known runtime directories when
absent; requires a real `npm run backup:create` success before migrating an
existing DB (a fresh/missing DB needs none, and a `DB_PATH` outside the
supported `<repo>/data/` contract refuses outright rather than claiming
protection it can't provide); clones/moves the sidecar to exactly the
pinned commit (never a branch tip), refusing on tracked changes or an
origin mismatch on an existing checkout; and, for `update`, fast-forwards
MikAI's own `main` only (refuses on a diverged history) before re-reading
the possibly-new pin. `start` validates the sidecar `HEAD` against the pin
and delegates to the existing `npm run prod:all` launcher — no second
process manager. Every side-effecting command runs through one injectable
runner, used by the required command-order proof.

All five required proofs were run for real against disposable fixtures
(temporary git repos/clones/worktrees, isolated ports, cleaned up
afterward) and passed: pin validation matrix (33/33), command-order safety
with a fake runner (26/26), a genuine end-to-end fresh install against a
local git remote fixture pinned at an exact tag/commit (15/15, real `npm
ci`, real `pnpm install`, real `next build`, real migration), a genuine
end-to-end update including fast-forward, backup-before-migration, the
sidecar moving to a new pin, and dirty/mismatched-pin refusals with zero
mutation (19/19), and an isolated `start` on non-default ports with a CORS
check confirming MikAI's editorial-export route grants
`Access-Control-Allow-Origin` only to the explicitly configured sidecar
origin, never an unlisted one (8/8). Two real bugs were found and fixed by
these proofs, not just theorized: Windows `shell:true` was silently
stripping `^` from git revision arguments like `<tag>^{}` (cmd.exe's own
escape character), and `next build` was running BEFORE migrations, which
fails outright on a schema-less fresh DB because some routes prerender
against it — migration now runs first. See `.agents/claude_report.md` for
full evidence.

## OPENREEL.SIDECAR.PROMOTION.1 - Audited and prepared, awaiting Codex review (2026-08-10, retake)

Upstream-based sidecar candidate `mikai/upstream-8459024`
(`f80853ce3de432751847eb1bab3d03a669267c37`) was audited against legacy
sidecar `main` (`33f917a253bef632f65da7ef5175aa4130785fc0`): no supported
MikAI integration contract was lost, and the legacy native-playback patches
(`bace876`, `492dd01`, `33f917a`) are confirmed absent from the candidate's
history and source tree. Candidate typecheck, full test suite, lint, and
production build pass in an isolated worktree (2 pre-existing flaky tests in
`video-engine-export-effects.test.ts`, unrelated to MikAI, reproduced
independently unchanged). Two isolated browser smoke sessions (own ports,
mock export server, local disposable fixture media, no live `5173` use)
confirmed import, continuous multi-clip playback across two clip boundaries,
pause/seek/reload, and full MikAI Bridge visibility with no new console
errors — one against a normal export, one against an explicit
`videoSourceMode`/`timingBasis: "compact-real-duration"` export, which
correctly disabled Validate/Apply, Insert Shot, and Push Duration (each with
an explicit reason) while leaving Publish Advanced available. Grouped-drag +
undo/redo was reattempted with a properly frame-timed synthetic pointer
sequence (delays between `mousedown`/`mousemove` so React's listener-attach
effects flush) and conclusively demonstrated: two selected clips moved by an
identical delta, a single Undo reverted both, a single Redo reapplied both,
no console errors. `MIKAI_SIDECAR.md` now carries an explicit maintenance
contract (upstream base, deterministic release-pin sequencing, retired-patch
note, update/rollback procedure). The MikAIProdLab release pin
(`config/openreel-sidecar-release.json`) is deliberately **not created yet**
— its `commit` value must be the actual sidecar-doc commit once
`MIKAI_SIDECAR.md` is committed on `mikai/upstream-8459024`, which has not
happened; creating it now with the pre-documentation candidate SHA would be
stale the moment that commit lands. It is created in the closing sub-pass,
right after that commit, per the deterministic sequence documented in
`MIKAI_SIDECAR.md`. No git remote state (tags, branches, `main`) was changed
in this pass — promotion (`--force-with-lease` after verifying `origin/main`
is still `33f917a`) is deferred to a Codex-approved follow-up. See
`.agents/claude_report.md` for full evidence.

## DB.HEALTH.REPAIR.1 - Completed Live Maintenance (2026-08-10)

The live SQLite database was repaired during an explicit maintenance window.
Four corrupt Project Style indexes were rebuilt, and the user-authorized,
fully detached Project Style Research rows plus one orphan Working Draft were
removed only after a coherent SQLite backup and a successful disposable-copy
proof. The live database now reports `PRAGMA integrity_check = ok` and zero
rows from `PRAGMA foreign_key_check`; Project 18 and the remaining valid
Projects were verified unchanged. Two timestamped pre-repair SQLite-aware
backups exist under `data/backups/`. The next operational priority is
`OPS.DATA.BACKUP.RESTORE.1`, including media as well as SQLite.

- MikAI: `72f9d89 - feat(style): add Reference Board analysis UI`
- OpenReel sidecar: `4078de7 - Shot video library bridge support`

## STYLE.1.ACCEPTANCE.1 — ACCEPTED, epic STYLE.1 RESOLVED

`STYLE.1.ACCEPTANCE.1` (transversal acceptance gate for the `STYLE.1`
epic, A through G) is `ACCEPTED`: technical evidence complete, two bounded
Codex retakes closed (`REVISE` -> `REVISE` -> accepted), and manual user
confirmation received on 2026-08-02 (`c est ok`). Full matrix, DB/migration
audit, dead-code audit, cross-Project refusal proofs and sign-off are
recorded in `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`. The `STYLE.1`
epic (A through G) is `RESOLVED` — see `docs/ROADMAP.md` for the delivered
ticket registry and the next active ticket.

Verification on 2026-07-13:

- MikAI committed HEAD is `c37e603`; its working tree has persistent
  `AGENTS.md` workflow change plus unrelated `.agents/skills/` and `.vscode/`.
- OpenReel sidecar remains at committed HEAD `e1c36d1`.

Current supervised work:

- `CAMLAB.POLISH.2` est termine et valide par l'utilisateur (`41d7004`) : la
  colonne Gaussian-to-image mappe le snapshot vers
  `Load Image Gaussian (Input)`, la source vers `Load Image (Input)`,
  independamment de l'ordre JSON, et expose ses autres nodes `(Input)`.

- `CAMLAB.POLISH.1`, `CAMLAB.VIEWER.CONTROLS.1` et `CAMLAB.POLISH.2` sont
  termines, pousses et valides par l'utilisateur. Camera Lab guide maintenant
  la generation PLY, le cadrage/capture avec profondeur et zoom ajustes, puis
  la generation Gaussian-to-image avec mapping nominal strict.
- L'epic `STYLE.1` (A a G) est `RESOLVED` : Working Draft et versions
  immuables, Reference Board et Creative Influences, Influence Research et
  Reference Analysis, heritage/override Sequence, injection dans les six
  consumers de generation, Asset Alignment et Look Development sont tous en
  place et pousses (dernier ticket applicatif livre :
  `feat(style): add Reference Board analysis UI`, HEAD `72f9d89`). Le gate
  transversal `STYLE.1.ACCEPTANCE.1` est `ACCEPTED` (voir section
  ci-dessus) — confirme manuellement par l'utilisateur le 2026-08-02. Le
  registre complet des tickets livres est dans `docs/ROADMAP.md`.
- `SEQGEN.VIDEO.CUT.1` reste le prochain candidat hors epic Project Style :
  retirer une plage frame-exacte d'un Sequence Video Draft, concatener les
  parties conservees et publier une nouvelle version sans ecraser la source.
- `SEQGEN.VIDEO.1`, `SEQGEN.SPLIT.1`, the unified Split Workspace, the EOF
  compatibility fix, `SEQGEN.PUSH.1`, `SEQGEN.PUSH.2`, the first-frame PNG
  fix, short frame-native segments and `SHOT.VIDEO.LIBRARY.1` are complete
  and pushed.
- Validated Split Plans now create durable Shot video candidates. Candidate
  review, explicit approval, result invalidation and safe deletion are live.
- `SEQGEN.KEYFRAMES.1` was removed because Shot-level `Capture Frame` already
  covers manual frame extraction.
- `SEQGEN.SPLIT.CLEANUP.1` and its native player-anchor retakes are complete.
- `CAMLAB.SPIKE.1`, `CAMLAB.PLY.1`, `CAMLAB.VIEWER.1` and `CAMLAB.SHOTREF.1`
  are complete and pushed at MikAI HEAD `c9d2982`. A validated Gaussian PLY is
  a secure job/cache artifact with Range serving; the Shot Camera Lab provides
  a PlayCanvas viewer, exact local offscreen PNG capture, and explicit atomic
  confirmation as a durable Shot Reference Image with role `camera`.
- The supplied
  `Gaussian.json` and real ComfyUI history prove a `SharpPredict`
  image-to-PLY workflow whose `GeomPackPreviewGaussian` output exposes a PLY
  downloadable through `/view` with Range support.

Project Style reference documents:

- `STYLE.1` (A through G) is functionally delivered — see the current
  supervised work note above and `docs/ROADMAP.md` for the full delivered
  ticket registry. The original user journey, accepted MVP/deferred
  decisions, detailed specification and development-supervisor handoff are
  preserved in `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`,
  `docs/PROJECT_STYLE_MVP_DECISIONS.md`,
  `docs/PROJECT_STYLE_MVP_SPEC.md` and
  `docs/PROJECT_STYLE_SUPERVISOR_HANDOFF.md`.
- Next work in this area is bounded `STYLE.2` follow-ups (Look Development
  corrections, Reference Analysis UI hardening) tracked in
  `docs/ROADMAP.md`, gated behind `STYLE.1.ACCEPTANCE.1` closure.

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

- Historical note: `31441d3` was the latest committed MikAI HEAD as of the
  Seedance handoff session below. It predates the `STYLE.1` epic and is no
  longer the current head — see `Repository Heads` at the top of this
  document (`72f9d89`) for the actual current state.
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
- `EDITORIAL.NAV.1`, `SEQGEN.1`, the Sequence Storyboard generation/extraction
  chain and `SEQGEN.VIDEO.1` are complete. The dedicated Storyboard workspace
  now owns contact-sheet generation, panel extraction, durable Sequence Video
  drafts and their provenance. Split detection/review and `SEQGEN.PUSH.1` are
  complete: an explicitly validated plan now creates durable, reviewable Shot
  video candidates without automatic approval.

## Storyboard Direction

The Storyboard is not only a gallery of media that already exists. It is the
first visual production workspace for a Sequence, even when no Shot has an
image yet. It must provide a Sequence selector like Editorial, a persistent
Project navigation shortcut, a visual Shot grid, and a compact unique list of
the Assets cast anywhere in the Sequence.

The workspace will let the user select Asset reference images per Asset,
open the Asset Detail page, compile the Sequence package with explicit
options to ignore prompt segments and unapproved references, generate draft
storyboard images, and approve useful compositions before the later
Sequence-level Seedance video workflow.

The intended chain is:

```text
Story -> Storyboard images per Shot -> approved visual structure
-> Sequence-level Seedance video -> Split -> Push candidates to Shots
```

The accepted `SEQGEN.STORYBOARD.3` extension adds a first sequence-level
storyboard contact sheet before sequence video generation. It uses selected
casting references and the full inspectable Sequence Generation Package, and
stores explicit versioned drafts at Sequence level without mutating Shots.

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
