# FILM.RESULT.1.A — Film Result Architecture + Data Model/Viewer

Status: MikAI-only implementation, real end-to-end verification against the live dev server. MikAI HEAD before this ticket: `e7f0fc9 — Add basic editorial shot insertion`, working tree clean.

## 1. Audit Summary

- **Project Detail page** (`src/app/projects/[projectId]/page.tsx`): already loads `sequences` ordered by `orderIndex asc` — the exact ordering a Film Result manifest needs to walk. No existing Film-level section; the natural insertion point is directly under the page header, mirroring how the Sequence Result section sits at the top of Sequence Detail (`EDITORIAL_INSERT_1`/`SEQUENCE_RESULT_1` precedent).
- **`sequence_results`/`sequenceResults.ts`** (`SEQUENCE_RESULT_1`): confirmed the exact conventions to mirror one level up — applicative "at most one active" via a transactional demote-then-promote (`setActiveSequenceResult`), JSON-in-TEXT for manifest/snapshot/warnings columns, a `listX`/`getActiveX`/`setActiveX`/`archiveX`/`createX` action shape. `SequenceResultStatus` already includes `"outdated"`, and `EDITORIAL_INSERT_1` already established the pattern of a dedicated `outdateXForY` helper plus the "show the most recent outdated result rather than falling back to the empty state" viewer fix — both directly reused here.
- **`basicCutManifest.ts`/`renderBasicSequenceResult.ts`** (`BASIC_EDITORIAL_1B`): read to confirm this ticket should **not** follow their render-engine shape — this ticket builds a manifest only, no FFmpeg, no file write, matching the ticket's explicit "ne pas encore assembler/rendre le film final" scope.
- **Drizzle/migration conventions**: `sequence_results`'s own table definition (`src/db/schema.ts`) was the direct template — same column shape, same JSON-in-TEXT columns, same `index(...).on(projectId, status)` pattern.

**Decisions from this audit**:
- **Where to display**: Project Detail page, top section (above Overview), for the same reason Sequence Result sits atop Sequence Detail — it's the page's primary "what does this produce" output.
- **How to find each sequence's contribution**: query `sequenceResults` per sequence, filtered to `status: "active"` — exactly what the Sequence Result viewer already treats as "the current cut" for that sequence.
- **Sequences with no active result**: included in the manifest anyway (`included: false`, with a `missingReason`) rather than silently skipped — the manifest's job is to show the whole picture.
- **A trace of Sequence Results used**: `sequenceResultManifest` (JSON), one row per sequence, matching the ticket's proposed shape exactly.
- **"Which project state this came from"**: `projectSnapshot` (JSON) — a sha256 fingerprint over `(sequenceId, sequenceResultId, sequenceResultStatus)` tuples, deliberately excluding text/volatile fields (title, paths, durations), mirroring `editorialSnapshot.ts`'s own exclusion philosophy from `OPENREEL.CONFLICT.1`.
- **Invalidation**: wired directly (not deferred to `.1.B`) — see §5.

## 2. Data Model

`film_results` (migration `drizzle/0022_flat_blade.sql`):

```text
id                        integer PK autoincrement
project_id                integer NOT NULL, FK -> projects.id (cascade delete)
status                    text NOT NULL default 'draft'  -- "draft" | "published" | "active" | "archived" | "outdated"
video_path                text (nullable — always null in this ticket; FILM.RESULT.1.B renders it)
duration_seconds          real (nullable — theoretical sum of included sequences' durations, not a rendered file's real duration)
sequence_result_manifest  text (nullable, JSON)  -- FilmResultManifest
project_snapshot          text (nullable, JSON)  -- FilmProjectSnapshot
notes                     text (nullable)
warnings                  text (nullable, JSON string[])
published_at              text (nullable)
created_at / updated_at   text NOT NULL (default now)

index: film_results_project_idx on (project_id, status)
```

Migration is a single isolated `CREATE TABLE` + one `CREATE INDEX` — confirmed via direct inspection, nothing else in the schema touched. Generated via `npm run db:generate`, applied via `npm run db:migrate` against the local dev DB.

Types: `src/types/filmResult.ts` — `FilmResultStatus`, `FilmResultManifest`/`FilmResultManifestSequence`, `FilmProjectSnapshot`, plus parse/serialize helpers for all three JSON columns (each returns a safe null/empty value on malformed JSON rather than throwing — a Film Result row should stay viewable even if one field is corrupt, same policy as `sequenceResult.ts`), and `filmManifestSourceModeLabel` for the one UI wording decision (`"Basic"` / `"Advanced"` / `"—"`).

## 3. Manifest (`mikai-film-result-manifest-v1`)

`src/lib/film/filmResultManifest.ts` — `buildFilmResultManifest(projectId)`, matching the ticket's proposed shape exactly:

```ts
{
  schemaVersion: "mikai-film-result-manifest-v1";
  projectId: number;
  createdAt: string;
  sourceMode: "active-sequence-results";
  sequences: Array<{
    sequenceId, sequenceTitle, orderIndex,
    sequenceResultId, sequenceResultStatus, sequenceResultSourceMode,
    videoPath, durationSeconds, included, missingReason?
  }>;
  warnings: string[];
}
```

For each sequence (walked in `orderIndex` order): if it has a Sequence Result with `status: "active"`, that result is included verbatim (`videoPath`/`durationSeconds`/`sourceMode` copied through). Otherwise the sequence is still listed (`included: false`) with a specific `missingReason` — `"No Sequence Result has been published for this sequence."` (none exist at all) or `"Sequence Result is outdated."` / `"Sequence Result is {status}, not active."` (one exists but isn't currently active) — and the same message is pushed to the manifest's top-level `warnings` array. Throws `FilmResultManifestError` only for a genuinely invalid request (project not found, or zero sequences at all — nothing to build from).

`computeFilmResultTotalDuration(manifest)` sums `durationSeconds` across `included` sequences only — an explicit theoretical total, clearly not a rendered file's real duration since none exists yet.

`computeFilmProjectSnapshot(manifest)` — the `projectSnapshot` fingerprint described in §1, computed purely from the manifest's own already-built sequence list (no extra DB query).

No FFmpeg call, no file write, no video produced anywhere in this file — confirmed by inspection, matching the ticket's explicit scope.

## 4. Server Actions

`src/actions/filmResults.ts` — mirrors `sequenceResults.ts`'s shape exactly:

- `listFilmResults(projectId)` — most recent first.
- `getActiveFilmResult(projectId)` — the current active row, or `null`.
- `setActiveFilmResult(projectId, filmResultId)` — same transactional demote-then-promote as `setActiveSequenceResult`. Applicative "at most one active per project" — same V1 decision as `SEQUENCE_RESULT_1`, same reasoning (no first-class partial-index support in this project's pinned `drizzle-kit`).
- `archiveFilmResult(projectId, filmResultId)`.
- `outdateFilmResultsForProject(projectId)` — marks every non-terminal (`active`/`published`) Film Result of a project as `outdated`. Never throws.
- `createFilmResultDraftFromActiveSequenceResults(projectId)` — builds the manifest, computes the snapshot and theoretical duration, inserts a `status: "draft"` row (**always** draft — publish/activate stay two separate deliberate steps, per the ticket's own recommendation to avoid confusion). No FFmpeg, no file, `videoPath: null`.

## 5. Active Result & Invalidation Strategy

**Active strategy**: identical to `sequence_results` — applicative uniqueness via `setActiveFilmResult`'s transaction, one level up (project instead of sequence).

**Invalidation — wired directly, not deferred**: per the ticket's own recommendation ("changer un Sequence Result actif rend le Film Result actif potentiellement stale... wire l'invalidation dans setActiveSequenceResult, car [le] changement est localisé et propre"), `outdateFilmResultsForProject(projectId)` is now called at the end of **three** places in `src/actions/sequenceResults.ts`:
- `setActiveSequenceResult` — a different Sequence Result becomes active for a sequence.
- `archiveSequenceResult` — archiving may remove a sequence's only active result.
- `outdateSequenceResultsForSequence` — a structural change (e.g. `EDITORIAL_INSERT_1`'s shot insertion) already outdating that sequence's own results cascades to outdate any Film Result that included them.

No circular import: `filmResults.ts` reads the `sequenceResults` DB table directly via Drizzle (through `filmResultManifest.ts`), never through `sequenceResults.ts`'s action functions — so `sequenceResults.ts` importing `outdateFilmResultsForProject` from `./filmResults` is a one-directional dependency.

## 6. UI

`src/app/projects/[projectId]/page.tsx` — new **Film Result** section, placed immediately after the page header (before Overview/Sequences):

- **Active result present**: `<video controls>` if `videoPath` is set, else **"This Film Result has no rendered video yet."** (exact ticket wording — always true in this ticket, since nothing renders yet). Status badge, duration, published date. If `status === "outdated"`: a banner (**"This result is outdated because a sequence result changed after it was published. Create a new Film Result Draft to update it."**). Notes/warnings if present. A **"Sequences included"** summary table: per sequence, title, source (`Basic`/`Advanced`/`—`), duration, and a right-aligned status word — **`Included`** (green), or **`Missing Result`** / **`Outdated Result`** (red) depending on the manifest's `missingReason`.
- **No result at all**: `EmptyState` — **"No film result created yet."** / **"Publish active sequence results first, then create a Film Result."** (exact ticket wording).
- **Previous Film Results** (only when at least one non-active result exists): a compact table (Status, Duration, Created, actions) with `Set Active`/`Archive` per row — reusing the existing `SequenceResultActionForm.tsx` component as-is (already fully generic: `{action, label, className, confirmMessage}`) rather than creating a near-duplicate `FilmResultActionForm.tsx`, since no Film-Result-specific behavior was needed.
- **"Create Film Result Draft"** button (`CreateFilmResultDraftButton.tsx`, new client component) in the section header's action slot — no confirmation dialog (the ticket didn't call for one, and creating a draft is low-risk/reversible). On success: **"Film Result draft created."** plus any warnings, `router.refresh()`.

Same viewer-empty-state fix pattern as `EDITORIAL_INSERT_1`: the displayed result is the active one if it exists, else the most recent `outdated` one — an outdated Film Result stays visible and playable (once it has a video) rather than vanishing into the empty state.

All labels in English, matching the ticket's exact recommended strings throughout.

## 7. Real Verification (Project 4)

Performed against the live dev server via temporary, uncommitted test routes (created, used, then deleted; confirmed absent from `git status` at commit time — no test runner exists in this repo, consistent with every prior ticket).

**Baseline**: Project 4 has 3 sequences (30 "Opening — The Arrival", 31 "Climax — The Crisis", 32 "Closing — The Masterpiece"). Sequence 30 had an active Advanced Sequence Result (id 4, from `OPENREEL_PUBLISH_1`); sequences 31 and 32 had **no** Sequence Results at all — a genuinely realistic mixed scenario.

1. **Empty state confirmed**: `GET /projects/4` before any Film Result existed → "No film result created yet." rendered correctly.
2. **Draft creation**: `createFilmResultDraftFromActiveSequenceResults(4)` → `{"ok":true,"id":1,"warnings":["Sequence \"Climax — The Crisis\" (id 31): No Sequence Result has been published for this sequence.","Sequence \"Closing — The Masterpiece\" (id 32): No Sequence Result has been published for this sequence."]}`.
3. **DB confirmed**: manifest correctly lists sequence 30 as `included: true` (Advanced, `videoPath`/`durationSeconds` copied through verbatim) and sequences 31/32 as `included: false` with the exact expected `missingReason`. `projectSnapshot` fingerprint computed. `durationSeconds` on the row itself: `43.5` (matches sequence 30's own duration — the only included one).
4. **Activated**: `setActiveFilmResult(4, 1)` → `ok: true`. Page re-fetched: status badge, `43.5s` duration, "Sequences included" summary showing "Opening — The Arrival" / Advanced / Included, and both other sequences as "Missing Result", plus the "no rendered video yet" message — all confirmed rendered.
5. **Invalidation confirmed live**: called `setActiveSequenceResult(4, 30, 3)` (switching sequence 30's active result from the Advanced one to the earlier Basic one) → the Film Result (id 1) **automatically** transitioned from `active` to `outdated`, confirmed via direct DB read immediately after. Page re-fetched: the outdated banner and badge both rendered correctly. This is the core "hooks d'invalidation simples" requirement, verified for real, not just by code inspection.
6. **Cleanup**: per explicit decision (asked, not assumed), the test Film Result row and the switched Sequence Result activation were both reverted via a direct DB script — `film_results` emptied, sequence 30's Sequence Results restored to their exact pre-test state (Advanced `active`, Basic `published`). Confirmed via a final DB read matching the pre-test baseline, and the page re-showing the empty state.

`npx tsc --noEmit` — 0 errors. `npm run build` — compiled successfully, all routes generated (same pre-existing, unrelated Turbopack NFT-tracing warning seen in every prior ticket).

## 8. Limitations

- **No video, ever, in this ticket** — `videoPath` is always `null`; `FILM.RESULT.1.B` is the ticket that actually renders/concatenates.
- **`missingReason` string-matching in the UI**: the "Sequences included" table classifies a row as "Outdated Result" vs "Missing Result" by checking whether `missingReason` contains the substring `"outdated"` — a small string-matching coupling between the manifest builder's wording and the UI's classification, acceptable at this scale but worth a proper `reason` enum if this grows.
- **No staleness *comparison*, only a snapshot**: `projectSnapshot`'s fingerprint is computed and stored, but nothing yet *compares* a future publish attempt's snapshot against the project's current one (the way `OPENREEL_CONFLICT_1`'s `compareEditorialSnapshot` does for editorial patches) — the invalidation in this ticket works via the explicit `outdateFilmResultsForProject` calls (§5), not via snapshot comparison. A future ticket could add a comparison-based check as a second, independent safety net.
- **No draft cleanup/dedup** — repeatedly clicking "Create Film Result Draft" with no changes in between creates a new row each time (matching `sequence_results`' own "every publish is a new row" convention), with no warning that an identical draft may already exist.

## 9. Files Modified

- `src/db/schema.ts` — new `filmResults` table + `FilmResult`/`NewFilmResult` types.
- `drizzle/0022_flat_blade.sql` — generated migration (new file).
- `src/types/filmResult.ts` (new).
- `src/lib/film/filmResultManifest.ts` (new).
- `src/actions/filmResults.ts` (new).
- `src/actions/sequenceResults.ts` — invalidation wiring (§5).
- `src/components/CreateFilmResultDraftButton.tsx` (new).
- `src/app/projects/[projectId]/page.tsx` — Film Result + Previous Film Results sections.
- `docs/FILM_RESULT_1A_DATA_MODEL_VIEWER.md` (this document).

## 10. Next Step

```text
FILM.RESULT.1.B — Render Film Result from active Sequence Results
```

Would reuse the exact FFmpeg `filter_complex`-concat strategy already validated in `BASIC_EDITORIAL_1B` (bundled FFmpeg, `renderBasicSequenceResult.ts`'s normalization/placeholder approach), one level up: concatenating whole Sequence Result video files instead of individual shot clips. `buildFilmResultManifest`'s `included`/`missingReason` fields already tell that future renderer exactly which sequences to skip (and why) without needing to re-derive that logic.

## 11. Confirmations

- No new `package.json` dependency.
- No ComfyUI/generation/job runner/polling code touched.
- No `SequencePreviewPlayer` change.
- No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched or read — this ticket's own explicit constraint.
- No FFmpeg call anywhere in this ticket's code — manifest building is a pure DB read + hash computation.
- Schema/migration touched **only** for `film_results`, as explicitly authorized by this ticket.
- No runtime DB/uploads/outputs/storage committed — the real Film Result row and Sequence Result activation change created during verification were reverted (§7.6); confirmed via `git status`/`git diff --stat` before staging (only source files listed in §9 appear).
