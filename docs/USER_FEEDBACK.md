# MikAI User Feedback Log

Last updated: 2026-08-21

## Purpose

This document is the durable notebook for hands-on feedback, usability
observations, retakes, friction points, and product ideas discovered while
using MikAI Production Lab.

The user can record an observation here in informal language. Codex may then
clarify and structure it without changing its intent. When a development
conversation needs these notes, this file is the shared source of truth.

## Rules For Codex And Claude

- Give every new observation a stable ID: `FB-YYYYMMDD-NNN`.
- Preserve the user's original observation. Add interpretation separately.
- Do not silently turn an idea into an approved feature or roadmap priority.
- Reference the feedback ID in any related ticket, implementation report, and
  review.
- When development addresses an entry, update this document in the same work:
  change its status and record the ticket, resolution, and date.
- Never delete a handled entry. Keeping its history prevents old feedback from
  being mistaken for a new or still-open request.
- Use `TO VALIDATE` after implementation when hands-on user confirmation is
  still needed. Use `RESOLVED` only after the result is accepted or the user
  explicitly confirms that the observation has been handled.

## Statuses

- `INBOX`: captured but not yet clarified or prioritized.
- `OPEN`: understood and still unresolved.
- `PLANNED`: accepted into a future ticket or roadmap item.
- `IN PROGRESS`: currently being implemented.
- `TO VALIDATE`: implemented, but awaiting hands-on user confirmation.
- `RESOLVED`: handled and accepted; retained for history.
- `DECLINED`: intentionally not pursued, with the reason recorded.
- `DUPLICATE`: covered by another feedback ID, which must be referenced.

## Category Index And Consolidation Map (superseded 2026-07-30)

The entries below remain in their capture/history order so their original
context and development history are preserved. This index provides a
category-first view without deleting or silently merging feedback.

### Product shell, navigation, settings and visual system

`FB-20260715-001`, `FB-20260715-002`, `FB-20260715-003`,
`FB-20260715-004`, `FB-20260715-005`, `FB-20260715-006`,
`FB-20260715-007`, `FB-20260716-032`, `FB-20260716-034`,
`FB-20260716-037`, `FB-20260716-040`, `FB-20260722-002`.

### LLM assistance, prompts, translation and creative direction

`FB-20260715-010`, `FB-20260715-013`, `FB-20260716-033`,
`FB-20260716-035`, `FB-20260716-036`, `FB-20260716-038`,
`FB-20260716-039`, `FB-20260716-041`, `FB-20260716-037`,
`FB-20260723-001`.

### Assets, references and image preparation

`FB-20260715-008`, `FB-20260716-021`, `FB-20260716-022` through
`FB-20260716-031`, `FB-20260716-039`, `FB-20260716-040`,
`FB-20260717-042`, `FB-20260723-001`.

### Storyboard generation and Sequence storyboard workflow

`FB-20260715-011`, `FB-20260715-012`, `FB-20260715-015`,
`FB-20260715-016`, `FB-20260715-017`, `FB-20260715-018`,
`FB-20260715-019`, `FB-20260715-020`, `FB-20260717-043`,
`FB-20260717-044`, `FB-20260718-001`, `FB-20260718-002`,
`FB-20260722-006`.

### Sequence video, split detection and split review

`FB-20260717-046`, `FB-20260717-047`, `FB-20260718-003`,
`FB-20260718-004`, `FB-20260718-007`, `FB-20260719-001`,
`FB-20260719-002`.

### Shot video library and OpenReel round-trip

`FB-20260716-021`, `FB-20260717-042`, `FB-20260718-005`,
`FB-20260718-008`, `FB-20260722-002`.

### Camera and Workflow Tools

`FB-20260715-014`, `FB-20260716-041`, `FB-20260717-045`,
`FB-20260717-048`, `FB-20260722-001`, `FB-20260722-003`,
`FB-20260721-001`, `FB-20260722-004`, `FB-20260723-002`.

### Player and editorial presentation

`FB-20260715-009`, `FB-20260718-004`, `FB-20260718-005`,
`FB-20260718-008`, `FB-20260806-001`.

### Proposed regroupings (not automatic merges)

- `FB-20260716-022` through `FB-20260716-031` form one Storyboard
  Extraction/Diagnostics epic. ~~Keep the individual entries because they cover
  detection, crop, upload, diagnostics, and ratio behavior separately.~~
  **Superseded 2026-08-22, by the author's decision**: the nine entries were
  condensed into `FB-20260716-EXTRACT`, which keeps every ID, its ticket and
  its status. `FB-20260716-027` was excluded and keeps its own entry — it is
  still `OPEN`, and it is about image preparation, not extraction.
- `FB-20260717-046`, `FB-20260717-047`, `FB-20260719-001`,
  `FB-20260719-002`, `FB-20260718-003`, `FB-20260718-004`, and
  `FB-20260718-007` can later be planned as one Split Review epic, with
  cleanup and frame-accurate editing as separate subtasks.
- `FB-20260716-021`, `FB-20260717-042`, `FB-20260718-005`,
  `FB-20260718-008`, and `FB-20260722-002` belong to a Shot Video Library /
  OpenReel round-trip epic. The first concerns reference-video scope, while
  the others concern storage, compact review, reuse, and write-back.
- `FB-20260717-043` and `FB-20260717-044` should share one Sequence Video
  generation ticket: the first defines the capability and the second its CTA
  visibility. **Done 2026-08-22**: both were condensed into
  `FB-20260717-SEQVIDEO`, together with `FB-20260717-046` and
  `FB-20260717-047`, and closed by the author.
- `FB-20260716-034` and `FB-20260716-037` are the clearest visual duplicate:
  both request one consistent color treatment for LLM `Apply` actions. Keep
  both original observations, but use one shared implementation ticket later.
- `FB-20260715-002` and `FB-20260715-005` can share one LLM Chat theme polish
  ticket because both request `Text Primary`; the logo and title remain
  separately testable surfaces.
- `FB-20260716-035`, `FB-20260716-036`, and `FB-20260722-003` form a broader
  LLM Assist / Director / Workflow Tools discussion. Do not merge them until
  the product contract and boundaries are agreed.
- `FB-20260716-038` and `FB-20260716-039` can share an Asset LLM enhancement
  ticket while retaining separate actions and acceptance tests.

### ID hygiene

Two entries had accidentally received `FB-20260717-046`. The Split Review
entry keeps `FB-20260717-046`; the Camera workflow entry is now uniquely named
`FB-20260717-048`. Its content and history are unchanged.

Two entries also received `FB-20260723-001` during concurrent documentation
work. The Project Style V1 entry keeps `FB-20260723-001`; the later Camera Lab
copy-fix entry is uniquely named `FB-20260723-002`. Its content and history
are unchanged.

Two entries had also received `FB-20260722-004`. The Gaussian Viewer controls
entry keeps `FB-20260722-004`; the later Sequence Generation Package
presentation entry is uniquely named `FB-20260722-006`. Its content and
history are unchanged.

Two entries also received `FB-20260811-002`. The Project Style generation
entry keeps `FB-20260811-002`; the Insert Shot / Director Input entry is
uniquely named `FB-20260811-003`. Its content and history are unchanged.

## Category Review — 2026-07-30

This is the current category map. The older index above is retained only for
history; this review adds the later Project Style, Camera Lab, Gaussian Camera,
and workflow-input entries and separates primary product domains from the
cross-cutting UI/display view.

### Primary product categories

- **UI, layout, navigation and display:** `FB-20260715-001` through
  `FB-20260715-009`, `FB-20260715-011`, `FB-20260715-012`,
  `FB-20260715-016`, `FB-20260716-019`, `FB-20260716-032`,
  `FB-20260716-034`, `FB-20260716-037`, `FB-20260716-040`,
  `FB-20260717-044`, `FB-20260717-048`, `FB-20260718-002`,
  `FB-20260718-005`, `FB-20260722-001`, `FB-20260722-002`,
  `FB-20260722-003`, `FB-20260722-004`, `FB-20260722-005`,
  `FB-20260722-006`, `FB-20260723-002`, `FB-20260724-001`.
- **Project Style and creative direction:** `FB-20260715-010`,
  `FB-20260715-013`, `FB-20260716-033`, `FB-20260716-035`,
  `FB-20260716-036`, `FB-20260716-038`, `FB-20260716-039`,
  `FB-20260723-001`, `FB-20260726-001`.
- **Assets, references and image preparation:** `FB-20260715-008`,
  `FB-20260716-021`, `FB-20260716-022` through `FB-20260716-031`,
  `FB-20260717-042`, `FB-20260718-001`, `FB-20260718-002`,
  `FB-20260718-008`.
- **Storyboard and Sequence generation:** `FB-20260715-011`,
  `FB-20260715-012`, `FB-20260715-015` through `FB-20260715-020`,
  `FB-20260717-043`, `FB-20260717-044`, `FB-20260718-001`,
  `FB-20260718-002`.
- **Sequence video, split and review:** `FB-20260717-046`,
  `FB-20260717-047`, `FB-20260718-003`, `FB-20260718-004`,
  `FB-20260718-007`, `FB-20260719-001`, `FB-20260719-002`.
- **Shot video library and OpenReel:** `FB-20260716-021`,
  `FB-20260717-042`, `FB-20260718-005`, `FB-20260718-008`,
  `FB-20260722-002`.
- **Camera, workflows and generation inputs:** `FB-20260715-014`,
  `FB-20260716-017`, `FB-20260716-018`, `FB-20260716-020`,
  `FB-20260716-041`, `FB-20260717-045`, `FB-20260717-048`,
  `FB-20260721-001`, `FB-20260722-001`, `FB-20260722-004`,
  `FB-20260722-005`, `FB-20260722-003`, `FB-20260724-001`.

### UI and display — detailed list requested

#### Navigation and workspace layout

- `FB-20260715-001` — Settings anchors replaced by real tabs.
- `FB-20260715-003` — Expanded chat column fits the browser viewport.
- `FB-20260715-004` — Right column keeps only LLM Chat.
- `FB-20260715-011` — Storyboard generation action is explicit.
- `FB-20260715-012` — Storyboard Asset reference lists expanded by default.
- `FB-20260715-016` — Avoid the Storyboard Assets render/navigation error.
- `FB-20260716-019` — Clear stale generation errors when changing Sequence.
- `FB-20260717-044` — Make `Generate Sequence Video` prominent.
- `FB-20260717-046` — Unify Split review and refine cuts locally.
- `FB-20260722-001` — Guided three-stage Camera Lab workspace.
- `FB-20260722-002` — Compact Shot video workspace instead of two large
  players.
- `FB-20260722-003` — Workflow Tools with custom interfaces.
- `FB-20260722-006` — Collapse `Sequence Generation Package` and reduce
  non-actionable warnings.

#### Theme, labels, fields and visual hierarchy

- `FB-20260715-002` — LLM Chat logo uses `Text Primary`.
- `FB-20260715-005` — LLM Chat title uses `Text Primary`.
- `FB-20260715-006` — Custom Appearance exposes typography controls.
- `FB-20260715-007` — Correct `New Project` button contrast.
- `FB-20260716-032` — Unify Edit-page field colors with `API Key`.
- `FB-20260716-034` — Match `Apply to Story` with `Save Changes`.
- `FB-20260716-037` — Unify all LLM `Apply` button colors.
- `FB-20260723-002` — Correct the Camera Lab `Additional Prompt` label.

#### Thumbnails, previews and media display

- `FB-20260715-008` — Thumbnail backgrounds on Project and Sequence rows.
- `FB-20260715-009` — Video name overlay in the frame player.
- `FB-20260716-040` — Image zoom popup on hover.
- `FB-20260718-002` — Choose a Storyboard thumbnail from Shot references.
- `FB-20260718-005` — Open OpenReel from a Shot with selected videos.
- `FB-20260722-004` — Correct Gaussian Camera viewer controls.
- `FB-20260722-005` — Expose real Gaussian-to-image workflow inputs.

#### Forms, settings and workflow controls

- `FB-20260715-013` — Central `System Prompts` category in Settings.
- `FB-20260715-014` — ComfyUI port presets in Render Settings.
- `FB-20260716-033` — Translatable Edit Project fields.
- `FB-20260716-041` — Prefill workflow `Duration` from the Shot.
- `FB-20260717-045` — Project ratio and FPS settings.
- `FB-20260717-048` — Visual Qwen Multiangle Camera controls.
- `FB-20260721-001` — Preserve custom presets after server restart.
- `FB-20260724-001` — Do not show phantom `promptText` inputs.

### Category review notes

- The UI/display category is cross-cutting: several entries also belong to
  Storyboard, Camera, Shot Video, or Workflow categories. The primary domain
  remains in the first list; this section is the implementation-facing UX
  view.
- `FB-20260716-034` and `FB-20260716-037` remain separate observations but
  should share one button-variant implementation ticket.
- `FB-20260715-002` and `FB-20260715-005` remain separate test surfaces but
  can share one LLM Chat theme ticket.
- `FB-20260717-043` and `FB-20260717-044` should be one Sequence Video
  generation epic with capability and CTA subtasks. **Done 2026-08-22** — see
  `FB-20260717-SEQVIDEO`.
- `FB-20260722-001`, `FB-20260722-004`, `FB-20260722-005`,
  `FB-20260717-048`, and `FB-20260723-002` form the Camera Lab UI/input
  cluster, while preserving separate acceptance criteria.
- `FB-20260722-002`, `FB-20260718-005`, and `FB-20260718-008` form the Shot
  Video/OpenReel UX cluster.

## Active Feedback

### Consolidated entries — 2026-08-22

Three clusters of delivered feedback were condensed into one entry each, at the
author's request, because ~1 000 lines describing finished work were crowding
the observations that still need a decision. **No id was lost**: each
consolidated entry lists every id it absorbed, with that id's ticket, so any
reference — including the ones in the historical category indexes above, and in
`docs/PROJECT_STYLE_MVP_SPEC.md` — still resolves by a plain search. The full
write-ups remain in this file's git history.

- `FB-20260716-EXTRACT` — storyboard panel extraction, 9 ids, still
  `TO VALIDATE`.
- `FB-20260715-STORYBOARDGEN` — Sequence Storyboard generation and package,
  13 ids, still `TO VALIDATE`.
- `FB-20260717-SEQVIDEO` — Sequence video generation and Split review, 4 ids,
  **`RESOLVED`, validated by the author on 2026-08-22**.

Entries that were physically inside those clusters but carried a different
status were deliberately left alone: `FB-20260716-027` (`OPEN`),
`FB-20260715-010` (`OPEN`), `FB-20260715-016` (`IN PROGRESS`).

### FB-20260811-001 - Randomize Seed must stay within 0-99999

- Status: `TO VALIDATE`
- Date observed: 2026-08-11
- Date fixed (implementation): 2026-08-11
- Area: Generate Content / seed scalar input / `WorkflowScalarInputsForm`
- Context: The shared **Randomize Seed** button (used by every `seed`-kind
  input on the Asset, Shot, and Sequence generate/map surfaces) generated
  `Math.floor(Math.random() * 2 ** 32)`, up to `4294967295`.
- Expected outcome: **Randomize Seed** always produces an integer in the
  closed range `[0, 99999]`. Manual seed entry, URL/workflow-provided seeds,
  and history stay untouched.
- Impact: Seeds stay short enough to compare/track/copy across generations
  without truncation or overflow surprises.
- Related ticket: `GEN.SEED.RANDOMIZE.RANGE.1`
- Resolution: `randomizeSeed` now calls a new pure, exported
  `randomSeedValue()` (`Math.floor(Math.random() * RANDOM_SEED_MAX_EXCLUSIVE)`,
  `RANDOM_SEED_MAX_EXCLUSIVE = 100000`) in
  `src/components/WorkflowScalarInputsForm.tsx` — the single component shared
  by all Asset/Shot/Sequence generate surfaces. No other seed generator
  existed elsewhere in the app.
- Resolved or validated on: Implemented 2026-08-11; user manual validation
  still pending.

### FB-20260811-002 - Opt out of automatic Project Style during generation

- Status: `TO VALIDATE`
- Date observed: 2026-08-11
- Area: Asset / Shot / Generate Content
- Context: Editing an image with an image-to-image workflow when the source
  image already carries the desired visual identity.
- Original observation: Add a default-on `Append Project Style` checkbox in
  Generate Content so automatic Project Style injection can be disabled when
  it is not needed.
- Expected outcome: The checkbox is enabled by default on Asset and Shot
  generation surfaces. When disabled, no Project Style is automatically added
  to the queued prompt or job provenance, and retry preserves that choice.
- Impact: Image-to-image editing can preserve an intentional source look
  without unwanted Project Style prompt composition.
- Related ticket: `GEN.PROJECT_STYLE.APPEND.TOGGLE.1`
- Resolution note (2026-08-11): implemented on all four Asset/Shot Generate
  Content surfaces (embedded panels and dedicated workflow pages). The
  checkbox is checked by default on every mount; unchecking it is enforced
  server-side (fail-closed form parsing), skips Project Style resolution
  entirely, and is preserved exactly on Shot retry. Awaiting Codex review and
  user validation before closing.
- Resolution: None
- Resolved or validated on: None

### FB-20260810-003 - Push an explicit speed-adjusted Shot target duration from OpenReel

- Status: `RESOLVED` (implementation deployed; manual product validation by
  the user still pending)
- Date observed: 2026-08-10
- Date fixed (implementation): 2026-08-10
- Area: OpenReel / MikAI Bridge / Shot production duration
- Context: Compact real-duration exports deliberately disable the existing
  `Push Duration to MikAI` action because their default clip lengths describe
  source-media playback, not the planned production duration. The user wants
  to deliberately slow down or speed up one clip in OpenReel, then reuse its
  resulting timeline length as the target duration for future generations of
  that Shot.
- Expected outcome: A single explicit, confirmed `Set Shot Target Duration`
  action is available for a valid MikAI clip after an actual speed change. It
  writes only the owning Shot's production duration. It never updates the
  compact timeline, editorial items, source media, or existing results.
- Impact: Editorial rhythm can inform the next generation of one Shot without
  reopening unsafe general write-backs for compact playback timelines.
- Related ticket: `OPENREEL.SHOT.TARGET.DURATION.1`
- Resolution: The button is renamed `Set Shot Target Duration` and stays
  disabled on a compact timeline unless the targeted clip carries a
  complete, consistent MikAI provenance across the whole timeline, a unique
  (non-duplicated) MikAI item, an explicit finite/positive speed != 1, and
  is not reversed. The MikAI `editorial-push-duration` route required no
  change — a disposable-DB proof confirmed its existing
  ownership/bound/snapshot contract already satisfies this ticket. A real
  Speed-panel + Playwright proof also surfaced and fixed two pre-existing
  bugs uncovered by allowing this action on compact timelines for the first
  time: (1) the push relied on the timing-patch summary, which never builds
  on compact timing, always blocking the network call — fixed by switching
  to the same `resolveMikaiProjectSequenceContext` agreement already used
  by Publish/Insert; (2) a synchronous double-click could race past the
  React `pushBusy` state guard and fire two confirm dialogs / two POSTs —
  fixed with an immediate `useRef` re-entrancy guard set before the confirm
  dialog. Committed and pushed as `d4a24bcab30e4b089c341d6fb4969e34960bd5ba`
  on the sidecar (`main`, tagged `mikai-sidecar-v1.1.0`); MikAI's
  `config/openreel-sidecar-release.json` pin updated and pushed as
  `72e1b9a3bbc6cdc6b51212c91395fb1be75bdbed`.
- Resolved or validated on: Implemented and deployed 2026-08-10; user manual
  validation still pending.

### FB-20260810-002 - Multi-clip timeline drag stutters and does not track smoothly

- Status: `RESOLVED`
- Date observed: 2026-08-10
- Date fixed (implementation): 2026-08-10
- Area: OpenReel / Timeline / Multi-selection
- Context: In a vanilla OpenReel project as well as the MikAI candidate,
  dragging several selected video segments together makes their motion lag
  behind the pointer and appear to slide inconsistently. Disabling Snap does
  not remove the issue.
- Expected outcome: A selected group moves as one coherent block, follows the
  pointer smoothly, preserves relative offsets, remains one undoable action,
  and does not create a per-clip store/render cascade on every animation
  frame.
- Impact: Timeline assembly with multiple Shots is slow and visually
  unreliable.
- Related ticket: `OPENREEL.TIMELINE.MULTI_CLIP.DRAG.1`
- User validation: 2026-08-10 — confirmed working.
- Resolution: one atomic `clip/move` batch action instead of a per-clip
  store/render cascade. Ships on the OpenReel candidate
  `f80853ce3de432751847eb1bab3d03a669267c37` (tip of
  `mikai/upstream-8459024`), with its own 13-test regression suite
  (`packages/core/src/actions/handlers/clip-move-batch.test.ts`) and a live
  browser demonstration of grouped drag plus single-entry undo/redo. The
  `Resolution: None` that stood here until 2026-08-22 was wrong: the real
  resolution had only ever been written in the follow-up chronicle below,
  which is why condensing this entry made it visible.
- Resolved or validated on: 2026-08-10.
- Condensed 2026-08-22: 75 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260807-001 - OpenReel playback appears to start but never advances

- Status: `RESOLVED`
- Date observed: 2026-08-07
- Area: Editorial / OpenReel sidecar / Playback
- Context: After opening the MikAI Editorial export for Project 18 / Sequence
  54 (`videoSourceMode=latest-generation`) in the OpenReel sidecar at
  `http://127.0.0.1:5173/...#/editor`, clicking Play changed the UI to a
  playing state, but the playhead, timeline, and monitor frame reportedly
  stayed static.
- Expected outcome: Play advances the playhead and monitor frames for the
  imported sequence, or the UI reports one clear diagnostic and reverts to a
  non-playing state; it must never claim playback is running with no clock or
  frame progression.
- Impact: The imported sequence looked unplayable, blocking editorial review
  of the latest-generation cut.
- Related tickets: `OPENREEL.PLAYBACK.FIX1`, `OPENREEL.MULTICLIP.PLAYBACK.1`,
  `OPENREEL.PLAYBACK.CLOCK.LIVENESS.1`
- Resolution: Not a MikAI export issue. `OPENREEL.PLAYBACK.FIX1` first found
  no repro with the single MikAI Project 18 / Sequence 54 export in an
  isolated build. The user then reproduced the freeze with a purely local
  multi-clip OpenReel project (`Bold Havana`), proving it is an OpenReel
  playback defect independent of MikAI. `OPENREEL.MULTICLIP.PLAYBACK.1`
  fixed a startup stall (audio preload blocking the master clock, shipped at
  `bace876`), which improved startup but did not remove a second, deeper
  cause: after a single slow or hung video frame render,
  `PlaybackController.handleClockTimeUpdate` could permanently freeze the
  playhead and monitor while the UI kept reporting `Playing`.
  `OPENREEL.PLAYBACK.CLOCK.LIVENESS.1` found and fixed two liveness holes in
  `packages/core/src/playback/playback-controller.ts`: (1) once a slow render
  pushed audio/video drift over the skip threshold, every later tick silently
  skipped forever without ever re-rendering or recalculating drift — an
  unrecoverable livelock, now fixed by immediately attempting a catch-up
  render on the freshest time instead of skipping indefinitely; (2) a
  hung/never-resolving render held an internal "rendering" flag true forever,
  starving every later tick — now bounded by the same render timeout already
  used for scrubbing, extracted into one shared helper. The playhead's
  `timeupdate` now also fires on every tick regardless of render state, so
  the UI clock never freezes even while a frame is skipped or in flight.
  Verified with deterministic unit tests simulating a slow and a
  never-resolving render, and with isolated Playwright browser runs (6
  overlapping local H.264 clips for render pressure) showing continuous
  playhead/frame progression over 8+ seconds, correct pause/seek/Space/reload,
  and no application error.
  A first-round Codex review of `OPENREEL.PLAYBACK.CLOCK.LIVENESS.1` found the
  fix still let a *permanently* broken renderer be retried forever with the
  playhead moving over a frozen monitor (misleading), and a synchronous throw
  from `videoEngine.renderFrame()` could still leak the render lock. The
  retake added a bounded consecutive-failure counter (default 5, reset on any
  success or explicit Play): once exceeded, the controller pauses itself and
  emits one fixed, sanitized `Playback stopped: the video could not be
  rendered.` error — no raw decoder/path/URL detail, no automatic retry, wired
  to a toast in `playback-bridge.ts`. The render call is now deferred through
  a resolved microtask so a synchronous throw is treated identically to a
  rejection or timeout.
  A second review found the toast/error event were sanitized but the shared
  render helper still logged the raw caught `Error` object (potential
  decoder/Blob URL/path detail) to `console.error`. Fixed by logging a fixed
  string only, never reading or interpolating the caught error; proven with a
  console-spy test using a deliberately sensitive mock error message. See
  `.agents/claude_report.md` for full evidence.
- Resolved or validated on: **2026-08-10 — validated by the user** (« le flux
  Approved-only compact est confirmé fonctionnel sur la session réelle. Le
  feedback est clos »). The fixes ship on the upstream-based sidecar candidate
  `f80853ce3de432751847eb1bab3d03a669267c37` (branch `mikai/upstream-8459024`),
  which replaces the legacy playback lineage with upstream `8459024`'s own
  controller; two isolated browser smoke sessions covered both the normal and
  the compact-real-duration timing paths. The line that stood here until
  2026-08-22 — "pending user retest" — was stale: the retest had happened on
  2026-08-10 and was only recorded in the follow-up chronicle below, which is
  why condensing this entry made it visible.
- Condensed 2026-08-22: 309 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260726-001 - Influence Research completes with no sources

- Status: `RESOLVED`
- Date observed: 2026-07-26
- Area: Project Style / Creative Influences / Research / Settings
- Context: The user opened Research for the Roger Deakins Creative Influence,
  searched the web for `his lighting approach`, and received completed Runs
  with no Candidate or Source to review.
- Expected outcome: A successful Discover call yields reviewable cited
  Candidates. A response with no valid citations is an explicit failure and
  creates no empty Run. Influence Research inherits the active Language Model
  provider/model by default, with an optional separate provider chosen in
  Settings without duplicating API keys or model configuration.
- Impact: Research currently appears successful while producing no usable
  evidence, and it silently uses a hard-coded model instead of the user's LLM
  configuration.
- Related ticket: `STYLE.1.C.SEARCH.FIX1`
- Resolution: Implemented in `STYLE.1.C.SEARCH.FIX1` and shipped at `9a0d96b`.
  MikAI now parses nested OpenRouter `url_citation` fields, refuses results
  without valid citations without creating an empty Run, and inherits the
  active Language Model provider/model unless a separate Research provider is
  enabled in Settings.
- Resolved or validated on: 2026-07-26.
- Condensed 2026-08-22: 35 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260723-001 - Define the Project Style V1 workspace

- Status: `RESOLVED`
- Validated on: 2026-08-02 (user confirmation: `c est ok`)
- Date observed: 2026-07-23
- Area: Project Style / Assets / Sequences / Shots / Storyboard / Generation
- Context: Defining the Project Style MVP after completing Story, extracting
  Asset drafts and preparing to generate visually coherent Assets and Shots.
- Expected outcome: A dedicated Project Style workspace lets the user build a
  sparse, source-grounded and versioned artistic direction from a brief,
  Creative Influences, visual references and optional AI analysis. The active
  Style informs Asset design and generation. Sequences inherit it by default
  or replace it with one local override used by their Storyboard, Sequence
  generations and Shots.
- Impact: Without this layer, individually plausible Asset and Shot prompts
  can drift between eras, genres, design languages, rendering styles and
  photographic treatments, preventing project-wide visual unity.
- Related ticket: `STYLE.1` epic; specification
  `docs/PROJECT_STYLE_MVP_SPEC.md`
- Resolution: Product contract agreed; implementation split into foundation,
  research, references/influences, Sequence inheritance, prompt integration,
  Asset alignment and Look Development tickets.
- Resolved or validated on: Product design validated 2026-07-23;
  implementation complete and pushed through `72f9d89`; transversal
  acceptance (`STYLE.1.ACCEPTANCE.1`) `ACCEPTED` and epic `STYLE.1`
  formally closed with user confirmation on 2026-08-02 (`c est ok`).
- Condensed 2026-08-22: 521 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260722-004 - Correct Gaussian depth and wheel precision

- Status: `TO VALIDATE`
- Date observed: 2026-07-22
- Area: Shot / Camera Lab / Gaussian Viewer
- Context: Framing real SHARP Gaussian Splats before capturing a Shot camera
  reference.
- Original observation: Some wide shots look excessively stretched in depth,
  and one mouse-wheel step moves the camera too far for precise framing.
- Expected outcome: The viewer provides a reversible `Depth scale` control
  affecting only local Z, plus normalized Fine/Normal/Fast wheel sensitivity
  and `Alt + Wheel` for temporary ultra-fine dolly. Reset Camera must frame the
  transformed scene and captures must match the visible corrected rendering at
  exact source resolution.
- Impact: Makes Gaussian Camera useful for precise art-directed framing across
  different splats and input devices without altering the generated PLY.
- Related ticket: `CAMLAB.VIEWER.CONTROLS.1`
- Resolution: Implemented by Claude — `Depth scale` slider/numeric control
  (0.10–2.00, default 1.00) applies a non-destructive local Z-only scale to
  the `sharp-splat` entity; the PLY file is never touched. `Reset depth`
  restores 1.00 without moving the camera; `Reset camera` reframes using
  bounds recomputed at the current depth. `Zoom sensitivity` (Fine/Normal/
  Fast, default Normal) normalizes `deltaMode` (pixel/line/page) before
  applying a fixed coefficient, with `Alt + Wheel` for a temporary ×0.2
  fine-dolly; only the sensitivity preset persists in `localStorage`, read
  after hydration so SSR/first paint always shows "Normal". A new pure
  module (`src/lib/cameraLab/viewerControls.ts`) holds all numeric contracts
  (depth clamp, bounds transform, wheel normalization, presets, distance
  calculation), covered by 69 deterministic unit tests. No schema,
  migration, dependency, or ComfyUI/PLY change. Awaiting Codex review and
  user validation checklist before this is marked resolved.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-22: Product decision: `depthScale` remains local to the loaded PLY
  and resets to `1.00`; only the validated zoom-sensitivity preset persists in
  localStorage. No migration, dependency, PLY rewrite or ComfyUI runtime change
  is authorized.
- 2026-07-22: Codex review round 1 returned `REVISE` (3D engine and captures
  compliant, 3 targeted findings confined to `GaussianViewerPanel.tsx`): the
  depth numeric field clamped on every keystroke instead of allowing natural
  typing; the Fine/Normal/Fast control used an incomplete `role="radio"`
  pattern with a hover-only `title` tooltip; `preventDefault()` on wheel ran
  after the orbit-readiness guard, allowing page scroll during PLY loading.
  Claude applied the retake: depth field now separates a free-typing draft
  from the clamped committed value (clamp only on Enter/blur, Escape
  discards); Fine/Normal/Fast are real `<button aria-pressed>` elements
  reusing the existing `FieldTooltip` component (hover and keyboard focus
  both show the tooltip); `preventDefault()` is now unconditional at handler
  entry, before the orbit guard. `viewerControls.ts` untouched (re-verified
  byte-for-byte). Re-validated: 11/11 pure regression, 19/19 real-browser
  checks (production server, real completed PLY job #298), `tsc`/`build`/
  `db:generate`/`git diff --check` all clean. Full detail in
  `.agents/claude_report.md` (retake section). Awaiting fresh Codex verdict.

### FB-20260722-001 - Camera Lab needs a guided three-stage workspace

- Status: `TO VALIDATE`
- Date observed: 2026-07-22
- Area: Shot / Camera Lab / Generation
- Context: Continuing the Gaussian Camera MVP after PLY retrieval, viewer and
  Shot-reference capture were delivered.
- Original observation: Camera Lab should show three columns above Setup: a
  preloaded Gaussian PLY generation workflow, the Gaussian viewer with Refresh
  and Capture Snapshot, and a preloaded Gaussian-to-image workflow receiving
  the snapshot first and the original source image second.
- Expected outcome: The user can complete the image -> PLY -> camera snapshot
  -> Gaussian-to-image flow without leaving Camera Lab or manually remapping
  the intermediate media.
- Impact: The current page exposes the viewer but leaves generation and media
  handoff fragmented across generic generation surfaces.
- Related ticket: `CAMLAB.POLISH.1`
- Resolution: Implemented by Claude — three-column workspace added above
  Setup: Column 1 queues a Gaussian PLY generation through the canonical
  Local/Cloud pipeline (source picked via a visual `ImageSourcePicker` with
  an "Upload Source" shortcut); Column 2 adds a server-revalidated Refresh
  Viewer bound to Column 1's own tracked job, with the job's actual
  workflow re-validated against the Gaussian PLY contract on every refresh;
  Column 3 queues a Gaussian-to-image generation with a deterministic
  snapshot-then-source input mapping (structural order only, never
  label-inverted) and a transient (never persisted) snapshot upload, with
  an "Add to Shot references" action once the output is a finished image.
  The source image for Column 3 is always derived from the PLY job's own
  recorded provenance server-side, never from a caller-supplied id. Two new
  Generation Defaults added in Settings; Comfy Cloud now shares a single
  canonical API key field with Partner Node billing (legacy key still read
  as a fallback, no migration). Round 3 adds: an explicit `Upload Snapshot
  Override` in Column 3 (captured draft never lost, provenance records
  which source was actually queued); `Setup` is now collapsed by default
  and read-only (no selection controls, legacy `jobId`/`refId` deep links
  still work underneath); a Shot-scoped `Clear Shot PLY caches` action using
  a dedicated quarantine/conditional-transaction/restore-on-failure
  discipline (jobs kept as history, never deleted); and every non-image
  `(Input)` workflow node in Column 1 (text/integer/float/boolean/select/
  seed) is now editable and threaded through the canonical override
  pipeline, re-validated server-side against the workflow's real structure.
  Round 4 makes the "Gaussian Camera" entry point on Shot Detail permanent:
  it no longer hides behind a Shot already having a finished PLY — every
  valid Shot now shows the link, pointing to its own Camera Lab, so the
  three-column workspace (including PLY generation from zero) is reachable
  before any PLY exists. Round 5 hardens `Clear Shot PLY caches`: a race on
  any single cached PLY now cancels the whole clear operation instead of
  partially committing (all-or-nothing); a failed final cleanup now
  attempts full compensation (file and database both restored) and, if
  that compensation itself can't fully succeed, names the exact job and
  file path left incomplete rather than reporting a false success; and its
  `returnTo` redirect target is now confined server-side to the Shot's own
  Camera Lab page (never an arbitrary caller-supplied URL), via a helper
  now shared with the existing Upload Source flow. Round 6 fixes two more
  issues in `Clear Shot PLY caches`: the Camera Lab page was still reading
  stale feedback parameter names from before round 5, so a real cleanup
  failure could silently show as "nothing to clear" — now fixed and
  showing the real reverted/incomplete-compensation state. The database
  compensation after a failed final cleanup is now conditional and coupled
  to a confirmed file restore — it never points the database at a file
  that wasn't actually restored, and never overwrites a newer value
  written by a concurrent process. Five Codex REVISE rounds addressed
  (provenance/ordering findings, a round-2 user retake, the permanent-entry
  retake, cache-clearing hardening, then this feedback/compensation fix).
  Awaiting Codex review and user validation checklist before this is
  marked resolved.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-22: During hands-on validation, the user configured `gaussianPLY`
  and `GaussianQwen`. Column 1 still needs the standard visual source picker:
  selectable thumbnails with the existing enlarged hover preview.
- 2026-07-22: Clicking `Generate Gaussian PLY` first returned `fetch failed`
  because the runtime/key configuration was incomplete. The user then confirmed
  Cloud generation works after entering the API key. Accepted retake: expose
  one canonical Comfy.org key and use it for both Cloud auth and Partner Nodes,
  while preserving legacy saved-key compatibility without rendering secrets.
- 2026-07-22: Add `Upload Source` beside the visual picker in Column 1, and an
  explicit `Add to Shot references` action directly below a completed Column 3
  image output. Neither action may create an implicit approval.
- 2026-07-22: Additional Camera Lab retake requested before approval: Column 3
  must allow a local uploaded snapshot override while preserving the captured
  draft; legacy Setup must be collapsed by default and read-only; the user
  needs a safe Shot-scoped action to clear all cached PLY artifacts; and every
  non-image workflow node marked `(Input)` in Column 1 must be editable through
  the canonical text/scalar override pipeline. The Load Image input remains
  exclusively represented by the existing visual source picker.
- 2026-07-22: User validation found that the `Gaussian Camera` shortcut still
  appears only on a Shot that already owns an eligible PLY. Since Camera Lab
  can now create that PLY itself, the shortcut must be present on every Shot
  Detail; PLY eligibility remains enforced inside the workspace and actions.

### FB-20260719-001 - Manual split thumbnails must show the segment first frame

- Status: `IN PROGRESS`
- Date observed: 2026-07-19
- Area: Storyboard / Sequence Video Split
- Context: Manually cutting a Sequence Video Draft with Split at Current Frame.
- Original observation: The thumbnail generated after a manual split does not
  correspond to the first frame of the resulting segment.
- Expected outcome: Each half created by a manual split uses its own exact
  first source frame as thumbnail, especially the new second half beginning at
  the selected split frame.
- Impact: The visual review can suggest the wrong opening frame and makes
  short segments harder to identify.
- Related ticket: `SEQGEN.SPLIT.CLEANUP.1-FIX1`
- Resolution: Selection and seek were corrected in `b007f87`, but user
  validation confirmed that the App Router navigation still resets the page
  to the top after every Split at Current Frame. A focused scroll-restoration
  fix is in progress.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-19: The current shared thumbnail helper seeks to the midpoint of
  every segment. The retake must preserve existing automatic-detection
  behavior unless explicitly needed, while manual Split actions request the
  true segment start frame.

### FB-20260719-002 - Preserve Split Workspace position and select the new segment

- Status: `RESOLVED`
- Date observed: 2026-07-19
- Area: Storyboard / Sequence Video Split
- Context: Clicking Split at Current Frame while reviewing a selected segment.
- Expected outcome: The Split Workspace remains at the user's working
  position after submission, and the newly created second half is selected
  automatically and loaded in the player.
- Impact: Every manual cut currently interrupts the review flow and requires
  finding/selecting the new segment again.
- Related ticket: `SEQGEN.SPLIT.CLEANUP.1-FIX4`
- Resolution: Exact new-segment selection, seek, and the compact resizable
  player are working. Two JavaScript scroll-restoration attempts failed in the
  real browser. The final retake uses a native `#split-video-player` fragment
  after successful frame splits and keeps the Frame/Split toolbar below the
  resizable player.
- Resolved or validated on: 2026-07-20
- Condensed 2026-08-22: 27 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260717-SEQVIDEO - Sequence video generation and Split review, closed

- Status: `RESOLVED`
- Date observed: 2026-07-17
- Area: Storyboard / Sequence video generation / Split Workspace
- Context: Four observations made while exercising Sequence video generation
  and split review. **Closed by the author on 2026-08-22** — he validated
  them and asked for them to be condensed, the same treatment as
  `FB-20260716-EXTRACT` and `FB-20260715-STORYBOARDGEN`. Their full write-ups
  live in this file's git history.
- Consolidated IDs and what each asked for:
  - `FB-20260717-043` — generate a Sequence video from the Storyboard
    workspace · `SEQGEN.VIDEO.1`
  - `FB-20260717-044` — make **Generate Sequence Video** more prominent ·
    `UX.PRODUCTIVITY.POLISH.1`
  - `FB-20260717-046` — unify Split review and refine cuts locally ·
    `SEQGEN.SPLIT.WORKSPACE.1`
  - `FB-20260717-047` — Split Plan rejected a frame-quantized source
    endpoint · `SEQGEN.SPLIT.WORKSPACE.1-FIX1` (already `RESOLVED` before
    this consolidation)
- Expected outcome: unchanged — each item shipped under its named ticket.
- Impact: a Sequence video can be generated from the Storyboard workspace,
  and its splits reviewed and refined in one place with frame accuracy.
- Related ticket: `SEQGEN.VIDEO.1`, `SEQGEN.SPLIT.WORKSPACE.1` and its
  `-FIX1`, `UX.PRODUCTIVITY.POLISH.1`.
- Resolved or validated on: **Validated by the author 2026-08-22.** Other
  Split Workspace observations stay open on their own entries and are NOT
  covered here — see `FB-20260719-001`, `FB-20260718-003`, `FB-20260718-004`
  and `FB-20260821-001`.

### FB-20260716-021 - Reference videos for Assets and Shots

- Status: `INBOX`
- Date observed: 2026-07-16
- Area: Assets / Shots / Reference media / ComfyUI workflows
- Context: Preparing future reference video-to-video generation workflows.
- Original observation:

  > il faudra qu on voit ensemble pour pouvoir storer des videos de reference
  > pour les assets et les shots, car cela sera necessaire pour les workflow
  > reference video to video

- Expected outcome: Define a durable way to upload, store, review, and select
  reference videos associated with Assets and Shots so compatible
  reference video-to-video workflows can use them as explicit inputs.
- Impact: Without first-class video references, future video-to-video
  workflows cannot reliably reuse motion, appearance, camera, rhythm, or
  continuity material linked to the relevant Asset or Shot.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Product discussion must define reference-video roles, whether a
  video belongs to an Asset, a Shot, or a shared catalog, and the expected
  upload, preview, approval, ordering, replacement, and deletion workflow.
- 2026-07-16: Architecture preparation must audit the existing media schema
  and storage lifecycle, then decide what durable metadata is required, such
  as source filename, path, duration, dimensions, frame rate, codec,
  thumbnail, role, approval, provenance, and usage notes.
- 2026-07-16: This observation does not yet authorize a schema, migration,
  storage, ComfyUI protocol, generation-runtime, job-runner, polling, or
  dependency change. Those decisions require a dedicated ticket after the
  product discussion.

### FB-20260715-STORYBOARDGEN - Sequence Storyboard generation and package, consolidated

- Status: `TO VALIDATE`
- Date observed: 2026-07-15 to 2026-08-04
- Area: Storyboard / Sequence Generation / Sequence Generation Package
- Context: Thirteen observations made while exercising Sequence Storyboard
  generation, from the first contact sheet to the inline casting editor. All
  shipped. Condensed into this single entry on 2026-08-22 at the author's
  request, for the same reason as `FB-20260716-EXTRACT`: they described
  delivered work and were crowding the observations that still need a
  decision. Their full write-ups live in this file's git history.
- Consolidated IDs and what each asked for:
  - `FB-20260715-015` — a storyboard contact sheet at Sequence level ·
    `SEQGEN.STORYBOARD.3`
  - `FB-20260715-011` — make the generation action explicit ·
    `SEQGEN.STORYBOARD.2-FIX`
  - `FB-20260715-012` — expand Asset reference lists by default ·
    `SEQGEN.STORYBOARD.2-FIX`
  - `FB-20260716-017` — GPT Image 2 needs direct repeatable image inputs ·
    `SEQGEN.STORYBOARD.3-FIX2`
  - `FB-20260716-018` — those inputs started with zero images selected ·
    `SEQGEN.STORYBOARD.3-FIX3`
  - `FB-20260716-019` — clear a stale generation error when changing
    Sequence · `SEQGEN.STORYBOARD.3-FIX4`
  - `FB-20260716-020` — the first Generate click submitted zero images ·
    `SEQGEN.STORYBOARD.3-FIX5`
  - `FB-20260722-006` — collapse the package, reduce its warnings ·
    `UX.PRODUCTIVITY.POLISH.1`
  - `FB-20260803-001` — remove warnings from the Shot-by-shot detail ·
    `UX.SEQUENCE.STYLE.POLISH.1`
  - `FB-20260804-005` — remove Storyboard diagnostics ·
    `SEQGEN.STORYBOARD.CASTING.FIX1`
  - `FB-20260804-006` — keep internal Reference metadata out of the prompt ·
    `SEQGEN.STORYBOARD.CASTING.FIX1`
  - `FB-20260804-007` — initialize Dynamic Inputs from Storyboard Assets ·
    `SEQGEN.STORYBOARD.CASTING.FIX1`
  - `FB-20260804-008` — edit casting references inline ·
    `SEQGEN.STORYBOARD.CASTING.FIX1`
- Expected outcome: unchanged — each item shipped under its named ticket.
  This entry reopens none of them.
- Impact: Sequence Storyboard generation exists end to end — package, prompt,
  casting, Dynamic Inputs — and everything since builds on it, including
  `SEQGEN.STORYBOARD.SHOTRANGE.1` (2026-08-22, commit `0e9e121`).
- Related ticket: the `SEQGEN.STORYBOARD.2`/`.3` families, their FIX retakes,
  `SEQGEN.STORYBOARD.CASTING.FIX1`, `UX.PRODUCTIVITY.POLISH.1` and
  `UX.SEQUENCE.STYLE.POLISH.1`.
- Resolved or validated on: Implemented between 2026-07-15 and 2026-08-04.
  **Author's manual validation still pending** — condensing these did not
  validate them. Two neighbours of this cluster are deliberately excluded and
  keep their own entries: `FB-20260715-010` (Seedance package size limit,
  still `OPEN`) and `FB-20260715-016` (React Router warning, still
  `IN PROGRESS`).

### FB-20260715-016 - React Router update during Storyboard Assets render

- Status: `IN PROGRESS`
- Date observed: 2026-07-15
- Area: Storyboard / Assets selection
- Context: Selecting or rendering the expanded reference lists in Storyboard.
- Original observation:

  > Cannot update a component (`Router`) while rendering a different component
  > (`StoryboardAssetsPanel`). `router.replace()` at
  > `StoryboardAssetsPanel.tsx:78`.
- Expected outcome: Storyboard Assets renders without React console errors;
  reference selection still updates `storyboardRefs` and preserves other query
  parameters.
- Impact: React render warning may indicate unstable selection state and makes
  the Storyboard workflow unreliable.
- Related ticket: `SEQGEN.STORYBOARD.3-FIX`
- Resolution: In progress; remove Router updates from state updaters/render
  paths and revalidate after a clean server restart.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: User-provided Next.js/React stack trace identified
  `StoryboardAssetsPanel.tsx` as the failing surface.

### FB-20260715-001 - Replace Settings anchors with real tabs

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Settings
- Context: Navigating between the Settings categories from the shortcuts at
  the top of the page.
- Original observation:

  > je trouve que la navigation dans les settings n est pas bonne, j ai
  > actuellement des raccourci anchor en faut de page mais cela ne me convient
  > pas. Je voudrait un system d'onget, pour chaque parti on ne verrait que ce
  > qui est dedié à cette parti, et pas juste un jump dans la zone dédidé au
  > sein d'une grande liste

- Expected outcome: Replace the anchor shortcuts with actual tabs. Selecting a
  tab displays only the settings belonging to that category and hides the
  other categories, instead of scrolling within one long page.
- Impact: The current anchors do not reduce page density or isolate the active
  task, so Settings still feels like one large list rather than distinct
  configuration areas.
- Related ticket: `UX.SETTINGS.CHAT.1` (shipped in commit `c0cf81e` on
  `origin/main`) implemented real ARIA tabs (roving
  tabindex, Arrow/Home/End) replacing `UX.2.SETTINGS.NAV.1`'s anchor
  shortcuts; awaiting user validation.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Captured as a request for real content-switching tabs, not a
  visual restyling of the existing anchor links.
- 2026-08-03: `UX.SETTINGS.CHAT.1` replaced the anchor nav in
  `src/app/settings/page.tsx` with `SettingsTabs.tsx`, a real ARIA tabs
  widget (single visible tabpanel, roving tabindex, Arrow/Home/End,
  `defaultsSaved=1` opens `Generation Defaults` directly). Status moved to
  `TO VALIDATE` pending user confirmation.

### FB-20260715-002 - Use Text Primary for the LLM Chat logo

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: LLM Chat / Theme
- Context: Viewing the LLM Chat logo or icon in the application interface.
- Original observation:

  > la couleur du logo de llm chat devrait etre sur text promary et non basé
  > sur text secondary

- Expected outcome: The LLM Chat logo or icon uses the `Text Primary` theme
  token instead of `Text Secondary`.
- Impact: The current secondary color gives the LLM Chat identity less visual
  emphasis than intended and does not match the desired text hierarchy.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Interpreted `text promary` as the existing `Text Primary` theme
  token. The exact LLM Chat logo/icon component should be located during
  ticket preparation.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` changed the Right Context Panel
  launcher/close icon (`ResizableRightPanelShell.tsx`) from `text-[#a4abb2]`
  (Text Secondary) to `text-[#e7e9ec]` (Text Primary), preserving hover,
  collapse/reopen and viewport behavior. Status moved to `TO VALIDATE`
  pending user confirmation.

### FB-20260715-003 - Fit the expanded chat column to the browser viewport

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Right panel / LLM Chat
- Context: Using the expanded column on the right side of the application.
- Original observation:

  > j aimerai que la fenetre depliable de droite, où se trouve le chat, fit à
  > la hauteur de la fenetre webrowser. Actuellement je dois scroller pour tout
  > voir.

- Expected outcome: The expanded right column fits within the visible browser
  viewport. The user should not need to scroll the whole page to reach part of
  the chat; overflowing conversation content should be handled inside the chat
  layout while its essential controls remain accessible.
- Impact: Part of the chat column currently falls outside the viewport, adding
  unnecessary page scrolling during conversation.
- Related ticket: `UX.SETTINGS.CHAT.1` (shipped in commit `c0cf81e` on
  `origin/main`) bounded the expanded panel to the
  viewport height under TopBar/ContextStrip and made only the conversation
  area scroll internally; awaiting user validation.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Captured as viewport-height behavior for the expanded column,
  not merely a request to make the chat content shorter.
- 2026-08-03: `UX.SETTINGS.CHAT.1` removed the legacy `chatHeight`
  px-height/drag-resize mechanism from `SidebarLLMChat.tsx` and made the
  aside (`ResizableRightPanelShell.tsx`) a full-height flex column; header,
  mode tabs, model/system-prompt selectors and the input area stay fixed,
  only the message list scrolls. Status moved to `TO VALIDATE` pending user
  confirmation.

### FB-20260715-004 - Keep only LLM Chat in the right column

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Right panel / LLM Chat
- Context: Reviewing the content displayed in the expandable right column.
- Original observation:

  > de plus je voudrais enlevé de cette colonne, la partie sequence, actions
  > et shots, ou tout autre element à part la parti llm chat

- Expected outcome: Remove `Sequence`, `Actions`, `Shots`, and every other
  non-chat section from this column so it is dedicated exclusively to LLM
  Chat.
- Impact: Unrelated contextual sections compete with the chat for limited
  vertical space and make the column less focused.
- Related ticket: `UX.SETTINGS.CHAT.1` (shipped in commit `c0cf81e` on
  `origin/main`) reduced `RightPanel.tsx` to render
  only `SidebarLLMChat` (Project/Sequence/Shot/Assets context, quick links
  and `Coming later` placeholders removed) and made a single click on the
  launcher reveal the full Chat interface, removing the prior second
  disclosure; awaiting user validation.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: This is a product-content request, not only a disclosure or
  default-collapsed-state adjustment.
- 2026-08-03: `UX.SETTINGS.CHAT.1` rewrote `RightPanel.tsx` to
  `ResizableRightPanelShell` -> `SidebarLLMChat` only; the `tree` prop was
  dropped since no context-derived content remains. `SidebarLLMChat`'s own
  `isOpen` closed-disclosure state was removed so opening the panel shows
  the full Chat immediately. Status moved to `TO VALIDATE` pending user
  confirmation.

### FB-20260715-005 - Use Text Primary for the LLM Chat title

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Right panel / LLM Chat / Theme
- Context: Viewing the `LLM Chat` heading inside the right column.
- Original observation:

  > le text "**LLM Chat**"dans cette colonne devrait etre en couleur text
  > primary

- Expected outcome: The `LLM Chat` heading uses the `Text Primary` theme token.
- Impact: The title should carry primary emphasis and remain clearly legible
  as the identity of the dedicated chat column.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: This targets the heading text and is distinct from
  `FB-20260715-002`, which targets the LLM Chat logo or icon.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` changed the `LLM Chat` heading in
  `SidebarLLMChat.tsx` from a hard-coded `text-[#e0e4e8]` (not a mapped
  theme token) to `text-[#e7e9ec]` (Text Primary), preserving the provider
  badge's existing secondary hierarchy. Status moved to `TO VALIDATE`
  pending user confirmation.

### FB-20260715-006 - Expose typography controls in Custom Appearance

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Settings / Custom Appearance / Typography
- Context: Customizing the application's appearance and reviewing the fonts
  used across the interface.
- Original observation:

  > dans les custom apparence, j aimerai bien avoir d exposé les differentes
  > font utilisé, et pouvoir driver la taille et si c est en bold, italic ou
  > autre.

- Expected outcome: Custom Appearance exposes the different typography roles
  used by the application and lets the user control relevant font properties,
  including size, weight such as bold, and style such as italic.
- Impact: Current font customization does not expose enough of the typography
  system for the user to tune hierarchy and visual identity.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must define which typography roles are safe
  to expose, how inheritance and reset work, and what limits preserve layout
  and readability. No specific implementation or dependency is authorized by
  this observation alone.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` extended the two existing typography
  roles (Display -> h1, Body/UI -> body) with bounded size (18-48px / 12-20px),
  weight (400/500/600/700) and style (normal/italic) controls in
  `ThemeModeToggle.tsx`, backed by a centralized clamp/validate contract in
  `src/lib/mikrosTheme.ts` and mirrored in the `layout.tsx` anti-flash script.
  Legacy themes without these fields load with the documented defaults.
  Status moved to `TO VALIDATE` pending user confirmation.

### FB-20260715-007 - Fix the unreadable New Project button color

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Projects / Theme / Buttons
- Context: Viewing the `New Project` action in the project interface.
- Original observation:

  > la couleur du bouton "new project" est illisible, elle n'est pas réglé
  > comme la couleur des autres bouton du meme genre

- Expected outcome: In the left column, the `New Project` label uses the
  `Text Secondary` theme token while the button remains consistent with
  equivalent actions and preserves readable contrast.
- Impact: The current foreground/background color combination makes the action
  difficult to read and creates an inconsistent button hierarchy.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation should identify the intended shared button
  variant and verify contrast in every supported appearance mode, rather than
  applying an isolated hard-coded color.
- 2026-07-16: User refinement:

  > le mot "new project" de la colonne de gauche devrait avoir la couleur de
  > la text secondary

- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` changed the `New Project` label in
  `Sidebar.tsx` from `text-[#4b5158]` (Text Disabled) to `text-[#a4abb2]`
  (Text Secondary), with a `hover:text-[#e7e9ec]` state; the `+` icon keeps
  its existing dimmer hierarchy since the audit found no shared treatment
  with the label. Status moved to `TO VALIDATE` pending user confirmation.

- 2026-07-16: `Text Secondary` is now the explicit desired token for the
  left-column label; implementation should still use the shared theme token,
  not a hard-coded color.

### FB-20260715-008 - Custom thumbnail backgrounds for Project and Sequence rows

- Status: `WONTFIX` — implemented in UX.MEDIA.PREVIEW.1, committed and pushed
  to `origin/main` (`09439fa`, 2026-08-05: Sidebar Project/Sequence rows,
  `/projects` list rows and `/projects/[id]` Sequence cards with adjustable
  opacity), then cancelled outright by the user in the
  UX.MEDIA.PREVIEW.1-RETARGET1 retake (2026-08-05): the user no longer needs
  this feature. All upload/edit UI and Server Actions were removed in that
  retake, but migration `0048` (already applied to real databases) and its
  four tombstone columns were kept byte-identical — an already-pushed
  migration is immutable, and at least one real row (Sequence #57) still
  durably points at a real, still-present file.
- Date observed: 2026-07-15
- Area: Project list / Sequence list / Visual customization
- Context: Browsing the button-style rows used to open Projects and Sequences.
- Original observation:

  > cela serait sympa d'avoir un petit botuon icone thumbnails, sur la liste
  > bouton projet, et la liste bouton sequence. lorsque je clique sur ce
  > bouton, je pourrait uploader une image qui sera en opacité reduite
  > (reglable) sur la ligne associé, d une image qui sera sous le text et qui
  > decorera un peut

- Expected outcome: Add a small thumbnail icon action to each Project and
  Sequence row. It lets the user upload an image for that specific item and
  display it as a decorative background beneath the row text, with adjustable
  reduced opacity.
- Impact: Personalized background images would make Project and Sequence lists
  more visually distinctive and easier to recognize at a glance.
- Related ticket: UX.MEDIA.PREVIEW.1 / UX.MEDIA.PREVIEW.1-RETARGET1
- Resolution: WONTFIX — cancelled by explicit user decision after being fully
  implemented; the user no longer needs this feature.
- Resolved or validated on: 2026-08-05

#### Follow-up notes

- 2026-07-15: Ticket preparation must clarify image and opacity persistence,
  storage ownership, accepted formats and limits, crop/position behavior,
  removal/reset, and text contrast. This observation does not by itself
  authorize a schema, migration, upload-storage, or package change.
- 2026-08-05: User decision — cancel the row-background lot entirely, without
  a destructive rollback of the real local DB. All upload/edit UI and Server
  Actions were removed in UX.MEDIA.PREVIEW.1-RETARGET1; migration `0048`
  (already pushed and applied) and its schema columns were kept as an
  immutable tombstone, and the confined legacy-file cleanup on Project/
  Sequence delete was preserved so any remaining real background file (e.g.
  Sequence #57's) is never orphaned. The four nullable columns may remain as
  residue in the local dev DB only.

### FB-20260715-009 - Show the video name as a frame player overlay

- Status: `TO VALIDATE` — implemented in UX.MEDIA.PREVIEW.1 (2026-08-05).
  `VideoFrameReviewPlayer` gained an optional `mediaLabel` prop rendered as a
  persistent, truncated, non-interactive overlay top-left of the video. All 8
  real callers now pass a durable name (Result/Draft/Candidate label or
  Sequence/Shot title — never a raw URL); callers with no identifiable media
  omit the label.
- Date observed: 2026-07-15
- Area: Video frame player / Overlay
- Context: Reviewing a video in the frame-aware player.
- Original observation:

  > je me demande si dans le frameplayer on pourrait afficher le nom de la
  > video en overlay

- Expected outcome: Display the current video's name as a readable,
  non-obstructive overlay in the frame player so the viewed media remains
  identifiable during playback and review.
- Impact: An on-player label could reduce ambiguity when comparing or reviewing
  several videos.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must identify the intended player surfaces,
  define whether the label is a filename, result title, or version name, and
  decide whether the overlay is persistent, temporary, or user-toggleable.
  This observation does not authorize changes to `SequencePreviewPlayer`.

### FB-20260715-010 - Keep the Seedance package below its prompt-size limit

- Status: `OPEN`
- Date observed: 2026-07-15
- Area: Sequence Generation Package / Seedance
- Context: Reviewing the `Full JSON Package` intended for use with Seedance.
- Original observation:

  > le full json package est trop long, seedance s attend à une lenght de
  > prompt de maximum 32000 donc il va falloir qu on optimise le json à donner

- Expected outcome: Produce an optimized, compact package for Seedance that
  stays within the reported maximum prompt length of 32,000 while preserving
  the essential ordered Shot prompts and information needed for generation.
- Impact: An oversized JSON package may be rejected, truncated, or leave too
  little room for the useful generation instructions.
- Related ticket: `SEQGEN.1` provides the current read-only package and should
  be reassessed when preparing the future Seedance execution/export ticket.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Keep the inspectable full package conceptually separate from the
  compact payload actually sent to Seedance; the diagnostic view does not
  necessarily need to be the transport format.
- 2026-07-15: Ticket preparation must verify whether the active Seedance
  integration measures the 32,000 limit in characters, tokens, or bytes, then
  define deterministic compaction rules, a visible size counter, and clear
  overflow diagnostics. This observation alone does not authorize changes to
  the generation runtime, job runner, polling, schema, or dependencies.
- 2026-07-27: `STYLE.1.E.CORE.1` implemented by Claude — added
  `accountPromptSize()` (`src/lib/projectStyle/generationStyleSource.ts`), a
  pure helper returning exact character and UTF-8 byte counts (never
  "tokens", no tokenizer fabricated) for the base prompt, the resolved
  Style segment and the final composed prompt. This is size-accounting
  infrastructure only: no Seedance compaction, no 32,000-limit enforcement,
  no truncation, and no change to the generation runtime or payload
  patcher. Deterministic compaction against this limit remains open for a
  future ticket once Style is actually wired into a generation surface
  (`STYLE.1.E.SURFACES.1`). Status stays `OPEN`.

### FB-20260715-013 - Central System Prompts category in Settings

- Status: `OPEN`
- Date observed: 2026-07-15
- Area: Settings / LLM processes / System Prompts
- Context: Reviewing and configuring the prompts used by the application's
  different LLM-assisted processes.
- Original observation:

  > j aimerai bien avoir une categorie dans settings "system prompt" ave acces
  > à tout les prompt pout tout nos process llm de l'application

- Expected outcome: Add a `System Prompts` category in Settings that provides
  centralized access to the prompts used by every LLM process across the
  application, with each prompt clearly associated with its purpose and
  calling workflow.
- Impact: Central visibility would make LLM behavior easier to understand,
  audit, tune, and keep consistent across features.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must inventory every LLM call site and define
  which prompts are read-only or editable, their global/project scope,
  defaults, validation, reset behavior, versioning, and fallback behavior for
  invalid edits. Existing LLM Chat system-prompt controls do not by themselves
  satisfy this application-wide request.
- 2026-08-13: **The inventory prerequisite above is now satisfied.**
  `docs/LLM_OPERATIONS_INVENTORY.md` (ticket `PROMPTS.INVENTORY.CLEANUP.1`,
  commits `6a730b6` / `f31416a`) tabulates all 26 exported LLM actions with
  their prompt builders, assist components, anchor entities, written fields
  and output shapes. Status stays `OPEN`: the inventory unblocks ticket
  preparation, it does not deliver the Settings category.
  One constraint it establishes matters here: prompt builders are **not** all
  under `src/lib/prompts/` — `translationPrompt.ts` lives in `src/lib/llm/` —
  so any screen listing prompts by directory scan would silently omit one.
- 2026-08-13: **Likely to be superseded by the LLM Workspace.** This entry has
  never been promoted to `docs/ROADMAP.md`, so it commits nothing and gates
  nothing. More to the point, what it asks for — one place to see and tune the
  prompts of every LLM process — is what the workspace's three-pane bench and
  variable library provide as a by-product
  (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §5.1, §5.2). Building a separate
  `System Prompts` Settings category now would duplicate that.
  **Do not prepare a Settings-category ticket.** Re-evaluate this observation
  once the workspace exists, against what it actually delivers. Status stays
  `OPEN` — the need is real and unmet; only the intended solution has moved.
- 2026-07-15: This observation does not authorize a schema, migration,
  generation-runtime, or dependency change without a dedicated ticket and
  architecture decision.
- 2026-08-14: `LLMW.STORAGE.1` (B6a) delivers `/settings/llm-workflows`: one
  list showing every LLM operation of the application — the eight built-in
  (code) descriptors as read-only entries, plus the editable `llm_templates`
  rows the workshop creates or imports, each with its scope (global or a
  named Project). This is the "one place to see every LLM process's prompt"
  half of the request. Status stays `OPEN`: B6a ships no workbench (no panel,
  no entity selector, no Run) — B6b/B6c deliver the three-pane bench that
  lets a prompt actually be read and tuned per entity, which is what closes
  this observation.

### FB-20260715-014 - ComfyUI port presets in Render Settings

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Settings / Render Settings / ComfyUI
- Context: Switching between the ComfyUI instances or ports used for rendering.
- Original observation:

  > j aimerai bien avoir une list de presset de mes port comfyui dans les
  > render setting

- Expected outcome: Add a preset list in `Render Settings` for the user's
  ComfyUI ports, allowing an existing connection target to be selected quickly
  instead of entering it again for each switch.
- Impact: Presets would reduce repetitive configuration and mistakes when
  working with multiple ComfyUI instances.
- Related ticket: `UX.PRODUCTIVITY.POLISH.1`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must clarify whether a preset stores only a
  port or a complete named endpoint including protocol and host, where presets
  persist, how the active preset is selected, and how connectivity is tested.
  This observation alone does not authorize changes to the ComfyUI protocol,
  generation runtime, job runner, polling, schema, or dependencies.
- 2026-08-03: Assigned to `UX.PRODUCTIVITY.POLISH.1`. The ticket defines
  bounded named Local ComfyUI endpoint presets persisted in `app_settings`;
  selecting one only edits the Base URL draft until `Save Changes`.
- 2026-08-03: Implemented under `UX.PRODUCTIVITY.POLISH.1` (Lot A). Named
  Local ComfyUI endpoint presets (Settings > ComfyUI), max 20, durable in
  `app_settings` key `comfyui_local_endpoint_presets_v1` with optimistic
  concurrency. Pure/DB/browser proofs green, including a real server
  restart. Awaiting user validation before `RESOLVED`.

### FB-20260716-EXTRACT - Storyboard panel extraction, consolidated

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Storyboard extraction
- Context: Nine separate observations made on 2026-07-16 while exercising
  panel extraction, all shipped by the same `SEQGEN.STORYBOARD.EXTRACT.1`
  family. Condensed into this single entry on 2026-08-22 at the author's
  request: the nine full write-ups had become ~430 lines describing work that
  is done, and were crowding the observations that still need a decision.
  Their detail lives in the git history of this file and in the tickets named
  below.
- Consolidated IDs and what each asked for:
  - `FB-20260716-022` — detect and crop storyboard panels automatically ·
    `SEQGEN.STORYBOARD.EXTRACT.1`
  - `FB-20260716-023` — the detector missed dark separators ·
    `SEQGEN.STORYBOARD.EXTRACT.1-FIX1`
  - `FB-20260716-024` — use extracted panels as Shot thumbnails and
    references · `SEQGEN.STORYBOARD.EXTRACT.1-FIX2`
  - `FB-20260716-025` — tune detection and identify crop regions visually ·
    `SEQGEN.STORYBOARD.EXTRACT.1-FIX3`
  - `FB-20260716-026` — apply extraction settings and region mappings in
    bulk · `SEQGEN.STORYBOARD.EXTRACT.1-FIX4`
  - `FB-20260716-028` — crop the illustration without the storyboard text ·
    `SEQGEN.STORYBOARD.EXTRACT.1-FIX5`
  - `FB-20260716-029` — expose advanced detection diagnostics ·
    `SEQGEN.STORYBOARD.EXTRACT.1-FIX6`
  - `FB-20260716-030` — upload and delete Sequence Storyboard Drafts ·
    `SEQGEN.STORYBOARD.EXTRACT.1-FIX6`
  - `FB-20260716-031` — ratio-aware cropboxes ·
    `SEQGEN.STORYBOARD.EXTRACT.1-FIX6`
- Expected outcome: unchanged — each item above shipped under its named
  ticket. This entry does not reopen any of them.
- Impact: the extraction workspace exists, detects, crops, maps regions to
  Shots and pushes the crops. Everything since builds on it, including
  `SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1` (2026-08-22, commit `868869f`).
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1` and its FIX1 to FIX6 retakes.
- Resolved or validated on: Implemented 2026-07-16. **Author's manual
  validation still pending** — these were never marked validated, and
  condensing them did not validate them. `FB-20260716-027` (Crop/Fit tool
  with aspect-ratio presets) is deliberately NOT part of this group: it is
  still `OPEN` and keeps its own entry below.

### FB-20260716-027 - Crop/Fit image tool with aspect-ratio presets

- Status: `OPEN`
- Date observed: 2026-07-16
- Area: Image editing / Storyboard / Reference media
- Context: Adjusting an image to the framing required by a Shot, workflow, or
  final display format.
- Original observation:

  > ajouter un outil de modeification d'image "CROP/FIT" pour ajuster au
  > format voulu (16:9, 2:35)

- Expected outcome: Provide a `Crop / Fit` image-adjustment tool with aspect-
  ratio presets such as `16:9` and cinematic `2.35:1`. `Crop` fills the target
  frame by trimming overflow, while `Fit` preserves the complete image and
  handles the remaining space explicitly.
- Impact: Images could be prepared consistently for their intended Shot or
  generation format without relying on an external editor.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation must confirm that the user's `2:35` means
  `2.35:1`, identify which image surfaces expose the tool, and define crop
  positioning, zoom, additional/custom ratios, and the `Fit` background or
  padding behavior.
- 2026-07-16: Editing should be non-destructive by default: preserve the
  original, preview the result, and save or apply explicitly with clear
  provenance. This observation alone does not authorize storage, schema,
  migration, image-processing dependency, or generation-runtime changes.

### FB-20260716-032 - Unify Edit-page text-field colors with API Key

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Forms / Edit pages / Theme
- Context: Editing Projects, Assets, Shots, and other application entities.
- Original observation:

  > tout les text field des pages d'edit (exemple asset, shot, projet...)
  > devrait avoir la meme couleur que la couleur du text field "API KEY" par
  > exemple

- Expected outcome: Text fields across Edit pages use the same canonical color
  treatment as the `API Key` field, producing a consistent form appearance for
  Project, Asset, Shot, and equivalent editors.
- Impact: Inconsistent field colors make forms feel unrelated and can obscure
  which controls are editable or part of the same design system.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation must audit the shared and one-off input
  components, identify the exact `API Key` reference styles or theme tokens,
  and clarify whether the requested consistency includes background, border,
  entered text, placeholder, disabled, error, hover, and focus states.
- 2026-07-16: Prefer a shared field variant or design token over per-page
  hard-coded colors. Confirm separately whether textareas, selects, numeric
  fields, and other form controls should follow the same treatment.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` converged the shared `FormField.tsx`
  (used by Project, Asset, Sequence, Shot, and Segment new/edit pages) onto
  the exact `API Key` reference classes (`bg-[#0d0e10]`, `border-[#2c3035]`,
  `text-[#e7e9ec]`, `placeholder-[#3a4046]`, `focus:border-[#3a4046]`),
  replacing legacy `neutral-*` utilities. The two one-off reference-image
  Edit pages (`.../reference-images/[imageId]/edit/page.tsx`, Asset and Shot)
  used a divergent `bg-[#1a1d20]`/`placeholder-[#4b5158]` and were corrected
  to the same canonical treatment. Status moved to `TO VALIDATE` pending
  user confirmation.

### FB-20260716-033 - Make Edit Project text fields translatable

- Status: `OPEN`
- Date observed: 2026-07-16
- Area: Project editing / Translation
- Context: Editing the textual content of a Project from the `Edit Project`
  page.
- Original observation:

  > ajouter les text field de Edit project comme translatable

- Expected outcome: The relevant text fields on `Edit Project` use the
  application's translatable-field workflow, allowing their content to be
  translated with the same interaction and safeguards as other supported
  editors.
- Impact: Project-level creative context can be maintained across languages
  without copying content into an external translation tool.
- Related ticket: The existing `TRANS.*` translation work should be audited
  when preparing this request.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation must inventory the page fields and decide
  which are creative translatable content, such as Pitch, Story, or Notes,
  versus names, identifiers, paths, or technical values that should remain
  unchanged.
- 2026-07-16: Reuse the existing translation preview/apply behavior, preserve
  the source text, and never overwrite a field silently. This observation
  alone does not authorize schema, migration, provider, or dependency changes.
- 2026-07-16: Evaluate a non-generative, low-latency French↔English option for
  the translation workflow. Apertium is a rule-based/deterministic candidate
  with an official French–English pair; it may suit UI labels, short technical
  text, and quick previews, while an LLM can remain available for creative
  wording and nuance. Keep the provider configurable and compare quality before
  changing the default.

### FB-20260716-034 - Match Apply to Story with Save Changes button colors

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Story / Buttons / Theme
- Context: Applying edited or generated content to the Story.
- Original observation:

  > le bouton "apply to story" n'a pas la bonne couleur et devrait avoir la
  > meme couleur que les bouton "save changes"

- Expected outcome: The `Apply to Story` button uses the same color treatment
  and shared visual variant as `Save Changes` buttons.
- Impact: Matching equivalent confirmation actions would improve readability
  and make the application's action hierarchy more consistent.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation should identify the canonical `Save Changes`
  button variant and reuse it for default, hover, focus, disabled, and loading
  states rather than copying hard-coded colors.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` migrated `Apply to Story`
  (`StoryGenerationPanel.tsx`) from the divergent
  `bg-[#e7e9ec] text-[#141618] hover:bg-white` treatment to the shared
  `LLM_APPLY_ACTION_CLASS` (`src/lib/uiClasses.ts`), matching the canonical
  `Save Changes` colors/hover/disabled states in `OllamaSettingsForm.tsx`
  byte for byte. The handler, confirmation flow, and mutation sequence are
  unchanged. Status moved to `TO VALIDATE` pending user confirmation.

### FB-20260716-035 - Add an extra system prompt to Story LLM Assist

- Status: `OPEN`
- Date observed: 2026-07-16
- Area: Story / LLM Assist / Prompting
- Context: Generating a Story from a Project pitch through the Story LLM Assist.
- Original observation:

  > faudrait faire une passe sur le llm assist de story, actuellement c est
  > blackbox, ca serait pas mal d'y ajouter un bouton "extra System prompt" ou
  > on pourrait affiner la requette.
  >
  > Par exemple, là j ai généré une histoire par rapport au pitch. Il m'a fait
  > une histoire qui pourrait se traiter comme un film, bcp de decors, bcp de
  > perso, bcp de sequence potentiel. Alors que pour ce projet j avais envi
  > d'une histoire qui tiens dans 30s , 1 perso, 1 props, un decor,
  > establishing , mistere, decouverte, action consequence, twist de fin.
  > Basta.

- Expected outcome: Story LLM Assist exposes an optional `Extra System Prompt`
  control where the user can state production constraints (duration, number of
  characters, props, locations, beats, and ending structure) before generation.
  The generated result should make those constraints visible and reviewable.
- Impact: Users currently receive an opaque, over-scoped Story that can expand
  beyond the intended short-form production budget and visual complexity.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: The control should be optional and additive to the existing
  system prompt, with a clear preview of the effective prompt and no silent
  overwrite of the user's source text. It should support reusable presets or
  structured constraints later, but the first ticket can remain text-based.
- 2026-07-16: Generation UX should distinguish the base Story prompt from the
  user-provided extra constraints and retain both in the generation record or
  visible result context, subject to the existing persistence rules.
- 2026-08-14: **Partially addressed by `LLMW.BENCH.READ.1` (B6b)** — status
  stays `OPEN`. The read-only bench at `/settings/llm-workflows/[templateId]`
  now shows the effective `system` and `user` messages, and each context
  variable's resolved value, for any operation against a chosen test entity,
  without calling the model. That is the "no longer a black box" half of this
  entry. The other half is **not** delivered: there is still no
  `Extra System Prompt` control, and nothing changes inside the Story LLM
  Assist production screen — the bench is a workshop surface. Closing this
  entry needs the steering control itself.

### FB-20260716-036 - Introduce a specialist-agent MikAI Assist Director

- Status: `INBOX`
- Date observed: 2026-07-16
- Area: Cross-workspace assistance / Creative direction
- Context: Considering how LLM assistance should guide Story, Asset,
  Storyboard, and Editorial tasks.
- Original observation:

  > Peut etre que cela revient plus avec le concept de MikAI Assist Director.
  > Je ne sait plus si je l'avais déjà mentionné. Mais en gros l'idée c est
  > d'avoir une serie d'agents sepecialist dans chaque categorie (asset, story,
  > storyboard, editorial) pour nous aider a orienté plus chaque tache

- Expected outcome: MikAI Assist Director coordinates domain-focused assistants
  for Story, Asset, Storyboard, and Editorial work, each applying task-specific
  constraints and checks while keeping the user in control.
- Impact: Specialized guidance could prevent scope drift between narrative
  intent and downstream production tasks, while making the current LLM actions
  less black-box.
- Related ticket: `DIRECTOR.ASSIST.1` (roadmap candidate)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: The roadmap already contains `DIRECTOR.ASSIST.1`; this feedback
  confirms the intended direction and adds specialist domains plus the need to
  expose constraints. Product design should define agent boundaries,
  orchestration, approvals, and failure/override behavior before implementation.
- 2026-07-16: Do not interpret this concept as authorization to add a new model,
  provider, schema, or autonomous action system. Start with a product contract
  and a transparent assist flow built on the existing LLM infrastructure.

### FB-20260716-037 - Unify colors for LLM Apply buttons

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Story / LLM Assist / Buttons / Theme
- Context: Applying LLM-generated content, including the `Apply Outline`
  action.
- Original observation:

  > "Apply Outline" a aussi un probleme de couleur, je pense que cela va etre
  > redondant à tout les boutons "Apply" relatif au llm

- Expected outcome: All LLM-related `Apply` buttons, including `Apply Outline`
  and `Apply to Story`, use one consistent action color and shared button
  variant across their default, hover, focus, disabled, and loading states.
- Impact: A shared treatment would make equivalent LLM confirmation actions
  recognizable and prevent repeated per-button color fixes.
- Related ticket: `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on
  `origin/main`); related feedback: `FB-20260716-034`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation should inventory every LLM-driven `Apply`
  action and identify the canonical existing variant (for example, the
  `Save Changes` treatment) before changing individual buttons. Prefer a shared
  component or theme token over hard-coded per-page colors.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` added the shared
  `LLM_APPLY_ACTION_CLASS` (`src/lib/uiClasses.ts`) and migrated the full
  inventoried set: `Apply Outline`, `Apply to Story`, `Apply to Shot Prompt`
  (Prompt Composer), `Apply to Asset Bible`, `Replace/Append Description` and
  `Replace/Append Notes` plus `Replace All`/`Append All` (batch Asset
  enhancement), `Apply Selected` (Casting Suggestions), and the Asset
  Alignment `Apply to Asset`/`Confirm Alignment` submit — all now share the
  canonical `Save Changes` colors/hover/disabled states. Generate, Save
  Details, Cancel/Discard, and other non-LLM-Apply controls were left
  untouched. Every existing handler, confirmation gate, disabled condition,
  and mutation sequence is unchanged; only the class source changed. Status
  moved to `TO VALIDATE` pending user confirmation.

### FB-20260716-038 - Split Asset Description and Notes enhancement

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Asset / LLM Assist / Editing
- Context: Using the enhancement action on the Asset Detail page.
- Original observation:

  > j ai un probleme avec le enhance description, il faudrait splité enhance
  > description et enhance notres , pour les lancé un par un dans la page de
  > l'asset

- Expected outcome: The Asset page exposes separate `Enhance Description` and
  `Enhance Notes` actions that can be run independently, with each result shown
  in its own preview before the user explicitly applies it.
- Impact: Independent generation avoids unwanted coupling between fields and
  lets the user improve only the content that needs work.
- Related ticket: `UX.PRODUCTIVITY.POLISH.1`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Preserve the existing preview/apply safeguards for each field;
  one action must not overwrite or regenerate the other field silently. Keep
  the two prompts and loading/error states distinguishable in the UI.
- 2026-07-16: Ticket preparation should verify whether the current combined
  enhancement also feeds Asset Bible fields, and document that behavior before
  splitting the actions. This observation alone does not authorize schema,
  migration, provider, or dependency changes.
- 2026-08-03: Assigned to `UX.PRODUCTIVITY.POLISH.1`. The single-Asset UI and
  LLM calls will be split into independent Description and Notes drafts while
  the existing batch flow remains compatible.
- 2026-08-03: Implemented under `UX.PRODUCTIVITY.POLISH.1` (Lot C). Asset
  Detail now shows two independent `Enhance Description` / `Enhance Notes`
  panels, each with its own state, prompt, strict single-field parser, and
  anti-double-submit lock; the batch Story flow is untouched. DB + mock-LLM
  proofs and browser double-click proofs green. Awaiting user validation.

### FB-20260716-039 - Include Visual Identity in Generate Content Fill

- Status: `TO VALIDATE` — implemented in
  `ASSET.GENERATION.FILL.VISUAL.IDENTITY.1` (2026-08-11). The `Fill` menu on
  Asset Generate Content now adds `Visual Identity` (Asset Bible text alone)
  and `Asset Context` (Description + Notes + Visual Identity, `\n\n`-joined),
  each only when it has content; `Asset Context` also requires Description or
  Notes to be non-empty. The three historical choices
  (`Asset Description` / `Asset Notes` / `Description + Notes`) stay
  byte-identical. Shared via a new `buildAssetFillSources` helper consumed by
  both `AssetGenerationPanel.tsx` and the Asset generate page, removing the
  prior duplicated `fillSources` build. Selected text appears in the textarea
  immediately and only reaches the payload preview and submitted payload
  after `Apply Text`, with no duplication.
- Date observed: 2026-07-16
- Area: Asset / Generate Content / Prompt composition
- Context: Using the `Fill` action in the `Generate Content` workflow for an
  Asset.
- Original observation:

  > ajouter visual idnetity dans le bouton Fill de generate content

- Expected outcome: The `Fill` action can include the Asset's `Visual Identity`
  content in the generated prompt/context, alongside the currently supported
  Asset information, so visual consistency is preserved during generation.
- Impact: Generated content may currently omit a key part of the Asset Bible,
  causing avoidable drift in the asset's appearance and identity.
- Related ticket: `ASSET.GENERATION.FILL.VISUAL.IDENTITY.1`
- Resolution: Added `Visual Identity` and `Asset Context` to the Fill menu via
  a shared pure helper; behavior unchanged when Visual Identity is empty.
- Resolved or validated on: Implemented 2026-08-11; awaiting user validation.

#### Follow-up notes

- 2026-07-16: Ticket preparation should confirm whether `Visual Identity` is
  appended, merged, or mapped to a dedicated prompt segment, and show the
  resulting text in the existing prompt preview before generation. Empty or
  missing values should leave the current behavior unchanged.

### FB-20260716-040 - Show an image zoom popup on hover

- Status: `TO VALIDATE` — implemented in UX.MEDIA.PREVIEW.1 (2026-08-05).
  `ThumbnailHoverPreview` now also opens on keyboard focus (closes on blur,
  pointer leave or Escape), in addition to the pre-existing mouse hover. 17
  previously-unwrapped small thumbnails across the app were migrated to it
  (chat attachments, storyboard/split/draft grids, casting/workflow
  reference pickers) — see `.agents/claude_report.md` for the full
  inventory and the surfaces intentionally excluded.
- Date observed: 2026-07-16
- Area: Images / Preview / UX
- Context: Viewing image thumbnails throughout the application.
- Original observation:

  > lorsque je met le curseur au dessus d une image, toujours me faire un
  > popup zoon

- Expected outcome: Hovering an image thumbnail opens a consistent zoom popup
  or enlarged preview, allowing the user to inspect the image without leaving
  the current page.
- Impact: Small thumbnails are difficult to evaluate and currently require
  extra navigation or manual opening to inspect visual details.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation should inventory image surfaces and define
  one shared preview behavior, including delay, placement, viewport clamping,
  keyboard/focus access, and mobile/touch fallback. Avoid blocking the use of
  image action buttons underneath the thumbnail.

### FB-20260716-041 - Prefill workflow Duration from Shot duration

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Shot / Generate Content / Workflow inputs
- Context: Generating content from a Shot workflow that exposes a `Duration`
  input.
- Original observation:

  > injecter par defaut la duration du shot dans l'imput "Duration" des
  > workflow dans generate content

- Expected outcome: When `Generate Content` opens for a Shot, the workflow
  `Duration` input is prefilled from that Shot's configured duration whenever
  the workflow exposes a compatible duration field.
- Impact: The generated clip should follow the Shot's intended timing without
  requiring the user to copy the value manually or risk a mismatch.
- Related ticket: `SHOT.GENERATION.DURATION.DEFAULT.1`
- Resolution: A new pure helper (`resolveShotDurationScalarDefault`) prefills
  the single, uniquely compatible `Duration`/`Duration Seconds` scalar input
  (integer or float) from `shot.durationSeconds` whenever it is finite,
  `> 0` and `<= 600`s, applied before payload/preview/Generate-form
  construction in both the Shot panel and the standalone `/map` page. An
  explicit `scalarNode_<nodeId>` URL override — even empty/invalid — always
  wins and is never overwritten; the default is never written back into the
  DB or the URL. Two candidates, no candidate, a non-duration kind, an
  invalid/out-of-range Shot duration, or a non-integer duration into an
  integer input all retain today's workflow-default behavior unchanged.
- Resolved or validated on: Implemented 2026-08-10; pending user validation.

#### Follow-up notes

- 2026-07-16: The injected value should be a default only: preserve an
  explicit user edit during the current generation flow and validate units and
  bounds against the selected workflow. If the Shot has no duration or the
  workflow has no compatible input, retain the current behavior.
- 2026-08-10: Implemented as a UI-only default (no server/schema change).
  Verified with pure-helper tests and a disposable isolated-worktree browser
  proof (integer 5s, decimal 5.5s into integer/float inputs, URL override
  8 surviving reload, no-candidate/two-candidate passthrough); see
  `.agents/claude_report.md` for full evidence and the manual validation
  checklist.

### FB-20260717-042 - Add Shot video references management

- Status: `TO VALIDATE`
- Date observed: 2026-07-17
- Area: Shot / References / Video
- Context: Managing reference media attached to an individual Shot.
- Original observation:

  > il faudrait une section video pour les shots comme la sections image
  > reference, pour pouvoir les supprimer ou en uploader au besoin

- Expected outcome: Shot Detail exposes a dedicated video reference section,
  parallel to `Image References`, where the user can upload supported reference
  videos and delete existing ones explicitly.
- Impact: Video-to-video and other reference-video workflows need durable,
  manageable Shot-level video inputs instead of relying on external files or
  temporary generation state.
- Related ticket: `SHOT.VIDEO.REFERENCES.1`
- Resolution: Shot Detail now has a `Video References` section (MP4/WebM/MOV
  upload, native player, Delete with confirmation), fully separate from
  `Shot Videos`/`shots.approvedVideoPath`. Two explicit physical-copy bridges
  connect the two collections: `Duplicate as Video Reference` (from a Shot
  Video) and `Add to Shot Videos` (from a Video Reference, with an optional
  `Update Shot target duration` checkbox, disabled when the probed duration
  is not eligible). A bridged entry uses the new `shot_videos.source =
  "reference_copy"`; it is excluded from Editorial "Latest generation" but
  can be explicitly approved and then read by "Approved only", identically
  to any other library entry.
- Resolved or validated on: None (implemented, pending user validation)

#### Follow-up notes

- 2026-07-17: Ticket preparation should define supported formats, size and
  duration limits, storage ownership, preview behavior, and safe deletion. A
  deletion must not remove a video that is referenced by another entity or
  workflow record; provenance should remain visible where the video is used.
- 2026-07-17: Reuse the existing reference-media conventions where possible,
  but keep video references distinct from approved Shot outputs and from
  editorial media. This observation alone does not authorize schema,
  migration, provider, or generation-runtime changes.
- 2026-08-11: `SHOT.VIDEO.REFERENCES.1` implemented by Claude/Sonnet: additive
  `shot_reference_videos` table (own root
  `uploads/shot-reference-videos/shot-<id>/`), magic-byte + FFprobe upload
  validation (500 MiB cap), quarantine/transaction/restore-safe delete, and
  the same discipline extended to Shot/Sequence/Project cascade-delete file
  cleanup. No existing `videoNode_*`/generation contract changed.

### FB-20260717-045 - Configure project format ratio and FPS

- Status: `OPEN`
- Date observed: 2026-07-17
- Area: Project settings / Media format / Generation
- Context: Defining the technical output format that should apply to a Project
  and guide its downstream production workflows.
- Original observation:

  > regler au projet les information de format  ratio du projet ainsi que le
  > fps

- Expected outcome: Project settings expose editable format information,
  including the target aspect ratio and frame rate (FPS), with clear values
  that can be reused by Storyboard, Shot, generation, and editorial workflows.
- Impact: Centralizing these constraints reduces inconsistent framing and
  timing between generated assets, shots, sequences, and final outputs.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-17: Ticket preparation should define supported ratio presets and
  custom values, supported FPS values, validation/rounding rules, inheritance
  versus per-Sequence or per-Shot overrides, and the behavior for existing
  Projects with no configured format. This observation alone does not
  authorize schema, migration, provider, or generation-runtime changes.

### FB-20260717-048 - Expose a visual camera control interface in workflows

- Status: `INBOX`
- Date observed: 2026-07-17
- Area: Workflows / Camera direction / Qwen Multiangle Camera
- Context: Configuring camera behavior for image or video generation workflows
  that currently expose Qwen Multiangle Camera settings as text/API fields.
- Original observation:

  > ca serait pas mal de faire une interface de camera controle dans les
  > workflow, mais pour ca il faudrait que l'interface Qwen Multiangle Camera
  > soit visible dans l'app, et pas en text api

- Expected outcome: The workflow UI exposes a dedicated camera-control
  interface for compatible Qwen Multiangle Camera workflows, translating the
  underlying API fields into understandable controls and showing the resulting
  payload before generation.
- Impact: Visual camera direction would be easier to configure, inspect, and
  repeat than editing opaque text fields, reducing parameter errors and making
  camera choices accessible to non-technical users.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-17: Ticket preparation should first inventory the real Qwen
  Multiangle Camera workflow inputs and supported ranges, then define controls
  for angle, lens/framing, distance, elevation, movement, and any workflow-
  specific options without inventing unsupported parameters. Keep an advanced
  raw/API view available for completeness and debugging.
- 2026-07-17: The visual controls should be workflow-aware and additive; they
  must not alter unrelated ComfyUI workflows or generation-runtime behavior.

### FB-20260718-001 - Enrich pushed clips with duration and first frame

- Status: `TO VALIDATE`
- Date observed: 2026-07-18
- Area: Storyboard / Split Workspace / Shot
- Context: Pushing a validated Split Plan to its mapped Shots.
- Original observation: Add an optional `Push durations` checkbox and generate
  a first frame for every pushed clip so the Storyboard thumbnail is updated.
- Expected outcome: When explicitly enabled, Shot durations use the produced
  clip durations. Every pushed clip creates a durable `first_frame` reference
  and updates the Shot's explicit Storyboard thumbnail.
- Impact: Completes the Sequence-video-to-Shot handoff with timing and visual
  orientation while preserving explicit user control over duration mutation.
- Related ticket: `SEQGEN.PUSH.2`
- Resolution: `pushSplitPlanToShots` gained an off-by-default `Push durations`
  checkbox; when checked, each Shot's `durationSeconds` is set to its
  produced clip's exact ffprobe-measured duration (never a client value or
  approximation), written in the same final transaction as the candidate/
  frame/thumbnail rows, and only when the value actually differs. Dependent
  Sequence/Film Results are marked outdated only on a real change;
  `sequence_editorial_items` is never touched. Every newly pushed clip also
  gets an automatically extracted `first_frame` `shot_reference_images` row
  (never approved-for-generation, exact provenance to its Shot Video
  Candidate), which becomes the Shot's explicit Storyboard thumbnail unless
  a manual choice already exists.
- Resolved or validated on: Implemented 2026-07-18; awaiting user validation.

#### Follow-up notes

- 2026-07-18: `Push durations` should default to off. Duration changes must be
  atomic with the push and invalidate dependent Sequence/Film Results when a
  value actually changes; Editorial timing remains separate.
- 2026-07-18: An additive migration for an explicit Storyboard-thumbnail source
  of truth is authorized if confirmed by the implementation audit.
- 2026-07-18: Implemented and validated live via `SEQGEN.PUSH.2` — probed
  durations confirmed to match ffprobe output (not segment boundaries) on
  real pushed clips of Sequence 50; Sequence/Film Results confirmed outdated
  only on a real duration change (a no-op re-push and an unchecked push both
  left durations/Results/Editorial byte-identical).

### FB-20260718-002 - Choose a Storyboard thumbnail from Shot references

- Status: `TO VALIDATE`
- Date observed: 2026-07-18
- Area: Shot / Reference Images / Storyboard
- Context: Reviewing reference images on Shot Detail.
- Original observation: Add `Make Storyboard Thumbnail` beside a Shot reference
  image so the Storyboard grid can use that image explicitly.
- Expected outcome: One explicit thumbnail selection per Shot, with the
  Storyboard grid preferring it over legacy fallback heuristics.
- Impact: Lets the user correct or art-direct the visual used in the Storyboard
  without duplicating image files.
- Related ticket: `SEQGEN.PUSH.2`
- Resolution: New `shot_storyboard_thumbnails` table (one row per Shot,
  unique) records the explicit selection and its `source`
  (`manual`/`automatic_push`). `Make Storyboard Thumbnail` on Shot Detail
  sets it with `source: "manual"`, which a future push can never overwrite;
  an automatic push may only replace an existing `automatic_push` selection.
  The Storyboard grid now prioritizes a valid explicit selection above its
  existing (unchanged) legacy heuristic, falling back safely if the
  selection is ever absent or corrupted. Deleting the currently-selected
  Reference Image auto-clears the selection in the same transaction
  (documented policy choice — a presentation preference, not a content
  approval, so blocking the delete would be unnecessary friction).
- Resolved or validated on: Implemented 2026-07-18; awaiting user validation.

### FB-20260718-003 - Clear unused past Split runs

- Status: `INBOX`
- Date observed: 2026-07-18
- Area: Storyboard / Split Workspace
- Context: The `Other past run(s)` list accumulates obsolete detection runs.
- Original observation: Add a clear button to clean old drafts/runs.
- Expected outcome: `Clear unused past runs` removes only non-current runs that
  have no pushed candidates, with explicit confirmation and honest thumbnail
  cleanup. Provenance-linked runs remain protected.
- Impact: Keeps the Split Workspace readable without destroying production
  provenance.
- Related ticket: `SEQGEN.SPLIT.CLEANUP.1`
- Resolution: None
- Resolved or validated on: None

### FB-20260718-004 - Remove a frame range from a Sequence Video Draft

- Status: `INBOX`
- Date observed: 2026-07-18
- Area: Storyboard / Sequence Video Drafts
- Context: A generated Sequence video may contain a short unwanted passage,
  often only a few frames long.
- Original observation: Define a start and end, remove that range, concatenate
  the parts before and after it, review the result, then publish it.
- Expected outcome: A frame-aware, non-destructive In/Out workflow previews the
  cut and saves a new derived Sequence Video Draft with durable provenance; the
  source video is never overwritten.
- Impact: Repairs short generation artifacts before split detection while
  preserving version history and rollback.
- Related ticket: `SEQGEN.VIDEO.CUT.1`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-18: An additive migration for parent-draft and edit provenance is
  authorized if confirmed by the ticket audit. Frame units are required at the
  UI boundary; FFmpeg output must be reviewed before explicit publication.

### FB-20260718-005 - Open OpenReel for a Shot with selected videos

- Status: `OPEN`
- Date observed: 2026-07-18
- Area: Shot / OpenReel / Editorial round-trip
- Context: Editing the videos associated with a Shot and sending the edited
  result back into MikAI.
- Original observation:

  > pouvoir ouvrir open reel pour le shot, avec les videos du shot
  > selectionné au préalable , pour pouvoir apres faire un montage, et le
  > resultat pouvoir le push dans mikai

- Expected outcome: From a Shot, the user can open OpenReel with the Shot's
  selected video items already loaded or selected, perform an edit, and
  explicitly push the resulting media or editorial result back to that Shot in
  MikAI.
- Impact: This would provide a direct Shot-level editing loop without manually
  rebuilding the source selection in OpenReel or losing the relationship to
  the originating Shot.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-18: Ticket preparation should define which Shot videos are eligible
  (generated candidates, approved video, references, or all), the initial
  ordering, and whether the pushed result becomes a candidate, approved video,
  or a separate editorial result. Preserve source provenance and require an
  explicit publish/push action; opening OpenReel must not mutate the Shot.
- 2026-07-18: Reuse the existing OpenReel bridge and stale/snapshot safeguards
  where possible. Clarify whether the first version supports one Shot only or
  a Shot-local mini-sequence, without expanding into a general timeline change
  model implicitly.
- 2026-07-19: `SHOT.VIDEO.LIBRARY.1` delivers the "open OpenReel with the
  Shot's selected videos already loaded" half of this request: `Shot Videos`
  → select videos → `Open Selected in OpenReel`, Shot-local, one Shot only,
  reusing the existing `mikai-editorial-export-v1` bridge with an additive
  `sourceMode: "shot-videos"` tag. Explicitly read-only — the sidecar refuses
  Validate/Apply Patch/Publish for this mode. The other half of this
  feedback (perform an edit in OpenReel, then push the result back into this
  Shot) remains unimplemented; still `OPEN`, not resolved by this ticket.
- 2026-07-19: User confirms the remaining blocker: the current MikAI Bridge
  is designed around Sequence editing, so a Shot can export videos to
  OpenReel but cannot receive the edited result back. The requested completion
  is a Shot-scoped round trip: edit in OpenReel, explicitly publish/push the
  result, and attach it to the originating Shot without requiring a Sequence
  context. The unrelated `SEQGEN.SPLIT.CLEANUP.1` work must not be treated as
  resolving this limitation.

- Status: `TO VALIDATE`
- Date observed: 2026-07-18
- Area: Storyboard / Split Workspace / Shot
- Context: Pushing a validated Split Plan after `SEQGEN.PUSH.2`.
- Original observation: `First frame produced for segment #776 is not a valid PNG file.`
- Expected outcome: Every pushed candidate produces a real, decodable PNG
  first frame and the push completes without weakening image validation.
- Impact: Blocking; the entire push batch currently fails before candidates,
  first frames, and thumbnails can be published.
- Related ticket: `SEQGEN.PUSH.2-FIX1`
- Resolution: `buildFirstFrameArgs` now passes `-c:v png` explicitly, never
  relying on the `image2` muxer's own extension-based codec guess. The
  temporary output path was also renamed to keep a `.png` suffix
  (`<name>.png.tmp.png` instead of `<name>.png.tmp`) as a second, defensive
  layer. Both existing validations (PNG signature, ffprobe dimensions) are
  unchanged and unweakened.
- Resolved or validated on: Implemented and reproduced fixed 2026-07-18;
  awaiting user validation.

#### Follow-up notes

- 2026-07-18: Codex confirmed the producer writes to `*.png.tmp` with the
  generic `image2` muxer but no explicit PNG codec. The consumer correctly
  rejects the resulting non-PNG signature. The fix must correct production,
  not relax validation.
- 2026-07-18: Fixed via `SEQGEN.PUSH.2-FIX1`. The exact originally-failing
  Split Plan (run #68, segment #776) was re-pushed live and now succeeds;
  the produced first frame for that exact segment was inspected byte-for-
  byte (`89 50 4E 47 0D 0A 1A 0A` PNG signature) and via ffprobe
  (`codec_name: "png"`, real positive dimensions).

### FB-20260718-007 - Allow very short frame-exact split segments

- Status: `TO VALIDATE`
- Date observed: 2026-07-18
- Area: Storyboard / Split Workspace
- Context: Correcting cuts between very short adjacent Shots.
- Original observation: Split boundaries do not land correctly and a segment
  as short as three frames must remain valid.
- Expected outcome: For a reliable CFR source, manual and detected boundaries
  may create segments down to one source frame; the UI and server reason in
  frames rather than imposing the current 0.1-second floor.
- Impact: Blocking for short transitions and rapid generated Shots.
- Related ticket: `SEQGEN.SPLIT.MINFRAMES.1`
- Resolution: Every boundary-creating/moving path (global detection, local
  re-detection, Adjust Start/End, numeric Split, Split at Current Frame) now
  goes through one shared policy (`resolveMinGapSeconds`/`resolveBoundaryValue`
  in `frameTime.ts`): on a proven-CFR source the absolute floor is exactly 1
  source frame, enforced via integer frame-index comparisons, never a fixed
  0.05s/0.1s constant; `0` in the "Minimum segment duration" setting now
  means that floor (and is the new default) instead of being rejected; a
  positive value still imposes a deliberately larger minimum. VFR/unknown
  sources never promise frame precision and use a strictly-positive
  high-precision epsilon instead. Live-proven end-to-end on Sequence 50 /
  Project 17 (real 24fps CFR source): a fresh detection run with minimum `0`,
  a manually created exactly-1-frame segment via Split at Current Frame, a
  successful Split Plan validation containing it, and a real FFmpeg push
  producing a genuine `nb_frames: 1` clip for that segment.
- Resolved or validated on: 2026-07-18 (implementation + live proofs; awaiting
  user validation)

#### Follow-up notes

- 2026-07-18: The current implementation exposes a 0.1-second minimum and
  converts it to a multi-frame gap at common frame rates. Codex keeps the
  one-frame safety invariant so zero/negative segments remain impossible;
  no larger arbitrary duration floor should remain for reliable CFR media.

### FB-20260718-008 - Treat Shot videos as reusable media

- Status: `TO VALIDATE`
- Date observed: 2026-07-18
- Area: Shot / Generation / OpenReel
- Context: Reviewing clips pushed from a Sequence Video Split Plan.
- Original observation: Pushed clips can only be previewed as Sequence Video
  Candidates; they cannot be listed and reused like Shot media, selected for
  ComfyUI workflows, or exported reliably to OpenReel.
- Expected outcome: A Shot has a durable, provenance-aware video library with
  explicit list/preview/delete/approve/reuse controls. Eligible videos can be
  mapped into compatible ComfyUI video inputs and explicitly sent to OpenReel
  with MikAI metadata.
- Impact: The generated split clips are currently a terminal review surface
  rather than reusable production assets.
- Related ticket: `SHOT.VIDEO.LIBRARY.1`
- Resolution: New additive `shot_videos` table unifies Split-pushed clips and
  Generation Content saves into one durable, provenance-aware library
  (`shots.approvedVideoPath` remains the single approved pointer). Backfilled
  179 rows from existing candidates/legacy approved videos. `Shot Videos`
  section on Shot Detail replaces the old terminal `Sequence Video
  Candidates` list: list/preview/approve/delete, multi-select, and `Open
  Selected in OpenReel`. ComfyUI: the canonical input mapping/patch pipeline
  now structurally supports a video input kind, live-verified with fixture
  tests — no real workflow with a video input exists in this library today,
  so no live ComfyUI generation was run for this path (documented limit, no
  fabricated proof). OpenReel: a new Shot-local, read-only, multi-video
  export (`sourceMode: "shot-videos"`) reuses the existing
  `mikai-editorial-export-v1` bridge verbatim; the sidecar was given a
  minimal additive guard (distinct Project id namespace, explicit refusal of
  Validate/Apply Patch/Publish for this mode) — live-verified against the
  real sidecar code: the export produces clips carrying all 5 MikAI metadata
  fields the Bridge requires (fixing "No MikAI clips detected" for this
  flow) and write-back is cleanly refused.
- Resolved or validated on: 2026-07-19 (implementation + live proofs;
  awaiting user validation)

#### Follow-up notes

- 2026-07-18: `shot_video_candidates` currently stores split provenance and
  review state, while ComfyUI runtime options are built only from image
  references. The OpenReel editorial export currently exposes only
  `shots.approvedVideoPath` for editorial items. Codex authorizes an additive
  migration if the ticket audit confirms a dedicated Shot-video relation is
  the clean model; do not overload image references or generation jobs.
- 2026-07-18: The OpenReel message `No MikAI clips detected` means the current
  OpenReel project contains no imported editorial clips carrying the required
  MikAI metadata. Candidate storage alone cannot satisfy that bridge contract.

### FB-20260721-001 - Preserve custom presets across server restarts

- Status: `TO VALIDATE`
- Date observed: 2026-07-21
- Area: Settings / Presets / Persistence
- Context: Using custom presets, then restarting the MikAI server.
- Original observation:

  > je ne comprend pas pourquoi mais je perd mes presset custom save, a croire
  > qu ils ne sont plus enregistré quand je redemarre mon server

- Expected outcome: A custom preset saved by the user remains available after
  stopping and restarting the server, with the same values and name.
- Impact: Losing presets makes the configuration unreliable and forces the
  user to recreate saved work after each server restart.
- Related ticket: `UX.PRODUCTIVITY.POLISH.1`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-21: Investigation should trace the complete save/load path, confirm
  whether the preset is written to durable server storage or only browser
  state, and check startup errors, path/permission issues, and environment
  differences. The UI should distinguish `Saved` from merely edited or
  session-only state.
- 2026-07-21: Any fix must preserve existing presets, avoid silently resetting
  invalid entries, and provide a clear error when persistence fails. No schema,
  migration, or dependency change is authorized by this observation alone.
- 2026-08-03: The repository audit identifies Custom Appearance's
  `Save as custom` as the user-facing custom-preset workflow. Assigned to
  `UX.PRODUCTIVITY.POLISH.1` for durable `app_settings` persistence with a
  backward-compatible localStorage cache and import path.
- 2026-08-03: Implemented under `UX.PRODUCTIVITY.POLISH.1` (Lot B). Custom
  Appearance presets (save/edit/delete) are now durable in `app_settings` key
  `mikros_custom_theme_presets_v1` with optimistic concurrency; localStorage
  remains only the per-browser active-choice cache and anti-flash source.
  Legacy localStorage-only themes are imported idempotently on first load.
  Verified surviving a real server restart in browser. Awaiting user
  validation.

### FB-20260722-002 - Rework the Shot video section into a compact workspace

- Status: `INBOX`
- Date observed: 2026-07-22
- Area: Shot / Video library / UX
- Context: Reviewing the validated Shot video and the other candidate videos
  in the Shot Detail page.
- Original observation:

  > je n'aime pas la parti video dans les shots, le fait d'avoir une premiere
  > video qui est le shot validé, et apres un autre player avec la liste des
  > autre video candidate, et le fait que les player soit grand, c est genant.
  > J aimerai que lors du traitement de ce ticket, tu me propose qu on en parle
  > plus

- Expected outcome: The Shot video area is redesigned as a compact, coherent
  workspace instead of two large independent players. The approved video and
  candidate videos should remain clearly identifiable, while the user can
  select a video to inspect in one appropriately sized player or preview.
- Impact: The current layout consumes too much vertical space and makes the
  relationship between the approved video and candidate library feel awkward,
  slowing Shot review and editing.
- Related ticket: None; related feedback: `FB-20260718-008`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-22: Before implementation, Codex must schedule a product discussion
  with the user to decide the target information hierarchy and interaction:
  compact thumbnails/list versus a single selected player, placement of approve,
  delete, reuse, and OpenReel actions, and how the approved state is displayed.
  Do not treat this observation as sufficient authorization for a visual rewrite
  until that discussion is complete.
- 2026-07-22: Preserve the existing Shot-video provenance, approval, and
  deletion safeguards while exploring the new layout. The visual redesign alone
  does not authorize schema, migration, or media-storage changes.

### FB-20260722-003 - Revisit workflows as tool-oriented interfaces

- Status: `INBOX`
- Date observed: 2026-07-22
- Area: Workflows / Tooling / UX architecture
- Context: Considering how users should configure and run different workflow
  types in MikAI.
- Original observation:

  > il faudrait revoir l'approche des workflow, avoir un system de workflow
  > Tool, avec des interface sur mesure pour certain workflow, un peut comme
  > pour le camera-lab, mais pour d'autre utilisation. Faut qu on en reparle

- Expected outcome: Workflows can be exposed as task-oriented tools, with
  custom interfaces for workflows that need specialized controls, following the
  Camera Lab approach while retaining a generic fallback for other workflows.
- Impact: Purpose-built interfaces could make complex workflows easier to use
  than editing raw node/API fields and provide a clearer mental model for each
  production task.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-22: A product discussion is required before implementation to define
  what qualifies as a Workflow Tool, how its UI maps to real workflow inputs,
  how presets and advanced/raw controls coexist, and how unsupported or changed
  workflow schemas are handled.
- 2026-07-22: Keep this as a product direction only for now. Do not introduce
  a new workflow registry, schema, dependency, or generation-runtime change
  until the tool contract and first target workflows are agreed.

### FB-20260722-005 - Correct Gaussian-to-image mapping and expose inputs

- Status: `RESOLVED`
- Date observed: 2026-07-22
- Area: Shot / Gaussian Camera / Generation UX
- Context: Testing Column 3 of the Gaussian Camera workspace with the real
  `GaussianQwen` default workflow.
- Expected outcome: Column 3 maps its two visual sources by their exact
  workflow labels, never by JSON order, and renders every additional supported
  `(Input)` node as an editable control whose explicit override reaches the
  queued payload.
- Impact: The current structural-order fallback can invert the Gaussian
  snapshot and source image, while hidden Seed/prompt inputs prevent the user
  from controlling the real Gaussian-to-image workflow.
- Related ticket: `CAMLAB.POLISH.2`
- Resolution: Implemented by Claude — `resolveGaussianToImageMapping` now
  resolves the snapshot/source roles strictly by exact label
  (`Load Image Gaussian` / `Load Image`), never by JSON/node order; the old
  CAMLAB.POLISH.1 structural-order fallback and its recommended labels
  (`Gaussian Snapshot (Input)` / `Source Image (Input)`) are retired and now
  block with a diagnostic if seen. Column 3 renders an "Other inputs" section
  (shared with Column 1 via a new local `NonImageInputsFieldset` component)
  exposing every other supported `(Input)` node — confirmed against the real
  `GaussianQwen` workflow: `Seed (Input)` and `Additional Prompy (Input)`.
  Server-side, `queueGaussianToImageGeneration` now re-validates every
  override key against the workflow's real current structure, applies only
  the explicitly-edited overrides through the existing canonical
  `patchWorkflowPayload` (never a second patcher), then injects the two
  images on top of that already-patched JSON — an unedited additional input
  keeps its own stored workflow value, never implicitly replaced by an empty
  string or a Shot prompt. No schema, migration, dependency, or
  ComfyUI/job-runner/polling change. Awaiting Codex review and user
  validation checklist before this is marked resolved.
- Resolved or validated on: 2026-07-23
- Condensed 2026-08-22: 48 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260723-002 - Correct the Camera Lab Additional Prompt label

- Status: `TO VALIDATE`
- Date observed: 2026-07-23
- Area: Camera Lab / UI copy
- Context: Reading the label for the additional prompt input in Camera Lab.
- Original observation:

  > Il y a une erreur d'orthograph à "Additonal Prompy" dans la camera-lab .
  > ca devrait etre "Additonal Prompt"

- Expected outcome: The label is displayed as `Additional Prompt`.
- Impact: The current typo reduces interface quality and makes the workflow
  UI look unfinished.
- Related ticket: `CAMLAB.POLISH.1` / Gaussian Camera workflow inputs;
  `UX.VISUAL.CONSISTENCY.1` (shipped in commit `8fb1f75` on `origin/main`)
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-23: The user's quoted target omits the second `i` in `Additional`;
  the canonical English UI spelling is `Additional Prompt`.
- 2026-08-03: `UX.VISUAL.CONSISTENCY.1` corrected the display only, in
  `CameraLabPolishWorkspace.tsx`'s `displayInputLabel()` helper: the exact
  stored workflow node title `"Additional Prompy"` renders as
  `"Additional Prompt"`; every other label passes through byte-identical.
  The ComfyUI workflow JSON, node id, and nodeId-keyed override transport
  (`textOverrideByNodeId`/`scalarOverrideByNodeId`) are untouched. Status
  moved to `TO VALIDATE` pending user confirmation.

### FB-20260724-001 - Do not inject phantom promptText workflow inputs

- Status: `TO VALIDATE`
- Date observed: 2026-07-24
- Area: Workflows / ComfyUI mapping / Generate Content
- Context: Inspecting the JSON payload sent to ComfyUI and the inputs exposed
  in the `Generate Content` panel.
- Original observation:

  > j ai une erreur dans les workflow envoyé a comfyui. le json inject toujour
  > un promptText dans le json, meme lorsque 'il n y a pas de prompt text avec
  > (Input) dans le nom du node, pour le flager comme une input a afficher dans
  > le generate content panel

- Expected outcome: `promptText` is injected and exposed as a Generate Content
  input only when the actual workflow contains a matching prompt-text `(Input)`
  node. Workflows without that node must not receive a synthetic `promptText`
  property or phantom UI field.
- Impact: The current behavior changes workflow JSON unexpectedly and presents
  controls that do not exist in the selected workflow, which can lead to
  invalid payloads or misleading generation settings.
- Related ticket: `GEN.ASSET.INPUT.ISOLATION.1`; related feedback:
  `FB-20260722-005`, `FB-20260804-004`.
- Resolution: `GenerationSnapshot.promptText` is now additive/optional
  (`src/lib/comfy/generationSnapshot.ts`). `runAssetGeneration`
  (`src/actions/generation.ts`) and `runShotGenerationCore`
  (`src/lib/comfy/runShotGeneration.ts`) only set it when
  `built.patch.patches` contains a real `kind === "text"` patch, or when an
  Advanced Payload Override explicitly rewrote a text-shaped field
  (`hasExplicitTextOverride`, `src/lib/comfy/verifyWorkflowMutations.ts`).
  Confirmed byte-for-byte against the real job `#472` snapshot (which still
  carried the compiled Asset description/notes as `promptText` despite zero
  text patches) and against the real workflow `#6` JSON — see
  `GEN.ASSET.INPUT.ISOLATION.1` in `.agents/claude_report.md` for full
  evidence. No `(Input)`-marked scalar/text control was ever rendered for
  this workflow shape in the first place (`parseWorkflow.ts` only extracts
  `(Input)`-marked nodes) — Lot C additionally adds an explicit mutation
  summary sentence next to the payload preview.
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

#### Follow-up notes

- 2026-07-24: Detection must be derived from the real parsed workflow
  structure, not from a generic default or from the presence of another input
  type. The mapping, injected keys, and displayed controls must remain aligned
  for workflows with and without a prompt-text `(Input)` node.
- 2026-07-24: Ticket preparation should prove the absence case with the exact
  payload sent to ComfyUI and confirm that existing workflow values remain
  untouched when no matching prompt input exists. No schema, migration,
  dependency, or unrelated generation-runtime change is authorized by this
  observation alone.
- 2026-08-04 (Round 2): Codex review found `promptText` could still be wrong
  when the Advanced Payload Editor changed the real queued text — the fix
  now reads the value back from the actually-queued payload
  (`deriveQueuedPromptText`) instead of a separately precomputed string.
  Re-proven end-to-end with a real `runAssetGeneration` call against a
  disposable DB + mock ComfyUI, and in a real browser via `next start`: the
  durable snapshot has no `promptText` for the image-only fixture, and a
  workflow with a real text `(Input)` node shows `promptText` exactly equal
  to `queuedWorkflow`'s own text field.
- 2026-08-04 (Round 3): Codex review found the derivation still accepted a
  partial result — if an Advanced Override removed one of two real text
  inputs (deleted its node/key, or turned its value into a number/null/
  object) the OTHER input's text was still published as if it described the
  whole queued prompt. Now every real text patch's exact final value must
  resolve to a string and all must match, or the field is omitted, no
  exceptions. Re-proven with the full fault matrix (node deleted, key
  deleted, number/null/object value, duplicate path) plus a real
  `runAssetGeneration` run through an Advanced Override via the actual
  action.

### FB-20260731-001 - Project Style and Look Development polish retakes

- Status: `RESOLVED`
- Date observed: 2026-07-30 to 2026-07-31
- Area: Project Style / Reference Board / Creative Influences / Look Development
- Context: User validation after completing the Reference Board, Creative
  Influences and Look Development MVP surfaces.
- Expected outcome: Reference and Influence metadata are self-explanatory;
  Reference images remain fully visible and inspectable; approvals are chosen
  during creation; Look Development opens with concise content, an optional
  neutral randomizer and a configured default workflow; secondary sections
  stay available without dominating the workspace.
- Impact: Current controls are easy to miss, some images are cropped, fields
  require prior product knowledge, From Story overwhelms the benchmark, and
  repeated setup/history sections make the workspace unnecessarily long.
- Related ticket: `STYLE.1.POLISH.1`
- Resolution: Project Style polish shipped at `82b04d0`; Reference Board
  analysis shipped at `72f9d89` and was validated by the user on 2026-08-02.
- Resolved or validated on: 2026-08-02
- Condensed 2026-08-22: 54 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260803-002 - Use Border color for primary Project Style headings

- Status: `TO VALIDATE`
- Date observed: 2026-08-03
- Area: Project / Project Style
- Context: Reading and editing the main Project Style workspace.
- Original observation: "dans project style, la couleur des elements:
  Direction Brief, World & Design Language, Visual Treatment, Style Rules (2)
  devrait etre de la couleur de Border"
- Expected outcome: Those four workspace headings use the theme's canonical
  Border color while all fields, content, badges and nested headings retain
  their existing colors.
- Impact: The principal Style blocks should visually follow the user's Custom
  Appearance Border token rather than Text Tertiary.
- Related ticket: `UX.SEQUENCE.STYLE.POLISH.1`
- Resolution: The four PANELS (Direction Brief, World & Design Language,
  Visual Treatment, Style Rules (N)) now use a direct
  `[background-color:var(--mikros-border,#2c3035)]` background, and their
  titles use a direct `[color:var(--mikros-text-primary,#e7e9ec)]` — both
  compiled straight into the token references, no intermediate CSS class
  to keep in sync. Verified byte-exact against the real `MikBright` preset
  (panel background `#C9D3D2`, title `#08232C`). No inline style, new CSS
  variable or token duplication introduced.
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

#### Follow-up notes

- 2026-08-03: Reuse `text-[#2c3035]`, already mapped to
  `var(--mikros-border)` by the theme layer; no new CSS token is required.
- 2026-08-04 (Retake Round 1): user validation showed the titles still
  dark — `text-[#2c3035]` relied on a hand-written `globals.css` selector
  matching Tailwind's generated class exactly, an unreliable indirection.
  Replaced with a direct `[color:var(--mikros-border,#2c3035)]` arbitrary
  property class on the titles.
- 2026-08-04 (Retake Round 2): request clarified — the reported "large
  black masses" were the four PANELS' literal `bg-[#101214]` background,
  not the title glyph color. Panels now use
  `[background-color:var(--mikros-border,#2c3035)]`; titles switched to
  `[color:var(--mikros-text-primary,#e7e9ec)]` for legibility against that
  background (Border is a light color in the user's `MikBright` preset).

### FB-20260804-001 - Theme the remaining Project Style panels

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Project / Project Style
- Context: Reviewing the full Project Style workspace and Reference
  Analysis after the FB-20260803-002 panel fix.
- Original observation: The same "large black mass" pattern also affects
  `Reference Analysis`, `Analysis History`, `Compiled preview` and
  `Versions & Publish`, plus the dark structural background shown when an
  Analysis History Run is opened.
- Expected outcome: The same Border-background / Text-Primary-title
  treatment applies to these four surfaces, and opening a Run under a
  light theme no longer reveals a literal dark background.
- Impact: Consistency across every Project Style surface under a light
  Custom Appearance preset such as `MikBright`.
- Related ticket: `UX.SEQUENCE.STYLE.POLISH.1`
- Resolution: `Reference Analysis` (`ReferenceAnalysisWorkspace.tsx`),
  `Analysis History`'s heading (`RunHistoryPanel.tsx`), `Compiled preview`
  and `Versions & Publish` (`ProjectStyleWorkspace.tsx`) now use
  `[background-color:var(--mikros-border,#2c3035)]` and
  `[color:var(--mikros-text-primary,#e7e9ec)]`, same pattern as the four
  panels from FB-20260803-002. The opened-Run background
  (`RunHistoryPanel.tsx`, previously literal `bg-[#101a26]`) now uses
  `[background-color:var(--mikros-raised,#101a26)]`. Verified byte-exact
  against the real `MikBright` preset (panel background `#C9D3D2`, titles
  `#08232C`, opened Run `#FFFDF8`). Status badges, thumbnails, fields and
  business content untouched.
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

### FB-20260804-002 - Align the Look Development Image/Video mode control

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Project / Project Style / Look Development
- Context: Testing the Look Development Bench's Mode control under a light
  Custom Appearance preset.
- Original observation: The active Image/Video button's background is a
  literal dark navy (`bg-[#14202e]`), unrelated to the active theme.
- Expected outcome: The active button's background follows the theme's
  Raised token; both buttons keep identical, stable dimensions; the active
  state stays visible via the existing accent border and `aria-pressed`.
- Impact: The control looked broken/inverted under a light theme (dark
  chip on a light background) while carrying no theme information.
- Related ticket: `UX.SEQUENCE.STYLE.POLISH.1`
- Resolution: A local `modeSegButtonActive` variant (scoped to the Mode
  control only, `LookDevelopmentBench.tsx`) replaces the literal
  `bg-[#14202e]` with `[background-color:var(--mikros-raised,#14202e)]`
  (same fallback, so Default rendering is unchanged). The shared
  `segButtonActive` constant used by the Source control is untouched — no
  regression there (verified: Source's active button still carries the
  literal `bg-[#14202e]`). Both Image/Video buttons now have a fixed
  `w-20 text-center` so their footprint never shifts between states.
  Border/accent and `aria-pressed` are unchanged; verified the active
  state transfers correctly on click and on keyboard (Enter) in both
  directions.
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

### FB-20260804-003 - Dynamic Batch leaves stale template LoadImage nodes

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Shot / Generate Content / ComfyUI Dynamic Batch
- Context: On Shot 103, selecting workflow `GPT2 Multi` (#11), adding two
  Dynamic Batch images, then clicking `Generate Keyframe`.
- Original observation: ComfyUI refuses generation because the workflow's
  original `LoadImage` filename (`ComfyUI_00304_.png`, node 3) does not exist,
  even though two replacement images were selected.
- Expected outcome: Dynamic Batch/Repeatable expansion sends only active
  image chains whose LoadImage inputs were replaced and uploaded. Superseded
  template nodes must not remain in the queued graph.
- Impact: Multi-image workflows cannot generate when their saved template
  LoadImage points to a file unavailable on the active ComfyUI provider.
- Related ticket: `WFBUILD.1.B-FIX1`
- Resolution: `expandDynamicBatchWorkflow` (`src/lib/comfy/expandDynamicBatch.ts`)
  and `expandDirectRepeatableInputsWorkflow`
  (`src/lib/comfy/expandDirectRepeatableInputs.ts`) now remove the original
  template chain node(s) from the expanded workflow once every clone/rewire
  succeeds, via a shared `removeOrphanedTemplateChainNodes` helper. Before
  deleting, it audits the graph for any node outside the chain still
  referencing it (a real external/shared consumer) and refuses the expansion
  with a clear error instead of silently dropping a shared node. Proved
  against the exact stored `GPT2 Multi` (#11) workflow: node 3 and
  `ComfyUI_00304_.png` no longer appear in the queued payload for 1/2/3
  selections, through the real `expandDynamicBatchWorkflow` and the real
  `prepareComfyPayloadForQueue` HTTP boundary (mocked transport).
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

#### Follow-up notes

- 2026-08-04: Job 467 proves the selected images were correctly cloned,
  uploaded and connected as nodes 14/15, but original node 3 remained in
  `queuedWorkflow` with `ComfyUI_00304_.png`. The fix belongs to the canonical
  expansion builder, not to the Shot UI or the saved workflow.
- 2026-08-04: Fix implemented and proved at the pure-function and real-HTTP-
  boundary level (see `.agents/claude_report.md`).
- 2026-08-04 (Retake Round 1): Fix additionally proved through the real
  `runShotGenerationCore` Shot action (single job, single `/prompt` call,
  durable `payload_snapshot` and the real wire payload both free of node 3 /
  `ComfyUI_00304_.png`) and through a live Playwright pass in an isolated
  `git worktree` (own DB, uploads, `.next`, port 3902 — real port 3000 never
  touched): Add Image x2 on Shot 103 / workflow `GPT2 Multi`, `Generate
  Keyframe`, job reaches `Running` with no node-3 error, exact bug URL
  (`batchImages_10=asset-44-41%2Casset-48-42`) reproduced. Remaining step is
  the user's own confirmation in their real environment.
- 2026-08-04 (Retake Round 2): The Round 1 browser proof surfaced a separate
  real bug — a genuine double-click on `Generate Keyframe` created two
  `generation_jobs` and sent two `/prompt` calls (double-cost risk on Cloud).
  Fixed with a synchronous submission lock in the shared
  `PartnerNodeConfirmForm` (used by all 7 real generation forms), proved with
  a real `dblclick()` and a same-tick double `requestSubmit()` against Shot
  103 / `GPT2 Multi`: exactly one job per genuine submission, node 3 /
  `ComfyUI_00304_.png` still absent. Unrelated to the Dynamic Batch graph fix
  itself, which stayed byte-identical across this retake.
- 2026-08-04 (Retake Round 3): A submission rejection was being caught and
  logged raw to the console without informing the user. Now shows a fixed,
  generic "Generation could not be submitted. Please try again." under the
  Generate button, clears on the next valid attempt, and never logs the raw
  error. Graph fix and double-submit lock unchanged and re-verified.

### FB-20260804-004 - Verify Asset workflow input isolation

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Asset / Generate Content / ComfyUI workflow mapping
- Context: Asset 44, workflow `Gemini_CharacterSheet` (#6), reference
  `asset-44-43`, generation job #472.
- Original observation: The generated image repeatedly looked incorrect, and
  the user suspected MikAI was editing more than the selected LoadImage source
  even though no other workflow node is marked `(Input)`.
- Expected outcome: With no Advanced Payload Override, MikAI changes only the
  inputs explicitly exposed by the stored workflow. For this workflow, only
  `node 3.inputs.image` may change; prompt, system prompt, model, seed, ratio,
  resolution, and every other setting remain byte-identical. UI and durable
  provenance must never claim that an Asset prompt was injected when no text
  input was patched.
- Impact: Unexpected or misleading payload mutation makes poor model adherence
  indistinguishable from an application mapping bug and prevents trustworthy
  workflow debugging.
- Related ticket: `GEN.ASSET.INPUT.ISOLATION.1`; related feedback:
  `FB-20260724-001`.
- Resolution: `buildGenerationPayload` -> `patchWorkflowPayload` ->
  `prepareComfyPayloadForQueue` was already the sole mutation path (verified
  by code audit, not just testing), but had no structural gate proving it.
  New pure helper `src/lib/comfy/verifyWorkflowMutations.ts`
  (`verifyPrePatchMutations`, `verifyPostUploadMutations`) recursively diffs
  `inputs.*` across each step and refuses generation before `/prompt` (and
  after upload) if any field changes outside the real patch/upload records —
  wired into both `runAssetGeneration` and `runShotGenerationCore`. Proven
  against the real workflow `#6` JSON: with reference `asset-44-43` selected
  and no override, the only allowed/observed diff is `node 3.inputs.image`;
  node 1 (`Nano Banana Pro`) stays byte-identical before and after a mocked
  upload rewrite. Fault-injected mutations on `prompt`, `system_prompt`,
  `model`, `seed`, `aspect_ratio` and `resolution` are all refused, at both
  the pre-patch and post-upload boundary. Dynamic Batch / Direct Repeatable
  (workflow `#11`, `GPT2 Multi`) re-verified: the gate does not false-refuse
  a real batch expansion (node add/remove from that already-proven contract
  is intentionally not re-checked here). The Advanced Payload Editor keeps
  its existing unchecked, honestly-marked `overrideUsed: true` behavior for
  the pre-patch gate; the post-upload gate still applies to it. See
  `promptText` resolution above for the `FB-20260724-001` link, and
  `GEN.ASSET.INPUT.ISOLATION.1` in `.agents/claude_report.md` for full
  evidence. Round 2 (Codex REVISE) widened the mutation diff from
  `inputs`-only to a genuine recursive diff of the full workflow tree
  (`class_type`, `_meta`, whole-node add/remove, nested arrays/objects all
  now correctly refused), and re-proved the whole contract with a real
  `runAssetGeneration` call against a disposable DB + mock ComfyUI provider,
  plus a real browser session (`next start` on a disposable port) — see
  Round 2 evidence in `.agents/claude_report.md`. Round 3 (Codex REVISE)
  closed the `PartnerNodeConfirmForm.tsx` `NEXT_REDIRECT` artifact noted in
  Round 2 (`unstable_rethrow`, real `next/navigation` export), tightened
  `deriveQueuedPromptText` to a strict all-paths-must-match contract, and
  qualified the UI summary as the automatic-mapping result with Advanced
  JSON edits called out as additional — see Round 3 evidence in
  `.agents/claude_report.md`. The user's own subsequent generation looking
  correct is a SEPARATE, real confirmation that the visual issue in job
  #472 was Gemini's own adherence to the prompt/reference, not a hidden
  MikAI mutation (already the Lot D conclusion) — it validates that
  specific diagnosis, not this ticket's full contract, which still needs
  the manual checklist below run against the real app.
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

#### Follow-up notes

- 2026-08-04: Codex compared stored workflow #6 with job #472 read-only. The
  queued graph kept node 1's prompt, system prompt, model, seed, aspect ratio,
  resolution and response modalities byte-identical; only node 3's image was
  rewritten to the Cloud filename. The selected source and generated result
  depict the same character, while the model retained much of the source
  environment despite the stored prompt requesting a neutral background.
- 2026-08-04: A real provenance defect remains: job #472 stores the compiled
  Asset description in top-level `promptText` although no text `(Input)` was
  patched and that text is absent from `queuedWorkflow`. The active ticket
  must correct this phantom claim and add fail-closed mutation verification,
  without silently changing the saved Gemini prompt.
- 2026-08-04 (Round 2): Codex REVISE found the mutation diff only compared
  `inputs` (missed `class_type`/`_meta`/whole-node mutations) and that
  `promptText` could still show a stale compiled string once an Advanced
  Payload Override changed the real queued text. Both fixed and re-proven
  end-to-end (real `runAssetGeneration` + disposable DB/mock provider + real
  browser session) — see `.agents/claude_report.md` Round 2 for full
  evidence, including an unrelated pre-existing UI artifact observed and
  reported but out of this ticket's scope (`PartnerNodeConfirmForm.tsx`
  submission-error banner appearing despite a successful redirect).
- 2026-08-04 (Round 3): the "unrelated artifact" from Round 2 turned out to
  be a real bug, not a mock/UI quirk: `redirect()` deliberately throws a
  `NEXT_REDIRECT` control-flow error (documented Next 16.2.9 behavior), and
  `PartnerNodeConfirmForm.tsx`'s bare `catch` (introduced by the prior
  anti-double-submit retake) was swallowing it as a real failure on every
  one of the 7 shared generation surfaces. Fixed with `unstable_rethrow`
  (the real `next/navigation` export) — proven directly against that real
  function plus a real browser session with no false error banner after a
  successful queue. Also tightened `promptText` to never publish a partial
  result when an Advanced Override removes/corrupts one of several real
  text inputs, and reworded the UI summary to explicitly scope it to the
  automatic mapping step. The user's satisfying new generation confirms the
  job #472 visual issue was Gemini's own prompt adherence — a distinct,
  already-expected finding, not proof that this ticket's contract is fully
  validated end-to-end by a human yet.

### FB-20260806-001 - Select Approved or Latest Shot videos for a Basic Sequence Result

- Status: `RESOLVED`
- Date observed: 2026-08-06
- Area: Editorial / Basic Sequence Result / Sequence Viewer
- Context: Publishing a Basic Sequence Result for a Sequence whose Shots have
  durable generated videos (Shot Video Library) but no approved output yet —
  e.g. Sequence 54 (Project 18), whose 20 Shots each have a durable
  `sequence_split` video in `shot_videos` but zero approvals, making the
  Editorial viewer and Publish unusable under the previous approved-only-only
  behavior.
- Expected outcome: A segmented `Approved only` / `Latest generation` control
  above the Sequence Viewer, URL-driven, defaulting to `Approved only`. The
  chosen mode drives the viewer, the Shot list/timeline availability, and
  `Publish Basic Sequence Result` identically — never a silent fallback
  between the two. The exact provenance of every published item (`approved`
  or `shot-video`, with its durable id/source/timestamp) is frozen into the
  cut manifest at publish time.
- Impact: Without this, a Sequence with real durable Shot videos but no
  approvals could never be previewed or published from Editorial at all.
- Related ticket: `EDITORIAL.SEQUENCE.RESULT.SOURCES.1`
- Resolution: Implemented — canonical resolver
  `src/lib/editorial/videoSourceMode.ts` (`resolveSequenceVideoSources`/
  `resolveVideoSourcesForShotList`), shared by the Editorial page (preview)
  and `publishBasicSequenceResult` (publish, re-resolved server-side from
  the mode string alone — never a client-supplied path/id). `BasicCutManifest`
  gained additive `videoSourceMode` (top-level) and `provenance` (per item)
  fields; historical manifests without them remain valid (`videoSourceMode`
  absent means `"approved-only"`). `PublishBasicSequenceResultButton` gained
  a synchronous `useRef` lock acquired before the first `await`, and names
  the mode being published in its button label, confirm dialog, and success
  message.
- Resolved or validated on: 2026-08-07 (user-validated; commit `c3ed6fa` pushed)
- Condensed 2026-08-22: 20 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.

### FB-20260810-001 - Approve every eligible Latest generation video in one action

- Status: `TO VALIDATE`
- Date observed: 2026-08-09
- Area: Editorial / Shot Video Library / Sequence Approvals
- Context: After validating the compact Latest-generation playback timeline
  (`EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1`), the user wanted to turn a
  reviewed Latest-generation cut into the normal Approved-only workflow
  without opening every Shot Video Library one by one.
- Original observation:

  > un bouton explicite dans Editorial qui approuve la derniere video
  > generation durable pour chaque Shot eligible de la Sequence, avec
  > confirmation, sans toucher aux Shots sans source utilisable.
- Expected outcome: A `Latest Approved` control in the Editorial video source
  area, visible only in `Latest generation` mode, showing the eligible count,
  disabled with an honest message at zero, requiring a native confirmation
  before mutation, and never clearing an existing approval for a Shot whose
  latest source is missing/rejected.
- Impact: Without this, promoting a validated Latest-generation cut to
  Approved required visiting every Shot individually.
- Related ticket: `EDITORIAL.LATEST.APPROVAL.1`
- Resolution: Implemented — `LatestApprovedButton` (client) drives a new
  Server Action `approveLatestGenerationForSequence`
  (`src/actions/editorialApproval.ts`) that accepts only `projectId`/
  `sequenceId`, re-reads Project → Sequence → ordered Shots fresh, and
  re-resolves sources through the canonical `resolveVideoSourcesForShotList`
  resolver — never a page-time selection. Per-Shot mutation reuses the exact
  same primitive as the existing single-approval path
  (`applyShotVideoApprovalWithinTransaction`, extracted from
  `src/lib/shotVideoLibrary/approve.ts`), composed into ONE outer transaction
  for true all-or-nothing batch atomicity. A missing/rejected/cross-owner
  latest source is skipped and its existing approval is left untouched,
  never cleared. Returns only bounded counts (approved / already approved /
  skipped) — never paths or raw DB errors.
- Resolved or validated on: Pending Codex review and user validation.

#### Follow-up notes

- 2026-08-09: Codex retake (`REVISE`, `safeToCommit: false`) found two P1s:
  the write transaction did not re-verify the Sequence/Shot snapshot or the
  deterministic Latest winner against a concurrent mutation, and a
  post-commit `revalidatePath` throw could report an already-committed
  approval as a failure. Both fixed — the transaction now re-reads
  Project → Sequence → ordered Shot ids and every eligible candidate's
  `shot_videos` winner fresh before writing anything, refusing the whole
  batch on any mismatch; `revalidatePath` failures are now best-effort and
  never turn a committed result into `ok:false`.
- 2026-08-09: Explicitly scoped MikAI-only — does not promote, alter, or
  stage the pending cross-repository `compact-real-duration` timing contract
  from `EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1`.
- 2026-08-09: Codex retake round 2 (`REVISE`, `safeToCommit: false`) found a
  P1 and a P2: the transaction's stale-winner check only compared Shots
  already classified eligible, so a previously-skipped Shot could gain a
  durable winner concurrently and be silently omitted from an otherwise
  committing batch; and the revalidation-failure log line still passed the
  raw caught `Error` object to `console.error`. Both fixed — the
  transaction now freezes and compares the deterministic Latest winner
  identity for every Shot in the snapshot, not only the eligible ones, and
  any change (including absent-to-present) refuses the whole batch; the
  revalidation log line is now a fixed string with no interpolated error
  content.
- 2026-08-09: Codex retake round 3 (`REVISE`, `safeToCommit: false`) found
  one remaining P1: the all-Shot winner-id comparison did not also compare
  an originally-eligible Shot's fresh `videoPath` against the exact path
  frozen at resolution — an existing `shot_videos` row updated in place
  (same id, changed path) between resolution and commit could still write
  a stale/changed path. Fixed — every originally eligible Shot's fresh
  winner path is now required to still equal `EligibleLatestApproval
  .videoPath` before the first write, alongside the existing all-Shot id
  comparison.

### FB-20260811-001 - Choose Shot or Asset destination for Sequence Result frame capture

- Status: `TO VALIDATE`
- Date observed: 2026-08-11
- Date fixed (implementation): 2026-08-11
- Area: Sequence / Sequence Result / Frame Capture
- Context: Capturing a frame from the active Sequence Result player or a
  Shot's Approved Output player.
- Original observation: Allow choosing the current Sequence's Shot list or
  the Project Asset list as the capture destination. In Asset mode, provide a
  `Sequence casting only` checkbox to pre-filter Assets assigned to the
  current Sequence.
- Expected outcome: The same clear destination mode selector on both players.
  `Shots` contains only the current Sequence's ordered Shots (the current Shot
  is first on Shot Detail). `Project Assets` defaults to Assets in that
  Sequence's casting, while unchecking `Sequence casting only` reveals every
  Asset in the Project. Capturing keeps using the existing durable Shot
  Reference or Asset Reference write contract.
- Impact: Captured editorial frames can be routed to the right creative
  resource without navigating away from the Sequence Result.
- Related ticket: `SEQRESULT.FRAME.CAPTURE.DESTINATIONS.1`
- Resolution note: implemented additively in `VideoFrameReviewPlayer` (a
  `destinationScopes` prop; every other caller is unaffected) and used on
  both the Sequence Result player and the Shot Detail Approved Output
  player. `Shots` is bounded server-side to the current Sequence's ordered
  Shots only (current Shot first on Shot Detail); `Project Assets` defaults
  to `Sequence casting only` (checked on every mount), which unchecks to
  reveal the full Project Asset list. Switching mode/filter always
  reconciles the selection to a visible destination or disables capture with
  a message. Verified in a disposable worktree/DB/browser: real captures
  landed in `shot_reference_images`/`asset_reference_images` via the
  unchanged `captureVideoFrame` action, cross-Sequence Shots and
  cross-casting Assets stayed out of their respective lists by default, and
  no ticket-attributable console/hydration errors appeared. Awaiting
  hands-on user validation.
- Resolution: None
- Resolved or validated on: None

### FB-20260811-003 - Add Director Input and intermediate Shot numbering

- Status: `OPEN`
- Date observed: 2026-08-11
- Area: Sequence / Insert Shot Here / Basic Editorial / Shot creation
- Context: Inserting a new Shot inside a Sequence and generating its brief from
  neighboring Shots.
- Original observation:

  > ajoute dans les userfeedbakc, que j 'aimerait bien dans insert shot here,
  > dans la partie sequence:
  > -un champ "director input" où je pourrais donner mes envie pour ce shot.
  > ALors, lorsque je clique sur "Generate Shot Brief from Neighbors " alors
  > cela prend le shot brief from neighbors mais aussi ma contrainte de
  > realisateur
  >
  > -lorsque je click sur "create Shot", le nom du shot doit etre le nom du
  > precedent shot mais en incrementant d'une dixaine au lieux d'une centaine,
  > pour pouvoir rester dans l'ordre croissant entre le precedent shot et le
  > suivant dans lequel ce shot va s'intercaller

- Expected outcome:
  - `Insert Shot Here` exposes a `Director Input` field for the user's
    shot-specific intention or constraints.
  - `Generate Shot Brief from Neighbors` combines the neighboring Shot context
    with that Director Input and makes the combined source visible before
    creation.
  - `Create Shot` derives an intermediate name from the preceding Shot by
    incrementing its numeric suffix by ten rather than by one hundred; for
    example, `SH-100` → `SH-110` when the next Shot is `SH-200`.
- Impact: The user can direct an inserted Shot without losing the continuity
  context from neighboring Shots, while keeping Shot names ordered without
  renaming the following production content.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-08-11: The Director Input must remain distinguishable from the generated
  brief, be included in the preview and generation provenance, and must never
  overwrite the neighboring Shot briefs. Product design should decide whether
  it is persisted as a Shot-level creative note after creation or retained only
  as generation provenance.
- 2026-08-11: Numbering must handle missing or non-numeric suffixes, collisions,
  and a predecessor that already ends in a value not divisible by ten. The
  algorithm must preserve ascending order between predecessor and successor,
  avoid silently renaming existing Shots, and provide a clear fallback when no
  valid intermediate number exists.
- 2026-08-11: `Generate Shot Brief from Neighbors` must populate the same
  structured fields as `Generate Shot List` in LLM Assist, not only a single
  free-text brief. The fields are: `Action Pitch`, `Camera Pitch`, `Production
  Details`, `Framing`, `Camera Movement`, `Continuity In`, and `Continuity Out`.
  The generated values must combine neighboring-shot context with the user's
  `Director Input` and remain editable before `Create Shot`.

### FB-20260811-004 - Add Auto Casting at Shot level

- Status: `OPEN`
- Date observed: 2026-08-11
- Area: Shot / Casting / Creative assistance
- Context: Managing the cast and reference Assets for an individual Shot.
- Original observation:

  > ajouter un autre ticket, sur le fait qu il faudrait que j'ai un bouton auto
  > casting aussi au niveau du shot, et pas just à la sequence comme
  > actuellement

- Expected outcome: Shot Detail exposes an `Auto Casting` action in addition to
  the existing Sequence-level action. It proposes suitable Project/Sequence
  Assets and references for the current Shot using its brief, prompts,
  continuity context, and available casting information.
- Impact: Users can refine or generate casting for one Shot without having to
  rerun or alter the entire Sequence casting, making local Shot direction more
  efficient.
- Related ticket: None; related feedback: `FB-20260804-008`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-08-11: The Shot-level action should show suggestions and their reasons
  before applying them. It must distinguish inherited Sequence casting from
  Shot-specific additions or overrides, preserve explicit user selections, and
  never silently replace the Sequence cast.
- 2026-08-11: Ticket preparation should define whether Auto Casting uses the
  same specialist/provider and scoring rules as Sequence casting, how many
  candidates it returns, and how image/video references are selected. The
  observation alone does not authorize schema, migration, provider, or
  generation-runtime changes.

### FB-20260821-001 - Retirer une plage frame-exacte d'un Sequence Video Draft

- Status: `OPEN`
- Date observed: 2026-08-21
- Area: Sequence / Sequence Video Draft / Split Workspace
- Context: Reconciling `docs/ROADMAP.md` against the code on 2026-08-21, after
  Chantier 1 (LLM Workspace), Chantier 2 (cleanup) and the start of the camera
  redesign. The roadmap still carried `SEQGEN.VIDEO.CUT.CORE.1` and
  `SEQGEN.VIDEO.CUT.UI.1` as "the immediate next recommended product chantier",
  a priority written on 2026-08-02 — before both chantiers.
- Original observation:

  > SEQGEN.VIDEO.CUT.CORE.1 on le push dans la boite à idee "User_Feedback" et
  > on le sort de roadmap

- Expected outcome: from a Sequence Video Draft, remove a frame-exact range,
  concatenate the kept parts and publish a **new durable version** with
  parent/cut provenance, without ever overwriting the source. The original
  split was into a core ticket (frame-exact contract, FFmpeg, provenance) and a
  UI ticket (In/Out player in frames, preview of the removed span, explicit
  publication).
- Impact: the need is not denied — it is removed from the roadmap because its
  **priority** was stale, not its substance. Nothing was ever implemented: there
  is no cut action in `src/actions/`, and `src/lib/sequenceVideoSplit/` only
  performs detection. It returns here so it can be re-prioritised on real use
  rather than inherited from a pre-chantier ordering.
- Related ticket: None. Former roadmap entries `SEQGEN.VIDEO.CUT.CORE.1` and
  `SEQGEN.VIDEO.CUT.UI.1`, preserved in `docs/archive/ROADMAP_2026-08-02.md`.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-08-21: Removed from `docs/ROADMAP.md` by the author's decision, in the
  same pass that archived the 2026-08-02 consolidated roadmap. The archive keeps
  the two tickets' original wording and their place in the old ordering.
- 2026-08-21: The durable-version-with-provenance shape is not an invention of
  this entry — it is how `SEQGEN.VIDEO.1` already stores Sequence Video Drafts,
  and how `SEQGEN.PUSH.1` already creates Shot video candidates without
  automatic replacement. Whoever prepares this ticket should read those two
  before designing a new contract.

### FB-20260821-002 - Prouver un vrai aller-retour MikAI / OpenReel

- Status: `OPEN`
- Date observed: 2026-08-21
- Area: Editorial / OpenReel sidecar / Sequence Result
- Context: Same roadmap reconciliation pass as `FB-20260821-001`.
  `OPENREEL.ROUNDTRIP.1` had sat at position 3 of an ordering written on
  2026-08-02, before Chantier 1 and Chantier 2.
- Original observation:

  > OPENREEL.ROUNDTRIP.1 — vrai aller-retour MikAI ↔ OpenReel >>>> a deplacer
  > dans la boite à idée User_feedback

- Expected outcome: an end-to-end demonstration that a Sequence leaves MikAI,
  is edited in the OpenReel sidecar, and returns without loss or partial
  mutation — covering the anti-stale snapshot, the timings, and the explicit
  refusal of a patch that would apply only in part.
- Impact: unlike `FB-20260821-001`, the bricks here **already exist and are in
  use**: Export Editorial JSON, Validate Patch, Apply Patch start-only, Publish
  Sequence Result, Insert Shot at Playhead, Push production duration, stale
  HTTP 409 and Reload from MikAI. What was missing is the **proof of the whole
  loop**, not a feature. That makes it a validation campaign, which is worth
  scheduling against real use rather than carrying as a product ticket.
- Related ticket: None. Former roadmap entry `OPENREEL.ROUNDTRIP.1`, preserved
  in `docs/archive/ROADMAP_2026-08-02.md`.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-08-21: Removed from `docs/ROADMAP.md` by the author's decision, in the
  same pass that archived the 2026-08-02 consolidated roadmap.
- 2026-08-21: Two known limits recorded in `docs/PROJECT_STATE.md` bound what
  such a proof can claim today, and should be read before scoping it: OpenReel
  V1 timing patches are **start-only** — duration changes are not pushed as
  general timeline edits — and some legacy patches without snapshots can still
  be accepted with warnings, for backward compatibility.
- 2026-08-21: A precedent exists for how this kind of proof is run here.
  `OPENREEL.SIDECAR.PROMOTION.1` was validated with two isolated browser smoke
  sessions on their own ports, against a mock export server and disposable
  fixture media, never against the live `5173`.

## Entry Template

Copy this block under `Active Feedback` for each new note:

```md
### FB-YYYYMMDD-NNN - Short title

- Status: `INBOX`
- Date observed: YYYY-MM-DD
- Area: Project / Story / Sequence / Shot / Asset / Storyboard / Editorial / Other
- Context: Where the user was and what they were trying to do
- Original observation: The user's wording, preserved as closely as possible
- Expected outcome: Optional; leave open if this still needs product discussion
- Impact: Optional; frequency, severity, or workflow cost
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- Add dated clarifications, decisions, or reproduction details here.
```

## Resolved And Closed Feedback

Move entries here only after setting their status to `RESOLVED`, `DECLINED`,
or `DUPLICATE`. Keep the full entry and its history.

### FB-20260814-001 - LLM bench cascade stays empty until Apply is clicked

- Status: `RESOLVED`
- Date observed: 2026-08-14
- Area: LLM Workspace / Bench / Entity picker
- Context: Trying the read-only three-pane bench delivered by B6b
  (`/settings/llm-workflows/[templateId]`), choosing a test entity.
- Expected outcome: choosing a Project immediately lists that Project's
  Sequences, and choosing a Sequence immediately lists its Shots, without the
  user having to discover that a separate action is required first.
- Impact: the bench appeared broken on first use. The data was never missing —
  the lists did fill after clicking `Apply` — but nothing signalled that a
  submit was required, and `Apply` reads as "run the preview", not "load the
  next level".
- Related ticket: `LLMW.BENCH.CASCADE.1`
- Resolution: the five `<select>`s of the entity selector (Project, Sequence,
  Shot, Asset, Mode) now submit their GET form on change, so each level fills
  the next one on its own. `intent.parameters` inputs deliberately do NOT
  auto-submit — a form must not reload on every keystroke — and the `Apply`
  button stays, both for them and as the no-JavaScript path.
- Resolved or validated on: 2026-08-14
- Condensed 2026-08-22: 28 lines of quoted observation,
  follow-up notes and investigation log were removed at the author's
  request. They are in this file's git history; the tickets named
  above are the live reference.
