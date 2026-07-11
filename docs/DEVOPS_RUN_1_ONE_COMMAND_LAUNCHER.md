# DEVOPS.RUN.1 — One-command launcher for MikAI ProdLab + OpenReel

## 1. Audit of existing scripts

**MikAI** (`package.json`):
- `dev`: `next dev` — no explicit host/port, accepts `-H`/`-p` flags (already proven by the existing `dev:host` script: `next dev -H 0.0.0.0 -p 3000`).
- `build`: `next build`.
- `start`: `next start` — also accepts `-H`/`-p`.

**OpenReel sidecar** (`package.json`, pnpm workspace root):
- `dev`: `pnpm --filter @openreel/web dev` → resolves to `apps/web`'s `"dev": "vite"`.
- `build`: `pnpm build:wasm && pnpm --filter @openreel/web build` → resolves to `apps/web`'s `"build": "tsc --noEmit && vite build"`.
- `preview`: `pnpm --filter @openreel/web preview` → resolves to `apps/web`'s `"preview": "vite preview"`.
- Uses pnpm, pinned via `"packageManager": "pnpm@9.0.0"` — matches this ticket's `npx -y pnpm@9.0.0 ...` invocations exactly.
- Plain `vite`/`vite preview` accept `--host`/`--port` flags (standard Vite CLI), but neither the sidecar's own scripts nor Vite's defaults pass them.

No sidecar script changes were needed — the ticket's literal example commands work as-is through the existing root scripts. **The sidecar repo was not touched.**

## 2. Launcher script

`scripts/run-prod-lab.mjs` (Node built-ins only — `child_process.spawn`, never `exec`, no new dependency):

```bash
node scripts/run-prod-lab.mjs dev
node scripts/run-prod-lab.mjs prod
```

Exposed via `package.json`:

```json
"dev:all": "node scripts/run-prod-lab.mjs dev",
"prod:all": "node scripts/run-prod-lab.mjs prod"
```

Behavior:
- **dev**: launches MikAI (`npm run dev`) and OpenReel (`npx -y pnpm@9.0.0 dev --host 127.0.0.1 --port 5173`) side by side, persistent, logs prefixed `[MikAI]` / `[OpenReel]`.
- **prod**: builds MikAI (`npm run build`) then OpenReel (`npx -y pnpm@9.0.0 build`) **sequentially** — if either build fails, no server is started — then launches MikAI (`npm run start`) and OpenReel (`npx -y pnpm@9.0.0 preview --host 0.0.0.0 --port 5173`) persistently, same logging.
- Resolves the OpenReel sidecar directory via `MIKAI_OPENREEL_DIR`, falling back to the sibling folder `../mikai-openreel-sidecar`; verifies the directory and a `package.json` inside it both exist, with a readable error otherwise.
- If either persistent server exits unexpectedly, the other is stopped too.
- Ctrl+C (`SIGINT`) and `SIGTERM` both trigger a clean shutdown of every spawned process.
- Cross-platform: Windows and POSIX both supported, including a Windows-specific process-tree kill fix (see §5).

## 3. Real bugs found and fixed during validation

**Bug 1 — OpenReel dev server didn't respond on the documented `127.0.0.1:5173` URL.** Plain `vite` (no `--host`) was found, live, to bind only the IPv6 loopback (`::1`) — `http://localhost:5173` responded, but `http://127.0.0.1:5173` (the literal URL this ticket requires, and the same value the "OpenReel Sidecar URL" app setting defaults to) did not. Fixed by always passing `--host <OPENREEL_HOST> --port <OPENREEL_PORT>` explicitly to the dev command (unlike MikAI's dev/start args, which only add `-H`/`-p` when overridden from their defaults — Next's dev server didn't have this problem). Confirmed the pnpm arg-forwarding through the nested `pnpm --filter @openreel/web dev` script works correctly — Vite reported `Local: http://127.0.0.1:5173/` after the fix.

**Bug 2 — orphaned processes on shutdown (Windows).** With `child_process.spawn(..., { shell: true })`, calling `child.kill()` on Windows only signals the immediate `cmd.exe` shell — the actual `npm`/`next`/`vite` descendant processes it spawned are left running, orphaned, still bound to their ports. Discovered by killing one persistent process and observing the *other* app's shutdown message log, then finding its process tree (3–4 processes) still alive and the port still open. Fixed with a platform-aware `killTree()`: `taskkill /pid <pid> /T /F` on Windows (kills the whole tree), and the POSIX negative-pid form of `process.kill()` (targeting the process group created by `detached: true`) elsewhere.

Both fixes are in the committed script — not left as known issues.

## 4. Output path / environment variables

Uploads-relevant note: not applicable to this ticket (no rendering, no uploads).

Supported environment variables, all optional:

| Variable | Default | Purpose |
|---|---|---|
| `MIKAI_OPENREEL_DIR` | `../mikai-openreel-sidecar` (sibling of this repo) | Override the sidecar's location |
| `MIKAI_HOST` | `localhost` | MikAI dev/start bind + display host |
| `MIKAI_PORT` | `3000` | MikAI dev/start port |
| `OPENREEL_HOST` | `127.0.0.1` | OpenReel dev bind host; also the prod preview bind host **if explicitly set** |
| `OPENREEL_PORT` | `5173` | OpenReel dev/preview port |

For `prod`, if `OPENREEL_HOST` is left unset, the preview server binds to `0.0.0.0` (reachable from other machines on a server/Tailscale box out of the box) while the printed URL still shows `127.0.0.1` — the locally-meaningful address. Setting `OPENREEL_HOST` explicitly makes it both the bind host and the displayed URL.

## 5. Windows vs. POSIX process management

- `spawn(..., { shell: true })` on both platforms, for consistent npm/npx `.cmd`-shim resolution on Windows.
- POSIX: children spawned with `detached: true`, making them the leader of their own process group; shutdown uses `process.kill(-child.pid, signal)` to signal the whole group (shell → npm/pnpm → next/vite), not just the immediate shell.
- Windows: `detached` doesn't provide equivalent semantics, so shutdown uses `taskkill /pid <pid> /T /F` (tree-kill) instead — this was the fix for Bug 2 above.

## 6. Manual validation

**dev:all** (`npm run dev:all`), on Windows, via a live run:
- MikAI ready in ~1s (`Ready in 988ms`), OpenReel ready in ~0.5s — both concurrently.
- `http://localhost:3000` → `200`. `http://127.0.0.1:5173` → `200` (confirmed only after Bug 1's fix; failed before it).
- **Cascading shutdown** (the practical equivalent of "one process dying should take the other down too"): killed the OpenReel `vite` process directly → the launcher logged `[OpenReel] exited (code ...) — stopping the other process.` and MikAI's port was confirmed closed within 3 seconds. Repeated with a fully clean process tree afterward (`Get-CimInstance Win32_Process` showed zero leftover MikAI/OpenReel/launcher processes).

**prod:all** (`npm run prod:all`), full run, no shortcuts:
- `MikAI:build` (`next build`) completed successfully — full route manifest printed, no errors.
- `OpenReel:build` (`pnpm build:wasm && ... tsc --noEmit && vite build`) started **only after** MikAI's build finished (confirmed sequential ordering from the log), completed successfully in ~25s (3997 modules transformed, `dist/` bundle written; a few pre-existing chunk-size warnings from the sidecar itself, not introduced by this ticket).
- Both persistent servers then started: MikAI (`next start`, ready in 451ms) and OpenReel (`vite preview --host 0.0.0.0 --port 5173`).
- `http://localhost:3000` → `200`. `http://127.0.0.1:5173` → `200`. `http://localhost:5173` → `200` (preview server correctly reachable both ways since it bound `0.0.0.0`).
- Cascading shutdown re-verified in prod mode the same way as dev: killed the `vite preview` process, launcher stopped MikAI's `next start`, both ports confirmed closed, zero orphaned processes left afterward.

**Ctrl+C**: the `SIGINT`/`SIGTERM` handlers were code-reviewed and follow the standard Node pattern (`process.on("SIGINT", ...)` calling the same `killAll()`/`killTree()` path exercised above). A literal interactive Ctrl+C keypress could not be simulated from this non-interactive validation environment — on Windows, a signal delivered cross-process via `process.kill(pid, signal)` from another process unconditionally hard-terminates the target (no JS handler runs), which is a documented Node/Windows platform limitation, not a property of this script; a real terminal Ctrl+C is delivered differently (via the console's Ctrl handler) and does invoke the registered handler, the same way it does for any other Node CLI tool (nodemon, concurrently, etc.). What *was* validated directly and repeatedly is the exact code path that handler calls — `killAll()` → `killTree()` — via the cascading-shutdown tests above, including confirming it fully cleans up a multi-process Windows tree.

## 7. Linux / Tailscale server notes

```bash
cd /path/to/MikAIProdLab
MIKAI_OPENREEL_DIR=/path/to/mikai-openreel-sidecar npm run prod:all
```

On a remote server, the URLs printed by the launcher (`127.0.0.1`/`localhost`) are only meaningful *on that machine*. For a browser connecting from elsewhere, also update MikAI's own Settings:

```text
OpenReel Sidecar URL:      http://<server-ip-or-tailscale-name>:5173
MikAI Public Base URL:     http://<server-ip-or-tailscale-name>:3000
```

(These are the same `openreel_sidecar_url` / `mikai_public_base_url` settings already used by the "Open in Advanced Editor" link — see EDITORIAL.UX.1 / `src/lib/settings.ts`. This ticket doesn't change them; the OpenReel preview server already binds `0.0.0.0` by default in prod, so it's reachable once the Settings values point browsers at the right host.)

## 8. Windows example

```powershell
cd F:\AI\MikAIProdLab
npm run dev:all
```

```powershell
cd F:\AI\MikAIProdLab
npm run prod:all
```

## 9. Limitations

- No process-tree cleanup on a hard external kill of the launcher itself (Task Manager "End task", a crash, `taskkill` without `/T` targeting only the launcher) — this is a general limitation of any Node-based multi-process launcher on Windows without OS-level job objects, which would require either a new dependency or direct Win32 API calls; both are out of scope ("no new dependency unless proven necessary," "don't overcomplicate"). A real interactive Ctrl+C, the ticket's primary use case, is unaffected by this.
- The sidecar's own build produces a few pre-existing chunk-size warnings (unrelated to this ticket, not introduced by it).
- No automated test coverage for the launcher script itself — validated entirely through live runs (dev and prod, both fully exercised, including cascading shutdown) rather than a unit test, consistent with this repo's established no-test-runner convention.

## 10. Next step

None required — this ticket's scope is complete and fully validated. If desired later: a small `doctor`-style pre-flight check (verifying Node/pnpm versions before launching) could be added, but wasn't requested and isn't needed for the core one-command workflow to work.
