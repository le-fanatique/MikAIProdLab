# OPENREEL.URL.1 — Configurable OpenReel Sidecar URL

Status: MikAI-only change. No sidecar code touched. MikAI HEAD before this ticket: `d79a5cf — Add OpenReel patch duration bug report`. Sidecar HEAD unchanged: `50bfde1 — Keep MikAI timing patches start-only`.

## 1. Problem

The `Open in Advanced Editor` link on the NLE Prototype page was built from `process.env.NEXT_PUBLIC_MIKAI_OPENREEL_SIDECAR_URL ?? "http://localhost:5173"`. In this user's environment, `localhost:5173` is unreliable but `127.0.0.1:5173` works — an env-var-only mechanism also has no in-app UI for changing it, and the roadmap requires the MikAI + sidecar combo to eventually run on a server reachable over Tailscale, where the sidecar's browser-facing URL (e.g. `https://mikai-openreel.tailnet-name.ts.net` or `http://100.x.y.z:5173`) has nothing to do with `localhost` at all.

## 2. Audit Summary

- Link generation: `src/app/projects/[projectId]/sequences/[sequenceId]/nle-prototype/page.tsx` — a server component that builds `advancedEditorHref` from `mikaiOrigin` (MikAI's own origin, `NEXT_PUBLIC_MIKAI_ORIGIN`) and `sidecarOrigin` (the OpenReel sidecar's origin).
- Settings storage: `app_settings` is a generic `key`/`value` table (`src/db/schema.ts`) already used for every other setting (LLM providers, ComfyUI, nomenclature, chat) — no schema change needed for a new key.
- Existing pattern to follow: ComfyUI's `getComfySettings()`/`saveComfySettings()`/`testComfyConnection()` in `src/lib/settings.ts` / `src/actions/settings.ts`, rendered via `ComfyUISettingsForm.tsx` in `src/app/settings/page.tsx`'s `Card`-based layout. Reused the same shape (read helper in `lib/settings.ts`, save action in `actions/settings.ts`, a small client form component, a `Card` in the Settings page).
- CORS: `src/lib/cors/editorSidecarCors.ts`'s `DEFAULT_ALLOWED_ORIGINS` already includes both `http://localhost:5173` and `http://127.0.0.1:5173`, and `MIKAI_EDITOR_CORS_ORIGINS` (comma-separated) is additive on top of the defaults — this route needed no code change for the localhost/127.0.0.1 mismatch or for adding further origins later.

**Decisions**:
- New `app_settings` key: `openreel_sidecar_url`.
- Read helper: `getOpenReelSidecarUrl()` in `src/lib/settings.ts`. Priority: DB setting → `NEXT_PUBLIC_MIKAI_OPENREEL_SIDECAR_URL` env var (kept as a fallback layer so any existing env-based deployment keeps working unchanged) → hardcoded `http://127.0.0.1:5173`.
- Called from the NLE Prototype server component directly (`await getOpenReelSidecarUrl()`), replacing the old inline env-var read.

## 3. Setting Added

Settings → **Advanced Editor (OpenReel)** card, field **OpenReel Sidecar URL**:

> URL used by MikAI to open the OpenReel advanced editor. Use a full URL, including protocol and port.
>
> For a server/Tailscale setup, use the URL reachable from your browser (e.g. a tailnet address or MagicDNS name), not the address MikAI's server sees internally.

Validation on save (`saveOpenReelSidecarUrl` in `src/actions/settings.ts`):
- Trims whitespace.
- Strips a trailing slash (or slashes) so the generated link never has `//` before `?`.
- Must start with `http://` or `https://`, or the save is rejected with `"Invalid URL. Must start with http:// or https://."`.
- An empty value on save restores the fallback (`http://127.0.0.1:5173`) rather than storing an unusable empty string.

Fallback: `http://127.0.0.1:5173` — chosen over `localhost:5173` because `127.0.0.1` has proven more reliable in this project's dev environment (matches the reported mismatch).

## 4. Link Construction

`nle-prototype/page.tsx` now does:

```ts
const sidecarOrigin = await getOpenReelSidecarUrl(); // trailing slash already stripped
const advancedEditorHref = `${sidecarOrigin}/?${new URLSearchParams({
  mikaiExportUrl: absoluteExportUrl,
  mikaiProjectId: String(pid),
  mikaiSequenceId: String(sid),
}).toString()}`;
```

`getOpenReelSidecarUrl()` strips trailing slashes on both the DB-stored value and the env-var fallback before returning, so a setting saved as `http://127.0.0.1:5173/` produces the same single-slash link as one saved without the trailing slash.

## 5. Tailscale / Server Setup Notes

- `OpenReel Sidecar URL` must be the URL reachable from the **user's browser** — a tailnet IP (`http://100.x.y.z:5173`) or a Tailscale MagicDNS name (`https://mikai-openreel.tailnet-name.ts.net`), not necessarily what the MikAI server process itself would use to reach the sidecar internally.
- **Not resolved by this ticket**: the `mikaiExportUrl` embedded in the link is still built from `NEXT_PUBLIC_MIKAI_ORIGIN ?? "http://localhost:3000"` — MikAI's own public/browser-facing base URL is not yet configurable via a Settings UI. If MikAI itself is served over Tailscale, `NEXT_PUBLIC_MIKAI_ORIGIN` must be set (as an env var, at build/deploy time) to MikAI's own tailnet-reachable URL, or the sidecar (running in the user's browser) won't be able to fetch the export JSON. This is a distinct, separable piece of work — flagged here, not solved in this ticket per its explicit scope.
- CORS: no code change was needed. `MIKAI_EDITOR_CORS_ORIGINS` already supports adding origins on top of the `localhost`/`127.0.0.1` defaults. For a Tailscale deployment, set:
  ```text
  MIKAI_EDITOR_CORS_ORIGINS=http://100.x.y.z:5173,https://mikai-openreel.tailnet-name.ts.net
  ```
  so the sidecar's tailnet origin is allowed to fetch MikAI's `editorial-export`/`editorial-timing-patch`/`uploads` routes cross-origin.

## 6. Tests / Verification

No existing automated test suite covers `src/actions/settings.ts` or `src/lib/settings.ts` (no test files found for either) — this ticket follows that existing convention and relies on manual/documented verification instead, matching the pattern used for ComfyUI's own settings (`testComfyConnection`, no unit tests either).

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — compiled successfully, all routes generated (one pre-existing, unrelated Turbopack NFT-tracing warning on `next.config.ts` / `api/uploads/[...path]/route.ts`, present before this ticket).
- Manual verification against the live dev server (direct DB read/write via `better-sqlite3` to simulate save/reload, since there's no browser automation tool in this environment):
  - No `openreel_sidecar_url` row present → NLE Prototype page's link correctly falls back to `http://127.0.0.1:5173/?...`.
  - Inserted `openreel_sidecar_url = "http://100.64.1.2:5173/"` (trailing slash) directly in the DB → NLE Prototype page's link became `http://100.64.1.2:5173/?...` — single slash before `?`, no double slash.
  - Settings page (`/settings`) rendered the `OpenReel Sidecar URL` field pre-filled with `http://100.64.1.2:5173` (trailing slash stripped for display too).
  - Removed the test row → link reverted to the `http://127.0.0.1:5173` fallback, confirming the fallback path works with no stored setting.
  - Save-path validation (empty → fallback restored; missing `http(s)://` → rejected with a readable error) verified by code inspection against the same pattern already used and unverified-by-automated-tests elsewhere in this file (`saveComfySettings`/`testComfyConnection`).

## 7. Confirmations

- No `src/db/schema.ts` change — `app_settings` is a generic key/value table, no migration needed.
- No `package.json`/lockfile change.
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign — only the sidecar-origin line and its import changed.
- No `SequencePreviewPlayer` change.
- No runtime DB/uploads/outputs/storage committed (the `data/mikailab.db` writes used for manual verification were temporary and reverted).
- **No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched** — confirmed unnecessary since the CORS allowlist already accepted both `localhost`/`127.0.0.1` and is additively configurable via `MIKAI_EDITOR_CORS_ORIGINS`; the patch contract and sidecar-side URL handling required no change.
