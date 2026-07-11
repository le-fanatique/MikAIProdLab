# EDITORIAL.UX.1 — Unify Basic / Advanced editorial access

## 1. Route audit

| Route | What it does today | Verdict |
|---|---|---|
| `/projects/{id}/sequences` (no sequence id) | **Does not exist as a route** — no `page.tsx` at that path. Returns 404 (confirmed live). The sequence list users likely mean is the "Sequences" section embedded in Project Detail (`/projects/{id}`). | Documented, not built (see §7). |
| `/projects/{id}/sequences/{sid}` (Sequence Detail) | Shot list, Insert Shot Here, Publish Basic Sequence Result, Sequence Result viewer, quick per-shot duration timeline (`SequenceTimelineEditor`), sequence context, assets, LLM assist. **No Advanced/OpenReel access, no Export JSON, before this ticket.** | **Made canonical this ticket** (see §2). |
| `/projects/{id}/sequences/{sid}/editorial` | `EditorialWorkspace` (timeline + `SequencePreviewPlayer`, shared selection) and `EditorialShotList` — the **only** place with per-shot trim-in/out editing and gap-aware fallback/order controls. Not duplicated by `SequenceTimelineEditor`, which only edits raw per-shot duration, nothing else. | **Not redundant — kept, not redirected** (see §3). |
| `/projects/{id}/sequences/{sid}/nle-prototype` | OpenReel bridge (Advanced Editor link + Export JSON link) plus a preview workspace (`NlePrototypeWorkspace`). Was the only place with the OpenReel/export links before this ticket. | **No longer needed as the primary path** to those two links — kept as-is otherwise (see §4). |

**Buttons/actions found before this ticket**: `Publish Basic Sequence Result` (Sequence Detail), `Insert Shot Here` / `Insert New Shot` (Sequence Detail), `Open in Advanced Editor` + `Export Editorial JSON` (nle-prototype only), trim/fallback controls (`/editorial` only).

**OpenReel links location**: only on `/nle-prototype`, built inline in that page's server component from `getMikAIPublicBaseUrl()` + `getOpenReelSidecarUrl()` (both `src/lib/settings.ts`, unchanged this ticket) plus the sequence's `editorial-export` route.

**Export Editorial JSON**: `GET /api/projects/{projectId}/sequences/{sequenceId}/editorial-export` (`src/app/api/.../editorial-export/route.ts`), unchanged — already a plain fetchable JSON endpoint, no changes needed to make it linkable directly.

**Basic Editing canonical page**: `/projects/{id}/sequences/{sid}` (Sequence Detail) — already had the shot list, Insert Shot, and Publish Basic before this ticket; this ticket adds Advanced/Export access to complete it as the single entry point.

## 2. Sequence Detail changes

Added a new **"Editorial Actions"** section directly below the page header (before "Sequence Result"), containing three actions in one row:

- **`Publish Basic Sequence Result`** — moved here from the old "Sequence Result" section header (same component, `PublishBasicSequenceResultButton`, unchanged).
- **`Open in Advanced Editor`** — new. Opens the OpenReel sidecar in a new tab, pre-loaded with this sequence's editorial export. Built via a new shared helper, `src/lib/editorial/advancedEditorLink.ts` (`buildAdvancedEditorHref`, `editorialExportHrefFor`), extracted from the URL-building logic that previously only existed inline in `/nle-prototype/page.tsx`. `/nle-prototype` was refactored to call the same helper — confirmed byte-identical output before/after (see §6).
- **`Export Editorial JSON`** — new. Direct link to the existing `editorial-export` API route, opened in a new tab.

Below the button row, a small helper note: `OpenReel must be running at {sidecarOrigin}.` (reads the same configured Settings value the link itself uses — never hardcoded), plus a collapsed-by-default `Show OpenReel start command` disclosure containing:

```
cd F:/AI/mikai-openreel-sidecar
npx -y pnpm@9.0.0 dev
```

## 3. `/editorial` behavior

**Kept, not redirected.** The audit found real, non-duplicated functionality there — per-shot trim-in/out editing and gap-aware fallback/order controls (`EditorialShotList`, `EditorialWorkspace`) that `SequenceTimelineEditor` (Sequence Detail's own timeline) does not provide. Redirecting or disabling the page would have removed real capability, which the ticket explicitly prohibited without justification.

Instead, added a one-line clarifying banner at the top of `/editorial`:

> Most editorial actions have moved to the **Sequence page**. This page provides advanced trim-in/out and fallback controls.

— with a working link back to Sequence Detail. The Sequence Detail "Timeline" section's link to this page was also relabeled from the generic `Open Editorial →` to `Advanced Trim & Fallback Controls →`, so its purpose is clear before a user even clicks through.

**Recommendation for a future ticket** (not done here — out of scope, "no deep redesign"): migrate trim-in/out editing into Sequence Detail's own shot list/timeline directly, at which point `/editorial` could be fully retired. Until then it remains a real, load-bearing secondary page, not a fallback/debug one.

## 4. `/nle-prototype` behavior

No longer required as a pass-through for Advanced Editor / Export JSON access — both are now directly on Sequence Detail. The page itself is unchanged in behavior (still works, still shows its own preview workspace) except for the internal refactor to reuse `buildAdvancedEditorHref` instead of duplicating the URL-building logic. Not removed or redirected — the ticket's out-of-scope list explicitly excludes "suppression définitive de routes sans audit," and no audit here justified removing it (its `NlePrototypeWorkspace` preview is a distinct, still-functional view). Left as a reachable secondary/debug page.

## 5. `/projects/{id}/sequences` (no id)

Confirmed via a live 404 check that this route does not exist in the app today — there is no `page.tsx` at `src/app/projects/[projectId]/sequences/page.tsx`. The sequence list the ticket's problem statement likely refers to is the "Sequences" section already embedded in Project Detail (`/projects/{id}`), which already fulfills the "list/navigate sequences, not a Basic editing tool" role the ticket asks to preserve. No route was built or changed here — out of scope for this ticket's UX-clarification goal, since the confusion was about which page **already has** Basic editing controls, not about a genuinely missing list page. **Recommendation for BASIC.EDITORIAL.2**: either document that `/projects/{id}` is the correct "sequences list" URL, or add a lightweight `/projects/{id}/sequences` route that simply redirects to `/projects/{id}` for users who type the URL directly.

## 6. Player resize

The `Sequence Result` viewer's `<video>` element on Sequence Detail (previously `className="w-full ..."`, unconstrained beyond its Card's own width) now has `max-w-xl` added (`className="w-full max-w-xl ..."`), constraining it to 36rem (576px) while staying responsive/centered within its container. Confirmed via live rendering — the class is present in the served HTML and the reduction is substantial relative to the unconstrained width. The Film Result player (Project Detail page) and `SequencePreviewPlayer` (used by `/editorial` and `/nle-prototype`) were **not** touched — different `<video>` element and a different component respectively, out of scope per the ticket.

## 7. Previous Results collapsed

New minimal client component, `src/components/Collapsible.tsx` (no existing collapsible component was found in the codebase — searched for `<details>`/collapsible patterns first). Generic: `label` + `defaultOpen` + `children`. Used to wrap Sequence Detail's "Previous Results" table, `defaultOpen={false}` (the prop default), with the row count in the label (`Previous Results (N)`). All existing `Set Active` / `Archive` actions are unchanged — they're just not mounted until the user expands the section (normal React children, no data loss, no separate fetch).

## 8. Manual validation

Ran against **Project 4**, sequences 30 and 31 (both have a real active Sequence Result), via a live dev server:

1. `/projects/4/sequences/31` — confirmed `Publish Basic Sequence Result`, `Open in Advanced Editor`, `Export Editorial JSON` all present in the new "Editorial Actions" section, in that order.
2. `Export Editorial JSON` → `GET /api/projects/4/sequences/31/editorial-export` returns `200` with valid JSON (`mikai-editorial-export-v1` schema, sequence/tracks data present).
3. `Open in Advanced Editor` → href confirmed: `http://127.0.0.1:5173/?mikaiExportUrl=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fprojects%2F4%2Fsequences%2F31%2Feditorial-export&mikaiProjectId=4&mikaiSequenceId=31` — identical to what `/nle-prototype` produces for the same sequence (confirmed byte-for-byte via direct HTML comparison), confirming the extracted helper is a faithful refactor, not a behavior change.
4. Confirmed `/nle-prototype` is no longer required for this workflow — both links now originate directly from Sequence Detail.
5. `Previous Results` confirmed collapsed by default on both sequence 30 (2 previous results) and sequence 31 (1 previous result) — SSR output shows only the closed toggle button, no table rows, until expanded client-side.
6. Sequence Result player confirmed to carry `max-w-xl` in the rendered HTML (was unconstrained before).
7. `/projects/4/sequences/31/editorial` — confirmed the new banner renders with a working link back to `/projects/4/sequences/31`.
8. `/projects/4/sequences` (no id) — confirmed `404`, consistent with §5's finding; not a regression introduced by this ticket.

No functional bugs were found during validation — all changes worked as implemented on the first pass.

## 9. Limitations

- `/editorial`'s trim/fallback controls remain a separate page rather than being merged into Sequence Detail — a deliberate scope boundary for this ticket, not an oversight (see §3's recommendation).
- `/projects/{id}/sequences` (no id) remains a 404 — not built, since the actual list already lives at `/projects/{id}` (see §5).
- No automated test coverage — this repo has no test runner; validation was manual, via a live dev server, reverted before commit.

## 10. Next step

Recommended: **BASIC.EDITORIAL.2** — decide whether to migrate `/editorial`'s trim-in/out controls into Sequence Detail directly (fully retiring `/editorial`), and/or add a lightweight `/projects/{id}/sequences` redirect for users who type that URL directly.

## Confirmations

- No schema/migration change.
- No new npm package.
- ComfyUI/generation/job runner/polling code untouched.
- `SequencePreviewPlayer` untouched (no route or component using it was modified beyond the `/editorial` page's added banner text, which sits outside that component).
- OpenReel sidecar repo untouched (sidecar HEAD unchanged this ticket).
- No route was deleted; `/editorial` and `/nle-prototype` remain fully functional.
- No runtime/upload/storage/local-DB file was committed.
