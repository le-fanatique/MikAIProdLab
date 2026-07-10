# FFMPEG.BUNDLE.1 — Bundled FFmpeg/FFprobe Dependency and Health Check

Status: MikAI-only change (sidecar not touched, not audited). MikAI HEAD before this ticket: `4ef2441 — Add basic editorial rendering audit`, working tree clean.

## 1. Decision (Option B, User-Confirmed)

MikAI bundles FFmpeg/FFprobe as an npm dependency rather than requiring a system install. Reasons, as given: development happens on Windows, the target server is Linux, reproducibility matters, and per-machine manual FFmpeg installs should be avoided. This ticket only builds the foundation (dependency + server helper + health check) — no Basic Editorial rendering is implemented here.

## 2. Package Audit

Three candidates compared:

| Package | Binaries | License | Last publish | ffmpeg version bundled |
|---|---|---|---|---|
| `ffmpeg-ffprobe-static` | ffmpeg **+** ffprobe, same build | GPL-3.0-or-later | 2024-10-29 (stable `6.1.1`: 2024-03-19) | `6.1.1` (both binaries, guaranteed matched) |
| `ffmpeg-static` | ffmpeg only | GPL-3.0-or-later | 2025-11-14 | `6.1.1` |
| `ffprobe-static` | ffprobe only | MIT | 2022-06-18 | `4.0.2` (binaries sourced from the now-defunct zeranoe.com build) |

**Chosen: `ffmpeg-ffprobe-static`, pinned to `6.1.1`** (not `latest`, which currently resolves to a pre-release `6.1.2-rc.1` — the registry's `latest` dist-tag points at an RC, so pinning explicitly to the last proper stable release was a deliberate choice, not an oversight).

**Why not the two-package split**: `ffprobe-static`'s bundled binary is `ffmpeg 4.0.2` — over two major versions behind `ffmpeg-static`'s `6.1.1`. Using the two packages together would mean encoding with ffmpeg 6.1.1 while probing/inspecting media with an ffprobe built from ffmpeg 4.0.2, a real version-skew risk for anything relying on consistent format/codec support or JSON output shape between the two tools. `ffmpeg-ffprobe-static` builds both binaries from the same release, eliminating this risk entirely, and is one `npm install` line instead of two independently-versioned dependencies to keep in sync.

**License**: GPL-3.0-or-later, for both the npm wrapper and the underlying FFmpeg binaries it downloads (`--enable-gpl` build, confirmed via `ffmpeg -version`'s own configuration output — see §4). This is the standard licensing for a full-featured FFmpeg build (H.264/H.265/AAC/etc. support requires GPL, not LGPL). MikAI invokes the binary as a separate child process (`execFile`) rather than linking against it as a library, which is the standard "mere aggregation" usage pattern that does not extend GPL obligations to MikAI's own source code — the same relationship any tool has with an external `git`/`imagemagick`/etc. binary it shells out to. Documented here for transparency, not treated as blocking.

**Platforms**: macOS (x64, arm64), Linux (x64, ia32, arm64, arm), Windows (x64, ia32) — confirmed directly from the installed package's own `index.js` platform/arch matrix. Covers both the Windows dev machine and a Linux target server.

**Risks accepted**:
- The registry's `latest` tag pointing at an RC suggests this package's release cadence is informal — mitigated by pinning the exact stable version (`6.1.1`) rather than a caret range, so an accidental upgrade to an RC can't happen via routine `npm install`/`npm update`.
- Binaries are downloaded from third-party build sources at `npm install` time (Windows builds from Jaex/ShareX, Linux from John Van Sickle, macOS from evermeet.cx — documented in the package's own README) rather than built from source — an implicit trust dependency on those maintainers' continued availability and integrity. This is the standard tradeoff every "-static" FFmpeg npm package makes; no alternative avoids it without building FFmpeg from source in CI, which is out of scope here.
- No Linux binary was tested in this ticket (dev environment is Windows only) — flagged explicitly in §7 as unverified, not silently assumed to work.

## 3. Installation

```bash
npm install ffmpeg-ffprobe-static@6.1.1
```

Added to `package.json` dependencies (not `devDependencies` — the binaries are needed at runtime on the server, not just during development/build). `package-lock.json` updated accordingly. 47 packages added transitively (the installer's own small dependency tree: an HTTP client, proxy-agent, progress bar — all install-time-only, used by the package's `postinstall` binary-download script).

## 4. Server Helper

`src/lib/ffmpeg.ts` — server-only (never imported from a Client Component; the module only exposes plain functions wrapping `node:child_process`/the bundled binary paths, nothing browser-safe about it):

```ts
getFfmpegPath(): string | null
getFfprobePath(): string | null
checkFfmpegAvailability(): Promise<FfmpegAvailability>
runFfprobeJson(inputPath: string): Promise<unknown>
```

- Uses `execFile` (never `exec`) throughout — arguments are passed as an array, never shell-interpolated, so there is no shell-quoting/injection surface regardless of path content (Windows or POSIX).
- `checkFfmpegAvailability()` never throws — every failure mode (binary unavailable for this platform, binary present but not executable) is reduced to a plain `{ ok, error, ... }` result, since this backs a user-facing health check that should always render *something* useful rather than crash.
- Timeouts: 8s for a version check, 15s for `runFfprobeJson` — generous for near-instant operations, short enough to fail fast rather than hang a server action indefinitely if a binary is somehow stuck.
- `windowsHide: true` on every `execFile` call — prevents a console window flash on Windows (irrelevant on Linux, harmless there).
- `runFfprobeJson`'s doc comment explicitly warns callers: `execFile` makes the *command* injection-safe, but the function still trusts its `inputPath` argument — callers must only ever pass a path MikAI itself resolved (e.g. a validated `uploads/`-relative path), never raw user input, since a crafted *path* could still point ffprobe at an unintended file even though the command itself can't be hijacked.

`src/actions/ffmpeg.ts` — one server action, `checkBundledFfmpeg()`, a thin `"use server"` wrapper around `checkFfmpegAvailability()` for the Settings UI to call.

## 5. Health Check UI

Settings → new **Technical** section → **Bundled FFmpeg** card (`src/components/FfmpegHealthCheckForm.tsx`, client component, same `useState`/`useTransition` pattern as the existing `ComfyUISettingsForm`/`OpenReelSidecarSettingsForm`):

- Button: **Check FFmpeg**.
- On click: calls `checkBundledFfmpeg()`, displays `OK`/`Failed`, `ffmpeg path`, `ffprobe path`, `ffmpeg version`, `ffprobe version`, and an error message if `ok: false`.
- Intro copy: *"FFmpeg and FFprobe are bundled with MikAI (no system install required) for future video rendering features."*

All labels in English, matching the ticket's exact requested strings.

## 6. Tests / Validation

No test runner is configured in this repo (confirmed again — no `vitest`/`jest` in `package.json`), consistent with every prior MikAI-side ticket in this series. Validated via direct, faithful-logic-replication scripts run with plain Node (`node -e "..."`, never saved to a file, nothing left behind) — the same approach used throughout this ticket series when no test runner is available:

1. **`ffmpeg -version` / `ffprobe -version` direct**: both binaries run successfully, report `ffmpeg version 6.1.1-essentials_build-www.gyan.dev`, GPL build with `--enable-libx264 --enable-libx265 --enable-libmp3lame --enable-libopus` among others (H.264/H.265 video, MP3/Opus audio — relevant to the future Basic renderer).
2. **`checkFfmpegAvailability()`'s exact logic**, replicated against the real installed package: returned `{ ok: true, ffmpegPath: "...\\ffmpeg.exe", ffprobePath: "...\\ffprobe.exe", ffmpegVersion: "ffmpeg version 6.1.1-essentials_build-www.gyan.dev ...", ffprobeVersion: "ffprobe version 6.1.1-essentials_build-www.gyan.dev ..." }` — paths non-empty, versions correctly extracted.
3. **`runFfprobeJson()`'s exact logic**, run against a real, already-existing approved shot video (`public/uploads/shot-videos/shot-36/...mp4`, read-only — no new file created): returned valid parsed JSON (`format.format_name`, `format.duration: "5.041667"`, one `video`/`h264` stream, no audio stream on this particular file — a concrete confirmation of `BASIC_EDITORIAL_1A_RENDERING_AUDIT.md`'s noted risk that some approved videos lack audio).
4. **Live Settings page** (`GET /settings`, dev server on `localhost:3000`): confirmed the "Bundled FFmpeg" card and "Check FFmpeg" button render. The click-triggered server action itself was not exercised through a real browser click (no browser automation tool in this environment), but its entire logic is the same `checkFfmpegAvailability()` already verified directly in step 2 — the action is a one-line pass-through with no additional logic of its own.

`npx tsc --noEmit` — 0 errors. `npm run build` — compiled successfully, all routes generated including `/settings` (same pre-existing, unrelated Turbopack NFT-tracing warning seen in every prior ticket; no new warning introduced by the FFmpeg import).

## 7. Linux/Server Implications

Not tested directly in this ticket (dev environment is Windows-only) — the following is based on the package's own documented platform matrix, not a live Linux run:

- `ffmpeg-ffprobe-static` downloads a Linux x64 (or arm64/arm, matching the server's actual architecture) binary automatically during `npm install` on that platform — no code change needed between Windows dev and Linux server; `getFfmpegPath()`/`getFfprobePath()` resolve to whatever binary was downloaded for the platform `npm install` ran on.
- A **fresh `npm install` must run on the target Linux server** (or in a Linux-targeted CI/build step) — the Windows `ffmpeg.exe`/`ffprobe.exe` binaries downloaded on this dev machine are not portable to Linux; this is inherent to how every "-static" binary-downloader npm package works, not specific to this one.
- If MikAI is ever containerized, the same rule applies inside the container build — installing dependencies on the host and copying `node_modules` into a differently-architected container image would ship the wrong binary.
- Recommend confirming a real Linux install as part of `BASIC.EDITORIAL.1.B`'s own validation, once server deployment is actually exercised — this ticket only establishes that the mechanism is sound and documented, not that it has been proven on Linux.

## 8. Risks

- `latest` dist-tag resolving to an RC (mitigated by explicit version pin, see §2).
- Third-party binary build sources (mitigated: standard practice for this class of package, no better alternative without building from source).
- Unverified on Linux (documented, not silently assumed — see §7).
- GPL licensing of the bundled binary (documented, not a blocker given `execFile`-based invocation — see §2).
- `execFile` with a MikAI-resolved path is safe from shell injection, but a future caller passing an unvalidated user-supplied path would still be a path-traversal/unintended-file-read risk — flagged in the helper's own doc comment for future callers to heed.

## 9. Recommended Next Ticket

`BASIC.EDITORIAL.1.B — Publish Basic Sequence Result`, per `docs/BASIC_EDITORIAL_1A_RENDERING_AUDIT.md`'s own recommendation — now unblocked, since the FFmpeg dependency decision (the explicit prerequisite that audit flagged) is resolved.

## 10. Files Modified

- `package.json` / `package-lock.json` — added `ffmpeg-ffprobe-static@6.1.1`.
- `src/lib/ffmpeg.ts` (new).
- `src/actions/ffmpeg.ts` (new).
- `src/components/FfmpegHealthCheckForm.tsx` (new).
- `src/app/settings/page.tsx` — new "Technical" section / "Bundled FFmpeg" card.
- `docs/FFMPEG_BUNDLE_1_BUNDLED_FFMPEG_HEALTHCHECK.md` (this document).

## 11. Confirmations

- No `src/db/schema.ts` change, no migration.
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- No `SequencePreviewPlayer` change.
- No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched or read.
- No runtime DB/uploads/outputs/storage committed or modified — `runFfprobeJson`'s validation read an existing approved video file, wrote nothing; no test video files were created.
- `package.json`/lockfile change is the one explicitly authorized exception for this ticket (bundled FFmpeg dependency).
