# MikAI ProdLab — UX Ergonomics & Information Architecture Audit

Ticket: `UX.AUDIT.1`
Date: 2026-07-14
Baseline: commit `9149c01`, tag `pre-ux-audit-20260714`
Auditor: Claude (read-only), following `.claude/skills/ux-audit/SKILL.md` and
the review lens in `.claude/agents/mikai-ux-auditor.md`. No product code,
schema, dependency, or runtime file was modified during this audit.

## 1. Executive summary

MikAI ProdLab has real, working end-to-end coverage of the pipeline it
promises — Pitch → Story → Outline → Sequences → Shots → Assets →
Generation → Sequence/Film Results — and almost every screen individually
makes sense in isolation. The problem is not missing capability; it is that
capability has been added screen-by-screen without a corresponding pass to
consolidate navigation, deduplicate near-identical workflows, or stage
advanced controls behind progressive disclosure. Three patterns repeat
across the whole app and account for most of the friction:

1. **Triplicated navigation.** The same destinations (Story, Assets, a given
   Sequence, a given Shot) are reachable from the left Sidebar, the top
   ContextStrip tabs, and the right-hand Quick Links panel simultaneously —
   often on the very same screen, styled identically enough that a first-time
   user cannot tell which one is "the" navigation.
2. **Duplicate workspaces for the same data.** Story Workspace (`/story`)
   and Outline Builder (`/outline`) render nearly the same six sections
   (Story context, Outline editor, Outline generation, Sequence Builder,
   Sequence Structure list, and cross-links to each other) on two separate
   routes. Shot Detail exposes three separately-titled cards — Prompt
   Composer, Prompt Compiler, Shot Prompt — that all ultimately write the
   same `shot.shotPrompt` field, with an inline sentence of prose required
   to explain the intended order between them.
3. **Everything visible, all the time.** Settings is one continuously
   scrolling page with 11 independent `Card` sections and at least 7
   separately-labelled "Save Changes"-class buttons (measured on rendered
   HTML). The LLM Chat sidebar is permanently mounted in the right column on
   every single screen in the app, whether or not chat is relevant to the
   current task. Shot Detail alone stacks up to 10 `Card` sections in a
   single vertical scroll with no collapsing beyond a couple of `<details>`
   elements deep inside Story Workspace.

None of this is a case of "too many features" — the two-pillar test in the
brief (feels like making a film; preserves overview-to-detail granularity)
is mostly satisfied by the *data model* and the *route structure*. The gap
is in *navigation surface consolidation* and *staged disclosure of
secondary/advanced tools*, which is exactly what progressive disclosure,
grouping, and contextual actions are meant to fix without removing anything.

## 2. UX inventory by major screen

| Screen | Route | Primary purpose | Primary action | Notable secondary/tertiary actions |
|---|---|---|---|---|
| Projects list | `/projects` | Pick or create a project | Open a project | New Project |
| Project Detail | `/projects/[id]` | Project home / status overview | Open Story or a Sequence | Edit, Delete, Create/Render Film Result, Story Workspace, Assets, Outline, per-sequence links (all duplicated in Sidebar/RightPanel) |
| Story Workspace | `/projects/[id]/story` | Write pitch/story, generate outline+sequences+assets | Edit Story Foundation | Story Generation, Outline editor+generation, Sequence Builder, per-sequence "Generate (More) Shots", Extract Asset Drafts, Batch Enhance Asset Descriptions, Casting Coverage |
| Outline Builder | `/projects/[id]/outline` | Same as above, outline-centric | Edit Outline | Outline generation, Sequence Builder, per-sequence delete + inline context editor + shot list (near-duplicate of Story Workspace) |
| Assets list | `/projects/[id]/assets` | Browse/manage assets | Open an asset | Add Asset, Edit, Delete, Extract Asset Drafts (collapsible) |
| Asset Detail | `/projects/[id]/assets/[assetId]` | Edit one asset's data and generate its references | Save Details | Enhance Description (AI), Enhance Asset Bible (AI), Reference Images CRUD, Generate Content (image workflow), Appearances (cast-in list) |
| Sequence Detail | `/projects/[id]/sequences/[id]` | Manage shots in a sequence, editorial pass | Add/insert a Shot | Sequence context editor, per-shot Edit/Delete, Insert Shot Here/Insert New Shot rows, Basic Editorial vs OpenReel Advanced entry points, Sequence Result viewer |
| Shot Detail | `.../shots/[id]` | Assemble everything a shot needs to generate | Generate Content | Casting, Prompt Composer, Prompt Compiler, Shot Prompt form, Prompt Timeline (+ segment editor + preview), Reference Images, Generation Jobs, Approved Output player |
| Shot Prompt Workspace | Cards inside Shot Detail (no separate route) | Produce the final `shotPrompt` text | Save Shot Prompt | Draft from context (Composer), full compiler (Compiler), timed segments (Timeline) — three tools, one field |
| Asset/Shot Generation | Slide-over panel opened via `?generation=open` on Asset/Shot Detail, or `/workflows` sub-route | Run a ComfyUI workflow | Generate | Workflow selector, per-node image/scalar/text inputs, job status, attach-to-reference |
| Settings | `/settings` | Configure LLM, ComfyUI, Nomenclature, OpenReel, FFmpeg, Appearance | Save Changes (×N) | Appearance/theme editor, LLM provider ×2 (main + chat), Chat system prompt library, ComfyUI connection, Workflow Library summary, Generation Defaults, Nomenclature templates, OpenReel sidecar URL + MikAI public base URL, FFmpeg health check |
| Workflow Library | `/settings/workflows` | Manage saved ComfyUI workflow definitions | Add/Edit workflow | Per-workflow badges (kind/output), delete |
| Right Panel | Persistent right column on every route | Contextual quick links + always-on chat | Follow a quick link | Full LLM Chat (image generation, model picker, save-as-reference) mounted underneath regardless of context |
| LLM Chat | `SidebarLLMChat`, bottom of Right Panel | Freeform chat / image generation assistant | Send a message | Attach file/image, generate image, save image as reference (context-dependent) |

## 3. Cross-application findings (transversal problems)

### 3.1 Triple navigation surfaces for the same destinations — `Critical`

**Evidence.** `src/components/Sidebar.tsx` renders a full project tree
(Story, Sequences → Shots, Assets, "later" placeholders). `src/components/
ContextStrip.tsx` renders a second, horizontal tab bar for the same project
(`Overview`, `Story`, `Assets`, `Project Style (disabled)`, or sibling-shot
tabs inside a Shot). `src/components/RightPanel.tsx` renders a *third* set
of "Actions"/"Quick Links" for the same context (`+ New Sequence`, `Story`,
`Assets`, `Edit Project`, plus a live re-listing of every sequence/shot).
On Project Detail (`src/app/projects/[projectId]/page.tsx`), the `PageHeader`
actions *also* add `Story Workspace` and `Assets` links (lines 125–136), and
a fourth "Production" section at the bottom repeats `Story Workspace` and
`Outline` as cards (lines 512–537). That is up to **4 independent places**
offering a link to Story Workspace visible on one page load.

**User impact.** No single element reads as "the" navigation. New users
have to learn three different navigation idioms (tree, tabs, quick-link
list) that are visually similar (all `text-[#6e767d] hover:text-[#a4abb2]`
on dark rows) but behave slightly differently (Sidebar expands in place,
ContextStrip is route-based tabs, RightPanel is a flat action list).
Maintaining three navigation surfaces in lockstep is also a standing
maintenance risk — nothing enforces that new routes are added consistently
to all three.

**Recommendation.** Pick one primary navigation surface (Sidebar is the
richest and already correct) and demote the other two to a single
job: ContextStrip becomes purely "siblings at this exact level" (which it
already does well for shot-to-shot switching), and RightPanel drops
its now-redundant "Actions" quick-links section, keeping only content that
doesn't exist anywhere else (contextual metadata, and non-navigational
actions like "+ New Shot" where no other affordance exists on the page).

**Risk of the fix.** Low technically (presentation-only), but requires care
to avoid silently removing the *only* affordance for an action if it turns
out RightPanel is sometimes the sole place a link exists.

**Effort.** `Medium Redesign` (touches three shared shell components used
on every route).

**Confidence.** High — verified directly in all three component source
files plus Project Detail page source.

### 3.2 LLM Chat is always mounted, regardless of relevance — `High Friction`

**Evidence.** `RightPanel.tsx`'s `RightPanelShell` wrapper unconditionally
renders `<SidebarLLMChat />` beneath whatever contextual content is shown,
in every one of the five branches (Settings, Shot, Sequence, Assets,
Project, Projects-list). `SidebarLLMChat.tsx` is a large (200+ line, still
growing) component with file/image attachment, image generation with model
picker, and "save as reference" — a fully-featured secondary application
surface, not a lightweight utility.

**User impact.** Permanent vertical space is spent on a tool most sessions
will not use on most screens (e.g. while editing Nomenclature templates in
Settings, or browsing the Projects list). It also raises the perceived
complexity of every screen before a user has done anything.

**Recommendation.** Collapse the chat to a slim launcher/tab by default
(consistent with the existing `Collapsible` pattern already used elsewhere
in the app, e.g. `OpenReel Bridge panel` per `docs/PROJECT_STATE.md`),
expanding on demand or when the user has an active conversation.

**Effort.** `Small Refactor` (the chat component itself is untouched; only
its host shell needs a collapsed/expanded state).

**Confidence.** High.

### 3.3 Near-duplicate workspaces: Story vs. Outline — `Critical` /
`Structural Opportunity`

**Evidence.** `src/app/projects/[projectId]/story/page.tsx` and
`src/app/projects/[projectId]/outline/page.tsx` both render, in slightly
different order and depth: a Story/Pitch context block, `OutlineEditorForm`,
`OutlineGenerationPanel`, `SequencesGenerationPanel`, and a rendered list of
sequences with their shots. Story Workspace additionally has Story
Foundation/Generation, Assets extraction, and Casting Coverage; Outline
Builder additionally has per-sequence `DeleteButton` and
`SequenceContextEditor` inline. Each page links to the other
("Open Outline Builder →" / "Open Story Workspace →"), and Sidebar links to
both as if they were distinct top-level modules.

**User impact.** A user trying to "write the story" genuinely cannot tell
whether Story Workspace or Outline Builder is the correct starting point —
both let you edit the outline and generate sequences. This directly works
against pillar 2 of the brief (clear overview-to-detail granularity):
instead of one clear rung on the ladder (Story → Outline → Sequences), there
are two competing surfaces for the same rung.

**Recommendation.** Merge into a single Story/Outline workspace with
internal sections (this is already 90% true — Story Workspace is a
superset), and either remove the separate `/outline` route or turn it into
a focused zoom-in view (e.g. "Outline only, distraction-free") reached
*from* Story Workspace rather than being a parallel entry point from
Sidebar.

**Risk.** Medium — some flows may specifically link to `/outline` (e.g.
"Open Outline Builder →" from Story), so removal needs a redirect or a
deliberate decision to keep it as a zoomed sub-view.

**Effort.** `Structural Redesign`.

**Confidence.** High — verified against both full page source files.

### 3.4 Three tools, one field: Prompt Composer / Compiler / Shot Prompt —
`High Friction`

**Evidence.** `src/app/.../shots/[shotId]/page.tsx` renders, in sequence,
`Card title="Prompt Composer"`, `Card title="Prompt Compiler"`, and
`Card title="Shot Prompt"`, immediately preceded by an explanatory sentence
in the page itself: *"Draft from context via Prompt Composer → save as Shot
Prompt → optionally build a timed Prompt Timeline for video workflows."*
(line 739–741). All three write toward the same `shot.shotPrompt` /
`promptSegments` data.

**User impact.** Needing an inline instruction sentence to explain the
intended order between three adjacently-stacked cards is itself the
symptom: the UI cannot explain its own workflow through layout and
affordance alone. New users will likely try the first card, get a
result, and not understand why a second and third card exist for
"the same thing."

**Recommendation.** Either (a) merge into one "Shot Prompt" card with the
Composer and Compiler as internal tabs/steps of a single guided flow, or
(b) keep them separate but make the *dependency* structural — e.g. grey out
Prompt Compiler and Prompt Timeline until a Shot Prompt exists, with a
one-line "Start here" affordance on Prompt Composer only.

**Effort.** `Medium Redesign` (no data-model change, but real interaction
work).

**Confidence.** High — verified against Shot Detail page source and the
inline hint text.

### 3.5 Settings is one long undifferentiated scroll — `High Friction`

**Evidence.** `src/app/settings/page.tsx` renders 11 `Card` sections
top-to-bottom with no tabs/sub-navigation: Appearance, Language Model, Quick
Setup, Chat LLM Provider, LLM Chat System Prompt Library, ComfyUI
Connection, Workflow Library, Generation Defaults, Nomenclature/Code
Templates, Advanced Editor (OpenReel + MikAI public base URL, two forms in
one card), Bundled FFmpeg. A live render of `/settings` contains **7**
occurrences of "Save Changes"-class button text and 2 of "Save Defaults" —
i.e. at least 7 independently-scoped save actions on one page. `RightPanel`
in the Settings context only offers two quick links (`General`,
`Workflow Library`), understating the page's real structure.

**User impact.** Finding a specific setting (e.g. "OpenReel sidecar URL")
requires scrolling past LLM, Chat, ComfyUI, and Nomenclature sections first.
Because every section persists independently, a user cannot reasonably
answer "did I save everything?" without re-scanning the whole page for
stray unsaved-state indicators.

**Recommendation.** Introduce real sub-navigation (tabs or an in-page
anchored index) matching the section labels already present
(`Appearance`, `Language Model`, `LLM Chat`, `ComfyUI`,
`Generation Defaults`, `Nomenclature`, `Integrations`, `Technical`), and
have RightPanel's quick-link list match it exactly instead of only two
entries.

**Effort.** `Small Refactor` (labels/structure already exist; this is
primarily an in-page navigation add, not a rewrite).

**Confidence.** High — verified against full page source and live SSR HTML
(button-text counts).

### 3.6 Reference-image role vocabulary is large and only partially
contextual — `Moderate Friction`

**Evidence.** `docs/PRODUCT_VISION.md` documents the intended role set
(first frame, last frame, character, environment, background, style,
camera, motion, rhythm, keyframe, storyboard, continuity anchor) — a
12-role vocabulary presented per reference image on both Asset and Shot
reference-image forms.

**User impact.** Without category grouping in the picker itself (grouping
exists in the shared role catalog per prior session history, but the raw
count is still large for a single-select field), a first-time user has to
learn a full cinematography-adjacent vocabulary before uploading their
first reference image.

**Recommendation.** Confirm the picker groups roles (Frame/Timeline,
Subject/Environment, Style/Direction, Asset-specific, Legacy) as `<optgroup>`
sections — if so, this finding downgrades to `Polish`; if the flat list
is what actually renders, promote grouping as a `Quick Win`.

**Effort.** `Quick Win` (grouping mechanism already exists in
`src/lib/referenceImageRoles.ts` per this project's own history; this is a
verification item, not new work).

**Confidence.** Medium — based on documented product vocabulary and prior
session history rather than a fresh read of the current picker markup in
this audit pass (see Limitations, §9).

### 3.7 Empty states are inconsistent in warmth and next-step clarity —
`Polish`

**Evidence.** `EmptyState` component is used consistently for genuinely
empty collections (no sequences, no assets), but several "soft empty"
situations are handled ad hoc with a one-line italic sentence instead
(e.g. Story Workspace's `<p className="text-sm text-[#4b5158] italic">No
assets yet.</p>`, Outline Builder's inline "No pitch yet." text) rather than
the shared `EmptyState` treatment used two sections above it on the same
page.

**User impact.** Minor visual inconsistency; not blocking, but it means the
"what do I do first" signal is stronger in some empty sections than others
on the very same screen.

**Recommendation.** Standardize on `EmptyState` (or a lighter inline
variant of it) for every zero-data section.

**Effort.** `Quick Win`.

**Confidence.** High.

## 4. Screen-by-screen findings

### 4.1 Project Detail (`src/app/projects/[projectId]/page.tsx`)

**Finding P-1 — Film Result leads the page, ahead of Story/Sequences.**
*Severity:* `Moderate Friction`. *Effort:* `Quick Win`.
Evidence: the very first `SectionLabel` after `PageHeader` is `"Film
Result"` (line 152), rendered even as an `EmptyState` for a brand-new
project with no sequences yet, before `Overview` (pitch/story, only shown
`if (project.pitch || project.story)`) and before `Sequences`. Impact: a
new project's very first screen leads with "no film result yet" — an
absence of the final output — rather than an invitation to start writing.
Recommendation: reorder so Overview/Sequences lead, with Film Result moved
below (or shown only once a Sequence Result exists), OR reframe the
project-empty state as an explicit "Get started: write your pitch" prompt
above the (still-present) Film Result section. Confidence: High (direct
source read, lines 113–166).

**Finding P-2 — Duplicated Story/Assets links, 4 places on one page.**
*Severity:* `High Friction`. *Effort:* covered by §3.1 shell-level fix.
Evidence: `PageHeader actions` (125–136), bottom "Production" cards
(512–537), Sidebar, and RightPanel all separately link to Story Workspace
and/or Assets from this single page. Confidence: High.

**Finding P-3 — Sequence cards show rich detail but "Assets" is one flat
summary line.** *Severity:* `Polish`. *Effort:* `Quick Win`.
Evidence: Sequences render as detailed cards with mood/location per row
(447–487); Assets renders as one summary sentence + a single link (490–510)
regardless of how many/what type of assets exist. Given the pillars call
for granularity down to Asset level, a brief type breakdown (matching what
Story Workspace already computes as `assetCountByType`, lines 163–166)
would bring Assets to visual parity with Sequences on this page.
Confidence: High.

### 4.2 Story Workspace / Outline Builder

Covered primarily in §3.3 (transversal). Additional screen-specific note:

**Finding S-1 — Story Workspace is a single very long page (6 major
sections, several with nested `<details>`).** *Severity:* `Moderate
Friction`. *Effort:* `Small Refactor`.
Evidence: Story Foundation → Story Generation → Outline (editor +
generation) → Production Structure (with per-sequence nested "Generate
(More) Shots" `<details>`) → Assets (with two more nested `<details>`:
Extract Asset Drafts, Batch Enhance Asset Descriptions) → Casting Coverage.
Six top-level sections, three of which contain their own collapsible
sub-tools. Impact: reasonable for a "mission control for a project's whole
narrative", but the vertical scroll is very long for what a returning user
usually wants (check on one specific sequence or asset). Recommendation:
keep as-is functionally, but consider anchored in-page navigation (matching
§3.5's recommendation pattern for Settings) so a returning user can jump
directly to "Assets" or "Production Structure" without scrolling past Story
Foundation/Generation every time. Confidence: High.

### 4.3 Assets list (`src/app/projects/[projectId]/assets/page.tsx`)

**Finding A-1 — Clean, appropriately scoped screen.** *Severity:* none
(positive finding). Table view, type counts, single "+ Add Asset" primary
action, collapsible "Extract Asset Drafts" for the AI-assisted path. This
screen is a good model for what other list screens in the app should look
like — cite as a pattern to replicate rather than a problem to fix.

**Finding A-2 — "+ Add Asset" button uses the same unmapped literal-color
pattern already fixed elsewhere in `UX.VISIBILITY.1` for other buttons.**
*Severity:* `Polish`. *Effort:* `Quick Win`.
Evidence: line 82, `className="rounded bg-[#e7e9ec] text-[#0d0e10] ..."` —
the exact literal-text-on-remapped-background pattern that
`UX.VISIBILITY.1` just fixed for the Chat/Ollama Settings "Save Changes"
buttons (see `.agents/claude_report.md` history for that ticket). This
button was not in `UX.VISIBILITY.1`'s named scope and was left untouched
there by design; flagged here for a follow-up pass since it is the same
root cause (a literal `text-[#0d0e10]` never remapped by `globals.css`
under a Custom theme). Recommendation: reuse the Border/Border-strong
pattern already applied to the other two forms. Confidence: High (same
verified defect class, different file).

### 4.4 Asset Detail (`src/app/projects/[projectId]/assets/[assetId]/page.tsx`, from this session's own prior implementation history plus a direct SSR check at `/projects/2/assets/1`)

**Finding AD-1 — Five stacked concerns compete for the same visual weight.**
*Severity:* `Moderate Friction`. *Effort:* `Small Refactor`.
The Details card (5 text fields including the whole Asset Bible), Enhance
Description AI panel, Enhance Asset Bible AI panel, Reference Images, and
Generation are all full-width `Card`s of roughly equal visual prominence.
For a first-time asset (no description, no references yet), the two AI
enhance panels and the generation section are equally "in the way" before
there is anything to enhance or generate from. Recommendation: this is a
canonical progressive-disclosure candidate — collapse "Enhance Description"
/"Enhance Asset Bible" until there is at least a Description/Notes seed to
work from (both AI actions already refuse to run without one, per this
session's `AI.ASSET.BIBLE.1` implementation — the UI doesn't yet reflect
that same precondition visually). Confidence: Medium-High (based on this
session's own implementation work on `AssetBibleEnhancePanel` plus a fresh
SSR check).

### 4.5 Sequence Detail

**Finding SD-1 — Two parallel editorial systems presented at equal
weight.** *Severity:* `Structural Opportunity`. *Effort:* `Structural
Redesign` (already flagged as a deliberate, tracked product decision).
Evidence: `docs/PROJECT_STATE.md` explicitly documents Basic Editorial
("main entry") and OpenReel Advanced ("Open in Advanced Editor") as two
separate paths that "produce the same type of sequence output." This is
intentional product design, not an oversight, but from a pure ergonomics
lens a first-time user on Sequence Detail has to understand *why* there are
two editors before picking one. Recommendation: no change to the dual-path
architecture (explicitly out of this audit's authority — editorial/OpenReel
core is hard-scoped as untouchable), but consider a short inline
explainer ("Basic Editorial: quick trims, gaps, publish. Advanced: full NLE
via OpenReel.") directly at the point of choice, if not already present.
Confidence: Medium (based on `PROJECT_STATE.md` + this session's own recent
`Insert Shot Here` work on this exact page, not a fresh full-file read this
pass).

### 4.6 Shot Detail

Covered primarily in §3.4 (transversal — Composer/Compiler/Shot Prompt
triplication). Additional finding:

**Finding SH-1 — Ten Cards in one uninterrupted scroll, zero collapsing.**
*Severity:* `High Friction`. *Effort:* `Medium Redesign`.
Evidence: Approved Output, Narrative Context, Continuity, Camera, Casting,
Prompt Composer, Prompt Compiler, Shot Prompt, Prompt Timeline, Segment
Timeline Preview, Reference Images, Generation Jobs — up to 12 `Card`
instances possible on one Shot Detail render (some conditional), none
collapsible. This is the single densest screen inspected in this audit.
Recommendation: group into 3 tiers with the later tiers collapsed by
default: Tier 1 (always open) = Narrative Context + Casting; Tier 2 (open
once Tier 1 has content) = Prompt workspace (post-3.4 merge); Tier 3
(collapsed by default, expand on demand) = Continuity, Camera, Reference
Images, Generation Jobs history. Confidence: High (direct source read of
the full page file).

### 4.7 Settings / Workflow Library

Covered in §3.5. Workflow Library itself (`/settings/workflows`) was
verified live (HTTP 200) but not read in full source this pass — see
Limitations.

### 4.8 Right Panel / LLM Chat

Covered in §3.1 and §3.2.

## 5. Simplification opportunities (no capability removed)

- Collapse LLM Chat to a launcher by default (§3.2) — capability unchanged,
  just not permanently mounted.
- Merge Story Workspace and Outline Builder into one workspace with
  anchored sections (§3.3) — every existing action stays reachable.
- Merge or sequence-gate Prompt Composer / Compiler / Shot Prompt (§3.4) —
  no tool removed, just an explicit dependency instead of three
  equal-weight cards.
- Add anchored in-page navigation to Settings and Story Workspace (§3.5,
  §4.2) — pure navigation aid, zero functional change.
- Collapse Asset Detail's AI-enhance panels until their preconditions are
  met (§4.4) — the panels already refuse to run without a Description/Notes
  seed; the UI should reflect that up front instead of always showing an
  active-looking button.
- Collapse Shot Detail's lower-priority cards (Continuity, Camera,
  Reference Images, Generation Jobs) by default (§4.6) — all remain one
  click away.

## 6. Durable MikAI UX principles

These are meant to be reusable guardrails for future tickets, not just
findings:

1. **One destination, one door.** Every route should be reachable from
   exactly one primary navigation surface at a time. If a second surface
   also needs to reach it, that surface should be doing something the first
   one cannot (e.g. ContextStrip's sibling-shot switching), not a plain
   duplicate link.
2. **A workspace owns its rung on the ladder.** Story, Outline, Sequence,
   and Shot should each correspond to exactly one primary screen. If two
   screens both claim to "do" the same rung (Story vs. Outline today), that
   is a design defect, not two features.
3. **Advanced and AI-assisted tools default to closed, not equal-weight.**
   Anything that requires existing data to be useful (AI enhance panels,
   Prompt Compiler, generation job history) should start collapsed until
   its precondition is met, exactly like the existing `Collapsible`/
   `<details>` pattern already used for "Extract Asset Drafts" — that
   pattern should be the default for *every* secondary tool, not an
   exception.
4. **Explain relationships through layout, not prose.** If a page needs an
   inline sentence to tell the user "use A, then B, then optionally C," that
   is a signal to restructure A/B/C into a guided flow or a single tool
   with steps, not a signal to write a better sentence.
5. **The film-making frame beats the CRUD frame.** Screens should be judged
   by whether they read as "directing a shot" / "building a sequence," not
   "filling out a settings form." Card titles like "Prompt Compiler" or
   "Casting" already lean cinematic; card titles like "Generation Defaults"
   or "Nomenclature" are necessary but should visually recede (Settings,
   Technical) rather than compete with creative screens for visual weight.

## 7. Prioritized roadmap

### `UX.1` — Immediate decluttering and hierarchy fixes

- Reorder Project Detail so Overview/Sequences lead over Film Result for
  new/low-activity projects (§4.1, P-1).
- Fix the remaining unmapped literal-color button on Assets list "+ Add
  Asset" (§4.3, A-2) — same defect class as `UX.VISIBILITY.1`.
- Standardize empty-state treatment across Story Workspace/Outline Builder
  (§3.7).
- Collapse Shot Detail's Continuity, Camera, Reference Images, and
  Generation Jobs cards by default (§4.6, SH-1).
- Collapse Asset Detail's AI-enhance panels until Description/Notes exist
  (§4.4, AD-1).

### `UX.2` — Shared interaction-pattern consolidation

- Collapse LLM Chat to a launcher in `RightPanel` by default (§3.2).
- Remove RightPanel's redundant "Actions" quick-link duplication of
  Sidebar/ContextStrip, keeping only genuinely unique content (§3.1).
- Add anchored in-page navigation to Settings matching its real section
  list, and update RightPanel's Settings quick-links to match (§3.5).
- Add anchored in-page navigation to Story Workspace (§4.2, S-1).
- Verify/confirm reference-image role grouping in the actual picker
  markup (§3.6) and promote or downgrade that finding accordingly.

### `UX.3` — Structural workspace redesigns

- Merge Story Workspace and Outline Builder into one workspace, or turn
  `/outline` into an explicit zoomed sub-view reached from Story rather
  than a parallel Sidebar entry (§3.3).
- Merge or sequence-gate Prompt Composer / Prompt Compiler / Shot Prompt
  into a single guided prompt-building flow (§3.4).
- Revisit the three-navigation-surface pattern (Sidebar / ContextStrip /
  RightPanel) app-wide once `UX.2`'s consolidation within RightPanel has
  shipped and been used for a while (§3.1, full resolution).

## 8. Three candidate screens for redesign

1. **Shot Detail** — highest density observed (up to 12 cards), contains
   the clearest internal duplication (Composer/Compiler/Shot Prompt), and is
   the screen closest to the app's creative core (§3.4, §4.6). Fixing it has
   the highest leverage on the "feels like directing a film" pillar.
2. **Story Workspace + Outline Builder (as one redesign unit)** — the
   clearest case of two screens claiming the same job; consolidating them
   directly serves pillar 2 (clear overview-to-detail granularity) by
   removing an ambiguous extra rung (§3.3).
3. **Settings** — not creative-core, but the highest raw control count (11
   cards, 7+ independent save actions) and the screen most likely to make a
   new user feel MikAI is "a collection of forms" rather than a production
   tool — directly the risk pillar 1 warns against (§3.5).

## 9. Limitations and evidence quality

- **No pilotable browser was available in this environment** (a limitation
  already documented across this project's prior tickets in this session).
  All findings are based on (a) direct reading of page/component source
  files, (b) live SSR HTML fetched via `curl` against a locally-run
  `npm run dev` instance (port 3000, `.next` purged before start, port
  freed and confirmed after stop — same validation discipline as every
  other ticket in this session), and (c) this session's own prior
  first-hand implementation work on Asset Detail, Sequence Detail's
  "Insert Shot Here" rows, and the Settings "Save Changes" buttons. No
  screenshots were captured (no browser automation tool was available to
  produce them); rendered-HTML excerpts and literal source line citations
  are used as evidence instead, per the "record exact route and state"
  fallback the Skill allows when screenshots aren't possible.
- **Verified live via SSR (HTTP 200 + HTML inspected):**
  `/projects/2`, `/projects/2/story`, `/projects/2/outline`,
  `/projects/2/assets`, `/projects/2/assets/1`, `/projects/2/sequences/2`,
  `/projects/2/sequences/2/shots/3`, `/settings`, `/settings/workflows`.
- **Verified via full source read (not just SSR):** `Sidebar.tsx`,
  `ContextStrip.tsx`, `RightPanel.tsx`, Project Detail page, Story Workspace
  page, Outline Builder page, Assets list page, Settings page, Shot Detail
  page, `SidebarLLMChat.tsx` (header/imports only, not the full 200+ line
  implementation).
  Confidence on findings drawn from these files is **High**.
- **Not read in full this pass** (findings on these are lower-confidence,
  marked individually above): Workflow Library page and its generate/map
  sub-routes, the full `AssetGenerationPanel`/`ShotGenerationPanel` slide-over
  contents, `EditorialWorkspace`/`EditorialTimeline`, `NlePrototypeWorkspace`,
  the OpenReel bridge iframe/sidecar UI itself (a separate application,
  correctly out of scope per the ticket's hard rules), and the full
  `SidebarLLMChat.tsx` implementation body. Sequence Detail and Asset Detail
  findings draw partly on this session's own prior implementation history on
  those exact files (tickets `AI.ASSET.BIBLE.1`, `EDITORIAL_INSERT_1`,
  `UX.VISIBILITY.1`) rather than a fresh full read this pass — flagged
  per-finding above with Medium/Medium-High confidence rather than High.
- **No responsive/narrow-viewport check was performed** — no browser tool
  was available to resize a viewport; all layout classes reviewed (e.g.
  `flex-wrap`, `hidden md:table-cell` on Assets list) suggest reasonable
  responsive intent, but this was not empirically verified.
- **No accessibility audit tooling was run** (no axe/Lighthouse access in
  this environment); accessibility observations above are limited to what
  is visible in source (native form elements, `aria-label` usage already
  observed in several components from prior session tickets) rather than a
  full WCAG pass.
- The subagent `.claude/agents/mikai-ux-auditor.md` specified by the ticket
  was not available as an invocable agent type in this execution
  environment (`Agent type 'mikai-ux-auditor' not found`); this audit was
  performed directly by the primary agent instead, following the same
  `.claude/skills/ux-audit/SKILL.md` workflow and review lens the subagent
  would have used.

## 10. Ten highest-priority findings

1. Story Workspace and Outline Builder are near-duplicate screens for the
   same "rung" of the pipeline (§3.3) — `Critical` / `Structural
   Redesign`.
2. Sidebar, ContextStrip, and RightPanel triplicate navigation to the same
   destinations, up to 4× on Project Detail alone (§3.1, §4.1 P-2) —
   `Critical` / `Medium Redesign`.
3. Shot Detail stacks up to 12 uncollapsed `Card`s with no tiering (§4.6
   SH-1) — `High Friction` / `Medium Redesign`.
4. Prompt Composer / Prompt Compiler / Shot Prompt are three tools for one
   field, requiring inline prose to explain their order (§3.4) —
   `High Friction` / `Medium Redesign`.
5. Settings is one undifferentiated scroll with 11 cards and 7+
   independent save actions (§3.5) — `High Friction` / `Small Refactor`.
6. LLM Chat is permanently mounted on every screen regardless of relevance
   (§3.2) — `High Friction` / `Small Refactor`.
7. Project Detail leads with an empty Film Result before Overview/Sequences
   for new projects (§4.1 P-1) — `Moderate Friction` / `Quick Win`.
8. Asset Detail's AI-enhance panels are shown at full weight even before
   their own preconditions (Description/Notes) are met (§4.4 AD-1) —
   `Moderate Friction` / `Small Refactor`.
9. A literal unmapped-color button remains on Assets list "+ Add Asset,"
   same defect class `UX.VISIBILITY.1` just fixed elsewhere (§4.3 A-2) —
   `Polish` / `Quick Win`.
10. Empty-state treatment is inconsistent within the same screen (some
    `EmptyState`, some ad hoc italic text) (§3.7) — `Polish` / `Quick Win`.
