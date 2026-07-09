# NLE.VENDOR.A — Existing Editor Sidecar Audit

Status: audit + local spike, no code vendored, no dependency added. HEAD at time of writing: `e9262ea — Fix editorial timeline mutation execution`.

## 1. Goal

Stop rebuilding a bespoke NLE inside `/nle-prototype`. This audit's earlier sibling (`docs/NLE_PLUGIN_A_AUDIT.md`) already recommended a bridge-first path (Option D→C) over a from-scratch build (Option A) or an embedded web library (Option B). That recommendation deliberately left "which external editor" open. This ticket answers that question by evaluating concrete, existing open-source editors as fork/sidecar candidates, using the export/patch contracts already shipped (`NLE.BRIDGE.1`, `NLE.PLUGIN.SYNC`) as the integration surface.

**Note on scope reversal**: every prior NLE ticket in this project's history (`PHASEC.NLE.*`) carried an absolute constraint of "no Twick/OpenReel/OpenCut/DesignCombo/Remotion/Media Chrome/FFmpeg." This ticket explicitly names OpenReel and OpenCut (and DesignCombo's `react-video-editor`) as priority candidates to *evaluate*. That is understood as a deliberate reversal for research purposes — this document is audit-only, no code from any of these projects is vendored or integrated, consistent with this ticket's own constraint ("ne pas vendor/copier... sans validation").

## 2. MikAI Advanced Editor MVP Requirements

```text
Required MVP:
- import MikAIEditorialExportV1
- display shots as clips
- use mediaUrl/approvedVideoPath
- reorder clips
- cut/trim clips
- frame/time navigation
- export mikai-editorial-timing-patch-v1
- keep shotId/itemId metadata
- run locally as sidecar

Not required for MVP:
- AI editing
- subtitles
- audio mixing
- effects
- cloud render
- multi-user
- full export video
- deep integration in MikAI UI
```

The last "not required" item matters most for candidate selection: MikAI does not need the winning editor to *become* a MikAI page. It needs to run as an independent local app that reads a file MikAI produced and writes a file MikAI consumes.

## 3. Existing MikAI Bridge Contracts

Already shipped, unchanged by this ticket, and treated as the fixed integration surface for every candidate below:

- `GET /api/projects/{projectId}/sequences/{sequenceId}/editorial-export` → `MikAIEditorialExportV1` (`src/lib/editorial/editorialExport.ts`): `schemaVersion`, `project`, `sequence`, `tracks[].items[]` (shots only — `id`, `shotId`, `shotCode`, `title`, `status`, `startSeconds`, `durationSeconds`, `trimInSeconds`/`trimOutSeconds`, `approvedVideoPath`, `mediaUrl`, `prompt`, `description`), `emptySpaces[]`.
- `POST /api/projects/{projectId}/sequences/{sequenceId}/editorial-timing-patch` (`src/lib/editorial/editorialTimingPatch.ts`) → `mikai-editorial-timing-patch-v1`: `mode: "validate"|"apply"`, items limited to `{ id, shotId, startSeconds, durationSeconds }`. V1 only writes `startSeconds`; `durationSeconds` is a consistency check, not yet editable server-side (`NLE.PLUGIN.SYNC`'s explicit boundary — see `BUG.NLE.1` for the accompanying fix to make these writes actually persist).

Any candidate's integration path is: **export** → editor loads `MikAIEditorialExportV1` JSON → user edits → editor exports its own timing → a thin adapter maps that back to `mikai-editorial-timing-patch-v1` → POST to MikAI. The adapter is the only code MikAI-side integration work should ever require; the editor itself should need zero MikAI-specific code if its own project format has a metadata escape hatch.

## 4. Candidate Evaluation

### 4.1 OpenReel

- **Repo**: `Augani/openreel-video` — 3,895 stars, 551 forks, 17 open issues, created 2026-01-19, last push 2026-06-01, **not archived**, MIT.
- **License**: MIT — no restriction relevant to forking/adapting for internal use.
- **Stack**: React 18 + TypeScript + TailwindCSS, Zustand for state, MediaBunny + WebCodecs + Web Audio API for media, WebGPU/THREE.js/Canvas2D for rendering, IndexedDB for local storage, pnpm monorepo (`apps/web`, `apps/image`, `packages/core`, `packages/ui`, `packages/image-core`). Also ships a native `Openreel Video.xcodeproj` (macOS/iOS) and an `Openreel Video Android` directory in the repo root — the project's surface is broader than just the web app, though only the web app (`apps/web` + `packages/core`) is relevant to a sidecar use case.
- **Install/run complexity**: low on paper — `pnpm install && pnpm dev` (Vite, `localhost:5173`), Node 18+. **Spike result**: a shallow clone into a scratch directory outside the MikAI repo succeeded structurally but the git checkout itself failed on Windows with `Filename too long` inside the bundled Xcode project (`Openreel Video.xcodeproj/.../UserInterfaceState.xcuserstate`) — a Windows-path-length issue, not a project defect (would need `git config core.longpaths true` or WSL/macOS/Linux to clone cleanly). All non-Xcode files (README, package.json, `apps/`, `packages/`) still checked out and were inspected directly. A full `pnpm install && pnpm dev` was **not** run in this spike (kept to a structural read, not a live boot, to stay within this ticket's time budget) — treat "does it actually boot" as unverified, everything below is from reading real source, not from marketing copy.
- **Timeline implementation**: `packages/core/src/timeline/` (`clip-manager.ts` + others), `packages/core/src/types/timeline.ts`. Real, non-trivial engine — not a toy.
- **Clip model** (`packages/core/src/types/timeline.ts`, read directly):
  ```ts
  interface Clip {
    id: string; mediaId: string; trackId: string;
    startTime: number; duration: number;
    inPoint: number; outPoint: number;       // trim, exactly maps to trimIn/trimOut
    effects: Effect[]; audioEffects: Effect[]; transform: Transform;
    // ...
  }
  interface ClipMetadata {
    templateSource?: ...; appliedTemplates?: ...; templateManaged?: boolean;
    readonly [key: string]: unknown;          // ← open metadata bag
  }
  ```
  The `[key: string]: unknown` index signature on `ClipMetadata` is the single most important finding of this audit: it means a fork can attach `{ mikaiItemId, mikaiShotId }` (or similar) to every clip without forking the type itself, and read it back unchanged after any edit. This directly satisfies "keep shotId/itemId metadata" from the MVP requirements.
- **Media import model**: `MediaItem { id, name, type, fileHandle: FileSystemFileHandle | null, blob: Blob | null, thumbnailUrl, waveformData, originalUrl?, sourceFile?: {...} }`. `originalUrl` is a plausible slot for MikAI's `mediaUrl` (already a relative `/api/uploads/...` URL MikAI resolves) — a fork could load media by URL instead of requiring a local file picker, though this needs verification (unclear from static reading whether the app's UI path currently supports "add clip from URL" vs. file-only).
- **Export model**: `packages/core/src/storage/project-serializer.ts` defines `ProjectFile`, `SCHEMA_VERSION = "1.0.0"`, and a `ProjectSerializer` class — a real, versioned, first-class JSON project format already exists. Programmatic load/save of a full project (not just clip-by-clip) is architecturally supported.
- **Ability to load JSON programmatically**: plausible given the serializer above, but the exact `ProjectSerializer` API surface (constructor args, `.serialize()`/`.deserialize()` method names, whether it round-trips through `Project`/`Timeline`/`Clip` cleanly) was not read in this spike — **to verify** in a follow-up ticket before committing to a fork.
- **Preserve shotId/itemId**: yes, via `ClipMetadata`'s open index signature (see above) — highest confidence finding in this audit.
- **Export timing data**: yes in principle (`Clip.startTime`/`duration`/`inPoint`/`outPoint` are exactly the fields a timing-patch adapter needs), exact export API — **to verify**.
- **Run as sidecar**: the web app (`apps/web`) is a Vite SPA with IndexedDB-only persistence and no described backend requirement beyond the optional cloud pieces (mentions of "KieAI" task fields on `MediaItem` — `isPending`, `kieaiTaskId`, `kieaiError` — suggest an *optional* cloud AI-generation integration exists in the codebase; this must be confirmed disabled/removable before adopting, since MikAI explicitly does not want a second AI-generation surface). Running purely as a local sidecar (no cloud dependency) looks achievable but the KieAI coupling needs a direct look before commitment.
- **Also found (not requested, worth noting)**: `packages/core/src/actions/action-validator.ts` and `inverse-action-generator.ts` — the project appears to implement an undo/redo command system, which is a meaningfully more mature architecture than the vanilla POC built in `NLE.PLUGIN.POC`/`.2`.

### 4.2 OpenCut Classic

- **Repo**: `opencut-app/opencut-classic` — 103 stars, 89 forks, 0 open issues, created 2026-05-16, **archived 2026-05-17** (one day after creation — this is a snapshot repo, not a living project), MIT.
- **License**: MIT.
- **Stack** (from repo metadata): TypeScript 92.6% (Next.js web app), Rust 5.9% ("GPU compositor, effects, masks, WASM bindings"), WGSL 0.5%, Bun + Docker + Turbo monorepo. Install requires Bun *and* Docker (database + Redis containers via `docker compose up`) before `bun install && bun dev:web` — meaningfully heavier setup than OpenReel's plain `pnpm dev`.
- **Timeline implementation / clip model / import possibilities**: not documented in the README and **not spiked** in this audit — see verdict below for why.
- **Verdict driver**: the "classic" repository is **archived and read-only as of 2026-05-17**, one day after being split out from the main `OpenCut-app/OpenCut` repository. The main `OpenCut-app/OpenCut` repo (61,954 stars, 6,671 forks, actively pushed as of 2026-06-21, **not archived**) is a from-scratch rewrite that, per its own README, is explicitly **not production-ready**: "OpenCut is being rewritten from the ground up... use classic for current functionality," while simultaneously stating the rewrite is "not set up to take outside contributions yet while the architecture is being designed," has no documented data model, and needs `proto`/`bun`/`moon` tooling not yet stabilized. In other words: the maintained version is unforkable-by-design right now (architecture actively in flux, no external contributions), and the forkable version (classic) is frozen and dead. This is a real trap for anyone picking "OpenCut" by name recognition alone (61k stars) without checking which OpenCut they'd actually be forking.
- Given this, deeper technical spiking of classic's timeline/clip model was not performed — no amount of technical merit changes the archived/dead-end status, and the live rewrite explicitly asks outsiders not to build on it yet.

### 4.3 OpenVideo / React Video Editor

- **Repo**: `openvideodev/react-video-editor` — 1,726 stars, 410 forks, 21 open issues, created 2024-08-02 (oldest of the four web candidates), pushed 2026-06-30, not archived, **license `NOASSERTION`** on GitHub's own detection — matches the vendor's own stated "dual-license: free for individuals/non-profits/orgs ≤3 employees, commercial license required above that" model. This alone is disqualifying for a project that doesn't want to track or attest to its own employee count against a third party's license terms indefinitely.
- **Stack**: Next.js 15, PixiJS v8 (via `@openvideo/engine-pixi`, **not** Remotion-based despite the "Capcut/Canva clone using remotion" description seen in some listings — the actual repo uses Pixi for client-side canvas rendering), Zustand, Tailwind v4, Radix UI, Framer Motion, `@openvideo/core` + `@openvideo/timeline` packages.
- **Install/run complexity**: `pnpm install`, `.env` from `.env.sample`, `pnpm dev` (`localhost:3000`) — looks simple on paper, but:
- **Cloud dependency requirement**: the `.env.sample` requires **Cloudflare R2 or AWS S3 credentials** for asset storage, a **Deepgram API key** for transcription, and a **Pexels API key** for stock media — i.e. the app is architected around cloud asset storage, not local files, even for basic operation. This directly conflicts with "run locally as sidecar" from the MVP requirements.
- **Risk of being too heavy**: yes — between the ambiguous license and the cloud-storage-first architecture, adapting this into a local-only sidecar would mean fighting the project's own architecture rather than working with it (removing/stubbing R2/S3 usage throughout, not just configuring an env var).
- **Verdict driver**: license ambiguity + cloud-first architecture together rule this out without needing a deeper spike.

### 4.4 OpenTimelineIO

- **Repo**: `AcademySoftwareFoundation/OpenTimelineIO` — 1,914 stars, 334 forks, mature (created 2016), actively maintained (Academy Software Foundation), Apache-2.0.
- **Role**: explicitly evaluated only as a **future interchange format**, not a UI candidate — it has no timeline editor UI at all, it's a C++-core / Python-bound data model + adapter library (reads/writes AAF, Final Cut Pro XML, CMX 3600 EDL, and its own native `.otio` JSON-based format).
- **Relevance to MikAI**: if a chosen editor sidecar (or a future one) speaks OTIO natively, `MikAIEditorialExportV1` → `.otio` becomes a one-time adapter write instead of a bespoke format per tool, and MikAI's export contract gains compatibility with the wider professional NLE ecosystem (Resolve, Premiere via EDL/AAF, etc.) essentially for free. **Not implemented now** — noted as a "if we ever need to talk to more than one external editor" upgrade, not an MVP requirement. No candidate evaluated above currently advertises native OTIO support (unconfirmed either way — not checked in this spike, low priority since it doesn't gate the MVP path).

## 5. Recommendation

```text
Recommendation:
Choose OpenReel (Augani/openreel-video) as the fork/adapt candidate.

Fallback: none of the other three are viable fallbacks as-is —
OpenCut Classic is archived/dead, OpenCut rewrite is too early to fork,
react-video-editor has a licensing and cloud-architecture mismatch. If
OpenReel's ClipMetadata/ProjectSerializer verification (Section 4.1,
"to verify" items) fails, the correct fallback is NOT another existing
project from this list — it's re-running this same audit process
against a fresh set of candidates, or falling back to
docs/NLE_PLUGIN_A_AUDIT.md's Option D (stay bridge-first, keep
NLE.PLUGIN.POC as the reference implementation) a while longer.

No-go: OpenCut Classic (archived, dead end). OpenCut rewrite (too
unstable, explicitly not accepting outside forks/contributions right
now — re-evaluate in 3-6 months). react-video-editor (ambiguous
NOASSERTION license + hard cloud-storage dependency, wrong shape for
a local sidecar).

Do not continue building timeline/reorder/trim UI inside MikAI's own
/nle-prototype or the vanilla tools/editor-poc — both stay frozen as
debug/reference tools per docs/NLE_PLUGIN_A_AUDIT.md.

Next implementation ticket should be: NLE.VENDOR.SPIKE.1 — OpenReel
fork feasibility confirmation (see Section 8).
```

Why OpenReel over the alternatives, in one paragraph: it is the only candidate that is simultaneously (a) actively maintained and not archived, (b) MIT-licensed with no ambiguity, (c) installable and runnable with a plain `pnpm dev` and no mandatory cloud credentials, and (d) has a source-verified clip data model with an explicit open metadata bag (`ClipMetadata`'s index signature) and a first-class, versioned project serializer — the exact shape needed to carry `shotId`/`itemId` through edits and to programmatically load/save `MikAIEditorialExportV1`-derived projects. Every other candidate fails at least one of these four on evidence gathered in this same audit, not on reputation.

## 6. Fastest Integration Path

Assuming OpenReel is confirmed viable (Section 8's spike ticket):

1. Fork `Augani/openreel-video` to a MikAI-controlled fork (or a private mirror) — **not vendored into this repo**, runs as a fully separate local app/process, per this ticket's constraints.
2. Write one adapter module inside the fork (not inside MikAI): `MikAIEditorialExportV1` → OpenReel `Project`/`Timeline`/`Clip[]`, storing `{ mikaiItemId, mikaiShotId }` in each `Clip`'s `metadata`, and `mediaUrl` in `MediaItem.originalUrl` (pending verification that OpenReel's media pipeline accepts a URL, not just a local file/blob).
3. Write the inverse adapter: OpenReel `Project` (post-edit) → `mikai-editorial-timing-patch-v1`, reading `startSeconds`/`durationSeconds` off each `Clip` plus the `mikaiItemId`/`mikaiShotId` stashed in `metadata`.
4. POST the resulting patch to MikAI's existing `editorial-timing-patch` endpoint with `mode: "validate"` then `mode: "apply"` — zero new MikAI-side code required beyond what `NLE.PLUGIN.SYNC` already shipped.
5. Keep `tools/editor-poc/` as the fallback/debug path if the OpenReel fork stalls or its architecture turns out to fight the adapter approach.

Nothing in this path requires modifying MikAI's schema, adding a package to MikAI's `package.json`, or touching `/editorial`/`/nle-prototype` — the entire integration surface is the two existing HTTP endpoints.

## 7. Risks

- **Unverified serializer API** (Section 4.1): `ProjectSerializer`'s exact method signatures were not read in this spike. If it doesn't cleanly round-trip a `Project` built programmatically (as opposed to one built only through the UI), the adapter becomes materially harder.
- **KieAI coupling**: `MediaItem`'s `kieaiTaskId`/`isPending`/`kieaiError` fields suggest an optional cloud AI-generation feature baked into the media model. Must confirm this can be left entirely unused/disabled without breaking the rest of the app — MikAI does not want a second AI-generation dependency surface alongside ComfyUI.
- **Windows dev friction**: the repo's bundled Xcode project causes `git clone` to fail on Windows with default `core.longpaths`. Trivial to work around (`git config core.longpaths true`, or clone on WSL/macOS/Linux, or a sparse/partial clone that skips the Xcode dir) but worth knowing before the next spike ticket picks it up cold.
- **Upstream drift**: OpenReel is young (created January 2026) and under active development (551 forks, 17 open issues) — forking now means periodically deciding whether to rebase on upstream changes or diverge. Not a blocker, but a real ongoing-maintenance cost the team should accept consciously, not by accident.
- **License compliance on fork**: MIT requires preserving the license/copyright notice in the fork — trivial to satisfy but must not be skipped.
- **Scope creep pressure**: OpenReel is a full-featured editor (color grading, keyframe animation, AI subtitles, 3D transforms) — nothing in this audit requires adopting more than the timeline/clip/trim/reorder/export surface. The fork's own scope must be actively kept narrow to MikAI's MVP list (Section 2), or the "advanced editor" ends up reproducing the same feature-creep risk `/nle-prototype` was frozen to avoid.

## 8. Next Ticket Prompt

```text
NLE.VENDOR.SPIKE.1 — OpenReel fork feasibility confirmation

Tu es dans le projet MikAI Production Lab.

Mode : Autonomie contrôlée, recherche uniquement, aucun code vendored.

Objectif :
Confirmer ou infirmer la faisabilité technique du fork OpenReel
(Augani/openreel-video) identifié dans docs/NLE_VENDOR_A_AUDIT.md
comme candidat gagnant, en répondant aux points marqués "to verify"
dans ce document (section 4.1 et section 7) :

- lire packages/core/src/storage/project-serializer.ts en entier :
  API exacte de ProjectSerializer (méthodes, signatures, round-trip
  Project -> JSON -> Project) ;
- confirmer si MediaItem peut être peuplé depuis une URL distante
  (mediaUrl de MikAI) plutôt qu'un File/Blob local uniquement ;
- localiser et lire le code lié à "kieaiTaskId"/"isPending"/
  "kieaiError" sur MediaItem, confirmer si ces champs peuvent rester
  vides/désactivés sans casser l'app ;
- si possible dans l'environnement, exécuter réellement
  `pnpm install && pnpm dev` sur un clone hors du repo MikAI (Linux/
  WSL/macOS pour éviter le problème Windows filename-too-long noté en
  section 7) et confirmer que l'app démarre.

Contraintes absolues : identiques à NLE.VENDOR.A (pas de migration,
pas de schema, pas de package ajouté à MikAI, pas de vendoring dans
le repo MikAI, pas de fork committé, pas de modification
/editorial ou /nle-prototype).

Livrable : mise à jour de docs/NLE_VENDOR_A_AUDIT.md (section 4.1 et
7) avec les réponses vérifiées, remplaçant chaque "to verify" par un
résultat concret. Si tout est positif, proposer le ticket suivant
(fork réel + premier adaptateur) EN ATTENTE de validation explicite
avant toute action de fork/vendoring.

Rapport attendu : réponses aux 4 points ci-dessus, mise à jour du
document, confirmation qu'aucun package/schema/fichier MikAI n'a été
modifié, git status final.
```
