# EDITORIAL.INSERT.1 — Insert New Shot from Basic Editorial Context

Status: MikAI-only implementation, real end-to-end verification against the live dev server. MikAI HEAD before this ticket: `c9333e5 — Publish advanced sequence results from OpenReel`, working tree clean.

## 1. Audit Summary

- **Shot storage/order**: `shots` (`src/db/schema.ts`) has a plain integer `orderIndex`, no unique constraint — `src/actions/shots.ts` already has every pattern needed: `createShot`/`createPlaceholderShot` (append at `max(orderIndex)+1`), `updateSequenceShotOrder` (full batch rewrite). **No existing helper inserts a shot *between* two others**, shifting everything after — this ticket adds the first one.
- **"Missing/draft shot" convention**: confirmed via `createPlaceholderShot` (`src/actions/shots.ts`) and `isPlaceholder: shot.title === "Placeholder"` (used throughout `editorialDocument.ts`/`editorial-export`/`editorial-timing-patch` routes) — **`title === "Placeholder"` is the existing convention**, not a separate status column. Reused verbatim; no new concept introduced.
- **Editorial-items layer**: `sequence_editorial_items` is a *separate*, independently-ordered table, populated once via `initializeEditorialTimeline` (idempotent, copies shot order at that moment) — **not automatically kept in sync with `shots.orderIndex`** by anything. `basicCutManifest.ts`/`buildEditorialDocument` read exclusively from this table, never from `shots` directly. This meant a new shot invisible to the editorial-items layer would be invisible to Basic publish too — the insert action must write to **both** tables when the layer exists, confirmed as the critical implementation detail from this audit.
- **Sequence Results / staleness**: `SequenceResultStatus` already includes `"outdated"` in its type (`src/types/sequenceResult.ts`, from `SEQUENCE_RESULT_1`) — **no schema/type change needed**, just a helper to actually write it. `setActiveSequenceResult`'s active/published demote-transaction (`src/actions/sequenceResults.ts`) was read carefully to confirm outdating a result doesn't interact with or break that logic — outdated rows are simply excluded from any "currently active" query, same as archived ones.
- **LLM infra**: `src/actions/llm/sequenceShots.ts` (`generateShotsFromSequenceDraft`) provided the exact template — `callLLMJson(prompt, config)` with a `{system, user}` `LLMPrompt`, `getLLMConfig()`, fenced-JSON-tolerant parsing. Simple enough to include in this ticket, not deferred.
- **UI placement**: Sequence Detail page's Shots table (`sequences/[sequenceId]/page.tsx`) was the natural fit — `/nle-prototype` was considered and rejected (it's the OpenReel-bridge export page, not a Basic editorial surface; inserting there would blur the Basic/Advanced boundary this whole ticket series has been careful to keep separate).

## 2. Behavior (V1)

```text
Insert Shot Here / Insert New Shot
→ creates a real production Shot (shots table row) in the current Sequence
→ inserted between two existing shots (via insertAfterShotId/insertBeforeShotId), or at the end
→ default target duration: 5 seconds
→ title defaults to "Placeholder" (existing missing-shot convention) if left blank
→ optional Generate Shot Brief from Neighbors (LLM, preview — no silent auto-apply)
→ mirrored into the sequence_editorial_items layer, if one already exists for the sequence
→ every non-terminal (active/published) Sequence Result for the sequence is marked outdated
```

## 3. Server Actions

`src/actions/editorialInsert.ts` (new):

- **`insertShotInSequenceFromEditorialContext({ projectId, sequenceId, insertAfterShotId?, insertBeforeShotId?, targetDurationSeconds?, title?, description?, notes? })`** — the insert itself. `notes` maps to `shots.continuityNotes` (the closest existing free-text field; `shots` has no generic "notes" column). All of the following happens inside **one** `db.transaction`:
  1. Shift every shot at/after the insertion point's `orderIndex` by `+1`.
  2. Insert the new shot (auto-generated `shotCode` via the existing nomenclature helper, `resolveShotPromptWithDefault` for `shotPrompt`, exactly matching every other shot-creation path's conventions).
  3. If `sequence_editorial_items` already has rows for this sequence: find the insertion point by matching `shotId` (not by `shots.orderIndex`, which has just changed — the editorial layer's own ordering is used), shift those rows' `orderIndex` similarly, and insert a matching `"shot"` item (`startSeconds: null`, matching the schema's own documented "not yet backfilled" convention — `buildEditorialDocument`'s cumulative-cursor fallback places it correctly either way).
  4. **Never calls FFmpeg, never publishes, never touches a video file** — purely a structural/DB change, per the ticket's explicit constraint.
  5. Outside the transaction (a separate, fast call, not worth holding the transaction open for): `outdateSequenceResultsForSequence(projectId, sequenceId)`.

- **`generateInsertedShotBriefFromNeighbors({ projectId, sequenceId, insertAfterShotId?, insertBeforeShotId? })`** — optional LLM assist, **preview only**, creates nothing. Builds a focused prompt from the project's pitch/story, the sequence's summary/mood/narrative purpose, and the previous/next shot's title/description/continuity fields, asking for a single bridging shot brief (`{title, description, notes}`). Same fenced-JSON-tolerant parsing as `sequenceShots.ts`. No silent auto-apply — the returned brief only pre-fills the insert form's fields, which remain fully editable before the user clicks Create Shot.

`src/actions/sequenceResults.ts` (extended, not schema-changed):

- **`outdateSequenceResultsForSequence(projectId, sequenceId)`** — sets `status: "outdated"` on every `active`/`published` result for the sequence (`draft`/`archived`/already-`outdated` rows are left alone). Does not auto-promote or delete anything. Reused the already-existing `"outdated"` enum value from `SequenceResultStatus` — **confirmed no schema/migration change was needed**, since that value was already part of the column's TypeScript type from `SEQUENCE_RESULT_1`, just never written by any code path until now.

## 4. UI

`src/components/InsertShotFromEditorialButton.tsx` (new, client component) — rendered as its own table row (`colSpan={6}`, matching the Shots table's column count) directly below each shot row (`insertAfterShotId: shot.id`, label **"Insert Shot Here"**), plus one more after the last shot (label **"Insert New Shot"**). Collapsed state is a small link; clicking expands an inline form in the same row:

- **Title** (placeholder text "Placeholder"), **Description**, **Notes** (all plain text inputs/textareas).
- **Target Duration** (number input, prefilled `5`).
- **Generate Shot Brief from Neighbors** button — calls the LLM action, fills Title/Description/Notes as an editable draft (`"Generated — edit before creating."` note shown), never submits anything itself.
- **Create Shot** — confirms with **"Create a new production shot at this editorial position?"** (exact ticket wording), then calls the insert action. On success: **"Shot created. Sequence results were marked outdated. Publish a new result when ready."** (or just "Shot created." if there was nothing to outdate), collapses the form, and `router.refresh()`s so the table/viewer update immediately.
- **Cancel** — collapses without submitting.
- Errors surfaced inline, exact ticket wording where specified (**"Could not create shot."** is not a literal string emitted anywhere — the action always returns a more specific message; **"Invalid insertion position."** and **"Target duration must be greater than 0."** are both emitted verbatim, confirmed in §6).

All labels in English, matching the ticket's exact recommended strings.

### Outdated feedback in the Sequence Result viewer

A real bug in the *original* viewer logic was found and fixed while building this: the viewer's `activeResult` was computed as strictly `sequenceResults.find(r => r.status === "active")`. Once a result is marked `"outdated"`, it is by definition no longer `"active"` — so with the *original* logic, an outdated result would vanish from the main viewer slot entirely, falling back to the "No sequence result published yet." empty state. That directly contradicts the ticket's own instruction ("Ne pas supprimer le viewer : l'utilisateur peut encore vouloir relire l'ancien résultat."). **Fixed**: the viewer now shows the active result if one exists, else falls back to the most recent `outdated` one (results are already `createdAt`-descending), with a banner:

> This result is outdated because the sequence changed after it was published.
> Publish a new Basic or Advanced Sequence Result to update it.

(exact ticket wording). The video, source, duration, and any notes/warnings for that outdated result remain fully visible and playable — only the banner is new.

## 5. Real Verification (Project 4, Sequence 30)

Performed against the live dev server via a temporary, uncommitted test route (created, used, then deleted; confirmed absent from `git status` at commit time — no test runner exists in this repo, consistent with every prior ticket).

**Baseline**: 6 shots, `sequence_results` had one `active` (Advanced, id 4, from `OPENREEL.PUBLISH.1`) and one `published` (Basic, id 3, from `BASIC.EDITORIAL.1.B`) result — a deliberately realistic starting state for testing the outdate behavior against *two* non-terminal results at once.

1. **Insert between shot 36 and shot 37**: `insertShotInSequenceFromEditorialContext({ projectId: 4, sequenceId: 30, insertAfterShotId: 36, notes: "..." })` → `{"ok":true,"shotId":75,"outdatedResultsCount":2}`.
2. **DB confirmed**: new shot 75 (`title: "Placeholder"`, `durationSeconds: 5`, `continuityNotes` set, auto-generated `shotCode: "Sh_100"`) inserted at `orderIndex: 1`; every shot originally at `orderIndex >= 1` shifted to `+1` correctly (37→2, 39→3, 38→4, 40→5, 41→6). A matching editorial item (id 16, `shotId: 75`, `startSeconds: null`) inserted at the correct position in the independently-ordered `sequence_editorial_items` layer, with every later item shifted the same way. **Both** `sequence_results` rows (id 3 and id 4) correctly transitioned to `"outdated"`.
3. **Page confirmed**: `GET /projects/4/sequences/30` — shot count updated to "7 shots", shot 75 visible in the table between shots 01 and 02 with title "Placeholder" and code `Sh_100`, and the outdated banner rendered exactly as specified.
4. **Error paths confirmed**: `targetDurationSeconds: 0` → `{"ok":false,"error":"Target duration must be greater than 0."}`; `insertAfterShotId: 999999` → `{"ok":false,"error":"Invalid insertion position."}`; `sequenceId: 999999` → `{"ok":false,"error":"Sequence not found."}` — no crash in any case.
5. **Generate Shot Brief from Neighbors confirmed live**: called with the real previous/next shot context (shot 36 / shot 75) → a real, coherent, production-ready brief was returned (title, description, and notes bridging the two shots' continuity) — this is included in this ticket, not deferred to `.2`.
6. **Cleanup**: per explicit decision (asked, not assumed — unlike the prior two tickets' video/DB artifacts, a structural shot insertion renumbers every later shot's position and was judged more disruptive to leave mixed into real production data), the test shot, its editorial item, and the two outdated statuses were fully reverted via a direct DB script: shot 75 and editorial item 16 deleted, every shifted `orderIndex` decremented back, and `sequence_results` id 3/id 4 restored to `published`/`active`. Confirmed via a final DB read matching the exact pre-test baseline, and via the page re-showing "6 shots" with no outdated banner.

`npx tsc --noEmit` — 0 errors. `npm run build` — compiled successfully, all routes generated (same pre-existing, unrelated Turbopack NFT-tracing warning seen in every prior ticket).

## 6. A Real Bug Found (Next.js Constraint)

`"use server"` files may only export **async functions** — a plain `export const DEFAULT_INSERTED_SHOT_DURATION_SECONDS = 5` inside `editorialInsert.ts` silently broke **the entire module's exports** at build time (`"Export insertShotInSequenceFromEditorialContext doesn't exist in target module"`, `"The module has no exports at all."`) — not just the one bad export. **Fixed** by keeping the constant server-side-only (unexported, private to the action file) and duplicating the same default value locally in the UI component with a comment explaining why it can't be shared via import. Documented here since it's a sharp, non-obvious Next.js constraint worth remembering for future `"use server"` files in this codebase.

## 7. Limitations

- **No editorial-items backfill for a sequence that never called `initializeEditorialTimeline`**: if a sequence has zero `sequence_editorial_items` rows, this insert action correctly still creates the real Shot (and outdates results), but does **not** create an editorial-items layer from scratch — matching the ticket's own scope (initializing that layer is a separate, pre-existing, opt-in action). Basic publish already fails cleanly for such a sequence regardless (documented in `BASIC_EDITORIAL_1B`), so this ticket doesn't change that pre-existing behavior.
- **`notes` is stored in `shots.continuityNotes`** — the closest existing free-text field, not a dedicated "editorial reason" column. Acceptable for V1; a future ticket could add a dedicated field if this proves to conflate two different concerns in practice.
- **No re-check of whether an insert happened *during* a Basic/Advanced render** — the same class of gap already documented in `BASIC_EDITORIAL_1B`/`OPENREEL_PUBLISH_1`'s own limitations sections, not addressed here either.
- **Generate Shot Brief prompt is intentionally simple** — no cast/asset context beyond project pitch/story and sequence/neighbor-shot fields, per the ticket's own "rester production-ready... ne pas créer un long texte" instruction.

## 8. Files Modified

- `src/actions/editorialInsert.ts` (new).
- `src/actions/sequenceResults.ts` — `outdateSequenceResultsForSequence` added.
- `src/components/InsertShotFromEditorialButton.tsx` (new).
- `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx` — Insert Shot buttons wired into the Shots table; outdated-result viewer fix (§4).
- `docs/EDITORIAL_INSERT_1_BASIC_INSERT_SHOT.md` (this document).

## 9. Next Steps

```text
1. FILM.RESULT.1 — Assemble a final short film from active Sequence Results
                    across a project's sequences.
2. A future ticket for "Push Duration to MikAI" (per
   docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md §8) remains unimplemented — the
   inserted shot's 5s target duration is a production target from day one,
   consistent with that document's rules, but there is still no explicit
   "push" action anywhere in the codebase for adjusting an existing shot's
   target duration after the fact from an editorial context.
```

## 10. Confirmations

- No `src/db/schema.ts` change, no migration — `"outdated"` was already part of `SequenceResultStatus`'s type from `SEQUENCE_RESULT_1`; this ticket only added the code path that writes it.
- No new `package.json` dependency.
- No ComfyUI/generation/job runner/polling code touched.
- No `SequencePreviewPlayer` change.
- No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched or read — this ticket's own explicit constraint.
- No FFmpeg call anywhere in this ticket's code — insertion is a pure DB/structural change.
- No runtime DB/uploads/outputs/storage committed — the real shot/editorial-item/status changes created during verification were reverted (§5.6); confirmed via `git status`/`git diff --stat` before staging (only source files listed in §8 appear).
