# SEQUENCE.RESULT.1 — Sequence Result Data Model and Viewer

Status: foundation ticket, MikAI-only. No sidecar code touched. MikAI HEAD before this ticket: `c9b4c6e — Add editorial snapshot safety for OpenReel patches`, working tree clean.

## 1. Audit Summary

- `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §4 already specifies the conceptual `SequenceResult` fields, the multi-version/single-active-per-sequence rule, and that a result can come from `sourceMode: "basic" | "advanced"`. `docs/OPENREEL_CONFLICT_1_SNAPSHOT_SAFETY.md` established `EditorialSnapshot` (`src/lib/editorial/editorialSnapshot.ts`) as the shared structural-fingerprint mechanism this ticket's `editorialSnapshot` column reuses verbatim.
- `src/db/schema.ts`: `sequences`/`shots` tables and the existing `sequenceEditorialItems` table (gap-aware montage layer) were read for column-naming and index conventions. JSON-in-TEXT is an established pattern (`comfyWorkflows.workflowJson`, `appSettings`'s JSON-valued keys, `sequenceEditorialItems`'s own future-reserved columns) — reused for `cutManifest`/`editorialSnapshot`/`warnings` rather than adding child tables for what are small, read-as-a-whole structures.
- `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx`: existing `SectionLabel`/`Card`/`EmptyState`/`StatusBadge` component conventions identified and reused directly — `StatusBadge` already handles `draft`/`active`/`archived` styling and gracefully falls back to the `draft` style for `published`/`outdated` (no `StatusBadge` change needed).
- `src/app/projects/[projectId]/sequences/[sequenceId]/shots/[shotId]/page.tsx`: confirmed the established "Approved Output" pattern — a plain `<video controls src={refImageUrl(path)}>` for a single already-resolved media file. This is the pattern reused for the Sequence Result viewer.
- `src/components/SequencePreviewPlayer.tsx`: audited and **not reused**. It is a multi-item playlist/scrubber built around `PreviewShot`/`PreviewItem` arrays (many shots stitched live), not a single already-assembled `videoPath`. Reusing it here would require inventing a manifest adapter and pulls in its full playlist/scrubbing state machine for no benefit at V1 — a plain `<video controls>` (matching Shot Detail's own established fallback pattern) is simpler and carries zero risk to the existing component. `SequencePreviewPlayer.tsx` itself was not modified.
- `src/actions/editorialTimeline.ts`'s `moveEditorialItem`/`resizeEditorialItemRightEdge` were read for this codebase's transaction convention (`db.transaction((tx) => { ... tx.select()...all() / tx.update()...run() ... })` with better-sqlite3's synchronous API) — followed exactly in `setActiveSequenceResult`.

**Scope decision**: table name `sequence_results`, minimal read/activate/archive/create actions, viewer + lightweight history table on Sequence Detail. No publish UI, no rendering, no Film Result, no Insert Shot, no Push Duration, no trim/duration V2 — all explicitly out of scope per the ticket and left for their own tickets.

## 2. Table Added

`sequence_results` (migration `drizzle/0021_eminent_zemo.sql`):

```text
id                 integer PK autoincrement
project_id         integer NOT NULL, FK -> projects.id (cascade delete)
sequence_id        integer NOT NULL, FK -> sequences.id (cascade delete)
source_mode        text NOT NULL              -- "basic" | "advanced"
status             text NOT NULL default 'draft'  -- "draft" | "published" | "active" | "archived" | "outdated"
video_path         text (nullable)
duration_seconds   real (nullable)
cut_manifest       text (nullable, JSON)      -- SequenceResultCutManifest
editorial_snapshot text (nullable, JSON)      -- EditorialSnapshot (OPENREEL.CONFLICT.1)
notes              text (nullable)
warnings           text (nullable, JSON string[])
published_at       text (nullable)
created_at         text NOT NULL (default now)
updated_at         text NOT NULL (default now)

index: sequence_results_sequence_idx on (sequence_id, status)
```

Types: `src/types/sequenceResult.ts` — `SequenceResultSourceMode`, `SequenceResultStatus`, `SequenceResultCutManifest`(Item), plus `parseCutManifest`/`serializeCutManifest`, `parseResultEditorialSnapshot`/`serializeResultEditorialSnapshot`, `parseResultWarnings`/`serializeResultWarnings` (all parse functions return a safe empty/null value instead of throwing on malformed JSON — a result row should stay viewable even if one JSON field is corrupt), and `sequenceResultSourceModeLabel` for the one UI wording decision (`"Advanced Editor"` / `"Basic Editorial"`).

## 3. Active Result Strategy

**Applicative uniqueness, not a DB constraint** — per the ticket's own MVP recommendation. `setActiveSequenceResult` (`src/actions/sequenceResults.ts`) runs inside a single `db.transaction`: it loads every row currently at `status: "active"` for the sequence, demotes each (except the target) to `status: "published"`, then promotes the target to `"active"`. No other code path in this ticket ever writes `status: "active"`, so this transaction is the sole gate.

A SQLite partial unique index (`CREATE UNIQUE INDEX ... WHERE status = 'active'`) was considered and rejected for V1: this project's pinned `drizzle-kit` schema builder has no first-class partial-index API, and hand-writing raw DDL into the generated migration would diverge from the schema-first workflow every other table in this repo follows. Documented as the deliberate V1 choice, not an oversight — revisit only if a concrete correctness gap surfaces (e.g. two server processes racing on the same sequence, which this single-process SQLite deployment does not currently have).

Archiving does **not** auto-promote a replacement — a sequence can be left with zero active results after an archive, which is exactly what the viewer's empty state already handles.

## 4. Server Actions

`src/actions/sequenceResults.ts`:
- `listSequenceResults(projectId, sequenceId)` — all results, most recent first (empty array, not an error, if ownership fails or none exist).
- `getActiveSequenceResult(projectId, sequenceId)` — the current active row or `null`. (Not called by the viewer directly — the viewer uses `listSequenceResults` once and derives active/previous client-side-in-the-server-component to avoid a second query; `getActiveSequenceResult` exists as a narrower read primitive for future callers, e.g. a publish action checking whether *something* is already active.)
- `setActiveSequenceResult(projectId, sequenceId, resultId)` — promote/demote transaction described above.
- `archiveSequenceResult(projectId, sequenceId, resultId)` — sets `status: "archived"`.
- `createSequenceResult(input)` — the creation primitive, **not wired to any UI in this ticket**. Exists so `BASIC.EDITORIAL.1`/`OPENREEL.PUBLISH.1` have a write path to call rather than re-deriving one, and so this ticket's own manual validation could seed rows in a documented, code-reviewed shape (in practice, direct DB script inserts were used for the actual manual test — see §7 — since there is no test-creation UI per the ticket's explicit "ne pas exposer une UI de création lourde").

Every action re-checks `sequence.projectId === projectId` (via `assertSequenceOwnership`) before reading or writing — same ownership-check convention as every other sequence-scoped action in this codebase.

## 5. Viewer UI

`src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx` — new **Sequence Result** section, placed immediately after the page header (before Context/Shots), reflecting its role as the sequence's primary output:

- **Active result present**: `<video controls>` (if `videoPath` set, else a "No video file recorded for this result yet." note), then a row of `Source: <Basic Editorial|Advanced Editor>`, `Status: <StatusBadge>`, `Duration: <n>s` (if set), `Published: <date>` (if set), followed by `notes` and any `warnings` (⚠-prefixed list) when present.
- **No active result**: `EmptyState` — `"No sequence result published yet."` / `"Use Basic Editorial or Advanced Editor to publish a playable result."`, matching the ticket's exact suggested copy.
- **Previous Results** (only rendered when at least one non-active result exists): a compact table (Source, Status, Duration, Published, actions) with `Set Active` / `Archive` per row (hidden for already-archived rows). Both actions are plain inline server actions (`async () => { "use server"; ... }`, closing over the row's id) submitted via a small new client component, `SequenceResultActionForm.tsx` — a confirm-optional variant of the existing `DeleteButton.tsx` pattern (Archive asks for confirmation; Set Active, being low-risk and reversible, does not).

All UI labels in English, matching the ticket's exact suggested strings where given.

## 6. Migration

```bash
npm run db:generate   # -> drizzle/0021_eminent_zemo.sql
npm run db:migrate    # applied to the local dev DB
```

The generated migration is a single isolated `CREATE TABLE` + one `CREATE INDEX` statement — confirmed via direct inspection (`drizzle/0021_eminent_zemo.sql`) that nothing else in the schema was touched. Applied and verified via `PRAGMA table_info(sequence_results)` against the local dev database.

## 7. Validation

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — compiled successfully, all routes generated (same pre-existing, unrelated Turbopack NFT-tracing warning seen in every prior ticket).
- **Empty state**: confirmed via live dev server (`GET /projects/4/sequences/30`) — "No sequence result published yet." / "Use Basic Editorial or Advanced Editor..." both present with zero rows in `sequence_results`.
- **Active result render**: inserted one test row directly via a controlled `better-sqlite3` script (project 4 / sequence 30, `sourceMode: "advanced"`, `status: "active"`, `videoPath` pointing at shot 36's real approved video file, `durationSeconds: 33.4`, `notes`, one `warnings` entry, `publishedAt` set) — confirmed via page fetch: video `<video>` tag with the correct `src`, `Source: Advanced Editor`, active `StatusBadge`, `Duration: 33.4s`, formatted `Published:` date, the notes text, and the warning line all rendered.
- **Previous Results / Set Active**: inserted a second row (`sourceMode: "basic"`, `status: "draft"`, no `videoPath`) — confirmed the "Previous Results" table appeared. Since there is no browser automation tool in this environment (consistent with every prior ticket in this series), the `setActiveSequenceResult` transaction's *logic* was verified by replicating its exact SQL sequence (select current active rows → demote every one except the target to `published` → promote the target to `active`) directly against the dev DB: result confirmed id 1 (previously active) → `published`, id 2 → `active`, exactly one active row afterward. Re-fetched the page and confirmed the viewer now showed the newly-active "Basic Editorial" result (with the "No video file recorded" note, correctly reflecting its null `videoPath`).
- **Archive**: set id 1 to `archived` directly, confirmed the badge rendered `archived` on the page.
- Cleaned up: deleted both test rows (`DELETE FROM sequence_results WHERE sequence_id = 30`), re-confirmed the empty state was restored. No runtime DB state or media files were committed — the test rows and their manual insert/cleanup scripts were local-only and reverted before this ticket concluded.

## 8. Limits

- `setActiveSequenceResult`'s single-active guarantee is applicative (transaction-scoped), not DB-enforced — documented in §3 as the deliberate V1 choice.
- No publish action exists yet in either mode — `createSequenceResult` is unreachable from the UI in this ticket, by design.
- No video rendering/assembly exists — `videoPath`/`cutManifest` are read-only fields for now; nothing in this ticket produces either.
- No staleness check wired between a `SequenceResult.editorialSnapshot` and the sequence's *current* editorial state — the column exists and is parseable, but comparing it (the way `OPENREEL.CONFLICT.1` compares a timing patch's snapshot) is left for whichever future ticket implements publish/activate staleness detection, per `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §9.
- The "Previous Results" table has no pagination — acceptable at V1 scale (a sequence is expected to accumulate a handful of results, not hundreds), revisit if that assumption breaks.
- `getActiveSequenceResult` is currently unused by the viewer itself (which reuses `listSequenceResults`'s result to avoid a second query) — kept as a public read primitive for future single-result callers.

## 9. Next Steps

```text
1. BASIC.EDITORIAL.1  — Basic assembler (reorder/trim/insert/preview) that
                         calls createSequenceResult to actually publish.
2. OPENREEL.PUBLISH.1 — Advanced/OpenReel side of the same publish flow.
3. EDITORIAL.INSERT.1 — Insert New Shot from editorial context.
4. FILM.RESULT.1      — Assemble a final short film from active Sequence
                         Results across a project's sequences.
```

## 10. Files Modified

- `src/db/schema.ts` — new `sequenceResults` table + `SequenceResult`/`NewSequenceResult` types.
- `drizzle/0021_eminent_zemo.sql` — generated migration (new file).
- `src/types/sequenceResult.ts` (new).
- `src/actions/sequenceResults.ts` (new).
- `src/components/SequenceResultActionForm.tsx` (new).
- `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx` — Sequence Result + Previous Results sections.
- `docs/SEQUENCE_RESULT_1_DATA_MODEL_VIEWER.md` (this document).

## 11. Confirmations

- No `package.json`/lockfile change.
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- `SequencePreviewPlayer.tsx` **not modified** — audited and found unsuitable for direct reuse (see §1); no code path in this ticket imports or touches it.
- No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched — this ticket is entirely MikAI-side, per its own constraint.
- No runtime DB/uploads/outputs/storage committed — all manual-test DB writes were temporary, local, and reverted (§7).
- Schema/migration touched **only** for `SequenceResult`, as explicitly authorized by this ticket.
