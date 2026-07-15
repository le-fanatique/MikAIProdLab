# MikAI User Feedback Log

Last updated: 2026-07-15

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
