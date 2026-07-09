# NLE.VENDOR.SPIKE.1 — OpenReel Sidecar Feasibility

Status: source-code spike, no execution of OpenReel confirmed (see Section 2), no code vendored into MikAI. HEAD at time of writing: `17b9a55 — Add NLE sidecar editor audit`.

## 1. Goal

`docs/NLE_VENDOR_A_AUDIT.md` named OpenReel (`Augani/openreel-video`) as the winning candidate for a sidecar editor, with several items flagged "to verify": the exact `ProjectSerializer` API, whether `MediaItem` accepts a remote URL, and how deeply the "KieAI" cloud-AI feature is coupled into the core. This ticket answers those questions directly from source, and adds a concrete field-by-field mapping in both directions (MikAI export → OpenReel project, OpenReel edits → MikAI timing patch).

## 2. Run Result

- **Clone**: `git clone --depth 1 https://github.com/Augani/openreel-video.git` into `F:/AI/_vendor_spikes/openreel-video` (outside the MikAI repo, not committed). The first attempt (previous ticket) failed on Windows with `Filename too long` inside the bundled `Openreel Video.xcodeproj/.../UserInterfaceState.xcuserstate`. This time, `git config --global core.longpaths true` was set first, and the clone completed cleanly with no errors.
- **OS**: Windows (via Git Bash / WSL-less Windows shell in this environment).
- **Node**: v22.15.0 (repo requires `>=18.0.0` — satisfied).
- **pnpm**: not installed globally in this environment (`pnpm: command not found`). `corepack enable` failed with `EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarn'` (no admin rights in this environment). Worked around via `npx --yes pnpm@9` (confirmed `9.15.9` resolves and runs — `npx pnpm --version` succeeded).
- **`pnpm install`**: **not executed**. The harness's own safety classifier blocked the command with: *"Running `pnpm install` on the cloned `Augani/openreel-video` repo executes arbitrary (postinstall/build) code from an external source that the agent itself discovered via web search rather than one the user explicitly named or verified."* This is a sandbox policy decision by the coding environment, not a failure of OpenReel itself, and this ticket did not attempt to bypass it. **Practical consequence: this spike could not confirm the app actually boots.** Everything below is from reading the real, cloned source tree directly (not from documentation or marketing copy), which is strong evidence of *architectural* feasibility but is not the same as a running `pnpm dev` on `localhost:5173`.
- **Cloud dependencies for local dev**: none required to *build/dev* the web app itself — `apps/web/package.json`'s `dev` script is plain `vite`, no `.env` requirements surfaced in `apps/web` the way they did for `react-video-editor` (Section 4.3 of the prior audit). A `wrangler.toml` exists (Cloudflare Pages) but only wires the `deploy`/`deploy:preview` scripts, not `dev`.
- **Install/run complexity assessment (static, unconfirmed live)**: low on paper for the web app alone (`pnpm install && pnpm dev`), but the monorepo also contains a macOS/iOS Xcode project and an Android project at the repo root — irrelevant to a web sidecar, but they inflate the checkout and are the reason the Windows clone needed `core.longpaths`.
- **Recommendation for the next ticket**: run `pnpm install`/`pnpm dev` from a shell the user explicitly drives (or grant the harness permission for this specific action), since this is the one substantive gap left by this spike.

## 3. Relevant OpenReel Architecture

All read directly from `packages/core/src/` and `apps/web/src/stores/` in the cloned tree.

- **`ProjectSerializer`** (`packages/core/src/storage/project-serializer.ts`) — confirmed API:
  - `exportToJson(project: Project): string` — pure, synchronous, no storage/IndexedDB dependency. Strips `blob`/`fileHandle`/`waveformData` off every `MediaItem` (`stripMediaBlobs`) but does **not** touch `Clip.metadata` or any clip field.
  - `importFromJson(json: string): Project` — pure, synchronous. Parses `{ version, project }`, and for any `MediaItem` without a `blob`, sets `isPlaceholder: true` and `originalUrl: item.thumbnailUrl || undefined`. If `version !== SCHEMA_VERSION` ("1.0.0"), calls `migrateProject` (currently a no-op passthrough).
  - `validateProjectJson(json: string): ValidationResult` — structural validation (required fields, dangling `mediaId` references on clips, missing assets) with `errors`/`warnings`/`missingAssets` — directly reusable to validate an adapter's output before handing it to the app.
  - `saveProject`/`loadProject` are the only storage-coupled methods (IndexedDB via `IStorageEngine`) — irrelevant to a pure export/import bridge, which only needs `exportToJson`/`importFromJson`/`validateProjectJson`.
- **`Project` type** (`packages/core/src/types/project.ts`): `{ id, name, createdAt, modifiedAt, settings: { width, height, frameRate, sampleRate, channels }, mediaLibrary: { items: MediaItem[] }, timeline: Timeline, textClips?, shapeClips?, svgClips?, stickerClips? }`.
- **`Timeline`/`Track`/`Clip` types** (`packages/core/src/types/timeline.ts`):
  - `Timeline { tracks: Track[], subtitles: Subtitle[], duration: number, markers: Marker[], beatMarkers?, beatAnalysis? }`.
  - `Track { id, type: "video"|"audio"|"image"|"text"|"graphics", name, clips: Clip[], transitions: Transition[], locked, hidden, muted, solo }` — no explicit index field; track order is the array position in `Timeline.tracks`.
  - `Clip { id, mediaId, trackId, startTime, duration, inPoint, outPoint, effects, audioEffects, transform, volume, keyframes, metadata?: ClipMetadata, ... }` (full interface read in full — see repo).
  - `ClipMetadata { templateSource?, appliedTemplates?, templateManaged?, templateTrackType?, [key: string]: unknown }` — **open index signature confirmed directly in source**, exactly as reported (unverified) in the prior audit.
- **`MediaItem` type**: `{ id, name, type: "video"|"audio"|"image", fileHandle: FileSystemFileHandle | null, blob: Blob | null, metadata, thumbnailUrl, waveformData, filmstripThumbnails?, isPlaceholder?, originalUrl?, sourceFile?, isPending?, kieaiError?, kieaiTaskId? }`.
- **Media import pipeline** (`packages/core/src/media/media-import-service.ts`, `MediaImportService`): every public method takes `File | Blob` — grepped the whole `media/` directory for `fetch(` and found **zero matches**. **Confirmed: there is no built-in "load media from URL" path.** `originalUrl` on `MediaItem` is only ever *written* (by `importFromJson`, as a placeholder marker when a blob is absent) — it is never *read* anywhere in the codebase to trigger a fetch. This is a real, concrete integration gap (see Section 6).
- **`project-store.ts`** (`apps/web/src/stores/project-store.ts`, Zustand): the actual live app state — holds `project: Project`, and exposes the full clip/track CRUD surface, confirmed by direct signature reads:
  - `loadProject: (project: Project) => void` — **programmatic project loading confirmed, no UI interaction required.**
  - `addClip(trackId, mediaId, startTime): Promise<ActionResult>`, `addClipToNewTrack(...)`, `removeClip(clipId)`.
  - `moveClip(clipId: string, startTime: number, trackId?: string): Promise<ActionResult>` — single call handles both re-timing and moving to a different track (reorder + intercalation both covered).
  - `moveClips(...)` — batch variant.
  - `trimClip(clipId: string, inPoint?: number, outPoint?: number): Promise<ActionResult>`.
  - `splitClip(clipId, time)`, `rippleDeleteClip(clipId)`, `slipClip(clipId, delta)`, `slideClip(clipId, delta)` — full professional trim vocabulary, well beyond MikAI's MVP needs.
  - `getClip(clipId): Clip | undefined`, `getTrack(trackId): Track | undefined` — read-back accessors, used for patch generation (Section 5).
  - `beginHistoryGroup`/`endHistoryGroup`, `actionHistory`, `clipUndoStack`/`clipRedoStack` — confirmed real undo/redo via an `Action`-typed command system (`ActionValidator` class in `packages/core/src/actions/action-validator.ts`, `ActionHistory`/`ClipHistoryEntry` types imported into the store). More mature than anything either `/nle-prototype` or `tools/editor-poc/` implement.
- **Action validation**: `ActionValidator` (`packages/core/src/actions/action-validator.ts`) — a dedicated class validating actions before they're applied (not fully read line-by-line in this spike; existence and role confirmed, deep API surface not needed to answer this ticket's questions).

## 4. MikAI Export → OpenReel Mapping

```text
MikAI trackIndex          → array position in Project.timeline.tracks (Track has no
                             explicit index field — order is positional)
MikAI item.id              → clip.metadata.mikaiItemId   (ClipMetadata open index signature)
MikAI shotId                → clip.metadata.mikaiShotId
MikAI startSeconds          → clip.startTime
MikAI durationSeconds       → clip.duration
MikAI trimInSeconds         → clip.inPoint   (default 0 if MikAI value is null)
MikAI trimOutSeconds        → clip.outPoint  (default = trimIn + durationSeconds if null)
MikAI mediaUrl/approvedVideoPath → adapter must `fetch(mediaUrl)` → Blob → File, then
                             MediaImportService / addClip's mediaId — OpenReel has no
                             native "load from URL" path (Section 6)
MikAI status (approved/missing/placeholder) → clip.metadata.mikaiStatus (free-form,
                             open signature) — optionally mirror onto
                             MediaItem.isPlaceholder for status === "placeholder"/"missing",
                             since that field already drives OpenReel's own placeholder UI
```

Construction path, using only confirmed APIs: build a `Project` object in the adapter (not by calling `importFromJson` on a hand-rolled JSON string, which would require guessing at every non-timeline field OpenReel's `ProjectSerializer` might expect — direct object construction is safer and was directly observable as the shape `ProjectSerializer.importFromJson` produces), then call `useProjectStore.getState().loadProject(project)` once the app has booted. Every field not sourced from MikAI (`settings.width/height/frameRate`, etc.) needs a sane default — not currently provided by `MikAIEditorialExportV1` and not required to be (video dimensions/frame rate are an OpenReel project setting, not an editorial timing concern).

## 5. OpenReel → MikAI Patch Mapping

```json
{
  "schemaVersion": "mikai-editorial-timing-patch-v1",
  "sourceSchemaVersion": "mikai-editorial-export-v1",
  "projectId": 4,
  "sequenceId": 30,
  "createdAt": "ISO_DATE",
  "items": [
    { "id": 1, "shotId": 36, "startSeconds": 0, "durationSeconds": 5 }
  ]
}
```

- **`projectId`/`sequenceId`**: not part of OpenReel's `Project` type at all — must be carried separately by the adapter (e.g. as adapter-level state alongside the loaded `Project`, or stashed in `Project.id` itself as a composite string like `mikai-4-30`, parsed back out at export time). Not a clip-level concern.
- **`items[].id`**: read directly from `clip.metadata.mikaiItemId` for every clip in `project.timeline.tracks[].clips[]`.
- **`items[].shotId`**: read from `clip.metadata.mikaiShotId`.
- **`items[].startSeconds`**: read directly from `clip.startTime`.
- **`items[].durationSeconds`**: read directly from `clip.duration`.
- **What's missing / needs a small adapter, not a fork**: none of the four patch fields require anything OpenReel doesn't already expose on `Clip` — this is a pure read-and-map operation over `useProjectStore.getState().project.timeline.tracks`, filtering to clips that carry `metadata.mikaiItemId` (so any clip added natively inside OpenReel, with no MikAI origin, is simply skipped rather than sent as a patch item with no server-side counterpart).
- **What needs a real feature (not built by this spike, not required for a POC)**: detecting *which* clips actually changed since import, to only emit modified items (matching `NLE.PLUGIN.POC.2`'s vanilla-POC behavior of "only modified items in the patch"). OpenReel's `ActionHistory`/`actionHistory` state could plausibly drive this (diffing against the action log since load), but this was not verified — a simpler, always-correct fallback is to snapshot `clip.startTime`/`clip.duration` per `mikaiItemId` at load time in the adapter itself and diff against that snapshot at export time, entirely outside OpenReel's code.
- `trimInSeconds`/`trimOutSeconds` are **not** currently part of `mikai-editorial-timing-patch-v1`'s schema (see `src/lib/editorial/editorialTimingPatch.ts` — `MikAIEditorialTimingPatchV1.items` only has `id, shotId, startSeconds, durationSeconds`) — even though `clip.inPoint`/`outPoint` are readily available, wiring them into the patch would require extending MikAI's own patch schema, which `NLE.PLUGIN.SYNC` deliberately scoped out ("V1 applies uniquement startSeconds... ne pas modifier durationSeconds/trimInSeconds/trimOutSeconds"). Consistent with that decision — no action needed here, just noting the mapping exists and is ready whenever that boundary is revisited.

## 6. Media URL / File Handling

**Confirmed gap, concrete and small**: `MediaImportService`'s entire public API takes `File | Blob`; there is no `fetch`-based or URL-based import path anywhere in `packages/core/src/media/`. `MediaItem.originalUrl` exists on the type and is written by `ProjectSerializer.importFromJson` as an informational placeholder marker, but nothing in the codebase reads it to actually fetch media.

This means the adapter (outside OpenReel, in the bridge script) must do the fetch itself:

```ts
const response = await fetch(mikaiMediaUrl); // e.g. "/api/uploads/shot-videos/shot-36/....mp4"
const blob = await response.blob();
const file = new File([blob], `${shotCode ?? shotId}.mp4`, { type: blob.type });
// then feed `file` to whatever OpenReel entry point ends up owning MediaItem creation
// (MediaImportService methods, or constructing a MediaItem directly with `blob: file`
// and calling project-store's addPlaceholderMedia/replacePlaceholderMedia, both already
// used by OpenReel's own KieAI flow for exactly this "blob arrives after the fact" pattern)
```

This is adapter code, not a fork of OpenReel — it never needs to touch OpenReel's own source. `addPlaceholderMedia`/`replacePlaceholderMedia` (Section 3) are a good fit: add a placeholder `MediaItem` immediately (so the timeline renders instantly even before the fetch resolves), then replace it with the real blob once `fetch` completes — mirroring the exact pattern OpenReel's own KieAI integration already uses for async media arrival.

## 7. Cloud / AI Coupling

- **`kieai-store.ts`** (`apps/web/src/stores/`, 87 lines) is a **separate, standalone Zustand store** — not merged into `project-store.ts` or `timeline-store.ts`.
- Grepped case-insensitively for `kieai` across `packages/` and `apps/web/src/` (the entire relevant source): **20 files** reference it in total.
- `project-store.ts` itself only touches KieAI-specific concerns in two isolated helper methods: `setKieAIItemState(mediaId, isPending, kieaiError)` (flips two fields on a placeholder `MediaItem`) and a couple of `console.warn`/`console.error` log lines inside media-replacement error handling. Neither `moveClip`, `trimClip`, `addClip`, `loadProject`, nor any core timeline logic reads or depends on KieAI state.
- **Answer to "can KieAI be ignored?": yes.** A sidecar fork can simply never call `setKieAIItemState` or mount any KieAI UI entry point (buttons/panels), and the rest of the app — project load, clip CRUD, trim, export — functions independently. The KieAI code ships in the bundle either way (removing it entirely would be a real, if small, fork change — not required for a POC, only relevant later if bundle size or attack surface becomes a concern).

## 8. Fork Surface

Everything found in this spike suggests the *minimum* fork surface is close to zero — the integration can plausibly live entirely in an external adapter script/app that:
1. Fetches `MikAIEditorialExportV1` from MikAI's existing export route.
2. Fetches each shot's media (`mediaUrl`) and constructs `File` objects.
3. Builds an OpenReel `Project` object (Section 4) and calls `loadProject`.
4. Lets the user edit natively in OpenReel's own UI (already has reorder, trim, split, undo/redo — no OpenReel code changes needed for any of these).
5. On "export to MikAI," reads `useProjectStore.getState().project`, maps back to `mikai-editorial-timing-patch-v1` (Section 5), and POSTs to MikAI's existing `editorial-timing-patch` endpoint.

If a fork *is* still needed, the most likely reason would be UI-level, not data-model-level: adding a "Load from MikAI" / "Export to MikAI" menu action into OpenReel's own UI shell, rather than relying on the browser console / a bookmarklet / a separate wrapper page to call `loadProject` and read `project` back out. That is a small, cosmetic fork (a new menu item wired to two functions), not a deep one.

## 9. Risks

- **No confirmed live boot** (Section 2) — the single largest open risk. Everything above is source-verified but not runtime-verified. A `Project` object that type-checks and passes `validateProjectJson` could still fail to render correctly in the actual React app for reasons invisible to static reading (e.g. a required-but-untyped invariant, a race condition in initial store hydration, WebGPU/WebCodecs browser requirements not met in a given environment).
- **`ActionValidator` internals not read** — actions dispatched via `moveClip`/`trimClip` go through this class before being applied; if it enforces invariants incompatible with MikAI-originated data (e.g. clip bounds, media readiness checks) that weren't visible from the store's public signatures alone, some adapter calls could silently fail or throw. Low risk given the store methods return `Promise<ActionResult>` (implying a structured success/failure contract, not a throw-only one), but not fully verified.
- **`migrateProject` is a no-op** (Section 3) — if OpenReel bumps `SCHEMA_VERSION` upstream before a fork stabilizes, older exported projects (including ones holding MikAI metadata) could silently pass through `migrateProject` unchanged rather than actually migrating, risking subtle data loss on `SCHEMA_VERSION` drift. Worth pinning a fork to a specific OpenReel commit/tag rather than tracking `main`.
- **Bundle-level KieAI surface remains** even if functionally unused (Section 7) — not a blocker, but means the fork ships an unused cloud-AI code path unless explicitly stripped later.
- **Upstream drift**, **Windows dev friction**, **license compliance on fork**, and **scope-creep pressure** — all already flagged in `docs/NLE_VENDOR_A_AUDIT.md` Section 7 and unchanged by this spike; not repeated in full here.

## 10. Recommendation

```text
CONDITIONAL GO — exact blocker to resolve first:

Confirm the app actually boots via `pnpm install && pnpm dev` (blocked
in this spike by the harness's own safety classifier, not by anything
OpenReel-specific — needs either explicit user-driven execution or a
permission grant for this exact action). Every other question this
ticket set out to answer (Sections 4-7) came back positive and
source-verified: loadProject() exists for programmatic project
creation, ClipMetadata's open index signature cleanly carries
shotId/itemId, moveClip/trimClip map directly onto MikAI's timing
patch fields, KieAI is safely ignorable, and the only real gap
(media-by-URL) is a few lines of adapter fetch code, not a fork
change.

Once the app is confirmed to boot and loadProject() confirmed to
actually render a programmatically-built Project correctly in the
browser, this becomes a straight GO.
```

## 11. Next Ticket Prompt

```text
NLE.VENDOR.SPIKE.2 — OpenReel live boot + loadProject() round-trip confirmation

Tu es dans le projet MikAI Production Lab.

Mode : Autonomie contrôlée, recherche uniquement, aucun code externe
vendored dans MikAI, aucune intégration dans ce ticket.

Contexte :
docs/NLE_VENDOR_SPIKE_1_OPENREEL.md a confirmé par lecture de code
(sans exécution) que OpenReel (clone existant hors repo MikAI, ou
re-cloner si besoin dans F:/AI/_vendor_spikes/openreel-video) expose
tout ce qu'il faut pour un sidecar : loadProject(project), ClipMetadata
ouvert, moveClip/trimClip. Le seul point non vérifié : est-ce que
l'app démarre réellement (`pnpm install && pnpm dev`), bloqué dans le
ticket précédent par le classificateur de sécurité du harness.

Objectif :
1. Lancer réellement `pnpm install` puis `pnpm dev` sur le clone
   OpenReel (hors repo MikAI), confirmer que localhost:5173 sert
   l'app et qu'elle est utilisable dans un navigateur.
2. Dans la console du navigateur (ou un petit script de test hors
   repo MikAI), construire un objet Project minimal à la main
   (1 track, 2-3 clips avec metadata.mikaiItemId/mikaiShotId, un
   MediaItem par clip avec un blob obtenu via fetch() d'un fichier
   vidéo de test local), appeler
   useProjectStore.getState().loadProject(project), et confirmer
   visuellement que la timeline OpenReel affiche bien les clips aux
   bons startTime/duration.
3. Tester manuellement un moveClip/trimClip dans l'UI, puis relire
   useProjectStore.getState().project pour confirmer que
   clip.startTime/clip.duration/clip.metadata survivent intacts.

Contraintes absolues : identiques aux tickets NLE.VENDOR précédents
(pas de migration, pas de schema, pas de package ajouté à MikAI, pas
de vendoring dans le repo MikAI, pas de fork committé, pas de
modification /editorial ou /nle-prototype, aucun code MikAI modifié
hors docs/).

Livrable : mise à jour de docs/NLE_VENDOR_SPIKE_1_OPENREEL.md section
2 et 9 avec le résultat réel du boot, remplaçant "CONDITIONAL GO" par
un verdict final GO ou NO-GO avec preuve. Si GO confirmé, proposer
(sans l'exécuter) le ticket de fork réel + premier adaptateur, en
attente de validation explicite.

Rapport attendu : résultat du boot, résultat du test loadProject(),
résultat du test moveClip/trimClip round-trip, verdict final,
confirmation qu'aucun fichier MikAI hors docs/ n'a été modifié, git
status final.
```
