# MikAI User Feedback Log

Last updated: 2026-07-16

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

## Active Feedback

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

- Expected outcome: The `New Project` button uses the same readable theme
  colors and visual variant as other buttons representing the same kind of
  primary action.
- Impact: The current foreground/background color combination makes the action
  difficult to read and creates an inconsistent button hierarchy.
- Related ticket: None
- Resolution: None
- Resolved or validated on: None

#### Follow-up notes

- 2026-07-15: Ticket preparation should identify the intended shared button
  variant and verify contrast in every supported appearance mode, rather than
  applying an isolated hard-coded color.

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
