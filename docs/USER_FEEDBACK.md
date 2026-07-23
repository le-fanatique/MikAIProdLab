# MikAI User Feedback Log

Last updated: 2026-07-23

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

## Category Index And Consolidation Map

The entries below remain in their capture/history order so their original
context and development history are preserved. This index provides a
category-first view without deleting or silently merging feedback.

### Product shell, navigation, settings and visual system

`FB-20260715-001`, `FB-20260715-002`, `FB-20260715-003`,
`FB-20260715-004`, `FB-20260715-005`, `FB-20260715-006`,
`FB-20260715-007`, `FB-20260715-032`, `FB-20260715-034`,
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
`FB-20260718-008`.

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

## Active Feedback

### FB-20260723-001 - Define the Project Style V1 workspace

- Status: `IN PROGRESS`
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
  implementation not started.

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

- Status: `OPEN`
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
- Related ticket: `UX.2.SETTINGS.NAV.1` implemented the current navigation and
  should be reassessed if this feedback becomes a development ticket.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Captured as a request for real content-switching tabs, not a
  visual restyling of the existing anchor links.

### FB-20260715-002 - Use Text Primary for the LLM Chat logo

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Interpreted `text promary` as the existing `Text Primary` theme
  token. The exact LLM Chat logo/icon component should be located during
  ticket preparation.

### FB-20260715-003 - Fit the expanded chat column to the browser viewport

- Status: `OPEN`
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
- Related ticket: `UX.2.RIGHTPANEL.DISCLOSURE.1` and
  `UX.2.LLMCHAT.DISCLOSURE.1` should be reassessed if this becomes a ticket.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Captured as viewport-height behavior for the expanded column,
  not merely a request to make the chat content shorter.

### FB-20260715-004 - Keep only LLM Chat in the right column

- Status: `OPEN`
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
- Related ticket: `UX.2.RIGHTPANEL.DISCLOSURE.1` and
  `UX.2.LLMCHAT.DISCLOSURE.1` should be reassessed if this becomes a ticket.
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: This is a product-content request, not only a disclosure or
  default-collapsed-state adjustment.

### FB-20260715-005 - Use Text Primary for the LLM Chat title

- Status: `OPEN`
- Date observed: 2026-07-15
- Area: Right panel / LLM Chat / Theme
- Context: Viewing the `LLM Chat` heading inside the right column.
- Original observation:

  > le text "**LLM Chat**"dans cette colonne devrait etre en couleur text
  > primary

- Expected outcome: The `LLM Chat` heading uses the `Text Primary` theme token.
- Impact: The title should carry primary emphasis and remain clearly legible
  as the identity of the dedicated chat column.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: This targets the heading text and is distinct from
  `FB-20260715-002`, which targets the LLM Chat logo or icon.

### FB-20260715-006 - Expose typography controls in Custom Appearance

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must define which typography roles are safe
  to expose, how inheritance and reset work, and what limits preserve layout
  and readability. No specific implementation or dependency is authorized by
  this observation alone.

### FB-20260715-007 - Fix the unreadable New Project button color

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation should identify the intended shared button
  variant and verify contrast in every supported appearance mode, rather than
  applying an isolated hard-coded color.
- 2026-07-16: User refinement:

  > le mot "new project" de la colonne de gauche devrait avoir la couleur de
  > la text secondary

- 2026-07-16: `Text Secondary` is now the explicit desired token for the
  left-column label; implementation should still use the shared theme token,
  not a hard-coded color.

### FB-20260715-008 - Custom thumbnail backgrounds for Project and Sequence rows

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must clarify image and opacity persistence,
  storage ownership, accepted formats and limits, crop/position behavior,
  removal/reset, and text contrast. This observation does not by itself
  authorize a schema, migration, upload-storage, or package change.

### FB-20260715-009 - Show the video name as a frame player overlay

- Status: `OPEN`
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
- 2026-07-15: This observation does not authorize a schema, migration,
  generation-runtime, or dependency change without a dedicated ticket and
  architecture decision.

### FB-20260715-014 - ComfyUI port presets in Render Settings

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation must clarify whether a preset stores only a
  port or a complete named endpoint including protocol and host, where presets
  persist, how the active preset is selected, and how connectivity is tested.
  This observation alone does not authorize changes to the ComfyUI protocol,
  generation runtime, job runner, polling, schema, or dependencies.

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

- Status: `OPEN`
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
- Related ticket: None
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

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation should identify the canonical `Save Changes`
  button variant and reuse it for default, hover, focus, disabled, and loading
  states rather than copying hard-coded colors.

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

- Status: `OPEN`
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
- Related ticket: None; related feedback: `FB-20260716-034`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation should inventory every LLM-driven `Apply`
  action and identify the canonical existing variant (for example, the
  `Save Changes` treatment) before changing individual buttons. Prefer a shared
  component or theme token over hard-coded per-page colors.

### FB-20260716-038 - Split Asset Description and Notes enhancement

- Status: `OPEN`
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
- Related ticket: None
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

### FB-20260716-039 - Include Visual Identity in Generate Content Fill

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: Ticket preparation should confirm whether `Visual Identity` is
  appended, merged, or mapped to a dedicated prompt segment, and show the
  resulting text in the existing prompt preview before generation. Empty or
  missing values should leave the current behavior unchanged.

### FB-20260716-040 - Show an image zoom popup on hover

- Status: `OPEN`
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

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-16: The injected value should be a default only: preserve an
  explicit user edit during the current generation flow and validate units and
  bounds against the selected workflow. If the Shot has no duration or the
  workflow has no compatible input, retain the current behavior.

### FB-20260717-042 - Add Shot video references management

- Status: `OPEN`
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
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-17: Ticket preparation should define supported formats, size and
  duration limits, storage ownership, preview behavior, and safe deletion. A
  deletion must not remove a video that is referenced by another entity or
  workflow record; provenance should remain visible where the video is used.
- 2026-07-17: Reuse the existing reference-media conventions where possible,
  but keep video references distinct from approved Shot outputs and from
  editorial media. This observation alone does not authorize schema,
  migration, provider, or generation-runtime changes.

### FB-20260717-044 - Make Generate Sequence Video more prominent

- Status: `OPEN`
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
- Related ticket: `SEQGEN.VIDEO.1`; related feedback: `FB-20260717-043`
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-17: Ticket preparation should review CTA hierarchy, placement,
  label, iconography, disabled/loading states, and responsive behavior. Keep
  the action visually distinct from `Generate Shot` and explain any missing
  storyboard or workflow prerequisites near the button.

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

- Status: `OPEN`
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
- Related ticket: None
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

- Status: `OPEN`
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
- Related ticket: None
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

- Status: `OPEN`
- Date observed: 2026-07-23
- Area: Camera Lab / UI copy
- Context: Reading the label for the additional prompt input in Camera Lab.
- Original observation:

  > Il y a une erreur d'orthograph à "Additonal Prompy" dans la camera-lab .
  > ca devrait etre "Additonal Prompt"

- Expected outcome: The label is displayed as `Additional Prompt`.
- Impact: The current typo reduces interface quality and makes the workflow
  UI look unfinished.
- Related ticket: `CAMLAB.POLISH.1` / Gaussian Camera workflow inputs
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-23: The user's quoted target omits the second `i` in `Additional`;
  the canonical English UI spelling is `Additional Prompt`.

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
