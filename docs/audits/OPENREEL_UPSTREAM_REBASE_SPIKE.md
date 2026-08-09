# OpenReel Sidecar → Upstream Rebase Spike

Ticket: `OPENREEL.UPSTREAM.REBASE.SPIKE.1`
Date: 2026-08-09
Scope: audit and disposable transplant experiment only. No sidecar source,
history, or branch was changed by this spike.

## Verdict

**GO WITH LIMITS.**

Migrate the sidecar's MikAI integration surface onto upstream `8459024`. The
transplant experiment compiled clean (`tsc --noEmit`, 0 errors) and passed
128/129 existing unit tests unmodified, with the one failure traced to a
precise, well-understood, non-blocking upstream behavior change (see
Conflict Matrix). All three sidecar-authored playback patches
(`bace876`, `492dd01`, `33f917a`) must be dropped rather than carried
forward: upstream `8459024` replaced the architecture they patched with a
different, actively-maintained native-playback implementation that already
gives the user working multi-clip playback in the vanilla checkout.

## Ancestry and Version Delta

- Sidecar `main` is at `33f917a`, 18 commits ahead of its fork point
  `5711925` (`Augani/openreel-video`, 2026-06-01).
- Upstream `8459024` ("feat: sync public web and desktop updates (#88)",
  2026-07-24) is 7,964 files / +1,060,297 / -17,675 ahead of the fork point
  at the whole-repo level (includes generated/vendor churn); the
  application-relevant delta under `apps/web/src` and `packages/core/src` is
  in the hundreds of files.
- Both `5711925` and `8459024` are present locally in the sidecar's git
  history (`upstream` remote already fetched); no network rebase was
  required for the audit.

## Commit Classification (18 sidecar commits since fork)

| Category | Commits | Files touched |
|---|---|---|
| MikAI-isolated (transplants clean) | `234ea73`, `5a1d71a`, `3dfd0e3`, `c032f5a`, `eb66b0e`, `e105720`, `50bfde1`, `b701875`, `5dfdc4e`, `09a4a23`, `a884582`, `e1c36d1`, `bfa3d7f`, `4078de7` | `apps/web/src/integrations/mikai/**`, `MIKAI_SIDECAR.md` only |
| Thin integration wiring (small, low conflict) | `eb66b0e`, `c032f5a`, `3dfd0e3` (also touch `App.tsx`) | `apps/web/src/App.tsx` (+18/-0 total since fork) |
| Playback changes superseded by upstream — drop, do not carry forward | `bace876`, `492dd01`, `33f917a` | `apps/web/src/bridges/playback-bridge.ts`, `apps/web/src/components/editor/Preview.tsx`, `packages/core/src/playback/playback-controller.ts`, `packages/core/src/playback/native-playback-generation.ts` (new), `packages/core/src/playback/types.ts`, `packages/core/src/playback/index.ts` |
| Documentation only | every commit above also updates `MIKAI_SIDECAR.md` | — |

14 of 18 commits are pure additions under
`apps/web/src/integrations/mikai/**` plus a running `MIKAI_SIDECAR.md` log —
no interleaving with upstream-owned files at all. Only 3 commits touch
`App.tsx` (18 lines total, additive) and 3 touch the playback stack.

## Overlap Hotspots vs Upstream 8459024

| File | Sidecar diff since fork | Upstream diff since fork | Verdict |
|---|---|---|---|
| `apps/web/src/App.tsx` | +18/-0 | moderate (new `useGpuJobPoller`, `isMotionSurface` routing) | Low risk. Same anchor points (`hasHandledInitialRoute`, `ToastContainer`, poller-hook list) still exist upstream; wiring re-applies by hand in minutes. |
| `apps/web/src/bridges/playback-bridge.ts` | +24/-0 | refactored (`scrubTo`/`endScrubbing` rewritten) | Partial conflict. The `"error"` event/toast addition is portable as-is (upstream's `PlaybackEventType` already includes `"error"`). The `isExternalPlaybackActive()` guard does **not** transplant — see below. |
| `apps/web/src/components/editor/Preview.tsx` | +106/-(part of 27-file, +7132/-124 group) | **+2656/-454 lines**, file grew from 6,701 to 8,453 lines | Superseded. Upstream added its own native hardware-accelerated multi-clip playback path directly inside this component (`canUseNativeVideoPlayback`, `startNativeVideoPlayback`, per-clip native `<video>` element cache, `ImageBitmap` cache). This is architecturally different from — and independent of — the sidecar's `native-playback-generation.ts` / `PlaybackController.isExternalPlaybackActive()` approach. |
| `packages/core/src/playback/playback-controller.ts` | 317 lines changed since fork (largest single sidecar playback file) | only 16 lines changed since fork | Confirms the divergence: upstream solved multi-clip playback almost entirely inside `Preview.tsx`, not in the shared `PlaybackController`. The sidecar's `isExternalPlaybackActive()` method and its 3-commit liveness/desync patch chain have no upstream equivalent to merge into — they solve a coordination problem in an architecture upstream no longer uses. |
| `packages/core/src/playback/native-playback-generation.ts` | new file, sidecar-only | does not exist upstream | Superseded by `Preview.tsx`'s built-in native playback; do not carry forward. |
| `apps/web/src/stores/project-store.ts` | not touched by sidecar | rewritten from a single 5,084-line file into `apps/web/src/stores/project/*-slice.ts` modules | No direct conflict (sidecar never edited this file), but every MikAI integration file that calls `useProjectStore` must be re-verified against the new slice boundaries. All actions actually used by MikAI code (`createNewProject`, `loadProject`, `moveClip`, `project`) still exist upstream with matching signatures — confirmed in the transplant experiment. |

## Transplant Experiment

Performed in a disposable `git worktree` created from the sidecar repo at
`8459024`, checked out to
`…/scratchpad/openreel-transplant-spike` (outside `F:\AI\mikai-openreel-sidecar`
and `F:\AI\OpenReel_vanilla`), with its own `pnpm install` (901 packages,
35s, no symlink/junction to either main repo's `node_modules`). Removed via
`git worktree remove --force` at the end of the spike; `git status` in the
main sidecar repo was verified clean before and after.

Steps, in dependency order:

1. Copied `apps/web/src/integrations/mikai/**` and `MIKAI_SIDECAR.md`
   verbatim from sidecar `33f917a` (plain file copy into the worktree, not a
   cross-repo `git checkout` — see Process Note below).
2. Re-applied the `App.tsx` wiring by hand against upstream's rewritten file
   (import block, `useMikaiExportBootstrap()` call ordered with the other
   pollers, the `?mikaiExportUrl=` early-routing branch placed before the new
   `isMotionSurface` branch, `<MikaiBridgePanel />` mounted next to
   `<ToastContainer />`).
3. Re-applied only the portable half of `playback-bridge.ts` (the `"error"`
   event listener/toast); the `isExternalPlaybackActive()` guard was
   deliberately **not** carried forward (see Conflict Matrix — no
   upstream target for it).
4. Did **not** touch `Preview.tsx`, `playback-controller.ts`,
   `native-playback-generation.ts`, `types.ts`, or `playback/index.ts` —
   upstream's own native playback stands as-is.
5. `pnpm run typecheck` (`tsc --noEmit`) in `apps/web`: **0 errors.**
6. `npx vitest run src/integrations/mikai`: **128 passed, 1 failed, 129
   total.**

### The one test failure (real signal, not noise)

`MikaiBridgePanel.test.tsx › shows the pre-publish summary` expected
`Expected duration: 10.0s`, got `5.0s`. Root cause, confirmed by reading the
fixture: the test's `makeProject()` helper hardcodes
`timeline.duration = 10` while its single clip is `duration: 5`
(`startTime: 0`). On sidecar `33f917a`, `loadProject()` preserved the
caller-supplied `timeline.duration` verbatim, so the stale fixture value
leaked through and the assertion happened to pass. Upstream's rewritten
`loadProject()` now recomputes `timeline.duration` from the actual clip
layout on load — a more correct behavior, not a bug — which makes the
fixture's mismatched hardcoded value visible. `MikaiBridgePanel.tsx` itself
is unaffected: it only reads `project.timeline.duration`, whatever it is.
**Action for the migration ticket: update the stale fixture value, not the
integration code.**

## Playback Architecture Comparison — What to Drop, Reimplement, or Regression-Test

| Sidecar patch | Disposition | Reasoning |
|---|---|---|
| `bace876` — avoid multi-clip audio startup stalls | **Drop.** | Patched `PlaybackController`'s old audio-preload path, which upstream's `Preview.tsx`-native playback bypasses for the native multi-clip case. |
| `492dd01` — recover from stalled frame rendering (clock liveness) | **Drop**, then **regression-test upstream's native path for the same class of bug.** | The specific livelock (skip-forever after drift threshold, hung "rendering" flag) lived in `PlaybackController.handleClockTimeUpdate`, a code path upstream's native playback largely sidesteps. Upstream's own render loop (`startNativeVideoPlayback` and friends in `Preview.tsx`) must be independently checked for an equivalent freeze mode — this was not verified in this spike per the ticket's no-browser-proof allowance, and is the top item for the next ticket's browser regression pass. |
| `33f917a` — prevent native playback desync | **Drop.** Its external-playback ownership flag coordinates the fork's old controller/native-path interaction and has no upstream target. The bounded-failure, sanitized-error and deferred-render safeguards belong to `492dd01`; retain them only as behavioral regression criteria if upstream reproduces an equivalent failure. | Confirmed portable in isolation: the `"error"` `PlaybackEventType` already exists upstream and the `playback-bridge.ts` toast wiring transplanted with 0 type errors. |
| MikAI integration surface (`applyMikaiTimingPatch`, `insertMikaiShotAtPlayhead`, `mikaiToOpenReelProject`, `openReelToMikaiPatch`, `publishMikaiSequenceResult`, `pushMikaiTargetDuration`, `useMikaiExportBootstrap`, `MikaiBridgePanel`) | **Keep, transplant as-is.** | 128/129 tests green, 0 type errors, all consumed store actions (`createNewProject`, `loadProject`, `moveClip`) present upstream with matching signatures. Only the one stale-fixture duration value needs updating. |

The user's own vanilla-checkout verification (clean multi-clip playback at
`8459024`, per `.agents/codex_handoff.md`) is the strongest evidence here:
whatever upstream's native playback path does, it already works for the
real case the sidecar's three patches were trying and failing to fix.

Note for continuity with `FB-20260807-001`: the native `HTMLVideoElement`
fast path in `Preview.tsx` (`startNativeVideoPlayback`) is not an upstream
invention — it predates the fork, and `33f917a`'s
`isExternalPlaybackActive()` flag was the sidecar's own fix for a
desync between that pre-existing pipeline and `PlaybackController`. Upstream
`8459024` grew the same pipeline far beyond the fork-point version (`Preview.tsx`
alone: 6,701 → 8,453 lines) without ever adopting that flag
(0 references in upstream's `playback-controller.ts`), which is exactly why
it cannot be transplanted as-is: it coordinates with a version of the
pipeline that no longer exists in this form.

## Migration Strategy — Bounded Implementation Sequence for the Follow-Up Ticket

1. **Cut point.** Start a new sidecar branch from upstream `8459024` (not
   from `33f917a`); do not rebase the existing 18-commit history — replay
   the surviving commits as fresh, squashed changes instead, since 3 of the
   18 are being dropped outright and history rewriting upstream of a shared
   `main` is unnecessary risk for this migration's size.
2. **Group A — MikAI integration surface (lowest risk, do first).** Copy
   `apps/web/src/integrations/mikai/**` and `MIKAI_SIDECAR.md` verbatim.
   Fix the one stale `timeline.duration` test fixture value. Run
   `pnpm run typecheck` and the full `src/integrations/mikai` test suite as
   the gate before proceeding.
3. **Group B — App wiring.** Re-apply the `App.tsx` diff by hand (import
   block, `useMikaiExportBootstrap()`, early-routing branch, panel mount).
   Small enough to review as one diff; typecheck gate.
4. **Group C — Playback bridge error surface.** Re-apply only the `"error"`
   event listener/toast in `playback-bridge.ts`. Explicitly do **not** port
   `isExternalPlaybackActive()` or any reference to it.
5. **Group D — Playback regression pass (highest risk, gates the release).**
   Do not port any of `bace876`/`492dd01`/`33f917a`'s implementation. Instead,
   with a full isolated browser regression (Playwright, multi-clip local
   media, matching the method already used for
   `OPENREEL.PLAYBACK.CLOCK.LIVENESS.1`/`OPENREEL.PLAYBACK.REAL.PROJECT.REPRO.1`),
   verify upstream's native playback path against the same failure classes:
   sustained multi-clip playback with real media, forced slow/hung frame
   render, and confirmation the UI never claims "Playing" with a frozen
   clock. Only write new code here if a real failure reproduces — and scope
   it to upstream's actual architecture, not the removed one.
6. **Rollback point.** Sidecar `main` at `33f917a` is untouched by this
   migration path until Group A–D are merged and validated; the existing
   branch remains the instant rollback target for the whole ticket.
7. **Explicit exclusions.** No package/workspace config changes beyond what
   upstream `8459024` already defines (do not re-apply sidecar-era
   dependency edits blindly). No changes to `@openreel/core` public exports
   beyond what MikAI's integration files already consume. No edits to
   `packages/core/src/playback/*` unless Group D finds a real, reproduced
   failure.
8. **Acceptance gates for the follow-up ticket.** `tsc --noEmit` clean;
   `apps/web` test suite green; Playwright multi-clip regression green on
   real local media; manual retest against the user's actual `Cosmic Seoul`
   / `Bold Havana` projects per `FB-20260807-001`; no sidecar source path
   left importing the removed `native-playback-generation.ts` or calling
   `isExternalPlaybackActive()`.

## Risks

- Upstream's native playback path was not itself browser-tested in this
  spike (out of scope, per ticket — the user's vanilla-checkout test already
  covers this). Group D above exists specifically to close that gap before
  any GO-WITH-LIMITS becomes an unconditional GO.
- The whole-repo upstream delta (7,964 files) includes large unrelated
  surface (desktop app, scripts, docs) not audited here in detail; the
  migration ticket should scope its own diff review to `apps/web` and
  `packages/core` the same way this spike did.
- History strategy (fresh replay vs. true rebase) is a judgment call the
  migration ticket owner should confirm with Codex before starting Group A.

## Process Note (spike hygiene)

An early transplant step used `git --work-tree=<spike dir> checkout 33f917a
-- <paths>` from inside the main sidecar repo to seed the worktree, which
correctly left every working-tree file in
`F:\AI\mikai-openreel-sidecar` byte-identical to `HEAD` but did dirty the
main repo's *index* (`git status` reported spurious `M` entries with no
actual diff content). Caught immediately, corrected with
`git checkout -- <paths>` in the main repo, and re-verified clean before any
further work. All later transplant steps used plain file copies into the
worktree instead. `git status` and `git worktree list` in
`F:\AI\mikai-openreel-sidecar` were confirmed clean at the end of this spike.
