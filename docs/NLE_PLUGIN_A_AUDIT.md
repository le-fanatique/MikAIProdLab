# NLE.PLUGIN.A — Advanced Editorial Interface Strategy Audit

Status: audit only, no code change. HEAD at time of writing: `328153f — Harden NLE shot move bounds`.

## 1. Context

`/nle-prototype` started as a read-only preview (`PHASEC.NLE.C.A`) and has grown, ticket by ticket, into an interactive timeline: click-to-seek, non-ripple resize, non-ripple move with server-side pass-through hardening. Each increment was individually justified, but the cumulative direction is a hand-built NLE: drag/drop physics, timeline scale/tick heuristics, playhead scrubber math, empty-space derivation, snap-to-edge thresholds — all maintained inside MikAI ProdLab, a tool whose core value is upstream of editing (story → sequences → shots → assets → generation → approved outputs).

This audit exists to answer one question before more move/resize/reorder tickets accumulate: **should MikAI keep building its own editing surface, or should it stabilize a data contract and let an external, purpose-built editor own the editing surface?**

## 2. Current NLE Prototype Capabilities

What `/nle-prototype` already does well:

- **Visual timeline** — `@xzdarcy/react-timeline-editor` (`^1.0.0`) renders tracks/actions from `toTimelineEditorData`, with status-colored chips (approved/placeholder/missing) and a dedicated non-clip rendering for empty space.
- **Playhead + click-to-seek** — `PlayheadScrubber` in `NlePrototypeTimeline.tsx` resolves a click position to a shot or a derived empty-space segment and reports `(itemId, localSeconds)` up to `NlePrototypeWorkspace`, which drives `SequencePreviewPlayer`'s `seekRequest`.
- **Non-ripple move** — drag a shot within the empty space adjacent to it; `handleMoveEnd` clamps client-side to `action.minStart`/`maxEnd`, snaps to 0.1s and to neighbor edges, then persists via the `moveEditorialItem` server action.
- **Non-pass-through hardening (server)** — `moveEditorialItem` (`src/actions/editorialTimeline.ts:348`) independently recomputes the allowed range from the item's current immediate shot-only neighbors and rejects (no write) outside `[allowedStartMin, allowedStartMax]` — the client clamp is a UX nicety, the server is the actual guarantee.
- **Non-ripple right-edge resize** — `resizeEditorialItemRightEdge` (editorial page only, not `/nle-prototype`): shrink creates/extends a trailing gap, extend consumes it, with `orderIndex` renormalization.
- **Preview sync** — the preview player and the timeline agree on empty-space identity via a deterministic negative synthetic id (`getEmptySpacePreviewItemId`), so selection/seek never resolves to a stale legacy "gap" DB row.

## 3. Existing Editorial Data Layer

This is the part of the codebase this audit is actually about — it is UI-agnostic and already shaped like an export contract, even though nothing currently calls it that.

- **`EditorialDocument` / `EditorialDocumentItem`** (`src/lib/editorial/editorialDocument.ts`) — pure, DB-agnostic. One document per sequence, tracks (currently one, `kind: "video"`), items with: `id`, `sourceType` (`shot`/`gap`), `shotId`, `trackIndex`, `orderIndex`, `start`, `duration`, optional `trimIn`/`trimOut`, `mediaUrl`, `status` (`approved`/`placeholder`/`missing`), `title`, `shotCode`, `isPlaceholder`.
- **`getEditorialItemEffectiveDuration`** — single source of truth for "how long does this item actually play": trim range wins, falls back to `durationSeconds`, falls back to a 1.0s placeholder floor. Any external consumer of the contract needs this same effective-duration logic (or the contract needs to export duration pre-computed, see roadmap below).
- **`deriveEmptySpaces`** — empty space is a derived read, not a stored row. Legacy `type='gap'` rows in `sequence_editorial_items` are intentionally never consulted post-`PHASEC.NLE.C.M1.R1`; the DB's `type='gap'` rows are dead weight kept only for backward compatibility with `resizeEditorialItemRightEdge`'s gap bookkeeping on the `/editorial` page.
- **`toTimelineEditorData`** — the *only* place that knows about `@xzdarcy/react-timeline-editor`'s shape. This is good: swapping or dropping the library touches one file, not the data layer.
- **DB contract (`src/db/schema.ts`)** — `sequence_editorial_items`: `type`, `shotId`, `orderIndex`, `durationSeconds`, `trimInSeconds`/`trimOutSeconds`, `trackIndex` (single-track today, column reserved), `startSeconds` (nullable — not-yet-backfilled items still fall back to cumulative derivation in `buildEditorialDocument`). `shots.approvedVideoPath` is the only media reference; there is no audio table, no transition table, no multi-track semantics beyond the reserved column.
- **What's missing for a real export contract**: no explicit document/schema version field, no stable external id separate from the DB autoincrement id, no declared frame rate / timebase, no media metadata beyond a path (no checksum, no resolution, no codec), no explicit "which fields are authoritative vs. derived" documentation outside code comments.

## 4. Current Limitations

What `/nle-prototype` does today is proportionate to a debug/proof-of-concept tool. What it would need to become a serious editing surface — and what should probably not be built in-house — is a much longer list:

- Full reorder / intercalation (dragging a shot past a neighbor to re-sequence) — explicitly deferred to `C.REORDER.1`.
- Advanced duration edit (left-edge resize, ripple trim, roll edit).
- Split / razor tool.
- Zoom / pan / fit-to-window navigation (`C.M1.6`, also explicitly deferred).
- Multi-track compositing (video-over-video, PiP, overlays) — schema has a `trackIndex` column reserved but no track-relationship semantics (V, A tracks, locking, soloing).
- Audio (no audio table, no waveform, no sync offset).
- Transitions (cross-dissolve, wipes, etc.).
- Professional trim handles (roll, slip, slide, ripple-aware multi-selection).
- Export/render to a final video file — MikAI currently has no render/mux pipeline at all, editorial or otherwise.
- Undo/redo, multi-select, keyboard shortcuts, snapping settings, markers/annotations.

Each of these is a multi-week feature on its own if built to a professional bar, and several (audio sync, multi-track compositing, transitions/render) sit far outside MikAI's current DB shape and would pull schema/migration work that this audit is explicitly not scoped to touch.

## 5. Strategic Options

### Option A — Continue custom `/nle-prototype`
Keep building move/resize/reorder/multi-track/etc. directly inside `@xzdarcy/react-timeline-editor`.
- **Benefits**: everything stays in one codebase/one deploy; full control over UX; no integration boundary to maintain; already has working move+resize+preview sync today.
- **Risks**: reinventing well-trodden NLE UX (frame-accurate scrubbing, ripple edit, multi-track compositing) is a large, open-ended surface; every new capability needs its own server-side hardening pass (as seen with M1→M1.R3); scope creep risk is already visible in this exact audit's trigger.
- **Relative dev cost**: high and *growing super-linearly* — each feature (reorder, multi-track, audio) is roughly as much work as everything built so far, combined.
- **Technical debt**: grows the most among all options — a bespoke NLE engine embedded in a production-intelligence tool.
- **Compatibility with MikAI**: highest — no external process, no format bridge.
- **Speed to a montage-capable POC**: slow — reorder alone is a dedicated ticket; multi-track/audio/transitions are each further tickets.
- **Recommendation**: **no-go** as the primary path forward; acceptable only as a frozen debug view (see Option E).

### Option B — Advanced web editor integrated in MikAI
Embed a more capable *web-based* editing library/engine (timeline+canvas+render) directly into the Next.js app in place of/alongside `@xzdarcy/react-timeline-editor`.
- **Benefits**: stays a single web app, no separate install for the user; could reuse `EditorialDocument` as the internal model if the library's adapter layer is written analogously to `toTimelineEditorData`.
- **Risks**: per AGENTS.md and prior ticket constraints, this project has repeatedly ruled out exactly this category of library (Twick/OpenReel/OpenCut/DesignCombo/Remotion/Media Chrome/FFmpeg are all explicitly forbidden in past tickets) — strongly suggests this path has already been evaluated and rejected for reasons not visible in this audit alone (likely: bundle size, maturity, licensing, or render-pipeline mismatch with ComfyUI-centric generation). Any web-based render-capable library also drags in FFmpeg-class dependencies (WASM or server-side) which is a heavy, real technical bet.
- **Relative dev cost**: high — new dependency integration, new adapter layer, and (if it includes rendering) a render pipeline MikAI doesn't have today.
- **Technical debt**: medium-high — dependency on a third-party editing engine's release cadence and internal model, likely requiring its own adapter/bridge code (not unlike Option C but without process isolation).
- **Compatibility with MikAI**: medium — depends heavily on which library; candidates are "to verify" since no web access was used for this audit.
- **Speed to POC**: medium, entirely dependent on the chosen library's fit — could be fast if a library's data model maps cleanly to `EditorialDocument`, slow if not.
- **Recommendation**: **conditional no-go** — the explicit repeated exclusion of every concrete candidate in past tickets is a strong signal this was already tried/considered and set aside. Do not re-open without new information (a specific library name + justification).

### Option C — Separate local editor/plugin app bridged to MikAI
Treat editing as an external concern: a separate, purpose-built application (existing local NLE, or a small dedicated editor app) that imports/exports MikAI's `EditorialDocument`, possibly round-tripping via a project/XML/JSON bridge file.
- **Benefits**: uses editing tools that are already mature (frame-accurate scrubbing, multi-track, audio, transitions, export) instead of rebuilding them; MikAI's job shrinks to being an excellent *data source* (shots, approved videos, timing intent) and an excellent *data sink* (approved cut metadata back into the project); clean separation of concerns matches the stated product goal ("MikAI = data layer + production intelligence").
- **Risks**: round-trip fidelity (timing drift, trim precision, media path resolution) needs careful contract design; two processes to keep in sync during a session; "bridge" file format needs versioning discipline from day one.
- **Relative dev cost**: medium — most of the cost is one well-specified export/import contract plus a thin sync action, not a UI engine.
- **Technical debt**: low on the MikAI side (the contract is inert data); debt shifts to maintaining the bridge format's stability across `EditorialDocument` shape changes.
- **Compatibility with MikAI**: high — `EditorialDocument` already reads like an export-ready contract (see Section 3); minimal new surface needed (an export action, an import action, a diff/merge strategy).
- **Speed to POC**: fast — a JSON export + a manual import test can be a single small ticket (see roadmap below); does not require picking or vetting a specific external editor up front.
- **Recommendation**: **go**. Best alignment with the stated product boundary and the existing code shape.

### Option D — Export/Import bridge first, editor later
A variant of C: build and stabilize the export/import contract *before* committing to any specific external tool, treating "which editor" as a decision to make later once the contract is proven.
- **Benefits**: de-risks the biggest unknown (contract stability) without betting on an unverified external tool; keeps `/nle-prototype` frozen and untouched while the contract work happens; naturally sequences into Option C once a target editor is chosen.
- **Risks**: if no viable external target is ever confirmed, the bridge work has no consumer — mitigated by making the contract useful on its own (e.g. as a JSON snapshot/debug export, or eventually feeding a render step).
- **Relative dev cost**: low-medium — smallest possible first step, deliberately.
- **Technical debt**: minimal — it's additive (a read path off `EditorialDocument`), doesn't touch existing move/resize/preview code.
- **Compatibility with MikAI**: highest — zero coupling to any unverified external dependency.
- **Speed to POC**: fastest of all options for a *tangible deliverable* (an exported file proves the contract works before any integration risk is taken).
- **Recommendation**: **go** — this is not a competing option to C, it's C's correct first step. Treat D as the immediate next ticket and C as the ticket(s) after it.

### Option E — Hybrid: keep `/nle-prototype` as debug fallback + build bridge
Freeze `/nle-prototype` at its current capability (move + resize + preview sync + click-to-seek), stop adding editing features to it, and build the D→C path alongside it. `/nle-prototype` remains useful as a no-external-dependency way to eyeball an `EditorialDocument` and sanity-check `startSeconds`/trim data without leaving the browser.
- **Benefits**: no regression — nothing working today is removed; gives every future ticket a cheap way to visually verify `EditorialDocument` correctness (e.g. after a bridge round-trip) without standing up the external editor; low risk, fully reversible.
- **Risks**: mild discipline risk — "just one more feature" pressure on `/nle-prototype` needs to be actively resisted (this audit itself is a response to that pressure).
- **Relative dev cost**: near-zero incremental (it's a policy decision, not new code).
- **Technical debt**: neutral to positive — caps the debt already incurred instead of growing it.
- **Compatibility with MikAI**: highest.
- **Speed to POC**: doesn't block or slow the D→C path at all.
- **Recommendation**: **go** — adopt alongside D/C, not instead of them.

## 6. Recommendation

```text
Recommendation:
Choose Option D → C (bridge-first, external editor second), combined with
Option E (freeze /nle-prototype as a debug fallback).

Do not continue with Option A (building reorder, multi-track, audio,
transitions, or render directly inside /nle-prototype).

Do not open Option B without a concrete, named, already-vetted library —
every specific candidate considered in prior tickets has already been
excluded from this project.

Use /nle-prototype only for: visually inspecting an EditorialDocument
(shot positions, empty spaces, status, trims) and validating that
startSeconds/trim data round-trips correctly after a bridge export/import —
i.e. as a read-mostly debug view, not as the editing surface.

Next implementation ticket should be: NLE.BRIDGE.1 — EditorialDocument
Export Contract (see roadmap below).
```

Rationale: `EditorialDocument` is already a clean, pure, versionless-but-versionable data shape decoupled from any specific rendering library (Section 3). The fastest path to "montage avancé" is not to keep extending `toTimelineEditorData`'s consumer, it's to give that same document a second consumer — an export format — and let a mature external tool own the editing UX MikAI was never trying to build in the first place. This matches the user's stated preference and nothing found in the audited files contradicts it; if anything, the repeated past exclusion of every concrete web-editor-library candidate (Option B) reinforces it.

## 7. Proposed Fast Roadmap

```text
1. NLE.BRIDGE.1 — EditorialDocument Export Contract
2. NLE.PLUGIN.POC — Minimal external/editor import test
3. NLE.PLUGIN.SYNC — Round-trip timing updates
4. Decision Gate
```

### 1. NLE.BRIDGE.1 — EditorialDocument Export Contract
- **Objective**: Add a read-only export path that serializes an `EditorialDocument` (plus enough metadata to be self-describing — schema/contract version, sequence id/title, generated-at timestamp, resolved absolute media URLs) to a downloadable JSON file. No import yet, no external tool integration yet — prove the contract is complete and stable in isolation.
- **Fichiers probables**: a new `src/lib/editorial/exportEditorialDocument.ts` (pure function, mirrors `toTimelineEditorData.ts`'s pattern — one file that knows about the export shape); a new route or server action to trigger a download (e.g. `src/app/projects/[projectId]/sequences/[sequenceId]/nle-prototype/export/route.ts`, or a button in `/nle-prototype` calling a server action — exact placement is an implementation decision for that ticket, not this audit). No schema/DB changes expected — this reads existing data only.
- **Risques**: under-specifying the contract (e.g. omitting frame rate, media checksums, or a stable external id) forces a breaking v2 later — worth spending real design time on the shape before writing code; must decide whether `id` fields exposed externally are the raw DB autoincrement ids (simplest, but couples the contract to DB internals) or opaque stable ids (safer long-term, more work now).
- **Définition de "done"**: exporting a sequence with a mix of approved/placeholder/missing shots and at least one empty space produces a JSON file that a human can read and manually verify matches what `/nle-prototype`'s debug `<details>` panel already shows for the same document; build passes; no changes to `/editorial`, `/nle-prototype`'s existing behavior, schema, or packages.

### 2. NLE.PLUGIN.POC — Minimal external/editor import test
- **Objective**: Manually verify (not necessarily automate yet) that the exported contract from step 1 can be understood by *something* outside MikAI — this could be as small as hand-writing a script that parses the export and reconstructs a timeline, or importing into a real external tool if/when one is chosen and vetted. The point is proving round-trip legibility, not building a permanent integration.
- **Fichiers probables**: none inside `src/` necessarily — likely a throwaway script or a small standalone test harness outside the Next.js app boundary; if any MikAI-side change is needed it should be limited to fixing gaps found in the step-1 export shape.
- **Risques**: this ticket may reveal the step-1 contract was incomplete (e.g. missing media dimensions, missing timebase) — expect a possible amendment to `NLE.BRIDGE.1`'s output rather than a clean new field; do not let this ticket quietly grow into building a full import UI inside MikAI (that would be sliding back toward Option A/B).
- **Définition de "done"**: a written note (or short doc) confirming the exported JSON was successfully parsed and reconstructed into a visually-equivalent timeline outside MikAI, or a clear list of what was missing from the contract to make that possible.

### 3. NLE.PLUGIN.SYNC — Round-trip timing updates
- **Objective**: Close the loop — take edits made externally (at minimum: updated `startSeconds`/trim values per item) and write them back into `sequence_editorial_items` via a bounded import action, reusing the same ownership/validation patterns already established in `moveEditorialItem`/`updateEditorialItemTrim` (sequence→project ownership check, per-item type checks, transactional writes).
- **Fichiers probables**: a new server action, e.g. `src/actions/editorialImport.ts`, following the exact conventions of `src/actions/editorialTimeline.ts` (sync `db.transaction`, ownership check, redirect/revalidatePath pattern); no schema change expected unless the contract from step 1 revealed a genuine gap (e.g. a needed field with no current column) — if so, that is exactly the kind of change this audit's mandate requires stopping for validation on, not proceeding automatically.
- **Risques**: conflict handling — what happens if MikAI-side data changed since the export (e.g. a shot's `approvedVideoPath` was updated)? Needs an explicit "last write wins by field" or "reject stale import" policy, not an implicit one; must preserve every invariant already enforced by M1 (`orderIndex` untouched unless explicitly in scope, non-destructive trims, ownership checks) — the import path is a new door into the same table `moveEditorialItem` already guards carefully.
- **Définition de "done"**: an import of a previously-exported-then-externally-modified document updates `startSeconds`/trim on the correct rows only, leaves untouched items untouched (verified via the same before/after DB row comparison technique used in prior NLE tickets), and the updated sequence renders correctly in both `/editorial` and `/nle-prototype`.

### 4. Decision Gate
- **Objective**: With a working, verified round-trip in hand, make the actual product decision this audit only prepares for: which specific external editor/plugin (if any single one) becomes the primary bridged target, and whether `/nle-prototype` should be trimmed further, kept as-is, or eventually retired once the bridge is trusted.
- **Fichiers probables**: none — this is a decision checkpoint, not an implementation ticket.
- **Risques**: skipping this gate and organically drifting into "just wire up tool X" without a deliberate choice reintroduces the exact ambiguity this audit was written to resolve.
- **Définition de "done"**: a short written decision (could be a follow-up to this same doc) naming the chosen path forward, or explicitly deciding more POC iteration is needed before committing.

## 8. Risks and Stop Conditions

Per the ticket's autonomy constraints, any of the following — if encountered while executing the roadmap above — requires stopping and asking for explicit validation before proceeding:

- Any DB migration or `src/db/schema.ts` change (e.g. if `NLE.BRIDGE.1` or `NLE.PLUGIN.SYNC` reveals a genuinely missing column).
- Any `drizzle/*` file change.
- Adding or removing an npm package, or any `package.json`/`package-lock.json` change (this becomes directly relevant the moment `NLE.PLUGIN.POC` considers a real external library).
- Any change to ComfyUI/generation/job runner/polling/workflow payload code.
- Any modification to `/editorial` or its components (`EditorialTimeline`, `EditorialWorkspace`, `EditorialShotList`).
- Any modification to `/nle-prototype`'s existing components, or to `SequencePreviewPlayer`.
- Reintroduction of Motion Beats in any form.
- Mass/destructive data operations of any kind.
- Any architectural change not explicitly requested by a ticket.

None of these were triggered during this audit — no code was modified, no dependency was inspected for addition, no schema change was proposed as a "yes, do this" (only as a possible future need flagged for validation).

## 9. Next Ticket Prompt

```text
NLE.BRIDGE.1 — EditorialDocument Export Contract

Tu es dans le projet MikAI Production Lab.

Mode : Autonomie contrôlée.

Objectif :
Ajouter un export JSON read-only d'un EditorialDocument (une séquence),
auto-descriptif (version de contrat, sequenceId/title, generated-at,
media URLs résolues), sans import, sans intégration externe, sans
modification de /editorial ou /nle-prototype existants.

Contraintes absolues (identiques aux tickets précédents) :
- pas de migration, pas de schema DB, pas de fichier drizzle ;
- pas de package npm, pas de modification package.json/package-lock.json ;
- pas de modification ComfyUI/generation/job runner/polling/workflow ;
- pas de modification des composants React existants d'/editorial ou
  /nle-prototype (EditorialTimeline, EditorialWorkspace,
  EditorialShotList, SequencePreviewPlayer, NlePrototypeTimeline,
  NlePrototypeWorkspace) ;
- Motion Beats ne doit pas être réintroduit ;
- UI labels en anglais uniquement ;
- ne jamais utiliser `git add .`, uniquement `git add -- "<path>"`.

Livrable :
- src/lib/editorial/exportEditorialDocument.ts (fonction pure, même
  pattern que toTimelineEditorData.ts) ;
- un point d'entrée pour déclencher l'export (route ou action, à ta
  discrétion, sans toucher aux composants listés ci-dessus) ;
- vérification manuelle que le JSON exporté pour une séquence avec un
  mix approved/placeholder/missing + au moins un empty space est complet
  et lisible.

Rapport attendu : fichiers créés, build, git status final, exemple de
sortie JSON (tronqué), confirmation qu'aucun fichier interdit n'a été
touché.
```
