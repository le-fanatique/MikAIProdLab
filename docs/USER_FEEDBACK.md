# MikAI User Feedback Log

Last updated: 2026-08-07

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
  Extraction/Diagnostics epic. Keep the individual entries because they cover
  detection, crop, upload, diagnostics, and ratio behavior separately.
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
  visibility.
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
  generation epic with capability and CTA subtasks.
- `FB-20260722-001`, `FB-20260722-004`, `FB-20260722-005`,
  `FB-20260717-048`, and `FB-20260723-002` form the Camera Lab UI/input
  cluster, while preserving separate acceptance criteria.
- `FB-20260722-002`, `FB-20260718-005`, and `FB-20260718-008` form the Shot
  Video/OpenReel UX cluster.

## Active Feedback

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
  - Implementation note: root cause confirmed as one `clip/move` action plus one
  Zustand project write per selected clip per RAF frame during a group drag.
    Fixed and pushed as `f80853c` on the upstream sidecar candidate
    (`mikai/upstream-8459024`) with a new atomic `clip/moveBatch` action/handler in
  `@openreel/core` and a per-frame batch commit in `ClipComponent.tsx`: the
  whole selection (primary + companions, derived from the drag-start
  snapshot) now commits through one validated, all-or-nothing action per
  animation frame — one history entry, one store write, regardless of
  selection size, with a single track-array reconstruction pass per commit.
  A first pass (Codex `REVISE`) also surfaced and fixed a real bug caught by
  the required browser proof: the drag effect was tearing itself down and
  rebuilding on every per-frame commit (because it depended on `allTracks`/
  `trackHeights`, which get a new reference every project write), which both
  fragmented a single drag into several undo groups and reset the delta
  anchor used for companion clips mid-drag. Verified in a real isolated
  Chromium build with local disposable H.264 fixtures: 1/5/20-clip group
  drags now move with an identical delta across the whole selection,
  cross-track drag of the primary correctly leaves companions on their
  original track, both collapse to a single undo/redo step, Snap off does
  not snap, reload persists with no duplicated/lost clips, and no new
  console errors appear (only pre-existing sandbox network noise unrelated
  to this change). A second pass (Codex `REVISE`) found a remaining P1: an
  earlier RAF-flushed batch commit could still be in flight at `mouseup` and
  resolve after a cross-track drop, reverting the primary's track, and the
  effect's cleanup could close the undo group before that finalization
  settled. Fixed by chaining every commit (already-flushed or final) onto
  one ordered promise per drag (`enqueueDragCommit` in the new
  `drag-finalize.ts`) and awaiting that chain's tail before the cross-track
  move; the group now closes exactly once, in a `finally`, and the effect's
  own cleanup only closes it as a fallback when no finalization is in
  flight. Re-verified in a real browser with a diagonal (time + cross-track)
  20-clip drag using intentionally uneven frame timing to leave commits
  in-flight at mouseup: primary lands on the target track, all 19
  companions keep an identical delta on the original track, and a single
  undo/redo covers the whole gesture. A third pass (Codex `REVISE`) found
  the chain only guarded against thrown exceptions: `moveClip`/`moveClips`
  report a functional rejection (locked track, invalid batch member, ...)
  as a resolved `{ success: false }` ActionResult, not a throw, so a
  refused batch still read as "settled" and the primary could still change
  track alone on top of a group move that never actually happened — an
  atomicity break. Fixed by having the commit chain normalize both
  ActionResult and void-returning commits into a success/failure outcome
  (`enqueueDragCommit`/`finalizeClipDrag` in `drag-finalize.ts`, plus
  `Timeline.tsx`'s move handlers now surfacing that result instead of
  discarding it) and skipping the cross-track move entirely whenever the
  commit chain's final outcome is a failure. Covered by 12 unit tests
  including the exact two scenarios Codex named (a rejected final batch,
  and a rejected batch already in flight before mouseup) and re-verified in
  a real browser with the same 20-clip diagonal drag plus Snap on/off and a
  single undo/redo, with no new console errors. See
  `.agents/claude_report.md` for full evidence and the manual validation
  checklist.
- Resolution: None.
- Resolved or validated on: None.
- Update (`OPENREEL.SIDECAR.PROMOTION.1`, 2026-08-10): the atomic-batch fix
  ships on candidate `f80853ce3de432751847eb1bab3d03a669267c37` (tip of
  `mikai/upstream-8459024`), unchanged since the commit named above — this
  pass only audits/tests/documents it for promotion, no further edit. The
  candidate's own regression suite for this fix
  (`packages/core/src/actions/handlers/clip-move-batch.test.ts`, 13/13
  tests) passes. A first browser re-verification attempt could not
  conclusively demonstrate the gesture (three tries: Playwright's native
  element-to-element drag, then two immediate `mousedown`/`mousemove`/
  `mouseup` DOM-dispatch sequences) — root cause found on retake: the
  component defers attaching its `window` drag listeners to a `useEffect`
  gated on React state (`isPendingDrag`/`isDragging`), so events dispatched
  in the same synchronous tick as `mousedown` land before those listeners
  exist. Retake (Codex `REVISE`, P2) re-ran the gesture with a
  frame-timed sequence (`requestAnimationFrame` pause after `mousedown` and
  after crossing the 5px drag threshold, before further `mousemove`s) in a
  real isolated browser session: two selected clips (`Sh1`+`Sh2`) moved
  together by an identical +150px/+3s delta while the unselected third clip
  stayed put, a single `Undo` reverted both to their exact original
  positions, and a single `Redo` reapplied both to the exact dragged
  positions — one history entry for the whole gesture, no new console
  errors. The grouped-drag + undo/redo contract is now demonstrated live,
  not just by the automated suite.

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
- Resolved or validated on: pending user retest with their real multi-clip
  `Bold Havana` and King of the Office projects on the live `5173` instance.
- Update (`OPENREEL.PLAYBACK.REAL.PROJECT.REPRO.1`, 2026-08-09): the user
  still saw the freeze on the real persisted `Cosmic Seoul` project after
  importing several local clips, so the prior three fixes above were not the
  full story. Reproduced end to end in an isolated Playwright/production
  build with disposable local H.264 fixtures (with and without audio,
  sequential non-overlapping placement matching the user's layout): the first
  stalled layer was not `PlaybackController`/`MasterTimelineClock` itself but
  a second, independent playback pipeline in `apps/web/src/components/editor/
  Preview.tsx` (`startNativeVideoPlayback`, a hardware-accelerated
  HTMLVideoElement/canvas fast path used whenever the timeline has no
  overlapping clips or active audio effects — the layout produced by normal
  multi-clip import). Its top-level effect re-runs on every project-store
  mutation while playing (import, metadata probe, thumbnail/waveform
  generation all recreate the project reference), tearing down and
  restarting the whole native pipeline each time; because that setup is
  async and un-guarded, a superseded run could finish late and start an
  orphaned, uncancellable render loop, and — measured with temporary
  diagnostics — the dormant `PlaybackController`, which still reacted to the
  shared clock being stopped/restarted by that churn, forced the timeline
  store back to "stopped" while the native pipeline kept actually running
  underneath, permanently desyncing the visible monitor/playhead from real
  playback. Fixed with a small generation guard in `Preview.tsx` plus an
  explicit "external playback active" flag on `PlaybackController` so it
  stops reacting to/driving the shared clock while the native pipeline owns
  it. Verified with the same burst-import-while-playing scenario continuing
  to advance for 12+ seconds to natural end, and confirmed clean via the full
  monorepo typecheck, lint on touched files, and the existing playback test
  suite (198/198 passing). Full evidence in `.agents/claude_report.md`.
- Update (`OPENREEL.UPSTREAM.REBASE.SPIKE.1`, 2026-08-09): the user
  separately confirmed clean, performant multi-clip playback in a pristine
  upstream OpenReel checkout (`F:\AI\OpenReel_vanilla`, commit `8459024`),
  proving current upstream playback works for the real case even though the
  sidecar (fork point `5711925`) does not. An isolated audit/transplant
  spike (`docs/audits/OPENREEL_UPSTREAM_REBASE_SPIKE.md`) found that
  upstream `8459024` replaced the shared playback architecture the three
  fixes above target — including the `isExternalPlaybackActive()` flag from
  `OPENREEL.PLAYBACK.REAL.PROJECT.REPRO.1` above, which has no upstream
  equivalent — with its own, far more developed native multi-clip playback
  path directly inside `Preview.tsx`. The spike's disposable transplant of
  the MikAI integration surface onto `8459024` compiled clean (0 TypeScript
  errors) and passed 128/129 existing unit tests unmodified. Recommendation:
  **GO WITH LIMITS** on migrating the sidecar to upstream `8459024` rather
  than further patching the old playback stack; see the audit document for
  the full conflict matrix and bounded migration sequence. Status remains
  `TO VALIDATE` pending that migration and a full browser regression pass.
- Update (`OPENREEL.UPSTREAM.MIGRATION.1`, 2026-08-09): rebuilt the MikAI
  integration on upstream `8459024` in a dedicated worktree/branch
  (`F:\AI\tmp-openreel-sidecar-upstream-8459024`,
  `mikai/upstream-8459024`), dropping all three sidecar-authored playback
  patches (`bace876`, `492dd01`, `33f917a`) including
  `isExternalPlaybackActive()`, per the spike's recommendation. `tsc
  --noEmit` clean, `pnpm build` clean, targeted lint zero new diagnostics,
  `git diff --check` clean, and 129/129 MikAI integration tests pass (one
  stale fixture duration corrected per the spike, assertion updated to the
  correct value, no assertion weakened). Full `apps/web` suite: 939/939
  excluding one flaky, unrelated, pre-existing upstream test
  (`NoiseReductionSection.persistence.test.tsx`, fails only under full
  parallel run due to jsdom/ffmpeg-wasm timing, passes isolated, file
  untouched by this ticket). Isolated Playwright browser proof on port
  `4610` (not `5173`/`3000`) against a production build with three
  disposable local H.264 fixtures and a local mock MikAI export/timing-patch
  endpoint (no real user data): MikAI bootstrap loaded the mock export and
  opened the editor directly; the MikAI Bridge panel rendered
  project/sequence/clip-count/warnings/snapshot data and a non-destructive
  "Validate Patch" call round-tripped against the mock endpoint; native
  multi-clip playback (upstream's own `Preview.tsx` path, untouched by this
  ticket) advanced the playhead continuously across all three clip
  boundaries from 0s to natural end (~12s) without freezing, with the
  transport control correctly reverting to "Play" (never stuck on
  "Playing" with a frozen clock); Pause/Space, seek via the timeline ruler,
  and a full page reload with the same URL all behaved correctly; no
  console/page/hydration error or sensitive error detail (the only console
  noise was the sandbox's blocked outbound network — Google Fonts, an AV
  browser extension, and upstream's own unrelated FFmpeg-CDN audio-waveform
  fallback — present regardless of MikAI integration). Status remains `TO
  VALIDATE`: this migration worktree is held for Codex review and has not
  been promoted to sidecar `main` (still at `33f917a`); the user's own
  retest against `Bold Havana` / `Cosmic Seoul` / King of the Office is
  still pending. Full evidence in `.agents/claude_report.md`.
- Update (`OPENREEL.MIKAI.IMPORT.PLAYBACK.PERF.1`, 2026-08-09): investigated
  the specific "stutter at the start of each imported segment" the user
  reported for the upstream-based MikAI candidate, using a controlled A/B
  Playwright comparison (candidate on `127.0.0.1:5173`, MikAI on `:3000`,
  never `npm run dev:all`) between a normal upstream local import and a
  MikAI bootstrap of the same local H.264 media. Ruled out the MikAI
  integration surface itself as the cause: a full MikAI bootstrap (panel
  render, store hydration, `replaceMediaBlob` work, bootstrap subscription)
  with editorial trim `trimInSeconds: 0` played 6 clips over 18s with only
  start/end timing noise — no stutter at any of the 5 clip boundaries.
  Reproducing the same bootstrap with a non-zero, non-keyframe-aligned
  `trimInSeconds: 1.5` (representative of a real mid-take editorial trim)
  reliably reproduced clustered ~60-100ms stalls at 4 of 5 clip boundaries
  and nowhere else. Root cause: upstream's native playback path in
  `Preview.tsx` (`syncVideoToClipTime`) seeks the `<video>` element to the
  clip's `inPoint` synchronously at the moment that clip becomes active
  (not during the earlier pre-load pass), and a non-keyframe `inPoint`
  forces the browser to decode forward from the previous keyframe before
  it can render — a real, one-time-per-boundary decode cost. MikAI-sourced
  clips carry this pattern far more often than a plain drag-and-drop
  import (whose clips almost always start at `inPoint: 0`, i.e. a
  guaranteed keyframe), which is why only the MikAI path visibly stutters
  even though the underlying playback code is shared and unmodified. No
  fix applied: the actual seek/decode logic responsible lives entirely in
  `Preview.tsx`/the native playback path, outside this ticket's authorized
  MikAI-integration scope, and no changed within
  `apps/web/src/integrations/mikai/**`, `App.tsx`, or `playback-bridge.ts`
  can influence it. Reported to Codex as `NEEDS_CODEX_CONTRACT` with the
  full measurement.
- Correction (`OPENREEL.MIKAI.IMPORT.PLAYBACK.PERF.1` retake, 2026-08-09):
  Codex rejected the `trimIn`/keyframe-seek explanation above — the real
  MikAI export for Space Corsair (Project 18 / Sequence 54, the actual
  sequence the user tested) has `trimInSeconds`/`trimOutSeconds` `null` on
  all 20 items, both in the live export and in the `sequence_editorial_items`
  table, so that mechanism (real, reproducible, but for a different data
  shape) does not explain this case. Re-measured against this real export
  with MikAI running standalone on `:3000` (`npm run dev`, no `dev:all`).
  Found the actual cause: `sequence_editorial_items.duration_seconds` (the
  slot each shot occupies on the timeline — 3 to 7s each, 90s total) does
  not match the real duration of the video files attached to those shots
  via `shot_videos`/`shot_video_candidates` (source `sequence_split`,
  0.375s to 1.375s each — 3 to 19x shorter than their assigned slot).
  Reproduced with the real Space Corsair export and the real, unmodified
  video files copied read-only from this machine's own MikAI uploads
  folder: canvas-content sampling (pixel hashing every 200ms — a plain
  `drawImage`-timing probe is blind to this failure mode, since the canvas
  keeps being redrawn every frame with a stale, unchanging source) showed
  the visible frame freezing solid around 10.5s into playback and **never
  recovering** for the remainder of the 90s sequence, while the
  timeline/playhead clock kept advancing normally to a natural end at
  90s. This reads to the user as the video hanging/stuttering partway
  through and never really catching back up — a data-integrity mismatch
  between MikAI's editorial timeline durations and its own generated/split
  video lengths, not a keyframe or trim issue, and not obviously fixable
  from `apps/web/src/integrations/mikai/**` alone (the mismatch originates
  in MikAI's own data). Status remained `TO VALIDATE`; reported to Codex as
  `NEEDS_CODEX_CONTRACT` with both measurements.
- Resolution (`EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1`, 2026-08-09):
  implemented per Codex's product decision. For
  `videoSourceMode=latest-generation` only, the editorial export now
  represents each shot's REAL, decodable media duration
  (`shot_videos.durationSeconds`, never guessed) and recomputes
  compact, gap-free `startSeconds`/`durationSeconds` in existing editorial
  order (`src/lib/editorial/compactRealDurationTiming.ts`); a shot with no
  valid real duration is omitted from the compact timeline with a bounded
  diagnostic in the export's new `timingWarnings` field, never stretched
  to its planned slot. The export carries an explicit
  `timingBasis: "compact-real-duration"` marker; the legacy no-param
  export and `approved-only` are untouched (proved byte-identical), and
  the `editorialSnapshot` stays the planned/production fingerprint exactly
  as before (proved, same fingerprint across all three modes). All four
  sidecar write-back paths were audited: Validate/Apply Timing Patch and
  Push Duration are now refused outright with a clear, visible reason on a
  compact export (they would otherwise write compact positions back as if
  they were production ones); Insert Shot and Publish Advanced stay
  accessible, proven safe by construction (relative anchors / a real
  rendered file, never absolute compact positions written as production
  truth). Verified against the REAL Space Corsair export (Project 18 /
  Sequence 54, MikAI run standalone on `:3000`): the 20 real clips now
  compact to their real ~15.07s (was a fictitious 90s), and the OpenReel
  candidate (`mikai/upstream-8459024` worktree) plays all 20 clips
  continuously to a clean natural end with no freeze — canvas-content
  sampling confirmed continuous change for the full ~15s, matching the
  compact timeline exactly, versus the prior test's freeze at ~10.5s with
  the clock still climbing to a fictitious 90s. Status: `TO VALIDATE`
  pending Codex review of the candidate worktree and the user's own
  hands-on retest.
- Retake (`EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1`, 2026-08-09):
  Codex `REVISE`d the first pass with 4 P1s, all fixed. (1) A rejected
  media source (missing file / cross-owner confinement failure —
  `videoPath: null`) could still occupy compact timeline time if it
  carried a durable duration; now a source must have BOTH a verified
  `videoPath` and a valid duration to be compact-eligible, otherwise
  omitted like any other invalid source. (2) The sidecar's
  project/sequence resolver returned on the first tagged clip found
  instead of verifying every clip agreed; it now scans all clips and
  refuses on any disagreement (mixed project, sequence, timing basis, or
  a present-but-different editorial snapshot), proven with a corrupted
  mixed-project fixture. (3) Insert Shot is now blocked outright for
  every compact-real-duration sequence (compaction can omit a planned
  shot between two visible clips, so a relative anchor no longer
  reliably matches the planned timeline) — it remains available in
  Approved only/legacy sessions; Publish Advanced stays enabled,
  independently re-verified safe. (4) The compact duration assigned to a
  trimmed item is now clamped to the trim's real playable span
  (`min(trimOut, realDuration) - max(0, trimIn)`) so it can never exceed
  the actual source length, and a trim that clamps to an empty/negative
  span is omitted rather than falling back to the planned duration.
  Re-verified against the real Space Corsair export with all fixes
  applied: still compacts to ~15.07s, Insert Shot now shows a blocked
  message and a disabled button, Publish Advanced remains fully
  functional, playback still advances continuously to a clean natural
  end. 147/147 sidecar tests pass (was 129 before this ticket, 136 after
  the first pass). Status remained `TO VALIDATE` pending Codex re-review.
- Retake 2 (`EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1`, 2026-08-09):
  Codex `REVISE`d again with a P1 and a P2, both fixed, sidecar-only. (1)
  `timingBasis` is a write-back safety boundary that was never validated
  at runtime — an export with an unknown `timingBasis` value would have
  been accepted and silently treated as non-compact by the strict-equality
  write-back guards, letting compact positions reach a production timing
  patch. Now validated exactly at the one point untrusted network input
  enters the adapter: absent stays compatible; present must be exactly
  `"compact-real-duration"`; only valid together with
  `videoSourceMode: "latest-generation"`; a malformed companion
  `timingWarnings` is also rejected. 13 new adversarial tests prove no
  malformed combination can ever reach `buildProjectFromMikaiExport` (zero
  clips, zero write-back surface). (2) A stale comment in
  `insertMikaiShotAtPlayhead.ts` still claimed Insert Shot was unblocked
  on compact timing — corrected to match the real, already-blocked
  behavior. 159/159 sidecar tests pass. Re-verified against the real
  Space Corsair export: loads and behaves identically (its real
  `videoSourceMode`/`timingBasis` pair is well-formed). Status remains
  `TO VALIDATE` pending Codex re-review. Full evidence in
  `.agents/claude_report.md`.
- Update (`EDITORIAL.APPROVED.REAL.DURATIONS.1`, 2026-08-10): the user
  reproduced the same freeze/stutter behavior using APPROVED Shot videos
  (not just Latest generation) — same root cause: Editorial can assign a
  planned Shot duration longer than the real decodable MP4 duration,
  regardless of which mode selected it. Extended the reviewed compact
  real-media timing contract to explicit `videoSourceMode=approved-only`,
  reusing the SAME `timingBasis: "compact-real-duration"` marker and the
  SAME compact computation (`computeCompactRealDurationPositions`, never a
  second one). New: `augmentApprovedSourcesWithDurableDuration`
  (`src/lib/editorial/videoSourceMode.ts`) matches `shots.approvedVideoPath`
  to that exact Shot's own durable `shot_videos` row (same Shot id AND
  same path) to source its real duration — never the newest library entry,
  never estimated. The legacy no-param export and Latest generation are
  both proved byte-identical/unaffected. The sidecar candidate's
  `assertValidMikaiExport` now accepts `timingBasis` alongside EITHER
  explicit mode (still refusing absent/unknown modes and malformed
  companion fields); all four write-back guards already keyed off the
  clip-level `mikaiTimingBasis` tag alone, so no guard logic changed —
  only their user-facing messages, which previously said "Switch to
  Approved only", now correctly say "reload without an explicit video
  source mode" (the old wording would have told a user already in
  Approved only to switch to the mode they were already in). 160/160
  sidecar tests pass (was 159). Verified in an isolated environment with
  real, ffmpeg-encoded H.264 clips (never port 3000/5173, never the real
  DB/uploads): the compact Approved-only timeline sums exactly to the
  three real clip durations (4.75s), plays back continuously with no
  freeze to a clean natural end, pause/seek/reload all behave correctly,
  Insert Shot/Validate/Apply/Push Duration are blocked with accurate
  messages, and Publish Advanced stays available — while the legacy
  no-param export of the same Sequence keeps Insert Shot/Push Duration
  enabled with the PLANNED durations, unaffected. Status: `TO VALIDATE`
  pending Codex review of the candidate worktree and the user's own
  retest. Full evidence in `.agents/claude_report.md`.
- Retake (`EDITORIAL.APPROVED.REAL.DURATIONS.1`, 2026-08-10): Codex
  `REVISE`d with 2 P1s and a P2, all fixed. (1) `timingWarnings` was not
  actually bounded — the producer could emit one entry per omitted item
  with no cap, and the sidecar parser accepted any array/string length.
  Fixed with a shared, documented contract (`MAX_TIMING_WARNINGS = 50`,
  `MAX_TIMING_WARNING_MESSAGE_LENGTH = 300`, duplicated on both sides):
  the producer now caps the array via a small `BoundedWarningCollector`
  (individual entries up to the cap, then one honest synthesis entry
  counting the remainder — never a silently incomplete-looking list) and
  truncates any single message with an explicit ellipsis; the sidecar
  parser rejects an export whose `timingWarnings` exceeds either bound.
  (2) A direct binary read found 2 literal NUL bytes physically present in
  `videoSourceMode.ts`'s source, inside a delimiter-joined Map key
  (`` `${shotId} ${videoPath}` ``) — an encoding artifact from how that
  key was originally constructed. Fixed by replacing the string-joined key
  entirely with a nested `Map<shotId, Map<videoPath, duration>>`, which
  has no string-join step and is structurally immune to this class of bug;
  verified the file (and every other file touched by this ticket, in both
  repositories) now contains zero NUL bytes via a direct binary scan. (3)
  `MIKAI_SIDECAR.md` still described the superseded latest-only,
  Insert-Shot-stays-accessible contract — corrected to match the shipped
  code (both explicit modes, Insert Shot blocked, shared warning bounds
  documented). 164/164 sidecar tests pass (was 160). Re-verified the
  Approved-only compact, Latest generation compact, and legacy
  byte-compatible exports through the real route handler; the four
  write-back intentions (Validate/Apply/Push refused, Insert Shot refused,
  Publish Advanced available) are covered by the existing sidecar
  integration test suite, unchanged by this retake (no playback-affecting
  behavior changed — only an internal bug fix, a bound, and documentation).
  Status remained `TO VALIDATE` pending Codex re-review. Full evidence in
  `.agents/claude_report.md`.
- Validation utilisateur (2026-08-10) : le flux Approved-only compact est
  confirme fonctionnel sur la session reelle. Le feedback est clos ; le
  contrat legacy sans parametre reste conserve pour les usages de timing
  planifie.
- Update (`OPENREEL.SIDECAR.PROMOTION.1`, 2026-08-10): the fixes above ship
  on the upstream-based candidate `f80853ce3de432751847eb1bab3d03a669267c37`
  (branch `mikai/upstream-8459024`), which replaces the legacy sidecar
  lineage (`33f917a` and its ancestors `bace876`/`492dd01`) with upstream
  `8459024`'s own native playback controller
  (`packages/core/src/playback/`). Parity-audited against legacy `main`: no
  MikAI integration file lost a supported contract, every legacy playback
  patch is confirmed absent by content (no `native-playback-generation.ts`,
  no `isExternalPlaybackActive()`), and none of `bace876`/`492dd01`/`33f917a`
  are ancestors of the candidate. Candidate typecheck/tests/build pass
  (1197/1219 tests, 2 unrelated pre-existing flaky timing tests in
  `video-engine-export-effects.test.ts`, reproduced independently
  unchanged); isolated browser smoke (mock export + local fixture media, own
  port, no live 5173 use) confirmed import, continuous playback across two
  clip boundaries, pause/seek/reload, and full MikAI Bridge visibility with
  no new console errors. Status stays `RESOLVED`, pending Codex review and
  the actual `main` promotion (not yet performed — this pass only audits
  and prepares). See `.agents/claude_report.md` for full evidence.
- Retake (Codex `REVISE`, P1, 2026-08-10): the first smoke session above only
  exercised the normal/production-timing path. A second isolated browser
  smoke session against an explicit `videoSourceMode: "latest-generation"` /
  `timingBasis: "compact-real-duration"` mock export confirmed the inverse
  contract: Validate Patch, Apply Timing Patch to MikAI, Insert New Shot at
  Playhead, and Push Duration to MikAI were all disabled with an explicit
  on-screen reason, while Publish as Active/Published stayed enabled — import,
  continuous multi-clip playback, pause, and reload all remained functional
  in this mode too, with no new console errors. Both smoke sessions (normal
  and compact) are now covered.

### FB-20260726-001 - Influence Research completes with no sources

- Status: `RESOLVED`
- Date observed: 2026-07-26
- Area: Project Style / Creative Influences / Research / Settings
- Context: The user opened Research for the Roger Deakins Creative Influence,
  searched the web for `his lighting approach`, and received completed Runs
  with no Candidate or Source to review.
- Original observation:

  > j avais mis ca en influence:
  > Roger Deakins / Person / his lighting approach
  > et j ai fait "search web"
  > le run a fonctionne mais il ne me sort aucune sources. est ce normal?
  >
  > je voudrais que le LLM utilisable pour la recherche soit le meme que celui
  > selectionne dans Language Model dans les settings. et comme LLM Chat /
  > Chat LLM Provider, ajouter une case a cocher pour decoreller le provider
  > du discover influence, de l'utilisation du reste de l'app pour les LLM.

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

#### Follow-up notes

- 2026-07-26: Web Discover remains OpenRouter-only in this retake. If the
  effective Research provider is not OpenRouter, the UI and server must refuse
  clearly rather than silently falling back. No arbitrary page re-fetch is
  added.
- 2026-07-26: Existing zero-candidate historical Runs remain immutable and are
  not deleted by the fix.
- 2026-07-26: Commit `9a0d96b` pushed to `origin/main`; awaiting a real
  successful Discover search and Settings validation from the user.
- 2026-07-26: User confirmed the corrected Influence Research flow works.
- 2026-07-26: Implementation completed by Claude Code under
  `STYLE.1.C.SEARCH.FIX1`: `parseSearchAnnotations` now reads the canonical
  nested `url_citation` contract and returns an explicit failure when zero
  valid citations survive; `researchInfluenceAction` and
  `synthesizeInfluenceResearchAction` resolve and capture the effective
  Research provider/model before every network call and never persist a Run
  or Synthesis when the effective provider is unsupported or the response
  yields no valid citations; Influence Research now inherits the active
  Language Model provider/model by default, with an
  `Influence Research LLM Provider` Settings card (mirroring `Chat LLM
  Provider`) to opt into a separate provider. Roger Deakins' existing
  zero-candidate Runs were verified untouched. Status remains `IN PROGRESS`
  pending Codex review and user validation in the running app.

### FB-20260723-001 - Define the Project Style V1 workspace

- Status: `RESOLVED`
- Validated on: 2026-08-02 (user confirmation: `c est ok`)
- Date observed: 2026-07-23
- Area: Project Style / Assets / Sequences / Shots / Storyboard / Generation
- Context: Defining the Project Style MVP after completing Story, extracting
  Asset drafts and preparing to generate visually coherent Assets and Shots.
- Original observation:

  > c est à ce moment là que je vais devoir commencer à penser project style.
  > [...] les resultat seront de style variable [...] et de registre variable.
  > Ces informations devrait etre defini à echelle du projet, car se
  > repercuter sur tout les assets et les shots pour avoir une unité de style.
  >
  > la creative Influences devrait avoir un espece d'auto feed, qui
  > permettrait à un llm de fill les information basique et proposerai des
  > informations pertinante trouvé sur internet à injecter.
  >
  > si un field n'est pas rempli, alors le critere ne devra pas etre injecté
  > dans le prompt composer. [...] Il faut que je sois capable de faire simple.
  >
  > il faut ajouter un champ général à la sequence "Project Style", qui par
  > defaut vient du Project Style actif projet. [...] cela permet de faire un
  > override à la sequence, et ainsi spread facilement l'override sur tout les
  > shots de cette sequence.

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

#### Follow-up notes

- 2026-07-23: The Style Bible has two pillars: `World & Design Language`
  changes the design of content itself; `Visual Treatment` changes how that
  content is represented.
- 2026-07-23: All fields are optional. Empty fields, empty headings and
  internal metadata must never appear in compiled prompts.
- 2026-07-23: Creative Influence research is user-triggered, source-grounded
  and approval-gated. Saved URLs, metadata, bounded evidence and syntheses are
  durable; full third-party articles are not copied by default.
- 2026-07-23: Project Style uses Working Draft and immutable published
  versions. Normal generations use the published version; Look Development
  may use a selected draft revision.
- 2026-07-23: A Sequence dynamically inherits the active Project Style until
  `Customize for Sequence` creates a complete local replacement. Shots have no
  Style override in the MVP and always resolve their Sequence Style.
- 2026-07-23: No semantic clash detector or style-conflict warning is part of
  the MVP.
- 2026-07-26: `STYLE.1.C.UI` implemented by Claude — the visible Research
  review workflow (`InfluenceResearchWorkspace.tsx`) consuming the
  `STYLE.1.C.CORE` contracts: Discover (search, review/save/dismiss
  candidates), Sources (select/notes/withdraw), Synthesis & Rules
  (synthesize, review claims, edit/reject/approve Candidate Rules into the
  Working Draft). Approval reconciles the Working Draft's rules/revision
  without a page reload, preserving any unsaved Direction Brief/pillar
  edit. Pending Codex review.
- 2026-07-23: The original eleven-step user story is preserved in
  `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`. Accepted decisions are
  separated into `docs/PROJECT_STYLE_MVP_DECISIONS.md`, while
  `docs/PROJECT_STYLE_SUPERVISOR_HANDOFF.md` records the implementation order,
  repository baseline and supervision gates.
- 2026-07-23: `STYLE.RESEARCH.SPIKE.1` approved (`GO WITH LIMITS`) — the
  OpenRouter `openrouter:web_search` Server Tool is the selected retrieval/
  citation contract for the future research ticket; no arbitrary page
  re-fetch by MikAI for the MVP.
- 2026-07-23: `STYLE.1.A` implemented by Claude — durable Working Draft +
  immutable published version foundation. Additive migration
  (`drizzle/0040_sharp_raza.sql`) adds `project_style_drafts` (DB-unique per
  Project, optimistic-concurrency `revision` column),
  `project_style_sections`, `project_style_rules`, `project_style_versions`
  (immutable, DB-unique version number per Project), and
  `project_style_active_pointers` (the only mutable row that can change
  which version is active — never a write to a version row itself). A pure
  compiler (`src/lib/projectStyle/compileStyleSnapshot.ts`) turns a sparse
  snapshot into exact prompt text, omitting every empty field/heading/
  disabled rule and never injecting rule metadata as literal prompt
  content, per the "internal metadata is not literal prompt content"
  decision above. The `/projects/{id}/style` workspace (Direction Brief,
  both Style Bible pillars, sparse specialized sections, atomic rules,
  exact compiled preview, Versions & Publish with history) is live; the
  `Project Style` navigation entry is enabled in both `ContextStrip` and
  `Sidebar`. Real proofs on a dedicated, deleted-after test Project:
  migration preserved all 26 pre-existing tables' row counts byte-for-byte;
  a real two-tab double-publish race produced exactly one new version,
  never a duplicate or partial state, with the earlier version proven
  byte-identical afterward; editing after publish never touches the
  published version. No Web research, no Creative Influences, no Sequence
  inheritance, and no prompt/generation integration in this ticket — those
  remain their own tickets. Awaiting Codex review.
- 2026-07-23: `STYLE.1.A`'s report documents one honest limitation: the
  double-publish race's exact per-tab error message could not be captured
  from the test script (a Puppeteer `click()` hung on the losing tab during
  the winning tab's page reload); the invariant itself (never two vN rows,
  never a partial state) was instead verified directly against the real
  post-race database state, which is an equally direct — arguably more
  direct — source of truth.
- 2026-07-23: Codex review returned `REVISE` on `STYLE.1.A` (4 findings):
  the compiled preview could show unsaved edits while Publish read stale
  DB text; fields stayed blank-but-editable after publication, letting a
  stray keystroke create a throwaway draft that bypassed `Edit Active
  Style`; Server Actions trusted TypeScript enum types with no runtime
  check; version history showed only version/date with no way to inspect
  what was actually published. Claude applied the retake: `Publish Style`
  now sends the exact live field values the preview was computed from,
  publishing them atomically in the same transaction (never a stale DB
  read); fields are read-only and show the real active version's content
  until `Edit Active Style` is clicked; every Server Action now runs a
  real runtime validator (new `src/lib/projectStyle/validation.ts`) on
  every enum/id/revision before touching the database; each version's
  compiled text is now inspectable inline in History. Re-validated: 43/43
  pure validator tests, 37/37 real adversarial DB proofs (every invalid
  enum/direction/id/revision rejected with zero row mutation, verified
  against real row counts), and 21/21 real-browser checks proving all four
  fixes end-to-end on a live server. Full detail in
  `.agents/claude_report.md` (retake section). Awaiting fresh Codex
  verdict.
- 2026-07-23: Codex review returned a second `REVISE` on `STYLE.1.A` (2
  findings, both in `ProjectStyleWorkspace.tsx`): Reorder persisted the new
  `orderIndex` in the database but never re-sorted the local React array,
  so the moved item didn't visually move and the Up/Down button states
  went stale; and a rejected Add/Edit (stale revision, validation refusal,
  server error) still cleared the typed heading/content or closed the
  editor, silently discarding the user's input. Claude applied retake 2: a
  new `sortByOrderIndex` helper keeps `sections`/`rules` state always
  sorted after every mutation; `onAdd`/`onUpdate` callbacks now return a
  real success boolean, and the form/editor is only cleared or closed on
  an actual success. Re-validated with 24/24 real-browser checks,
  including four real stale-rejection scenarios (Add/Edit × Section/Rule)
  driven by a genuine concurrent `UPDATE` on the draft's revision column,
  each proving byte-identical input preservation. Full detail in
  `.agents/claude_report.md` (retake 2 section). Awaiting fresh Codex
  verdict.
- 2026-07-24: `STYLE.1.B.CORE` implemented by Claude — Project Style
  Reference Board images and Creative Influence dossiers, backend only.
  Additive migration (`drizzle/0041_left_natasha_romanoff.sql`) adds six
  tables: `project_style_reference_images` (Project-scoped, separate from
  Asset/Shot reference tables), `project_style_reference_domains` and
  `project_style_reference_consumers` (relational facts, DB-unique per
  reference, never a JSON blob), `project_style_influences`,
  `project_style_influence_domains` (weighted primary/supporting/accent),
  and `project_style_influence_references` (many-to-many link, DB-unique
  per pair, app-layer-checked to always share one Project — SQLite cannot
  express that cross-table equality as a plain FK). Upload is a dedicated
  path (`src/lib/projectStyle/uploadReferenceImage.ts`) that never trusts
  the declared filename/MIME: real magic-byte detection (PNG/JPEG/WebP
  only, no GIF/SVG), the bundled FFmpeg both decodes the file for real and
  reports its real dimensions, exclusive temp write then atomic rename
  publish. Delete follows the established quarantine/transaction/restore
  discipline (`src/actions/shotReferenceImages.ts`'s own pattern). Real
  proofs on a disposable DB copy plus real PNG/JPEG/WebP/GIF files produced
  by the bundled FFmpeg (78/78 passed, cleaned up after): every enum/id/
  URL/domain validator; case-insensitive duplicate-domain rejection;
  cross-Project refusal on update/delete/link; Influence-Reference link
  refused when the two belong to different Projects; GIF, a `.png`-named
  SVG, a truncated PNG, and an 11 MB file all refused with zero file
  published; a forced DB failure after a real publish left zero orphaned
  file; a forced mid-transaction delete failure restored the quarantined
  file to its exact original path; nominal delete removed the row, its
  cascaded domain/consumer rows, and the file together; `deleteProject`
  (`src/actions/projects.ts`) now collects Project Style reference paths
  before the cascaded DB delete and removes the files afterward, logging
  any leftover path rather than claiming a silent success — proven end to
  end (file and every Project Style row gone after deleting a real test
  Project). Pre-existing 26 tables' row counts and `PRAGMA
  foreign_key_check` unchanged after migration. No UI in this ticket
  (`STYLE.1.B.UI` follows); no Web research, synthesis or candidate rules
  (`STYLE.1.C.CORE`). Full detail in `.agents/claude_report.md`. Awaiting
  Codex review.
- 2026-07-24: Codex review returned `REVISE` on `STYLE.1.B.CORE` (4 P1
  findings, 1 P2). The relational model and migration were accepted as-is;
  the revision was limited to error/deletion paths that did not yet honor
  the ticket's honest-cleanup contract. Claude applied a targeted retake,
  no schema change: an upload DB failure's cleanup outcome is now checked
  explicitly (`deleted`/`already_absent`/`failed`) instead of assumed, so a
  real unlink failure is reported as a genuinely orphaned file rather than
  a false "cleaned up" message; a reference delete's final-cleanup failure
  now restores the row, its domains, consumers and influence links (not
  only the file), with an exact per-side "X/Y restored" report when
  recovery is incomplete; `deleteProject` now refuses an unconfined stored
  path outright, quarantines every eligible file before the Project row is
  deleted (restoring everything already quarantined if either the
  quarantine step or the DB delete itself fails), and throws a real error
  instead of redirecting to a false success if a quarantined file cannot be
  permanently removed after commit; `linkInfluenceReferenceAction` now uses
  a targeted `onConflictDoNothing` instead of a blanket try/catch, so a
  genuine database failure propagates instead of being presented as an
  "already linked" success; the upload temp file is now written with the
  exclusive `wx` flag, the real materialized buffer size is re-checked
  (not just the caller-declared size), every temp-cleanup failure is
  reported with its exact path, and `sourceFilename` is normalized as
  untrusted input before being persisted. Re-validated: 69/69 assertions on
  a disposable DB copy, including fault injection via intercepted
  `node:fs`/`node:fs/promises` calls to force each of the four P1 failure
  paths precisely (a technique the first pass could not use, since Windows
  file-locking tricks proved unreliable) — every one restores or reports
  honestly rather than claiming success. `npx tsc --noEmit`, `npm run
  build`, `npx drizzle-kit generate` (no drift) and `git diff --check` all
  clean. Full detail in `.agents/claude_report.md` (retake section).
  Awaiting fresh Codex verdict.
- 2026-07-24: Codex returned a second `REVISE` on `STYLE.1.B.CORE` (2 P1
  remaining). Three corrections from retake 1 were accepted; two blocking
  paths remained: (1) the Reference delete used out-of-transaction
  snapshots that could restore a stale or partial state, and (2)
  `deleteProject` swallowed pre-commit restore failures while claiming
  nothing changed. Claude applied retake 2, no schema change: (1)
  `deleteProjectStyleReferenceAction` rewritten in 4 phases — snapshot and
  DELETE now happen in ONE synchronous `better-sqlite3` transaction
  (impossible concurrent mutation between snapshot reads and cascade
  delete); post-commit compensation only restores DB rows AFTER confirming
  the file was restored to its original path (never recreates rows pointing
  at a `.trash-*` file); DB restoration uses a single transaction with
  `onConflictDoNothing` on every table (all-or-nothing rollback). (2)
  `deleteProject` now collects per-file restore results with exact original
  and quarantine paths and OS error; never says "nothing was changed" if a
  restore is incomplete. Re-validated: 43/43 assertions (transactional
  snapshot correctness, onConflictDoNothing safety, all-or-nothing rollback
  via SQL trigger injection, DB-delete-blocked diagnostics with per-file
  restore counts, quarantine failure handling, unconfined path refusal,
  plus nominal delete/deleteProject regression). `npx tsc --noEmit` clean,
  `npm run build` succeeded, `npx drizzle-kit generate` (no drift), `git
  diff --check` clean. Full detail in `.agents/claude_report.md` (retake 2
  section). Awaiting fresh Codex verdict.
- 2026-07-24: Codex returned a third `REVISE` on `STYLE.1.B.CORE` (1 P1
  remaining). Snapshot transactional and `deleteProject` diagnostics
  accepted; one local issue: `onConflictDoNothing` in the compensation
  transaction could silently skip a conflicting row, attach snapshot
  relations to a different concurrent line, and report false full
  restoration. Claude applied retake 3, no schema change: removed all
  `onConflictDoNothing` from the compensation transaction — any conflict
  (concurrent insert reusing the same id) now fails the INSERT and rolls
  back the entire restoration transaction, preserving the existing
  "database restoration failed ... rolled back" diagnostic. Three targeted
  proofs validated: (1) conflict on Reference id — concurrent row intact,
  no snapshot relations attached, full rollback (8 assertions); (2)
  conflict on a relation id mid-restoration — no snapshot row survives
  (6 assertions); (3) nominal full restoration still works (6 assertions).
  `npx tsc --noEmit` clean, `npm run build` succeeded, `npx drizzle-kit
  generate` (no drift). Full detail in `.agents/claude_report.md` (retake 3
  section). Awaiting fresh Codex verdict.
- 2026-07-27: `STYLE.1.E.CORE.1` implemented by Claude — the canonical,
  deterministic and inspectable generation Style source, split ahead of
  surface integration (`STYLE.1.E.SURFACES.1`). New
  `src/lib/projectStyle/generationStyleSource.ts` defines the six-consumer
  contract (`asset`, `shot-image`, `shot-video`, `shot-storyboard`,
  `sequence-storyboard`, `sequence-video`), a deterministic
  `consumer:`/`media:`/`all` applicability grammar that keeps existing
  free-text values such as "Night interiors" applicable to all (never
  semantically interpreted, never silently excluded), a sparse
  consumer-filtered generation segment beginning with a literal
  `PROJECT STYLE` header (distinct from and never mutating the immutable
  `compileStyleSnapshot()` authoring text), a byte-identical no-Style
  composition helper, and exact character/UTF-8 byte accounting (never
  called tokens). `resolveActiveProjectStyle` was added to
  `resolveSequenceStyle.ts` as the canonical Asset-consumer resolver,
  reusing the existing pointer-read and corruption-guard logic rather than
  duplicating it; Shot/Storyboard/Sequence consumers resolve through the
  existing `resolveSequenceStyle`/`resolveShotStyle` unchanged.
  `GenerationSnapshot` gained one optional, backward-compatible
  `styleProvenance` field. No generation action, payload, queue, ComfyUI
  call or user-facing UI was touched — that rollout is
  `STYLE.1.E.SURFACES.1`. 117/117 pure assertions and 21/21 disposable-DB
  assertions passed (inheritance, override freeze, cross-Project refusal,
  corrupted snapshot/compiled-text refusal, consumer-filtered provenance).
  Full detail in `.agents/claude_report.md`. Awaiting Codex verdict.
- 2026-07-27: `STYLE.1.E.SURFACES.1` implemented by Claude — the canonical
  Style source is now integrated into Asset generation, normal Shot
  image/video generation and Shot Storyboard generation only (Sequence
  Storyboard/Video remain `STYLE.1.E.SURFACES.2`). A shared server-only
  preparation helper (`src/lib/projectStyle/generationStylePreparation.ts`)
  resolves and composes once for both preview and action parity. The trusted
  consumer is always server-derived: hard-coded `asset` for Assets,
  `workflow.kind` for normal Shot generation, and a dedicated hard-coded
  `shot-storyboard` wrapper/action for Storyboard — never a client-supplied
  value. Camera Lab keeps its exact existing `runWorkflowGeneration` entry
  point, unstyled, byte-identical. All four preview surfaces (embedded
  Asset/Shot panels, both dedicated generate pages) render the compiled
  `PROJECT STYLE` segment, resolution/version identity and exact
  character/UTF-8 byte counts before the payload preview, and disable
  Generate on a resolver error. An edited Advanced Payload JSON that removes
  the composed Style-bearing text is refused before job creation. Retry
  preserves a prior Storyboard consumer from the job's own snapshot; a
  legacy job without Style provenance falls back to the normal image/video
  consumer. Full detail and proofs in `.agents/claude_report.md`. Awaiting
  Codex verdict.
- 2026-07-27: `STYLE.1.E.SURFACES.2` implemented by Claude — completes the
  `STYLE.1.E` rollout by integrating the canonical Style into Sequence
  Storyboard contact-sheet and Sequence Video generation, with the fixed
  consumers `sequence-storyboard`/`sequence-video` always server-derived
  from `{ kind: "sequence", projectId, sequenceId }`, never a client-supplied
  value. Both `runSequenceGeneration` and `runSequenceVideoGeneration` reuse
  `prepareGenerationStyleSource`, `buildGenerationPayload` and
  `findEditedStyleTextMismatch` exactly as accepted in `CORE.1`/
  `SURFACES.1` — no second resolver, composer or payload patcher. Both
  dedicated generate pages render `ProjectStyleGenerationPreview` (source
  label "Resolved Sequence Style") before the Payload Preview, resolved
  server-side with the same shared helper the action re-resolves at submit,
  and disable Generate on a resolver error. Sequence Video keeps its
  existing board image-provenance guard (`validateImageProvenanceUnchanged`)
  unmodified, now checked alongside the Style-text Advanced Payload guard,
  both before any job row or provider call. 46/46 real action/DB/payload
  assertions passed on a disposable SQLite DB with a mocked ComfyUI upload/
  queue boundary (no real ComfyUI, no paid call): exact provenance for
  inherited and Sequence-override resolution on each consumer, byte-identical
  no-Style behavior, no-claimed-injection when a workflow has no patchable
  text input, fresh re-resolution between preview and submit, resolver
  corruption refusing generation with zero job rows, consumer/kind coherence
  refusing an image workflow for Sequence Video and a video workflow for
  Sequence Storyboard, Advanced Payload accepting an unrelated edit while
  refusing a Style-text removal, and the pre-existing image-provenance guard
  still refusing a rewired board. A temporary `next start` server against the
  same disposable DB confirmed every UI state (`Inherited from Project`,
  `Sequence Override`, exact character/UTF-8 counts, "No effective Style",
  "no compatible text input", and the resolver-error disabled state) on both
  pages. Full detail and proofs in `.agents/claude_report.md`. Awaiting Codex
  verdict.
- 2026-07-27: User validation completed for `STYLE.1.E.SURFACES.2` after
  commit `5e92d71`: the Sequence Storyboard and Sequence Video Style
  integration works as expected. The wider `FB-20260723-001` epic remains
  `IN PROGRESS` until the remaining Project Style roadmap tickets are closed.
- 2026-07-27: Implementation completed by Claude Code under `STYLE.1.F.CORE`:
  `Enhance Description` (single and batch) and `Enhance Asset Bible` now
  resolve the active published Project Style through the canonical
  `resolveActiveProjectStyle` and inject a pillar-separated, Asset-filtered
  Style segment into their existing prompts, with proven byte-for-byte
  compatibility when no Style is active. The complete backend contract for
  an explicit `Align with Project Style` proposal/apply flow is implemented:
  a pure deterministic context builder (Project Story + Asset fields +
  Style), a strict two-outcome JSON parser with an anti-suffix-only boundary
  (rejects a response that only appends decorative rendering vocabulary with
  no field-level design decision — proven against the original space-postman
  fixture), a zero-write generate action that refuses before any LLM call
  when there is no active Style, an atomic single-transaction apply action
  (ownership, active-version re-check, Asset-fingerprint staleness check,
  field update, alignment-marker upsert — all-or-nothing), and a read-only
  status model (`no-active-style` / `not-reviewed` / `aligned` /
  `style-changed` / `asset-changed`). One additive migration
  (`asset_style_alignments`) was generated via `drizzle-kit`; it stores only
  the reviewed Style version and a post-review Asset content fingerprint,
  never the temporary proposal. No Asset Detail UI was touched — that is
  `STYLE.1.F.UI`. Full detail and proofs (18 disposable-DB checks, 30 pure
  checks, all provider calls mocked/no-cost) in `.agents/claude_report.md`.
  Awaiting Codex verdict.
- 2026-07-27: `STYLE.1.F.CORE` closed at commit `1fe873e` after two Codex
  retake rounds (post-LLM-call revalidation, bounded canonical baseline
  with no truncation, a strict Apply input parser, explicit marker-
  corruption handling, and a raw-vs-normalized fingerprint fix). Migration
  `0044_whole_nocturne.sql` applied to the real development DB with backup;
  pre-existing table counts and the 33 pre-existing FK violations
  unchanged.
- 2026-07-28: Implementation completed by Claude Code under `STYLE.1.F.UI`:
  Asset Detail now exposes `Align with Project Style` as a new collapsed-by-
  default "AI Assist" panel (`src/components/AssetAlignmentPanel.tsx`),
  placed before `Enhance Description`/`Enhance Asset Bible`, consuming the
  frozen `STYLE.1.F.CORE` actions exactly as written — no change to any
  CORE prompt, parser, transaction, schema or migration. The panel renders
  every read-model state honestly (`no-active-style` with a link to
  Project Style, `not-reviewed`, `aligned`, `style-changed`, `asset-changed`,
  and a sanitized local error that never fails the page), drives an
  explicit generate -> edit five fields (Description, Notes, Visual
  Identity, Usage/Performance Rules, Forbidden Variations) side-by-side
  against their generated baseline -> apply-or-discard workflow, and
  derives the effective apply outcome (`changes-proposed` vs
  `already-aligned`) client-side from the same trimmed-canonical semantics
  CORE itself uses, so a fully-reverted edit is confirmed rather than
  rejected as a fake mutation. A committed Apply triggers a full same-page
  navigation (mirrors the existing `AssetBibleEnhancePanel` convention) so
  the Details form and the alignment status both refresh from one source of
  truth. Proven: all 5 statuses plus a corrupted-marker read error over a
  real temporary `next start` server against a disposable DB (HTTP 200 in
  every case, correct status payload delivered for each); the exact
  user-visible status/CTA text via real `react-dom/server` rendering of the
  actual component (6 cases); the effective-outcome/no-fake-mutation
  derivation via a small additive pure helper
  (`compareFields.ts`, 5 cases). No real LLM credits spent. Interactive
  click-driven flows (generate/apply/discard/regenerate confirmation,
  keyboard traversal, Default/Custom theme, compact viewport) were **not**
  verified in a real browser — no browser automation tooling was available
  in this environment and none was installed, per the ticket's own
  documented-honestly fallback; an expanded manual testing checklist is
  provided in `.agents/claude_report.md` for the user to run. Awaiting
  Codex verdict.
- 2026-07-30: Implementation completed by Claude Code under `STYLE.1.G.UI.1`
  (following the merged `STYLE.1.G.CORE.1` Look Development backend): a new
  Look Development Bench at `/projects/[projectId]/style/look-development`
  (`src/components/projectStyle/lookDevelopment/LookDevelopmentBench.tsx`,
  `LookDevelopmentRecentTests.tsx`), reachable from a new "Open Look
  Development" entry in the Project Style workspace. It lets a user choose an
  explicit Style source (Working Draft or a Published version), prepare an
  Image or Video Look Test with From Story/Neutral Benchmark/Custom test
  content, map up to 12 Reference Board images onto ordinary or Dynamic
  Batch workflow inputs, inspect the exact compiled Look prompt (via the real
  `compileLookPrompt`) and mapping diagnostics before submitting, launch the
  job through `createLookTestAction` with a Partner Node confirm/cancel gate
  and a synchronous anti-double-submit lock, follow it via the existing
  `GenerationJobStatusPanel`, and publish the durable result through
  `publishLookResultAction`. Recent Look Tests is read-only in this ticket
  (comparison, notes, status, duplication and Look Target selection are
  `STYLE.1.G.UI.2`). No CORE action, schema, or generation runtime file was
  modified. Full audit, proof results and an English manual validation
  checklist are in `.agents/claude_report.md`. Awaiting Codex verdict.
- 2026-07-30: Implementation completed by Claude Code under `STYLE.1.G.UI.2`:
  the Look Development Bench's Recent Look Tests became a full review
  workspace over the existing CORE contract — editable notes, Candidate/
  Reject/Mark-as-Look-Target (with project-wide uniqueness reconciled
  locally), Delete Result, a 2-to-4 durable-result comparison grid with
  `Clear comparison`, and a Duplicate-for-rerun -> configure -> Partner Node
  gate -> run cycle reusing the exact `duplicateLookTestAction` /
  `runExistingLookTestAction` contract and UI.1's frozen-fingerprint Partner
  Node gate. One new pure, client-safe helper
  (`restoreLookTestSnapshotSelections.ts`) restores a duplicate's prior
  mapping from its source's own generation snapshot only when
  contextType/contextId/workflowId match exactly and every referenced
  reference id still belongs to the duplicate — otherwise it refuses and the
  user must configure explicitly. No CORE action, schema, or generation
  runtime file was modified. Full audit, proof results (21 pure + 17 DB
  assertions) and an English manual validation checklist are in
  `.agents/claude_report.md`. Awaiting Codex verdict.
- 2026-07-30: Codex Round 1 review returned `REVISE` (5xP1, 1xP2). Claude
  Code retake corrected all six findings: the duplicate-rerun cycle now
  actually reaches `publishLookResultAction` after a `done` job instead of
  stopping at polling; notes/status/Look Target mutations reconcile the
  opened detail from a real read and only claim `committed, pending sync`
  after a KNOWN CORE success (never after a plain transport exception), with
  a `Retry sync` that only re-reads; Duplicate now has a synchronous
  double-submit guard and never loses its created id if the list refresh
  fails; `restoreLookTestSnapshotSelections` is fully defensive against
  legacy/corrupt snapshots (reproducing Codex's exact crash case) and
  validates every restored node id against the CURRENT workflow's inputs; a
  duplicate's Style selector now starts on its own frozen Style identity
  instead of defaulting to the first option; the Comparison grid now shows
  the exact queued `promptText` instead of the raw Style block. 12 new pure
  + 18 new DB assertions, all passing; full detail in
  `.agents/claude_report.md`. Awaiting Codex re-review.
- 2026-07-30: Codex Round 2 review returned `REVISE` (3xP1, 1xP2). Claude
  Code retake corrected all four remaining findings: the rerun's poll/
  publish UI no longer unmounts the instant a job is queued (a new
  `activeRerunId` lifecycle flag keeps one controlled view mounted through
  queued -> running -> done -> published, then hands off to the normal
  reviewed-result view only after a KNOWN publish success, never showing
  "No durable result saved" right after publishing); Candidate/Reject/Look
  Target/notes now patch the opened detail immediately on a known CORE
  success (status label, pressed state and `pending sync` no longer
  contradict each other when a confirming re-read fails); duplicating a
  Working Draft-sourced test now matches the EXACT frozen revision (not just
  "Working Draft" in general), blocking Run with an explicit diagnostic if
  the draft has since moved on; and the snapshot-restoration helper now
  requires all four canonical selection fields (rejecting the exact
  `selections: {}` case Codex reproduced) while both the opened detail and
  the Comparison grid now validate `promptText` is a real string before
  rendering it. 24 new pure + 15 new DB assertions, all passing; full detail
  in `.agents/claude_report.md`. Awaiting Codex re-review.
- 2026-07-30: Codex Round 3 review returned `REVISE` (1xP1). Claude Code
  retake lifted the rerun's known job id (`activeRerunJobId`) up to
  `LookDevelopmentRecentTests`, alongside the existing `activeRerunId`: the
  pre-run editor now receives it as a `resumeJobId` prop and seeds its local
  state from it, so closing a rerun-in-progress row and reopening it (or
  opening a different row first) resumes directly on the poll/publish view
  instead of losing the job and re-showing the configuration form. `Close`
  no longer clears this tracking — only a known publish success does.
  Verified with a temporarily-installed (`npm install --no-save`, fully
  removed after, `package.json`/`package-lock.json` byte-identical
  before/after) real React DOM harness exercising actual mount/unmount/
  remount cycles, plus a full re-run of the Round 2 regression proofs. Full
  detail in `.agents/claude_report.md`. Awaiting Codex re-review.
- 2026-07-30: Codex Round 4 review returned `REVISE` (1xP1). Claude Code
  retake replaced the Round 3 single global `activeRerunId`/
  `activeRerunJobId` pair in `LookDevelopmentRecentTests` with a controlled
  `lookTestId -> jobId` registry (`activeReruns`): queuing a second rerun no
  longer overwrites/loses a first, still-active one — each Look Test's
  entry is added/removed independently, and a publish only removes the
  exact `lookTestId`/`jobId` pair just published. Still only one
  `LookDevelopmentPrerunEditor`/poller is ever mounted at a time (whichever
  row is open). Verified with a temporarily-installed (fully removed after,
  package files byte-identical) real React DOM harness proving two
  concurrent reruns (A and B) each resume their own job independently and
  publishing one never affects the other, plus a full re-run of the Round
  2/3 regression proofs. Full detail in `.agents/claude_report.md`. Awaiting
  Codex re-review.
- 2026-08-02: `STYLE.1.ACCEPTANCE.1` transversal acceptance gate executed by
  Claude Code in an isolated environment (HEAD `72f9d89`). Full A-G matrix,
  schema/migration audit, provenance/version/ownership DB checks and a
  dead-code audit are recorded in
  `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`. Technical evidence is
  complete; status is `TO VALIDATE` pending manual user confirmation and a
  final Codex verdict. This epic-level entry stays `IN PROGRESS` until that
  confirmation lands.
- 2026-08-02: Codex Round 1 review of `STYLE.1.ACCEPTANCE.1` returned
  `REVISE` — several acceptance scenarios were documented as `PASS` without
  being executed, migration preservation and cross-Project refusals were
  inspected rather than proven, and `PROJECT_STATE.md` still contained
  stale `STYLE.1.D.UI`/pre-epic state. Claude Code retake (new isolated
  environment, no shared `node_modules`) completed all missing scenarios
  with real evidence: Reference deletion guards (nominal delete + blocked
  delete on a Run-cited reference), `Reset to Project Style`, all 6
  generation consumers with DB-verified `styleProvenance.consumer`
  discrimination, Asset Alignment stale/edit-preservation and
  no-double-Apply reconciliation, Look Development duplicate/rerun,
  close/reopen resuming the exact in-progress job, and authorized result
  deletion (DB + media), a real DB-level migration-preservation proof
  (pre-`0040` fixture rows preserved byte-identical through `0040`-`0047`),
  live cross-Project refusal proofs for Sequence Style/generation/Asset
  Alignment plus code-verified guards for Look Development/Influence
  Research/Reference Analysis, and a compact-viewport + real keyboard
  activation + zero-hydration-error browser pass. `PROJECT_STATE.md` was
  reconciled and the `server-only` finding reclassified as defensive
  hardening. Full detail in `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`
  and `.agents/claude_report.md`. Status remains `TO VALIDATE` pending
  Codex re-review and manual user confirmation.
- 2026-08-02: Codex Round 2 review returned `REVISE` on 3 bounded points:
  Look Development/Influence Research/Reference Analysis cross-Project
  refusals were still code-inspection only, a residual
  `F:\AI\tmp-style1-acceptance` directory (with a leftover `.next`) was not
  deleted, and the audit mis-stated the Asset job's stored consumer as
  `"shot-image"` instead of `"asset"`. Claude Code retake (no browser, no
  full build, no worktree) proved all 3 remaining cross-Project refusals by
  calling the real Server Actions directly against a minimal disposable
  SQLite DB (structured refusal + byte-identical zero mutation for each),
  deleted and confirmed-absent the residual directory, and re-verified the
  Asset job's real `consumer` value via an actual `runAssetGeneration` call
  on the same disposable DB — confirmed `"asset"`, correcting a
  documentation error (not a product defect). No application file was
  modified. Full detail in `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md` and
  `.agents/claude_report.md`. Status remains `TO VALIDATE` pending Codex
  re-review and manual user confirmation.
- 2026-08-02: User confirmed final acceptance (`c est ok`). Codex closed the
  review with `STYLE.1.ACCEPTANCE.1` accepted. Claude Code closure pass
  deleted the remaining temporary residue (`F:\AI\tmp-style1-retake2`,
  confirmed `Test-Path` `False`), marked `docs/audits/
  PROJECT_STYLE_V1_ACCEPTANCE.md` as `ACCEPTED` with final sign-off,
  updated `docs/PROJECT_STATE.md` and `docs/ROADMAP.md` to reflect the
  closed epic and promoted `SEQGEN.VIDEO.CUT.CORE.1` as the next active
  ticket. **This entry is now `RESOLVED` — the `STYLE.1` epic (A through G)
  is formally closed.**

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
- Original observation: The page scrolls back to the top after the split and
  the newly created segment is not selected.
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

#### Follow-up notes

- 2026-07-19: Select the exact inserted segment returned by the server, not a
  heuristic such as "last segment". Preserve scroll without relying on a
  fragile fixed pixel offset.
- 2026-07-20: User validation after `b007f87` confirms selection and seek are
  correct, but scroll restoration still fails: every split returns to the top
  of the page. Follow-up moved to `SEQGEN.SPLIT.CLEANUP.1-FIX1`.
- 2026-07-20: User manually validated `SEQGEN.SPLIT.CLEANUP.1-FIX4` in a real
  browser. The native `#split-video-player` anchor lands on the resizable
  player after Split at Current Frame and the resulting workflow is confirmed
  functional.
- 2026-07-20: The DOM-anchor/multi-frame FIX1 also failed user validation.
  Product decision: remove that mechanism, move Frame/Split controls above the
  player, and make the player 50% wide by default with adjustable width in
  `SEQGEN.SPLIT.CLEANUP.1-FIX2`.
- 2026-07-20: User visually validated the FIX2 player sizing. Final product
  retake: keep the resizable player, restore the Frame/Split toolbar below it,
  and use the native `#split-segment-bar` URL fragment after a successful
  Split at Current Frame instead of any JavaScript scroll restoration.
- 2026-07-20: FIX3 native navigation works, but anchoring the segment bar
  lands visually too low, around the newest segment. Final retake moves the
  native fragment target to the resizable video-player container via
  `#split-video-player`.

### FB-20260717-047 - Split Plan rejects frame-quantized source endpoint

- Status: `RESOLVED`
- Date observed: 2026-07-17
- Area: Storyboard / Sequence video splits / Validation / Frame accuracy
- Context: Validating a reviewed Split Plan produced by the current CFR-aware
  detector.
- Original observation:

  > J'ai ce message quand je fais Validate Split Plan: "The last segment does
  > not end at the source video's duration."

- Expected outcome: A plan generated by MikAI must preserve the exact source
  video EOF and validate without asking the user to repair a synthetic tail
  gap. Existing runs created by the faulty endpoint quantization must be
  repaired safely when their mismatch matches that exact legacy signature.
- Impact: Blocking; the plan cannot reach `validated`, so `SEQGEN.PUSH.1`
  cannot consume it.
- Related ticket: `SEQGEN.SPLIT.WORKSPACE.1-FIX1`
- Resolution: `selectSegmentBoundaries.ts` no longer quantizes the absolute
  EOF to the nearest frame — only internal cut boundaries are frame-rounded;
  the last segment's end now stays exactly the FFprobe source duration.
  `validateSplitPlan` gained a narrow, atomic compatibility normalization for
  already-affected runs: applies only to `ready` runs proven CFR with a
  reliable FPS, only when the last segment's endpoint matches the exact old
  buggy signature to floating-point epsilon, diagnoses on a normalized view,
  and writes the fix (plus nulling the now-stale thumbnail) in the same
  transaction only if every other diagnostic passes; any other mismatch is
  still refused unchanged. Proven live against the exact reported runs
  (35/36) and against fresh detections, including refusal cases, atomic
  rollback on a co-occurring failure, non-CFR/legacy exclusion, thumbnail
  deletion-failure surfacing via `splitWarning`, and immutability of already
  validated runs. See `.agents/claude_report.md` for full proof log.
- Resolved or validated on: User validated 2026-07-18.

#### Follow-up notes

- 2026-07-17: Reproduced on runs 35/36 for Sequence 50. Source duration is
  `15.104s`; the final segment ends at `15.083333333333334s`, exactly the
  source duration quantized to the nearest 24fps frame. The validator compares
  this generated endpoint to the unquantized source duration and rejects it.
- 2026-07-17: Fixed and validated via `SEQGEN.SPLIT.WORKSPACE.1-FIX1`. Runs
  35/36 (the exact reported runs) now validate cleanly with `end_seconds`
  normalized to `15.104` and their stale thumbnails nulled and deleted.
- 2026-07-18: User confirmed that `Validate Split Plan` succeeds and the EOF
  duration error no longer appears. Feedback closed.

### FB-20260717-046 - Unify Split review and refine cuts locally

- Status: `TO VALIDATE`
- Date observed: 2026-07-17
- Area: Storyboard / Sequence video splits / UX / Frame accuracy
- Context: Reviewing a detected Sequence Video Split Plan and correcting a
  very short Shot that global detection misses unless settings are lowered so
  far that other valid cuts disappear.
- Original observation:

  > Je voudrais que Detect & Review Splits affiche directement le Split Plan,
  > avec les reglages de detection et Run Detection Again sur la meme page.
  > Apres une premiere decoupe, je veux merger les fausses coupes, selectionner
  > un segment qui contient plusieurs Shots, puis soit le splitter moi-meme a
  > la frame courante du player, soit relancer une detection uniquement dans
  > ce segment avec des reglages locaux. Le cas concret est un plan de 14
  > frames : des reglages globaux assez permissifs pour le retrouver font
  > disparaitre d'autres bonnes detections.

- Expected outcome: `Detect & Review Splits` becomes one workspace containing
  detection settings and the current editable plan. The user can merge false
  cuts, select a segment, split exactly at the current source frame, or rerun
  FFmpeg only inside that segment with local settings, without changing the
  rest of the plan.
- Impact: A single global threshold cannot reliably cover both micro-Shots and
  longer transitions. Page navigation and whole-video reruns currently make
  iterative correction slow and frustrating.
- Related ticket: `SEQGEN.SPLIT.WORKSPACE.1`
- Resolution: Implemented — `/splits` is now the single workspace (Detection
  Settings + review together, current run resolved via `splitRunId` or the
  most recent run, `Run Detection Again` stays on the same route), segment
  selection seeks the player without a page reload, `Split at Current Frame`
  is a frame-exact server action, and `Refine Detection in This Segment` runs
  FFmpeg scoped to only the selected segment. Pending Codex review/user
  validation.
- Resolved or validated on: None yet — awaiting Codex verdict.

#### Follow-up notes

- 2026-07-17: Keep seconds at high precision as the canonical persisted
  boundary and derive frame/timecode from the run's source FPS. Do not add
  duplicated frame columns. Existing runs remain versioned and durable even
  though only the current run is emphasized in the UI.
- 2026-07-17: Local detection may replace only the selected segment; all other
  segment boundaries, mappings, statuses and thumbnails must remain intact.
- 2026-07-17: The exact 14-frame Shot case from the original observation was
  not reproducible against real dev data (no Sequence Video draft exists for
  the Sequence with sub-1s Shots) — Lot D's 14-frame proof is via pure
  synthetic unit tests at 24/25/30 FPS, per the ticket's own instruction not
  to fabricate a positive proof for an unavailable real case.

### FB-20260717-043 - Generate a Sequence video from the Storyboard workspace

- Status: `TO VALIDATE`
- Date observed: 2026-07-17
- Area: Storyboard / Sequence-level video generation / Seedance
- Context: The Sequence contact sheet can now be generated, stored, extracted
  and assigned to Shots. The next production stage is a single generated video
  containing the ordered Shot progression before split review.
- Original observation:

  > Je veux que la generation de cette video basee sur le storyboard se fasse
  > depuis la page Storyboard. Nous splitterons ensuite la video et pousserons
  > chaque video splittee dans les Shots correspondants, dans le meme esprit
  > que image Storyboard -> extract -> push Shot, mais video -> split -> push.

- Expected outcome: From Storyboard, explicitly choose a stored Sequence
  Storyboard draft, run a compatible video workflow, inspect the real payload
  and save the result as a durable versioned Sequence Video Draft. No split or
  Shot mutation occurs yet.
- Impact: `SEQGEN.SPLIT.1` currently has no durable generated Sequence video to
  analyze.
- Related ticket: `SEQGEN.VIDEO.1`
- Resolution: `Generate Sequence Video` added to Storyboard, per Sequence
  Storyboard draft. New `.../storyboard/video/workflows[...]` surface lists
  `kind="video"` workflows only, always anchors the chosen board as the
  mandatory `@Image1` (never displaced by optional casting references),
  reuses the exact same generation pipeline (`buildGenerationPayload`,
  Dynamic Batch, payload preview, job polling) as the image flow, and a
  dedicated `buildSequenceVideoPrompt` asks for one continuous video with
  cut-friendly transitions. `Save as Sequence Video Draft` copies a `done`
  job's output into a new `sequence_video_drafts` row (additive migration),
  playable via the existing `VideoFrameReviewPlayer`. Deleting a Sequence
  Storyboard draft is now blocked if a Sequence Video draft still
  references it. Validated end-to-end with a real ComfyUI job (SeedanceLow)
  from queue to saved, playable draft. No split, Shot, or Sequence Result
  mutation.
- Resolved or validated on: Implemented 2026-07-17, pending Codex review.

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

### FB-20260716-020 - First Generate click submits zero direct images

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Generation / Direct GPT Image inputs
- Context: Clicking `Generate Sequence Storyboard` from a direct GPT Image 2
  workflow after selecting three casting references.
- Original observation:

  > Le premier clic donne `Add at least one image...`; le second clic
  > fonctionne. L'URL avant le clic contient deja
  > `batchImages_6=asset-21-18,asset-26-16,asset-20-19`.
- Expected outcome: The first click must submit the selected direct image IDs;
  no manual retry should be required.
- Impact: The main generation action appears broken on first use.
- Related ticket: `SEQGEN.STORYBOARD.3-FIX5`
- Resolution: `SEQGEN.STORYBOARD.3-FIX5` implemented — `DynamicBatchFormSync`
  gained an optional `initialValue` prop, used only by the Sequence
  Storyboard generate page, so the hidden `batchImages_<nodeId>` input is
  server-rendered with the real selection instead of a literal empty
  string. The first click now works without depending on any client effect
  having run first; sessionStorage/URL sync for later reorder/remove is
  unchanged; classic Dynamic Batch workflows and every existing Shot/Asset
  caller are unaffected (prop defaults to empty). Awaiting hands-on
  confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: URL comparison confirms selection exists before the click; the
  second click succeeds after client sessionStorage initialization.

### FB-20260716-019 - Clear stale generation errors when changing Sequence

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Generation / Navigation
- Context: Repeating the Sequence Storyboard generation workflow after
  switching Sequence.
- Original observation:

  > Si je change de Sequence et refais les memes etapes, le message d'erreur
  > reapparait et je dois supprimer `&generationError=...` manuellement.
- Expected outcome: A previous generation error may be shown after its own
  failed submission, but must not survive navigation into a new Sequence,
  workflow, or fresh generation attempt.
- Impact: Stale error blocks/confuses the next generation workflow.
- Related ticket: `SEQGEN.STORYBOARD.3-FIX4`
- Resolution: `SEQGEN.STORYBOARD.3-FIX4` implemented — `generationError` is
  now excluded at the single shared point where the generate page builds its
  passthrough search params, so every internal form/panel that reuses them
  (text/scalar overrides, the Dynamic Image Batch picker) stops carrying the
  stale error forward. The error still displays on the page that produced
  it, and `storyboardRefs`/`batchImages_*`/other functional params are
  unaffected. Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Manual confirmation: removing `generationError` from the URL
  makes the current direct workflow operate correctly.

### FB-20260716-018 - Direct GPT Image inputs start with zero selected images

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Generation
- Context: Testing `GPT_STORYBOARD_demo.json` after
  `SEQGEN.STORYBOARD.3-FIX2`.
- Original observation:

  > Apres l'etape 7, je n'ai pas de bouton Update Preview. Dans Dynamic Image
  > Batch j'ai le message: Add at least one image to the direct GPT Image 2
  > inputs before generating.
- Expected outcome: Selected `storyboardRefs` should initialize the direct
  GPT Image 2 inputs and show the preview/update action immediately.
- Impact: The new direct mode is detected but cannot be used on first load.
- Related ticket: `SEQGEN.STORYBOARD.3-FIX3`
- Resolution: `SEQGEN.STORYBOARD.3-FIX3` implemented — `batchSelectedIds`
  now initializes from `storyboardRefs`/`availableImages` when
  `batchImages_<nodeId>` is absent, but only for the direct-repeatable-inputs
  mode (exposed via a new `mode` field on `detectDynamicBatchUiInfo`).
  Classic Dynamic Batch workflows keep their exact current behavior
  (absent parameter = nothing selected, no preselection). Once the user
  reorders/removes images in the panel, `batchImages_<nodeId>` becomes the
  source of truth. Zero `storyboardRefs` still blocks generation cleanly.
  Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Root cause confirmed in the Sequence generation page: direct
  mode was treated as ready but read only `batchImages_<nodeId>`.

### FB-20260716-017 - GPT Image 2 needs direct repeatable image inputs

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Generation / ComfyUI workflow mapping
- Context: Comparing the prepared GPT Image 2 storyboard workflows.
- Original observation:

  > Dans `GPT_STORYBOARD_03`, les images passent par un image batch. Dans
  > `GPT_STORYBOARD_demo`, elles sont connectees directement au node OpenAI
  > GPT Image 2. Le batch ne fonctionne pas correctement pour les references.
- Expected outcome: Inject each selected reference into direct
  `model.images.image_N` inputs when the workflow requires it, while retaining
  the existing batch mode for compatible workflows.
- Impact: GPT Image 2 must receive references as distinct semantic inputs for
  correct storyboard generation.
- Related ticket: `SEQGEN.STORYBOARD.3-FIX2`
- Resolution: `SEQGEN.STORYBOARD.3-FIX2` implemented — a dedicated
  `direct-repeatable-inputs` mode, detected purely from workflow structure
  (numbered `model.images.image_N` ports on an `OpenAIGPTImageNodeV2` node
  fed directly by `LoadImage` nodes, never by workflow name/id), clones the
  Load Image chain per selected reference and wires it straight to
  `image_1..image_N`, pruning unused ports when the selection shrinks. The
  existing Dynamic Batch mode (used by `GPT_STORYBOARD_03` and other
  workflows) is checked first and stays completely unchanged. Awaiting
  hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: `GPT_STORYBOARD_demo.json` uses direct numbered inputs;
  `GPT_STORYBOARD_03.json` uses `ImageBatchMulti` into `image_1`.
- 2026-07-16: `GPT_STORYBOARD_demo.json` was not yet present in this
  environment when the ticket started (only `GPT_STORYBOARD_03.json` was in
  the workflow library); the user uploaded it via Settings > Workflows
  (id=13) before implementation, so tests run against the real file.

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

### FB-20260715-015 - Generate a storyboard contact sheet at Sequence level

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Storyboard / Sequence Generation
- Context: Defining the next Storyboard workflow after the Shot-level
  generation workspace.
- Original observation:

  > dans Storyboard, je veux cliquer sur Generate Sequence StoryBoard,
  > choisir un workflow prepare, envoyer les images de casting selectionnees
  > et obtenir une image avec une vignette par Shot. Pour l'instant cette
  > image peut etre stockee a la Sequence.
- Expected outcome: Generate one editable, sequence-aware contact sheet from
  selected casting references and the full Sequence Generation Package, then
  save it explicitly with `Save as Sequence Storyboard Draft`.
- Impact: Establishes the visual storyboard foundation before sequence-level
  Seedance video generation, split review, and push to Shots.
- Related ticket: `SEQGEN.STORYBOARD.3`
- Resolution: `SEQGEN.STORYBOARD.3` implemented — CTA, workflow selector,
  editable `@ImageN` prompt built from the exact Dynamic Batch send order,
  Sequence Generation Package inclusion, generation, `Save as Sequence
  Storyboard Draft` with provenance read from the queued job (never page
  state), multiple versions retained, and the saved drafts now listed on the
  Storyboard workspace. Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Codex migration arbitration: a dedicated Sequence-level table
  and nullable sequence generation target are technically justified; existing
  `storyboard_images` is Shot-level and `sequence_results` stores editorial
  videos, so neither should be repurposed.
- 2026-07-15: User confirmed the explicit save button requirement.

### FB-20260715-011 - Make Storyboard generation action explicit

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Storyboard / Generation
- Context: Using the new Storyboard workspace after `SEQGEN.STORYBOARD.2`.
- Original observation:

  > je ne trouve pas de bouton generate dans la page de storyboard pour
  > choisir et executer un workflow

- Expected outcome: The Storyboard workspace should expose a clearly visible
  `Generate Storyboard` action for each Shot or an equally explicit primary
  generation action that leads to workflow selection and execution.
- Impact: The current small `Generate`/`Regenerate` links are not discoverable
  enough for the central workflow of the Storyboard workspace.
- Related ticket: `SEQGEN.STORYBOARD.2-FIX`
- Resolution: `SEQGEN.STORYBOARD.2-FIX` implemented — the small text link is
  replaced by a full-width `Generate Storyboard`/`Regenerate Storyboard`
  button on each Shot card in `StoryboardGrid.tsx`, same href and
  `storyboardRefs` transport, `Approve`/`Open Shot` kept distinct. Awaiting
  hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Product interpretation: promote the existing per-Shot route to
  a visually clear button/CTA; do not create a second generation mechanism.

### FB-20260715-012 - Expand Storyboard Asset reference lists by default

- Status: `TO VALIDATE`
- Date observed: 2026-07-15
- Area: Storyboard / Assets
- Context: Inspecting the `Storyboard Assets` section of the new workspace.
- Original observation:

  > par defaut expand chaque asset listé dans "Storyboard Assets"

- Expected outcome: Each listed Asset's reference-image list is expanded by
  default so the available images and selection controls are immediately
  visible.
- Impact: Requiring one disclosure click per Asset hides the primary visual
  input-selection workflow.
- Related ticket: `SEQGEN.STORYBOARD.2-FIX`
- Resolution: `SEQGEN.STORYBOARD.2-FIX` implemented — each Asset's
  `References (...)` `Collapsible` in `StoryboardAssetsPanel.tsx` now passes
  `defaultOpen`, confirmed rendered open in the initial SSR HTML for every
  Asset with references. Selection state, order, counters, and manual
  collapse remain unchanged. Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Keep one compact Asset row per cast Asset, but change only the
  disclosure default; preserve the existing selection transport and counters.

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

### FB-20260716-022 - Detect and crop storyboard panels automatically

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Storyboard
- Context: Reviewing a generated Sequence Storyboard contact sheet and wanting
  each vignette split out into its own Shot-level image instead of manually
  cropping each cell.
- Original observation:

  > MikAI reçoit des images composites contenant plusieurs vignettes, vues ou
  > sujets. L'objectif est de détecter automatiquement chaque vignette puis de
  > produire une image cropée indépendante par vignette. [...] L'utilisateur
  > souhaite extraire uniquement l'illustration de chaque cellule, sans le
  > texte descriptif éventuel.
  > (`.agents/opencv_storyboard_extraction_handoff.md`, exploratory handoff,
  > 2026-07-16)

- Expected outcome: An `Extract Storyboard Panels` action detects bordered/
  gutter-separated cells in a chosen Sequence Storyboard image with OpenCV,
  previews numbered rectangles with confidence, lets the user add/delete/
  resize/reassign/skip regions, then creates draft Shot-level storyboard
  images from the confirmed crops.
- Impact: Removes manual per-cell cropping after every Sequence Storyboard
  generation.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1`
- Resolution: `SEQGEN.STORYBOARD.EXTRACT.1` implemented — Python/OpenCV
  worker (`scripts/opencv_storyboard_extract.py`, border/gutter-band
  detection with a strict JSON contract), additive migration
  (`sequence_storyboard_extractions`, `sequence_storyboard_extraction_regions`,
  nullable `storyboard_images.extraction_region_id`), a dedicated
  `/storyboard/extract` review page with numbered overlay + confidence,
  per-region add/resize/reassign/skip/delete, a global inward padding option,
  and `Confirm & Extract` as the only action that crops and creates `draft`
  Shot-level `storyboard_images` rows (never approved, never touching
  `shots.approvedVideoPath` or existing references). Unassigned regions and
  Shots without a region are flagged, never silently paired. Awaiting
  hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Codex arbitration captured in
  `.agents/opencv_storyboard_extraction_handoff.md` and
  `.agents/current_task.md`: OpenCV worker and the additive migration are
  explicitly authorized for this ticket; illustration/text splitting and
  Shot mapping require explicit user confirmation, never automatic
  attachment; out-of-scope for this ticket: OCR, AI segmentation fallback for
  border-less panels, automatic approval, and any change to existing Shots,
  durations, approved videos, or references.

### FB-20260716-023 - Storyboard detector misses dark separators

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Storyboard extraction
- Context: Extracting panels from a real 3840x2160 Sequence Storyboard with
  eight Shots.
- Original observation: OpenCV returns one region covering the entire image;
  the separators and captions are black, while the detector mainly expects
  near-white gutters.
- Expected outcome: Detect dark, light, or mixed separators and propose the
  expected 4x2 layout for eight Shots when primary detection is ambiguous.
- Impact: The extraction tool cannot split the real storyboard contact sheet.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX1`
- Resolution: `SEQGEN.STORYBOARD.EXTRACT.1-FIX1` implemented — separator
  detection is now polarity-independent (edge density plus a
  border-sampled adaptive background-color estimate, reinforced by bounded
  Hough long-line detection), which correctly splits the real 8-Shot dark
  contact sheet into a clean 4x2 grid via primary detection (confidence
  0.25, all 8 illustration/caption splits detected). When primary detection
  is still ambiguous (0 or 1 region) and the Sequence's real Shot count is
  passed to the worker, a low-confidence `grid-fallback` grid is proposed
  instead — its regions are pre-filled with a proposed Shot but never
  auto-assigned, so `Confirm & Extract` cannot include them until reviewed
  and explicitly assigned one by one. A single Shot never gets a
  multi-cell fallback. Illustration/caption splitting now also recognizes
  dark caption backgrounds (white-on-black), not just light ones. No
  migration was needed (verified: `drizzle-kit generate` produces no SQL
  for the new `grid-fallback` enum value). Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Codex authorized a no-migration retake using polarity-
  independent line detection plus a low-confidence expected-Shot-count grid
  fallback. Manual confirmation remains mandatory before extraction.
- 2026-07-16: Verified against the real reported fixture (Sequence 32,
  Project 4, 3840x2160, 8 Shots) via the live dev server: all 8 regions
  detected and mapped 1:1 to Shots 81-88 in reading order; `Confirm &
  Extract` produced 8 real crops, each correctly excluding its dark
  caption band. Regression-tested against every previously-passing fixture
  (1/3/6-cell synthetic, the original 6-Shot white-gutter Sequence) plus
  two new fixtures built for this retake (an all-black-gutter sheet, and
  an adversarial two-tone sheet where the vertical gutter is white and the
  horizontal gutter is black within the same image) — the two-tone case
  correctly falls back to the low-confidence grid path rather than
  guessing, and reassigning one fallback region and confirming produced
  exactly one crop, leaving the other seven untouched.

### FB-20260716-024 - Use extracted panels as Shot thumbnails and references

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard extraction / Shots / Reference Images
- Context: Confirming extracted Storyboard panels that have been assigned to
  their corresponding Shots.
- Original observation:

  > pour le storyboard, j aimerai bien que les image extracted soit forcé dans
  > les thumbnail des shots, les images extract doivent aussi se retrouver
  > dans la parti reference image de chat shot associé

- Expected outcome: After a panel extraction is confirmed for a Shot, the
  extracted image is automatically used as that Shot's visible thumbnail and
  is also available in the associated Shot's `Reference Images` section.
- Impact: Extracted compositions would immediately become useful throughout
  the Shot workflow instead of remaining isolated as Storyboard drafts.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX2`.
- Resolution: `SEQGEN.STORYBOARD.EXTRACT.1-FIX2` implemented — confirming an
  extraction now creates a `shot_reference_images` row (role
  `storyboard_frame`) in the same transaction as the `storyboard_images`
  draft, sharing the exact same file path (no binary copy). The Storyboard
  grid's thumbnail selection now prioritizes an extraction-sourced draft
  over any other non-approved draft, so the extracted panel is the visible
  thumbnail without needing approval. An approved draft (any origin) still
  always wins. Deletion of the shared reference never removes the file
  while the originating draft (or any other reference) still points at it
  — verified for both the "still needed" and "genuinely orphaned" cases.
  Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: This changes the previous extraction boundary recorded in
  `FB-20260716-022`, where extracted drafts deliberately did not modify Shot
  references. A dedicated product and architecture decision is required.
- 2026-07-16: Ticket preparation must define whether an extracted image
  replaces an existing thumbnail, how the active thumbnail is chosen, which
  reference role and approval state it receives, and whether `Reference
  Images` points to the same stored file or creates a separate durable copy.
  Provenance and deletion behavior must remain consistent.
- 2026-07-16: Codex decision (`SEQGEN.STORYBOARD.EXTRACT.1-FIX2`): the
  reference shares the draft's file (no copy), role `storyboard_frame`,
  never auto-approved; a new nullable `source_storyboard_image_id` column on
  `shot_reference_images` (additive migration) records the shared-file
  provenance so deletion can verify the file is still needed before
  unlinking.
- 2026-07-16: This observation does not yet authorize automatic approval,
  schema/migration changes, storage changes, or writes to
  `shot_reference_images` outside a dedicated ticket.
- 2026-07-16: Codex authorized FIX2 to add a provenance link through an
  additive migration if needed, reuse the same crop file as storyboard draft
  and Shot reference, prioritize the extracted crop in the Storyboard
  thumbnail, and protect shared files from premature deletion. Interactive
  crop editing and extraction-context-preserving redirects are included.

### FB-20260716-025 - Tune detection and identify crop regions visually

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard extraction / Detection settings
- Context: Retrying extraction on a real Sequence Storyboard whose detected
  region count does not match its Shot count.
- Original observation: The user wants to expose detection parameters so they
  can rerun with different results, trigger the expected grid when the first
  detection is wrong, and use a distinct color for each crop shared with the
  corresponding Regions row.
- Expected outcome: Tunable Auto/Grid detection with bounded settings,
  versioned reruns, and unambiguous visual region mapping.
- Impact: Current failures require code changes and make crop assignment hard
  to read.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX3`
- Resolution: `SEQGEN.STORYBOARD.EXTRACT.1-FIX3` implemented — a collapsible
  "Detection Settings" section on the active extraction page exposes Mode
  (Auto / Grid fallback), optional Columns/Rows (with a "Use Shot count"
  button pre-filling the aspect-ratio-matched factorization), and Sensitivity
  (Low/Medium/High, mapped to server-side confidence-threshold profiles, not
  raw values sent by the client). "Run Detection Again" creates a new,
  separately-numbered extraction on the same source image — the previous
  one is always kept, never overwritten. Auto mode's fallback trigger is no
  longer limited to 0/1 detected regions: a wrong region count (verified
  live: a real 6-panel sheet forced into an 8-Shot Sequence correctly
  proposes a 4x2 grid instead of the mismatched 6) or a confidence below the
  chosen sensitivity's threshold (verified live: the real 8-Shot fixture
  keeps its correct primary result at Low/Medium but flips to grid-fallback
  at High) both now trigger the same low-confidence, always-editable grid
  proposal. All parameters actually used are persisted in the existing
  `paramsJson` column (no migration). Each region gets a distinct, stable
  color (by its own `orderIndex`, unaffected by sibling add/delete) shown
  identically on its preview overlay frame+label and its Regions list row
  swatch, always paired with the visible region number — never color alone.
  Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Codex authorized a UI-only parameter model using existing
  `paramsJson`; no migration is required. Auto fallback must trigger on count
  mismatch or low confidence, not only zero/one region.

### FB-20260716-026 - Apply extraction settings and region mappings in bulk

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard extraction / Detection settings / Regions
- Context: Rerunning detection after changing settings and editing several
  crop regions.
- Original observation: The user does not see the overridden Detection
  Settings reflected by `Run Detection Again` and wants `Update All` plus
  `Assign All` buttons.
- Expected outcome: Rerun uses and displays the submitted settings; all valid
  region rectangles can be saved together; all regions can be assigned in
  reading order to Shots with explicit confirmation.
- Impact: Repeated per-region actions make tuning and mapping slow and unclear.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX4`
- Resolution: `SEQGEN.STORYBOARD.EXTRACT.1-FIX4` implemented — root cause of
  the "settings not taken into account" perception: the Mode/Sensitivity/
  Columns/Rows fields always rendered their hard-coded defaults regardless
  of the active extraction's actual `paramsJson`, and the panel was
  collapsed by default, so a just-submitted override was never visibly
  reflected even though it WAS being applied correctly (verified again in
  FIX3). Now the Detection Settings panel opens by default and every field
  is pre-filled from the current extraction's own recorded parameters —
  verified live: an extraction run with Grid/4×2/High sensitivity shows
  exactly those values pre-selected when revisited. `Update All` (new
  `resizeAllExtractionRegions` action) reads every editable region's
  currently-displayed x/y/width/height and applies them in one transaction;
  a single invalid entry aborts the whole batch (verified live: a negative
  width in one of two regions left BOTH untouched, including the otherwise-
  valid one). `Assign All` (new `assignAllExtractionRegions` action)
  reapplies the reading-order-to-Shot-order mapping to every editable,
  non-skipped region — verified live: turns pending grid-fallback regions
  into `assigned` in one click, correctly skips a region the user had
  explicitly marked `skipped` (excluded from the reading-order recount, its
  own assignment left untouched), leaves Shots beyond the mappable region
  count flagged as still needing a region, and creates zero crops/drafts/
  references (row counts confirmed unchanged). Both bulk actions are
  idempotent and cleanly refuse once the extraction is no longer `ready`
  (e.g. already confirmed). No migration.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Codex authorized atomic server-side bulk actions without schema
  changes. `Assign All` must never extract files or create drafts/references.
- 2026-07-16: Bug found and fixed during validation of this ticket (unrelated
  to FIX3's own new logic, but only surfaced by testing an explicit
  Columns/Rows mismatch for the first time): `wrapWorkerFailure` in
  `src/lib/storyboardExtraction/opencvWorker.ts` threw its recovered worker
  error message from inside the very `try` block whose `catch` swallowed it,
  so every worker-side validation failure (e.g. "Columns x Rows does not
  match the expected Shot count") surfaced only as a generic "OpenCV worker
  failed to run." instead of the specific, actionable message. Fixed by
  moving the throw outside the parsing `try`.
- 2026-07-16: `SEQGEN.STORYBOARD.EXTRACT.1-FIX4` also switched the Detection
  Settings `Collapsible` to `defaultOpen` — verified via SSR HTML that the
  panel's fields (and their pre-filled values) are otherwise entirely absent
  from the rendered page until a client-side click, which is the direct
  cause of the "seems not applied" perception this feedback describes.

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

### FB-20260716-028 - Crop illustration without storyboard text

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Extraction
- Context: Reviewing generated contact sheets with image panels and optional
  title or caption bands.
- Original observation: The user reports that extraction also crops the
  description below each illustration and wants to tune the result from the
  interface using several generated examples.
- Expected outcome: Bounded presets for full cell, bottom-caption removal,
  top-header removal, and both, plus a manual mode and bulk application to
  editable regions.
- Impact: Text bands contaminate Shot storyboard thumbnails and require
  repeated manual correction.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX5`
- Resolution: `SEQGEN.STORYBOARD.EXTRACT.1-FIX5` implemented — a "Content
  Crop" control (Mode: Full cell / Remove bottom caption / Remove top
  header / Remove top and bottom text / Manual, plus bounded 0-45% Header/
  Caption inputs, presets pre-filling adjustable starting values) previews
  new rectangles for every editable, non-skipped, non-extracted region via
  `Apply to all regions` — a client-only preview, no DB write — and `Update
  All` (existing, unchanged) remains the sole, atomic persistence step.
  Verified live against the real 8-Shot fixture: `Remove bottom caption`
  produces a crop with the full illustration and the caption band fully
  excluded; `Remove top header` and `Remove top and bottom text` verified
  numerically and visually. Skipped and already-extracted regions are
  provably untouched by both the bulk preview and `Update All`. Settings
  persist in the existing `paramsJson` (no migration) and correctly
  pre-fill the controls (including the exact selected mode and percentages)
  on reload. Invalid mode/percentage values reject the whole batch with a
  clear error, same atomicity guarantee as an invalid rectangle.
  Awaiting hands-on confirmation.
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Codex authorized a no-migration implementation using existing
  region rectangles plus extraction `paramsJson`; the worker and generation
  runtime remain out of scope.
- 2026-07-16: Bug found and fixed during validation of this ticket:
  `confirmStoryboardExtraction` (from `SEQGEN.STORYBOARD.EXTRACT.1`) silently
  overrode a region's current height with the auto-detected
  `illustrationHeight` whenever a valid split existed — which is true for
  most real regions — meaning Content Crop's explicit choice was ignored at
  the final extraction step for any region FIX1's heuristic had already
  analyzed. Fixed by skipping that auto-override entirely once an
  extraction's `paramsJson` shows Content Crop has ever been used (a
  `contentCrop` key present, any mode) — the current rectangle then always
  wins. Extractions that have never touched Content Crop keep the original
  auto-detection behavior unchanged. Verified live: a `Remove top header`
  crop produced the exact configured height (832px) instead of the
  pre-existing auto-detected illustration height (715px) it would have used
  before this fix.

### FB-20260716-029 - Expose advanced storyboard detection diagnostics

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Extraction / Detection
- Context: Comparing Auto and Grid reruns on several generated contact sheets.
- Original observation: Auto and Grid appear to return the same result; the
  user wants to choose Otsu, Canny or Grid and directly tune raw thresholds,
  including values such as 0.8, with an explanation for every parameter.
- Expected outcome: Advanced Diagnostics exposes bounded raw parameters,
  accessible tooltips, the primary result, fallback reason and final engine.
- Impact: Detection quality cannot currently be understood or tuned reliably.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX6`
- Resolution: `Detection engine` now offers Otsu (Legacy, reintroduced from
  commit `4bc3db5`), Canny + Hough, and Exact Grid, plus a collapsed
  `Advanced Diagnostics` panel exposing every bounded raw worker parameter
  with English hover/focus tooltips and a `Custom threshold` overriding the
  Low/Medium/High presets. The worker's JSON contract now carries a
  structured `diagnostics` object (primary engine, detected count,
  confidence, threshold, fallback reason, final engine).
- Resolved or validated on: Implemented 2026-07-16, pending Codex review.

#### Follow-up notes

- 2026-07-16: Otsu and Canny/Hough are OpenCV algorithms, not AI models. They
  add no model weights or meaningful binary storage. Grid is geometric.

### FB-20260716-030 - Upload and delete Sequence Storyboard Drafts

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Sequence Storyboard Drafts
- Context: Testing extraction settings against several different contact
  sheets for the same Sequence.
- Original observation: The user wants to upload or delete Storyboards from
  Sequence Storyboard Drafts in order to keep several visuals for testing.
- Expected outcome: Validated local upload, visible independent drafts, and
  safe deletion that never breaks an existing extraction.
- Impact: Testing currently depends only on generated drafts already stored.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX6`
- Resolution: `Upload storyboard` and `Delete` added to Sequence Storyboard
  Drafts. Upload accepts PNG/JPEG/WebP only (extension AND magic-byte
  checked), 10MB max; each upload is a new file plus a new `draft` row with
  null job/workflow/prompt/references provenance. Delete requires
  confirmation, Sequence ownership, strict path containment, and is blocked
  with a clear error when the draft is already an extraction's source.
- Resolved or validated on: Implemented 2026-07-16, pending Codex review.

#### Follow-up notes

- 2026-07-16: Codex authorized storage writes only under the existing Sequence
  Storyboard upload root. No migration is needed; uploaded files consume their
  real file size, while detection reruns reuse the source image.

### FB-20260716-031 - Ratio-aware storyboard cropboxes

- Status: `TO VALIDATE`
- Date observed: 2026-07-16
- Area: Storyboard / Extraction / Content Crop
- Context: Normalizing extracted storyboard panels to production framing.
- Original observation: Add ratio presets 19:9, 2:35 and 2:38, Apply Ratio
  All, Lock ratio for homothetic resize, and a size multiplier.
- Expected outcome: Deterministic, idempotent ratio/scale previews calculated
  from stable cell bounds and persisted only through Update All.
- Impact: Manual crops cannot currently preserve a common framing ratio.
- Related ticket: `SEQGEN.STORYBOARD.EXTRACT.1-FIX6`
- Resolution: `Free`/`19:9`/`2.35:1`/`2.38:1` ratio presets and a `Size
  multiplier` (0.10-1.00) added to Content Crop, computed via a new pure
  pipeline (Content Crop -> ratio -> multiplier -> clamp) always from the
  same stable base rect. `Apply Ratio All` previews on eligible regions;
  `Update All` remains the only persistence. `Lock ratio` on the crop box
  keeps all 4 resize handles active but constrains resizing to the selected
  ratio, anchored on the opposite corner, without leaving source bounds.
- Resolved or validated on: Implemented 2026-07-16, pending Codex review.

#### Follow-up notes

- 2026-07-16: Product wording `19:9` is retained literally. Ratios `2:35` and
  `2:38` are interpreted as `2.35:1` and `2.38:1`.

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

### FB-20260717-044 - Make Generate Sequence Video more prominent

- Status: `TO VALIDATE`
- Date observed: 2026-07-17
- Area: Storyboard / Sequence video generation / CTA visibility
- Context: Looking for the action that generates the Sequence video from the
  Storyboard workspace.
- Original observation:

  > le bouton de generate sequence video de la partie storyboard n est pas
  > assez en evidence

- Expected outcome: The `Generate Sequence Video` action is visually prominent
  and clearly identifiable as the primary next step after preparing or
  selecting the Storyboard, without being confused with Shot-level generation.
- Impact: Users may overlook the Sequence-level video workflow or mistake the
  available generation actions, slowing the storyboard-to-video process.
- Related ticket: `UX.PRODUCTIVITY.POLISH.1`; related delivery:
  `SEQGEN.VIDEO.1`; related feedback: `FB-20260717-043`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-17: Ticket preparation should review CTA hierarchy, placement,
  label, iconography, disabled/loading states, and responsive behavior. Keep
  the action visually distinct from `Generate Shot` and explain any missing
  storyboard or workflow prerequisites near the button.
- 2026-08-03: Assigned to `UX.PRODUCTIVITY.POLISH.1` as a presentation-only
  retake of the existing per-Storyboard-Draft link; its destination and query
  parameters must remain byte-identical.
- 2026-08-03: Implemented under `UX.PRODUCTIVITY.POLISH.1` (Lot D). Each
  Sequence Storyboard Draft card now shows a bordered, icon-labelled primary
  action reading exactly `Generate Sequence Video`; its href/query params are
  unchanged (confirmed by diff — only surrounding markup/classes changed).
  Verified in browser: visually primary, keyboard-focusable, correct target
  URL, no overflow at 390×844. Awaiting user validation.

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

### FB-20260722-006 - Collapse Sequence Generation Package and reduce warnings

- Status: `TO VALIDATE`
- Date observed: 2026-07-22
- Area: Storyboard / Sequence Generation Package / UX
- Context: Reviewing the `Sequence Generation Package` information displayed
  in the Storyboard or Sequence generation workspace.
- Original observation:

  > ajouter un ticket pour collapse le "sequence generation package" et
  > supprimer les informations de warning

- Expected outcome: The `Sequence Generation Package` section is collapsed by
  default to keep the workspace focused, and non-actionable warning or status
  information is removed or moved behind an intentional details affordance.
- Impact: The current package and warning content add visual noise and make the
  primary generation actions harder to find.
- Related ticket: `UX.PRODUCTIVITY.POLISH.1`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-22: Ticket preparation should inventory every message in the package
  and classify it as actionable error, blocking warning, useful status, or
  informational noise. Do not hide errors or warnings that protect against an
  invalid generation; those may instead be summarized with an expandable
  details view.
- 2026-07-22: Preserve the package data and existing generation behavior. This
  observation authorizes a presentation change only, not changes to payload
  compilation, validation, schema, or generation runtime.
- 2026-08-03: Assigned to `UX.PRODUCTIVITY.POLISH.1`. The package will be
  collapsed by default on both existing surfaces, with non-blocking warnings
  moved into an explicit collapsed Diagnostics section rather than deleted.
- 2026-08-03: Implemented under `UX.PRODUCTIVITY.POLISH.1` (Lot E). Both
  surfaces (Sequence Detail, Storyboard) now render the package inside a
  closed-by-default `Collapsible` whose closed row shows only the title, shot
  count and known duration. The top-level warnings banner is removed; all
  warnings (inventoried: none are blocking — Apply/Copy are never gated on
  `pkg.warnings`) now live in a closed-by-default `Diagnostics (N)`
  sub-panel. `buildSequenceGenerationPackage` and its query params are
  byte-identical (confirmed by diff). Awaiting user validation.

### FB-20260722-005 - Correct Gaussian-to-image mapping and expose inputs

- Status: `RESOLVED`
- Date observed: 2026-07-22
- Area: Shot / Gaussian Camera / Generation UX
- Context: Testing Column 3 of the Gaussian Camera workspace with the real
  `GaussianQwen` default workflow.
- Original observation:

  > le workflow de la colonne de droite doit exposer les input, nomme avec
  > (Input), additionnelle du workflow
  >
  > l'output snapshot de la colonne 2 doit ce retrouver dans l'input
  > "Load Image Gaussian (Input)", ainsi l'input image de la colonne 1 devra
  > se retrouver dans l'input nommee "Load Image (Input)" du workflow de la
  > colonne 3

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

#### Follow-up notes

- 2026-07-22: The real dev workflow `GaussianQwen` confirms two image labels,
  `Load Image Gaussian (Input)` and `Load Image (Input)`, plus `Seed (Input)`
  and `Additional Prompy (Input)`. Node ids are fixture evidence only and must
  never be hard-coded.
- 2026-07-22: No migration, dependency, provider, job-runner, or polling change
  is authorized. Server-side revalidation and proof against the actual queued
  payload are mandatory.
- 2026-07-23: User validation passed. The exact snapshot/source mapping,
  additional Gaussian-to-image inputs, generation flow, and resulting output
  work as expected. Feedback closed after commit `41d7004`.
- 2026-07-22: Implementation complete. Mapping resolution proven order-
  independent (reversed JSON node-key order produces the identical mapping)
  with both pure tests and a harness run directly against the real stored
  `GaussianQwen` JSON. The canonical-patcher/image-injection payload pipeline
  was proven with a mock/harness of the real payload rather than a real Comfy
  Cloud submission, since this workspace's configured provider is Cloud with
  a real API key — a real submission would have incurred real Partner Node
  cost for a proof that a harness already covers, per the ticket's own
  explicit instruction not to spend on Cloud when a harness suffices. See
  `.agents/claude_report.md` for full proof detail and limits.
- 2026-07-22: Codex review returned `REVISE` (mapping correct, 3 targeted
  findings): patcher warnings on explicit overrides were only partially
  enforced (only the "could not be parsed" case blocked); that validation
  ran after the snapshot file was already written; and the UI/shared
  classifier still referenced the retired ordinal contract (`Input 1`/
  `Input 2`) or the wrong column name. Claude applied the retake: any
  warning from the canonical patcher on an explicit override now blocks
  generation outright, and that check now runs before any snapshot
  file/job work; Column 3 now shows the real `Load Image Gaussian (Input)`
  / `Load Image (Input)` labels; `classifyNonImageInputs` takes an
  optional caller-context so its diagnostic names "Gaussian-to-image" for
  Column 3 while Column 1's original wording is unchanged. Re-validated:
  12/12 pure tests, a real (zero-cost) end-to-end call proving an invalid
  override creates zero temp files and zero jobs, a re-verification that
  valid overrides still land byte-exact, and a real-browser check that the
  new labels render. Full detail in `.agents/claude_report.md` (retake
  section). Awaiting fresh Codex verdict.

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
- Original observations:

  > le bouton image file n est pas assez visible

  > les image sont au format carré, il faudrait qu elle fit par l'edge le plus
  > long, et ajouter notre feature de popup quand je met le curseur sur l'image

  > met la parti referenceBoard au dessus de la parti Creative board

  > met un popup helper à coté des titres de chaques field de reference board
  > et creative influences,qui dit à quoi sert chaque field, et ajoute un
  > exemple

  > mettre le check Approved for Style analysis et Approved for generation
  > use, dès la creation de la reference board

  > dans look dev bench, le from story est trom long [...] 20 mots maximum

  > en mode Neutral Benchmark, j aimerai bien un bouton random

  > ajouter dans les settings, la possiblilité de renseigner le workflow par
  > defaut pour le look dev bench

  > collapse la partie Test Content [...] "recent look tests" [...] "history"

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

#### Follow-up notes

- 2026-07-31: Reference Board multimodal analysis is deliberately excluded
  from this polish ticket. It remains a mandatory MVP closure gate under
  `STYLE.1.B.ANALYSIS.CORE` and `STYLE.1.B.ANALYSIS.UI`.
- 2026-07-31: The Look Development default is one workflow. Its persisted
  workflow kind determines the initial Image/Video mode; absent or stale
  settings retain the historical image-first fallback.
- 2026-07-31: From Story summarization must be deterministic and local. This
  UI preset must never trigger a hidden or paid LLM request.
- 2026-07-31: `STYLE.1.B.ANALYSIS.CORE` (backend/schema for Reference Board
  multimodal analysis) is implemented — see `.agents/claude_report.md`. This
  is backend-only: no UI exists yet, so the "Approved for Style analysis"
  badge remains not visibly actionable until `STYLE.1.B.ANALYSIS.UI` ships.
  Do not consider this observation resolved on the CORE ticket alone.
- 2026-08-01: Retake 12 (Cline / GLM-5.2) restored exact `next@16.2.9` and
  mounted the real React components in jsdom (15/42 proofs pass). The
  harnais could not intercept Server Action calls inside tsx-compiled `.tsx`
  files — tsx resolves `@/` imports internally before ESM `load` hooks can
  rewrite them. No product bug was found. Status remains `TO VALIDATE`.
- 2026-08-02: Retake 14 (Cline / GPT-5.6 Luna Pro) replaced the unstable
  `next dev` proof with a real Playwright pass against `next start`. Reference
  selection, explicit provider confirmation, one completed analysis Run,
  history inspection and Candidate Rule approval into the Working Draft were
  proven without losing an unsaved Direction Brief. The exact post-commit
  read-failure injection is deferred to
  `STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1`; status remains `TO VALIDATE`
  pending the user's manual pass.
- 2026-08-02: User confirmed the shipped Reference Analysis workflow works in
  the application. `FB-20260731-001` is now `RESOLVED`; the separate
  post-commit pending-sync hardening remains tracked under
  `STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1`.
- 2026-07-31: `STYLE.1.B.ANALYSIS.UI` (Reference Board Analysis Review
  Workspace) is implemented by Cline / Mimo v2.5 Pro. The UI now allows
  selecting references, confirming provider/model, launching multimodal
  analysis, reviewing observations, and approving candidate rules into the
  Working Draft. Visible usage remains reserved for manual user validation;
  do not mark RESOLVED until the user has tested the workflow end-to-end.

### FB-20260803-001 - Remove warnings from Sequence Shot-by-shot detail

- Status: `TO VALIDATE`
- Date observed: 2026-08-03
- Area: Sequence / Storyboard
- Context: Reviewing the collapsed Sequence Generation Package and its
  per-Shot compiled prompt details.
- Original observation: "supprimer du Shot-by-shot detail des sequence les warnings"
- Expected outcome: Per-Shot warning rows are no longer rendered inside
  Shot-by-shot detail. Global Diagnostics remains available and the underlying
  package/JSON warning data is unchanged.
- Impact: Repeated warnings make the per-Shot prompt inspection unnecessarily
  noisy when Diagnostics already provides the dedicated warning surface.
- Related ticket: `UX.SEQUENCE.STYLE.POLISH.1`
- Resolution: `s.warnings` no longer rendered under each Shot in
  Shot-by-shot detail (`SequenceGenerationPackagePanel.tsx`). Diagnostics,
  `pkg.warnings`, the compiler and Full JSON are byte-identical.
- Resolved or validated on: Implemented 2026-08-04, pending user validation.

#### Follow-up notes

- 2026-08-03: Presentation-only change. Do not modify warning generation,
  package compilation, Full JSON, Apply, Copy or generation behavior.

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

### FB-20260804-005 - Remove Storyboard diagnostics

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Storyboard / Sequence Generation Package
- Context: Reviewing the Storyboard workspace after Shot-by-shot warnings
  were removed.
- Original observation:

  > le diagnostic est toujours present, supprime moi carrement cette feature
  > de diagnostique pour le storyboard.
- Expected outcome: The Storyboard workspace and Sequence Storyboard prompt
  expose no non-blocking diagnostics or warning prose. Blocking generation
  errors remain explicit.
- Impact: Diagnostic text adds noise to the workspace and can contaminate the
  creative prompt sent to the image workflow.
- Related ticket: `SEQGEN.STORYBOARD.CASTING.FIX1`
- Resolution: `Diagnostics (N)` Collapsible removed from
  `SequenceGenerationPackagePanel.tsx`. `formatSequenceGenerationPackageText`
  gained an additive `includeWarnings` option (default `true`, byte-identical
  historical behavior); both Sequence Storyboard callers
  (`buildSequenceStoryboardGenerationContext` in `sequenceGeneration.ts` and
  the generate page) now pass `includeWarnings: false`, so the text queued to
  the image workflow never contains a `Warnings:` block. `promptResult.warnings`
  is no longer rendered under `Casting References`. Blocking errors (no
  casting, invalid workflow, batch, ownership, provider, queue) are untouched.
- Resolved or validated on: 2026-08-04 (implemented, proved; user validation pending)

#### Follow-up notes

- 2026-08-04: User explicitly accepted removing the shared non-blocking
  `Diagnostics` panel globally, including from Sequence Detail. Structured
  warning data may remain in the Full JSON/package contract.
- 2026-08-04 (retake round 1): Reverified live in both the Storyboard
  workspace and the Sequence Detail page (`SequenceGenerationPackagePanel`
  is the same shared instance in both) — neither renders any `Diagnostics`
  control.

### FB-20260804-006 - Remove internal Reference metadata from Storyboard prompts

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Storyboard / Sequence Storyboard Prompt
- Context: Inspecting the generated `Casting References` prompt block.
- Original observation:

  > enleve des prompts les informations du genre "Keyframe (Not approved for
  > generation)"
- Expected outcome: Each `@ImageN` line contains only the image label, Asset
  name and Asset type. Role, variant and approval metadata remain available
  to MikAI for provenance but are never sent as creative prompt text.
- Impact: Internal labels and approval states bias or confuse the image model.
- Related ticket: `SEQGEN.STORYBOARD.CASTING.FIX1`
- Resolution: `buildSequenceStoryboardPrompt.ts` now emits exactly
  `@ImageN — {assetName} ({assetType})` per casting line — `roleLabel`,
  `variantState` and `"(Not approved for generation)"` are never appended.
  `imageMappings` (returned by the same function) still carries all of that
  metadata unchanged for UI/snapshot/traceability. Verified against the
  Project 18 / Sequence 54 fixture (Azelle/character, Corporate Cargo
  Vessel/environment, The Golden Tail/vehicle) in both the pure prompt
  builder and a real browser render.
- Resolved or validated on: 2026-08-04 (implemented, proved; user validation pending)

### FB-20260804-007 - Initialize Dynamic Inputs from Storyboard Assets

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Storyboard / Sequence Generation / Dynamic Inputs
- Context: Selecting references in Storyboard Assets, then opening workflow
  `GPT_STORYBOARD` for Sequence Storyboard generation.
- Original observation:

  > si le workflow selectionne est un workflow dynamic input, alors precharge
  > par defaut dans le workflow les images selectionnees dans la partie
  > Storyboard Asset. Ajoute aussi un bouton "Add From Casting".
- Expected outcome: Both classic Dynamic Batch and direct-repeatable workflows
  initialize from the ordered Storyboard Assets selection when no explicit
  batch selection exists. `Add From Casting` restores missing casting images
  on demand without duplicates.
- Impact: Re-selecting the same images in two consecutive surfaces wastes time
  and makes `@ImageN` ordering error-prone.
- Related ticket: `SEQGEN.STORYBOARD.CASTING.FIX1`
- Resolution: The generate page's preload (previously restricted to
  `direct-repeatable-inputs`) now applies to any workflow with a ready
  Dynamic Input node (`dynamic-batch` included), whenever
  `batchImages_<nodeId>` is absent from the URL — verified against the real
  `GPT_STORYBOARD` (#12, classic Dynamic Batch) and `GPT_STORYBOARD_demo`
  (#13, direct-repeatable) workflows. `DynamicBatchImageList` gained an
  `Add From Casting` button (English label, Sequence Storyboard surface
  only via a new `showAddFromCasting` prop) that appends every missing
  casting reference in casting order, preserving the existing subset/order
  and never duplicating. Same update path as `Add Image` (state, URL,
  sessionStorage, same tick).
- Resolved or validated on: 2026-08-04 (implemented, proved; user validation pending)

#### Follow-up notes

- 2026-08-04 (retake round 1, P1-1, Codex review): removing a casting
  reference did not actually clean the Dynamic Batch's own stored
  selection — the URL param was reconciled only on the server, while
  `DynamicBatchFormSync` reads sessionStorage first at submit time, so a
  quick submit right after a removal could still send the removed image or
  be refused. Fixed with one shared pure helper
  (`pruneDynamicBatchIds`, `src/lib/comfy/pruneDynamicBatchSelection.ts`)
  used identically server-side and in `StoryboardAssetsPanel`'s
  same-tick URL + sessionStorage reconciliation. Proved live: batch
  A,B,C -> remove A from casting -> immediate Generate click -> exactly
  one job, B and C only, A never uploaded/queued.
- 2026-08-04 (retake round 2, P1, Codex review): a batch pruned/cleared
  down to zero was still reconverted back into the full casting preload on
  the next render/reload, because "empty" was represented by omitting the
  `batchImages_<nodeId>` param entirely — which this surface's own
  contract reads as "never touched, preload everything". Fixed by keeping
  the param (and its sessionStorage mirror) explicitly present but empty
  once the user has acted (`Clear Images`, or pruning down to zero),
  restricted to the Sequence Storyboard surface only via a new
  `preserveExplicitEmptySelection` prop on `DynamicBatchImageList`. Proved
  live across a full page reload (the strictest case): `Clear Images` ->
  reload -> still zero images, no Generate button until `Add From Casting`
  or a manual pick.

### FB-20260804-008 - Edit Storyboard casting references inline

- Status: `TO VALIDATE`
- Date observed: 2026-08-04
- Area: Storyboard / Generate Sequence Storyboard / Casting References
- Context: Adjusting image sources after entering Generate Storyboard.
- Original observation:

  > fait en sorte qu on puisse editer la selection direct depuis cette
  > fenetre, et non en renvoyant sur la page storyboard workspace en cliquant
  > sur "Edit Selection In storyboard Assets"
- Expected outcome: Casting references can be selected and deselected directly
  in the Generate Storyboard page with thumbnails and hover previews. The URL,
  Dynamic Batch, prompt preview and queued payload reconcile from one source
  of truth.
- Impact: The current back-and-forth navigation interrupts iteration and makes
  it easy to lose track of the effective casting/batch selection.
- Related ticket: `SEQGEN.STORYBOARD.CASTING.FIX1`
- Resolution: The "Edit Selection in Storyboard Assets" link is replaced by
  `StoryboardAssetsPanel` reused directly inside the Casting References card
  (same canonical selection logic: stable Asset-then-Reference order,
  `asset-{assetId}-{imageId}` ids, `storyboardRefs` via local
  `router.replace`, no scroll-to-top — plus a new `ThumbnailHoverPreview`
  popup on every thumbnail). A new optional `clearParamsOnChange` prop drops
  `jobId`/`generationError`/draft-save flash params on every casting change
  so a previous result is never shown as belonging to the new selection.
  Removing a casting reference now prunes it from every `batchImages_*`
  param; adding one never overwrites an explicitly customized batch. Proved
  live in a real browser against Project 18 / Sequence 54: unchecking a
  reference reconciled the URL, the `@ImageN` cards, the Dynamic Batch and
  the queued JSON payload in one render, without leaving the page.
- Resolved or validated on: 2026-08-04 (implemented, proved; user validation pending)

#### Follow-up notes

- 2026-08-04 (retake round 1, P1-1, Codex review): the previous round's
  batch pruning was SSR-only and did not actually reach the URL param nor
  the sessionStorage `DynamicBatchFormSync` reads first at submit — see
  `FB-20260804-007`'s follow-up note for the fix (`pruneDynamicBatchIds`),
  applied here via `StoryboardAssetsPanel`'s new `castingBatchSync` prop.
- 2026-08-04 (retake round 1, P1-2, Codex review): the "Suggested Text"
  box under "Suggested Inputs" could keep showing a stale casting-driven
  prompt after an inline casting/batch change, risking `Apply Text`
  freezing that stale text as a real override. Fixed with a `key`
  (`orderedReferenceIds.join(",")`, the exact casting+batch-order
  signature) on `<WorkflowRuntimeMappingPanel>` in `generate/page.tsx`, so
  it remounts fresh whenever that signature changes. An already-applied
  `textNode_*` override is never lost (`mapping.suggestedText` already
  equals the override when one is present) — only an unapplied local edit
  can be reset, proved live: typed override survives a casting change;
  no-override text refreshes to the new casting immediately.
- 2026-08-04 (retake round 1, P1-3, Codex review): `runSequenceGeneration`
  now refuses (before creating any job or calling the provider) a
  duplicate casting reference id, or one that is forged/unknown/belongs to
  a different Project — `storyboardRefs` ids were previously silently
  dropped by the shared `filterAvailableImagesBySelection` contract
  (correct for its other callers, left unchanged). Proved against a real
  second Project/Asset/Reference fixture, never cast in this Sequence.

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
- Original observation:

  > un selecteur Approved only / Latest generation dans Editorial ; Approved
  > only conserve par defaut ; Latest generation prend la video durable la
  > plus recente de la Shot Video Library pour chaque Shot ; apercu, timeline
  > et publication du Basic Sequence Result synchronises ; provenance exacte
  > enregistree dans le manifest ; aucun changement des approvals ; aucun
  > fallback silencieux ; verrou contre la double publication.
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

#### Follow-up notes

- 2026-08-06: Ticket explicitly scoped the new mode to the Editorial viewer
  and Publish Basic Sequence Result only — `Export Editorial JSON` and
  `Open in Advanced Editor`/OpenReel keep their existing approved/Editorial-
  based contract unchanged, and Shot approvals themselves are never touched
  by this feature.

- 2026-08-07: The approved retake extended `Open in Advanced Editor`/OpenReel
  to use the selected Approved only or Latest generation mode. Direct Export
  Editorial JSON keeps its legacy approved-only contract when no query
  parameter is provided. User validation confirmed both flows.

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
