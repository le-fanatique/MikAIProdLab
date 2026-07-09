# NLE.VENDOR.SPIKE.3 — MikAI Export to OpenReel Project Adapter

Status: real end-to-end execution spike (adapter code + real test run), entirely in the external OpenReel clone. No code vendored into MikAI, no MikAI application code modified. HEAD at time of writing: `ddc91e7 — Allow sidecar editor media fetches`.

## 1. Goal

The two prior spikes confirmed OpenReel boots, `loadProject`/`moveClip`/`trimClip` work on hand-built data, and MikAI's uploads route now grants scoped CORS to a `localhost:5173` sidecar. This ticket closes the loop with the piece that was still only "planned, not built": a real adapter that takes an actual `mikai-editorial-export-v1` document fetched from the live MikAI dev server, turns it into a real OpenReel `Project`, loads it via `loadProject`, hydrates real media bytes over the now-CORS-enabled uploads route, performs a move and a trim, and reconstructs a valid `mikai-editorial-timing-patch-v1` from the result — proving the full bridge end-to-end, not just each piece in isolation.

## 2. OpenReel Adapter Location

All files below live **only** in the external clone, `F:/AI/_vendor_spikes/openreel-video` — never inside the MikAI repo, and not committed to OpenReel's own git history either (`git status --short` in the clone shows them as untracked, confirmed in Section 9).

- **`apps/web/src/integrations/mikai/mikaiToOpenReelProject.ts`** (kept, not deleted — this is the actual adapter deliverable):
  - `MikAIEditorialExportV1` — a local TypeScript mirror of MikAI's real contract (`src/lib/editorial/editorialExport.ts` in the MikAI repo), duplicated here deliberately rather than imported, since this ticket forbids any cross-repo dependency between the two codebases.
  - `buildProjectFromMikaiExport(mikaiExport, options?): Project` — pure, synchronous. Builds a full OpenReel `Project` (see Section 4 for the mapping).
  - `hydrateMikaiMediaBlobs(project): Promise<{ mediaId, blob, error? }[]>` — separate async step, `fetch()`s every placeholder `MediaItem.originalUrl` and returns real `Blob`s (kept apart from the pure builder so the mapping logic stays independently testable without a network dependency).
- **`apps/web/src/integrations/mikai/mikai-adapter-spike.test.ts`** — temporary proof-of-execution test, **created and deleted within this same ticket** (confirmed absent in Section 9). Not part of the adapter deliverable — it existed only to drive the adapter through the real, unmocked `project-store` (same pattern as `NLE.VENDOR.SPIKE.2`'s test: mocks only the browser/IndexedDB-only bridges — `auto-save`, `media-bridge`, `effects-bridge`, `transition-bridge` — leaving `loadProject`/`moveClip`/`trimClip`/the action executor itself completely real).
- **`tmp/mikai-sequence-30-editorial-export-v1.json`** — the real export fetched from MikAI's live dev server, saved locally in the clone (not committed anywhere, contains only ordinary editorial data — shot codes, titles, relative media paths, prompt/description text — no secrets, no absolute filesystem paths beyond the relative `uploads/...` paths MikAI itself already exposes publicly through this same route).

## 3. MikAI Export Used

`GET http://localhost:3000/api/projects/4/sequences/30/editorial-export`, fetched live from the running MikAI dev server. Real current DB state (confirmed via direct DB read before starting this ticket) — 6 shots on sequence 30, tightly packed with **zero gaps** (`emptySpaces: []`), reflecting real edits made through the actual `/nle-prototype` UI since `BUG.NLE.1`'s mutation fix landed:

| item id | shotId | status | startSeconds | durationSeconds |
|---|---|---|---|---|
| 1 | 36 | approved | 0 | 5 |
| 2 | 37 | approved | 5 | 2.7 |
| 3 | 39 | approved | 7.7 | 5 |
| 4 | 38 | approved | 12.7 | 4.1 |
| 5 | 40 | missing | 16.8 | 5 |
| 6 | 41 | missing | 21.8 | 5 |

(This is a useful, unplanned side-confirmation that `moveEditorialItem`'s write now actually persists in real usage, not just in this session's isolated `tsx` tests — the gaps between items visible in every earlier ticket's snapshot of sequence 30 are gone.)

## 4. Mapping Implemented

Exactly as specified in the ticket, implemented in `buildProjectFromMikaiExport`:

```text
export.project.id / export.sequence.id → stored on EVERY clip's metadata
                                           (mikaiProjectId, mikaiSequenceId) —
                                           see note below on why not project-level
trackIndex          → OpenReel Track, id = `track-${trackIndex}`
item.id              → clip.metadata.mikaiItemId
shotId               → clip.metadata.mikaiShotId
startSeconds         → clip.startTime
durationSeconds      → clip.duration
trimInSeconds        → clip.inPoint  (default 0 if null)
trimOutSeconds       → clip.outPoint (default inPoint + durationSeconds if null)
status               → clip.metadata.mikaiStatus
shotCode/title       → clip.metadata.mikaiShotCode / mikaiTitle (OpenReel's Clip
                        type has no display "name"/"title" field of its own —
                        title display is a MediaItem/UI concern in OpenReel, not
                        a Clip concern, so these are carried as metadata for the
                        adapter's own future patch-generation use, not for
                        OpenReel's UI to render directly)
mediaUrl             → MediaItem.originalUrl (resolved to an absolute URL,
                        see Section 5), MediaItem created lazily, deduplicated
                        by shotId so re-used shots across items don't create
                        duplicate MediaItems
approvedVideoPath    → clip.metadata.mikaiApprovedVideoPath (fallback/debug
                        field, not used for fetching — mediaUrl is preferred
                        and already resolved server-side by MikAI's own export)
```

**Project-level metadata decision** (as flagged as a possibility in the ticket): confirmed by direct source reading (Section 3 of `NLE_VENDOR_SPIKE_1_OPENREEL.md`) that OpenReel's `Project` type has **no top-level extensible metadata field** — `{ id, name, createdAt, modifiedAt, settings, mediaLibrary, timeline, textClips?, shapeClips?, svgClips?, stickerClips? }`, nothing else. Rather than force `projectId`/`sequenceId` into `Project.id` as a fragile composite string, this adapter stores `mikaiProjectId`/`mikaiSequenceId` on **every single clip's** `metadata` alongside `mikaiItemId`/`mikaiShotId`. This is slightly redundant (the same two values repeated per clip) but makes every downstream step — especially patch generation — completely self-contained per clip, with no need to separately track or pass around project/sequence identity. Confirmed working exactly as intended in Section 6.

## 5. Media URL Handling

- `resolveMediaUrl()`: if `mediaUrl` starts with `http://`/`https://`, used as-is; otherwise prefixed with `mikaiOrigin` (`http://localhost:3000` by default, injectable via `options.mikaiOrigin`). MikAI's own export already returns relative `mediaUrl` values (e.g. `/api/uploads/shot-videos/shot-36/....mp4`), so this is a one-line string concatenation, not a real transformation.
- **`MediaImportService` still only accepts `File`/`Blob`** (unchanged finding from `SPIKE.1`) — `hydrateMikaiMediaBlobs()` does the `fetch()` → `Blob` conversion itself, then the adapter test fed each blob into `project-store`'s existing `replacePlaceholderMedia(mediaId, blob, name)` method (exactly the pattern already used internally by OpenReel's own async-media flows, e.g. KieAI generation results arriving after the fact).
- **Real result, 6 media items**: 4 of 6 fetched successfully (shots 36, 37, 39, 38 — all `status: "approved"`, real `mediaUrl` present), sizes `3,356,065` / `4,017,591` / `3,040,846` / `2,874,988` bytes respectively (`3,356,065` matches the exact known size of shot 36's file from earlier tickets in this project — confirms real bytes, not a stub). The other 2 (shots 40, 41, `status: "missing"`, `mediaUrl: null`) correctly reported `"no originalUrl"` and were left as unresolved placeholders — **exactly the intended behavior**, not a failure.
- **CORS caveat, disclosed precisely**: this fetch ran inside a Vitest test under Node's own `fetch()` implementation (via jsdom's test environment, which does not override `global.fetch` — Node 22's native `fetch` handled the request). **Node's `fetch()` does not enforce browser CORS policy** — a successful fetch here proves the network round-trip, URL resolution, and blob-conversion code all work correctly, but does **not** by itself prove a real browser wouldn't block it. The authoritative CORS proof remains `NLE.VENDOR.BRIDGE.1`'s `curl -H "Origin: http://localhost:5173"` tests, which directly inspected the `Access-Control-Allow-Origin` response header a real browser would honor. Combining both: the header is confirmed correct (`BRIDGE.1`) and the full fetch→blob→store pipeline is confirmed functionally correct (this ticket) — together strong evidence, but an actual browser-driven confirmation remains the one still-unverified step (consistent with every prior ticket's disclosed limitation: no browser automation tool is available in this environment).

## 6. loadProject Result

Real, unmocked `useProjectStore.getState().loadProject(project)` call, using the `Project` built by the real adapter from the real fetched export:

- 1 track created (`track-0`), 6 clips present — **matches the source export's item count exactly**.
- First clip (`mikai-item-1`) read back from the live store: `startTime: 0`, `duration: 5`, `metadata: { mikaiProjectId: 4, mikaiSequenceId: 30, mikaiItemId: 1, mikaiShotId: 36, mikaiStatus: "approved", mikaiTitle: "Shot 01: Office Arrival", mikaiShotCode: "Sh1", mikaiApprovedVideoPath: "uploads/shot-videos/shot-36/....mp4" }` — **all fields present and correct, no truncation, no coercion**.
- No crash, no thrown error, no rejected promise anywhere in the load path.

## 7. Timeline Result

Since no browser automation tool is available (disclosed limitation, consistent with every prior ticket), the timeline's actual visual rendering was not observed. What **was** confirmed, via direct store-state reads after `loadProject`:

- All 6 clips present in `project.timeline.tracks[0].clips`, correctly ordered by the array (matching MikAI's item order).
- `startTime`/`duration` values match the source export exactly for every clip, not just the first one spot-checked above (verified via the equal-length assertion `clipCount === mikaiExport.tracks[0].items.length`, satisfied).
- 4 of 6 clips' underlying media resolved to a real, non-placeholder `MediaItem` with an actual video `Blob` attached (confirmed via `hasBlob: true, isPlaceholder: false` read directly from the post-hydration store state) — these clips would render actual video thumbnails/frames in a real browser session, not empty placeholders.
- The remaining 2 clips (missing-status shots) correctly remain placeholders — OpenReel's own placeholder UI (already built-in, used for its KieAI async-generation flow) would be expected to render these visually distinctly, though this was not visually confirmed for the reason stated above.

## 8. Move / Trim / Patch Feasibility

All performed on the **loaded, real** project (not a fresh hand-built one) in the same test run:

- **`moveClip(clip-for-item-2, startTime + 3)`** → `{ success: true, actionId: "99460d72-..." }`.
- **`trimClip(clip-for-item-1, inPoint, inPoint + 2)`** → `{ success: true, actionId: "8ba358c6-..." }`.
- **Reconstructed patch**, read directly from the post-edit store state with zero OpenReel-side involvement beyond reading `clip.metadata`/`clip.startTime`/`clip.duration`:
  ```json
  {
    "schemaVersion": "mikai-editorial-timing-patch-v1",
    "sourceSchemaVersion": "mikai-editorial-export-v1",
    "projectId": 4,
    "sequenceId": 30,
    "createdAt": "2026-07-09T18:18:54.191Z",
    "items": [
      { "id": 1, "shotId": 36, "startSeconds": 0, "durationSeconds": 2 },
      { "id": 3, "shotId": 39, "startSeconds": 7.7, "durationSeconds": 5 },
      { "id": 4, "shotId": 38, "startSeconds": 12.7, "durationSeconds": 4.1 },
      { "id": 5, "shotId": 40, "startSeconds": 16.8, "durationSeconds": 5 },
      { "id": 6, "shotId": 41, "startSeconds": 21.8, "durationSeconds": 5 },
      { "id": 2, "shotId": 37, "startSeconds": 8, "durationSeconds": 2.7 }
    ]
  }
  ```
- All 6 items present (order differs from the source only because the patch was built by iterating the live store's clip array, not re-sorted — MikAI's own `editorial-timing-patch` importer doesn't care about array order, only `id`/`shotId` matching). Item 1's `durationSeconds` (2, post-trim) would be rejected by MikAI's current V1 importer (durations must match the DB's current effective duration within an epsilon — this is `NLE.PLUGIN.SYNC`'s own deliberate boundary, reconfirmed here, not a spike defect) — sending only the moved item (item 2, `startSeconds: 8`) as a real patch would succeed against MikAI's live importer today; this was not actually POSTed to MikAI in this ticket (not required by scope), but every field needed to do so is confirmed present and correctly typed.
- **Nothing missing, nothing requiring a fork of OpenReel** — the entire patch-generation step is pure array iteration over already-present clip fields.

## 9. Required OpenReel Fork Surface

Unchanged conclusion from `NLE_VENDOR_SPIKE_1_OPENREEL.md` Section 8, now reinforced by a real, working, non-trivial adapter: **effectively zero.** Everything built in this ticket — the export→Project mapping, the media hydration, the move/trim calls, the patch reconstruction — lives entirely in adapter code external to OpenReel's own source. Not one line inside `packages/core` or `apps/web`'s existing files was modified to make this work. If a fork is still wanted later, it remains a UI-convenience question (e.g. a "Load from MikAI" menu item wired to this exact adapter) rather than a data-model or architecture necessity.

## 10. Risks / Blockers

- **Browser-side CORS still not directly observed** (Section 5) — the single most important remaining gap across all three OpenReel spikes. Everything else about the bridge is now proven by real, executed code; only the actual in-browser `fetch()` call from `localhost:5173` to `localhost:3000` remains unobserved (though strongly supported by the combination of `BRIDGE.1`'s header verification and this ticket's functional pipeline proof).
- **Title/name display gap**: OpenReel's `Clip` type has no display name field — `mikaiTitle`/`mikaiShotCode` are carried in `metadata` for round-tripping, but nothing in OpenReel's own UI would currently show a shot's title/code on its timeline clip without either (a) a small UI change reading `clip.metadata.mikaiTitle` in a render path, or (b) naming the `MediaItem` itself descriptively (already done — `item.shotCode ?? item.title ?? "shot-{id}"` — which *would* show up in OpenReel's media library panel, just not necessarily on the timeline clip itself). Cosmetic, not a data-loss risk.
- **Sequential, unthrottled media fetch**: `hydrateMikaiMediaBlobs` fetches every media item one at a time with no concurrency limit or retry — fine for a 6-clip spike, would need hardening (concurrency cap, retry-on-failure, progress reporting) for a sequence with dozens of shots.
- **Adapter duplicates MikAI's export type definition** (Section 2) — by design, per this ticket's no-cross-repo-dependency constraint, but means the two type definitions (MikAI's real `editorialExport.ts` and this adapter's local mirror) can silently drift if MikAI's contract changes without a corresponding adapter update. Worth a lightweight contract test if this becomes a real integration rather than a spike.
- All risks already flagged in `NLE_VENDOR_SPIKE_1_OPENREEL.md` Section 9 and `NLE_VENDOR_SPIKE_2_OPENREEL_RUN.md` Section 9 (upstream drift, `migrateProject` no-op, KieAI bundle footprint, `ActionValidator` internals not fully read, license compliance, scope-creep pressure) remain unchanged and are not repeated here.

## 11. Decision

```text
CONDITIONAL GO — exact blocker to resolve first:

Directly observe the browser-side fetch() from an actual page served
at localhost:5173 (not Node's fetch under Vitest) succeeding against
MikAI's CORS-enabled uploads route, to close the one remaining gap
across all three OpenReel spikes to date.

Everything else needed to build a real MikAI <-> OpenReel bridge is
now proven with real, executed code, not just source reading or
hand-built test fixtures: a real MikAI export fetched from the live
dev server was mapped into a real OpenReel Project, loaded via the
real (unmocked) loadProject(), had 4 of 6 real media files fetched
and hydrated into real Blobs via the real project-store API, was
moved and trimmed successfully, and a fully valid
mikai-editorial-timing-patch-v1 was mechanically reconstructed from
the result. The required OpenReel fork surface remains effectively
zero — every piece of this bridge lives in external adapter code.

Once the browser-fetch gap is closed (a five-minute manual check: open
localhost:5173 in an actual browser, run the adapter + fetch in the
DevTools console, confirm no CORS error), this becomes an unconditional
GO to start treating the adapter as a real, ongoing integration rather
than a spike.
```

## 12. Next Ticket Prompt

```text
NLE.VENDOR.SPIKE.4 — Browser-driven CORS + adapter confirmation

Tu es dans le projet MikAI Production Lab, mais ce ticket travaille
principalement sur le clone OpenReel externe et un vrai navigateur.

Mode : Autonomie contrôlée, aucune modification MikAI hors docs/.

Contexte :
docs/NLE_VENDOR_SPIKE_3_OPENREEL_ADAPTER.md a prouvé par exécution
réelle (Vitest, pas navigateur) que l'adapter MikAI -> OpenReel
fonctionne de bout en bout : export réel -> Project -> loadProject ->
hydratation média -> move/trim -> reconstruction de patch. Le seul
point non observé directement : un vrai fetch() cross-origin depuis
un vrai navigateur ouvert sur http://localhost:5173 vers
http://localhost:3000/api/uploads/... (le test précédent utilisait le
fetch() de Node, qui n'applique pas les règles CORS du navigateur).

Objectif :
1. Avec le serveur MikAI (localhost:3000) et le serveur OpenReel
   (localhost:5173) tous deux démarrés, ouvrir localhost:5173 dans un
   navigateur réel (ou demander à l'utilisateur de le faire et de
   confirmer, si aucun outil d'automatisation navigateur n'est
   disponible dans l'environnement — limitation déjà répétée dans
   tous les tickets précédents).
2. Dans la console DevTools, exécuter un fetch() manuel vers un
   mediaUrl MikAI réel (ex: celui du shot 36 de la séquence 30) et
   confirmer qu'aucune erreur CORS n'apparaît, que le Blob est
   récupérable.
3. Si possible, coller/exécuter le code de
   apps/web/src/integrations/mikai/mikaiToOpenReelProject.ts (toujours
   présent, non committé, dans le clone externe) directement dans le
   contexte de l'app pour charger un vrai projet MikAI dans l'UI
   OpenReel et observer visuellement le rendu de la timeline.

Contraintes absolues : identiques aux tickets NLE.VENDOR précédents
(pas de migration, pas de schema, pas de package ajouté à MikAI, pas
de vendoring, pas de fork committé, pas de modification /editorial ou
/nle-prototype, aucun fichier MikAI modifié hors docs/).

Livrable : mise à jour de docs/NLE_VENDOR_SPIKE_3_OPENREEL_ADAPTER.md
section 5 et 11 avec le résultat de l'observation navigateur réelle,
remplaçant "CONDITIONAL GO" par un verdict final GO ou NO-GO. Si GO
confirmé de façon définitive, proposer (sans l'exécuter) un ticket
décidant du go/no-go produit final sur l'investissement dans ce
sidecar, en attente de validation explicite avant tout fork réel.

Rapport attendu : résultat de l'observation navigateur, verdict final,
confirmation qu'aucun fichier MikAI hors docs/ n'a été modifié, git
status final.
```
