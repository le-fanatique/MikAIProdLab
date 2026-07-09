# NLE.VENDOR.DECISION.1 — OpenReel Sidecar Decision

Status: product/technical decision, no code changed. HEAD at time of writing: `d22eb29 — Add OpenReel browser CORS validation`.

## 1. Decision

```text
GO — Adopt OpenReel as the advanced sidecar editor path,
pending one final human DevTools CORS check.
```

Across five tickets (`NLE.VENDOR.A`, `.SPIKE.1`–`.4`), every question this project set out to answer about OpenReel's viability came back positive, and — critically — most of them via **real, executed code**, not source reading or vendor claims. The single remaining item (a literal browser DevTools confirmation of the CORS fetch, reduced to a five-minute manual check in `NLE_VENDOR_SPIKE_4_OPENREEL_BROWSER_CORS.md` Section 9) does not block the architectural decision — it blocks only the very next implementation ticket's starting gun. This document commits to the sidecar path now so implementation work isn't gated behind a formality.

## 2. Why OpenReel

Restated briefly from `docs/NLE_VENDOR_A_AUDIT.md` Section 6, now reinforced by four rounds of hands-on verification rather than static reading alone: OpenReel is the only candidate evaluated that is simultaneously (a) actively maintained, not archived, MIT-licensed with no ambiguity; (b) installable and bootable with a plain `pnpm install && pnpm dev`, zero mandatory cloud credentials; (c) has a clip data model with an explicit open metadata bag (`ClipMetadata`'s `[key: string]: unknown`) proven — not assumed — to carry `mikaiItemId`/`mikaiShotId`/`mikaiProjectId`/`mikaiSequenceId` through `loadProject`, `moveClip`, and `trimClip` without loss; and (d) exposes a `moveClip`/`trimClip`/`loadProject` API surface that maps cleanly, field-for-field, onto MikAI's own `mikai-editorial-export-v1` and `mikai-editorial-timing-patch-v1` contracts, confirmed by actually building and running the adapter (`NLE_VENDOR_SPIKE_3_OPENREEL_ADAPTER.md`), not by inspecting types in isolation. Every rejected alternative (OpenCut Classic — archived; OpenCut rewrite — too unstable, not accepting outside forks; `react-video-editor` — ambiguous license, hard cloud dependency) failed on concrete, sourced evidence, not on reputation.

## 3. What Has Been Proven

All of the following were confirmed via **real execution**, not documentation:

- `pnpm install` succeeds cleanly (~46s, 594 packages, zero OpenReel-authored install hooks) and `pnpm dev` boots in under a second, with **no cloud credentials required** (`NLE_VENDOR_SPIKE_2_OPENREEL_RUN.md`).
- `useProjectStore.getState().loadProject(project)` accepts a hand-built and, separately, a real-MikAI-export-derived `Project`, and preserves every custom `ClipMetadata` field exactly (`SPIKE.2`, `SPIKE.3`).
- `moveClip(clipId, startTime, trackId?)` and `trimClip(clipId, inPoint?, outPoint?)` both succeed, update the correct fields, and leave metadata untouched — tested on both synthetic and real MikAI-sourced clips (`SPIKE.2`, `SPIKE.3`).
- A real adapter (`mikaiToOpenReelProject.ts`, prototyped in the external clone) maps a live `mikai-editorial-export-v1` fetch (project 4 / sequence 30, 6 real shots) into a working OpenReel `Project`, with 4 of 6 real video files successfully fetched and hydrated into playable `Blob`s, and the 2 `status: "missing"` shots correctly left as unresolved placeholders (`SPIKE.3`).
- MikAI's `/api/uploads/[...path]` route now grants scoped, non-wildcard CORS to `localhost:5173`/`127.0.0.1:5173` (extensible via `MIKAI_EDITOR_CORS_ORIGINS`), verified via the exact preflight-`OPTIONS`-then-`GET` sequence a browser performs, including a `206 Partial Content` Range-request path (`NLE.VENDOR.BRIDGE.1`, re-verified in `SPIKE.4`).
- A complete, schema-valid `mikai-editorial-timing-patch-v1` was mechanically reconstructed from post-edit OpenReel store state, using only `clip.metadata`/`startTime`/`duration` — zero OpenReel modification required to produce it (`SPIKE.3`).
- The required OpenReel fork surface, across all four spikes, has consistently measured out to **effectively zero** — every piece of the bridge lives in adapter code external to OpenReel's own source (`SPIKE.1` Section 8, reconfirmed `SPIKE.3` Section 9).

## 4. Remaining Manual Check

One item, unchanged from `NLE_VENDOR_SPIKE_4_OPENREEL_BROWSER_CORS.md` Section 9: a human needs to open `http://localhost:5173` in a real browser tab and paste the already-prepared `tmp/browser-console-cors-test.js` (in the external OpenReel clone) into DevTools, confirming no CORS error in the console. This agent has no browser-automation tool available in this environment (disclosed consistently across all four spike tickets) and instead reproduced the exact spec-defined CORS header check via `curl` — strong evidence, not a substitute for the literal five-minute check. This is a **verification gate on the first implementation ticket**, not a blocker on this decision.

## 5. What We Stop Building Internally

Effective immediately:

- **Stop building reorder inside MikAI.** `C.REORDER.1` (shot reorder / intercalation drag mode), flagged as a future ticket in `docs/NLE_PLUGIN_A_AUDIT.md`, is superseded — OpenReel's `moveClip(clipId, startTime, trackId?)` already does this correctly, with undo/redo, today.
- **Stop building trim inside MikAI beyond what already exists.** `resizeEditorialItemRightEdge`'s non-ripple right-edge resize stays as-is (it's already shipped, used by `/editorial`), but no further trim/cut features (roll edit, ripple trim, multi-clip trim) should be built in MikAI — OpenReel's `trimClip`/`splitClip`/`slipClip`/`slideClip` cover this ground.
- **Stop building frame/time navigation inside MikAI's timeline UI.** `C.M1.6` (Timeline Canvas Duration / Fit Model), also flagged as future work in the plugin audit, is superseded — OpenReel already has zoom, scrub, playhead, and time-to-pixel conversion built and tested (`timeline-store.ts`'s `TimelineState`, confirmed in `SPIKE.1` Section 3).
- **Stop building timeline zoom/canvas rendering inside MikAI.** No further investment in `@xzdarcy/react-timeline-editor` beyond its current state in `/nle-prototype`.
- **`/nle-prototype` stays exactly what `docs/NLE_PLUGIN_A_AUDIT.md` already decided: a frozen proof-of-concept/debug fallback.** It remains useful for eyeballing an `EditorialDocument` without leaving the browser or standing up the sidecar, and nothing more. `tools/editor-poc/` (the vanilla JS POC) keeps the same frozen status for the same reason — both did their job (proving the export/patch contracts work) and neither should absorb further feature work now that a real external editor path is confirmed viable.

## 6. Sidecar Architecture

```text
MikAI (data layer, unchanged)
  │
  ├─ GET  /api/projects/{projectId}/sequences/{sequenceId}/editorial-export
  │        → mikai-editorial-export-v1
  │
  └─ POST /api/projects/{projectId}/sequences/{sequenceId}/editorial-timing-patch
           → mikai-editorial-timing-patch-v1 (mode: validate | apply)

OpenReel sidecar (separate fork/repo, separate process, separate origin)
  │
  ├─ imports mikai-editorial-export-v1  →  builds an OpenReel Project
  │    (adapter: mikaiToOpenReelProject.ts pattern, already prototyped
  │    and proven in the external spike clone)
  │
  ├─ user edits natively in OpenReel's own UI — reorder, trim, frame
  │    navigation, zoom, undo/redo — all OpenReel's existing, unmodified
  │    functionality
  │
  └─ exports mikai-editorial-timing-patch-v1  →  POSTs to MikAI's
       existing editorial-timing-patch endpoint (validate, then apply)
```

MikAI never renders the advanced timeline. OpenReel never talks to MikAI's database directly — it only ever speaks the two JSON contracts over HTTP, through routes that already exist and are already tested. The sidecar runs as an independent local process (`pnpm dev` on its own port) — not embedded in MikAI's Next.js app, not sharing a deployment, not sharing a database connection.

## 7. Fork / Repository Strategy

- Fork `Augani/openreel-video` to a MikAI-controlled repository, separate from `MikAIProdLab` — never vendored into this repo, per every prior ticket's constraint and this one's.
- Pin the fork to a specific upstream commit/tag rather than tracking `main` continuously — `NLE_VENDOR_SPIKE_1_OPENREEL.md` Section 9 already flagged that `ProjectSerializer`'s `migrateProject()` is currently a no-op, meaning an unplanned upstream `SCHEMA_VERSION` bump could silently pass MikAI-tagged data through unmigrated. Rebasing/updating from upstream should be a deliberate, periodic decision, not automatic.
- The adapter code (`mikaiToOpenReelProject.ts` and its media-hydration counterpart, already prototyped end-to-end in the external spike clone) becomes the fork's own integration layer — living inside the OpenReel fork, not inside MikAI, consistent with every constraint enforced across this entire ticket series.
- KieAI (the bundled cloud-AI generation feature, confirmed isolated in `kieai-store.ts` with ~20 total references, `NLE_VENDOR_SPIKE_1_OPENREEL.md` Section 7) should be left dormant (UI entry points not wired) in the fork rather than surgically removed in the first pass — removing it is a legitimate later cleanup, not a blocker to starting.

## 8. Fast Roadmap

```text
1. NLE.OPENREEL.1 — Create MikAI OpenReel sidecar fork/repo
2. NLE.OPENREEL.2 — Add MikAI export import adapter
3. NLE.OPENREEL.3 — Add MikAI timing patch export
4. NLE.OPENREEL.4 — Add "Open in Advanced Editor" link from MikAI
5. NLE.OPENREEL.5 — Round-trip apply workflow
```

Each ticket should stay as narrowly scoped as this entire spike series has been — no ticket in this list needs to touch MikAI's schema, add a MikAI package, or modify `/editorial`/`/nle-prototype`. `NLE.OPENREEL.4` is the only one that touches MikAI's own UI at all, and even then it's a single link, not new functionality.

## 9. Risks

Carried forward, unchanged, from the spike series (not re-litigated here — see the source documents for full detail):

- **Browser CORS check not yet literally observed** (Section 4) — resolves in five minutes once a human runs the prepared script; the first implementation ticket should not proceed past its own first real browser session without this being confirmed.
- **Upstream drift** — OpenReel is young (created January 2026, under active development); forking now means accepting an ongoing maintenance decision (rebase vs. diverge), not a one-time cost.
- **`migrateProject()` no-op** — a real risk if the fork tracks upstream `main` casually; mitigated by pinning (Section 7).
- **KieAI bundle footprint** — dormant, not removed, in the first pass; acceptable now, revisit later.
- **`ActionValidator` internals not fully read** — `moveClip`/`trimClip` both succeeded cleanly in every test performed, but edge cases (overlapping clips, out-of-bounds trims) the validator might reject differently from MikAI's own rules were not exhaustively probed.
- **Scope-creep pressure** — OpenReel is a full-featured editor (color grading, keyframes, AI subtitles, 3D transforms); the fork's own scope must be actively kept to the MVP list from `docs/NLE_VENDOR_A_AUDIT.md` Section 2, or the sidecar reproduces the exact feature-creep risk `/nle-prototype` was frozen to avoid.

## 10. Stop Conditions

Implementation work on this roadmap should pause and return to this document for re-decision if:

- The five-minute browser check (Section 4) reveals an actual CORS failure not predicted by the curl-based verification — would indicate a gap in this project's understanding of the browser CORS model, not just an unverified formality.
- Forking OpenReel turns out to require touching MikAI's schema, adding a MikAI package, or modifying `/editorial`/`/nle-prototype` in ways not anticipated here — any of `NLE.OPENREEL.1`–`.5` hitting one of these should stop and request validation before proceeding, per this entire ticket series' standing constraints.
- `ActionValidator` (Section 9) turns out to reject MikAI-originated data in ways that can't be resolved without forking core OpenReel validation logic — would change the "effectively zero fork surface" finding this whole decision rests on.

## 11. Next Ticket Prompt

```text
NLE.OPENREEL.1 — Create MikAI OpenReel sidecar fork/repo

Tu es dans le projet MikAI Production Lab.

Mode : Autonomie contrôlée, action avec impact externe (création de
repo) — confirmer le nom/emplacement exact du repo avec l'utilisateur
avant de créer quoi que ce soit d'externe/visible publiquement.

Contexte :
docs/NLE_VENDOR_DECISION_OPENREEL.md a acté un GO pour adopter OpenReel
(Augani/openreel-video) comme éditeur sidecar externe pour MikAI. Ce
ticket est la première étape de la roadmap qui y est définie : créer
le fork/repo réel (hors du repo MikAIProdLab), pas encore l'adapter.

Objectif :
1. Confirmer le mode de fork souhaité (fork GitHub classique de
   Augani/openreel-video, ou clone + nouveau repo indépendant — a un
   impact sur le suivi des mises à jour amont).
2. Créer le repo/fork à l'emplacement validé par l'utilisateur.
3. Pin sur un commit/tag précis plutôt que de suivre main (voir
   docs/NLE_VENDOR_DECISION_OPENREEL.md section 7 pour la justification
   - migrateProject() est un no-op actuellement).
4. Ne rien intégrer dans MikAI dans ce ticket — uniquement la création
   du repo sidecar.

Contraintes absolues : identiques à toute la série NLE.VENDOR (pas de
migration, pas de schema, pas de package ajouté à MikAI, pas de
vendoring dans le repo MikAI, aucune modification /editorial ou
/nle-prototype).

Avant toute action de création de repo/fork visible publiquement ou
liée à un compte, demander confirmation explicite du nom/organisation/
visibilité souhaités.

Livrable : repo/fork créé à l'emplacement validé, commit/tag de
référence documenté, aucun changement dans le repo MikAI hors un
éventuel court rapport dans docs/ si demandé.
```
