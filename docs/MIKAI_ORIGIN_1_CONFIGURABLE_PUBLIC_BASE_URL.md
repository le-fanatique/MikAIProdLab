# MIKAI.ORIGIN.1 — Configurable MikAI Public Base URL

Status: MikAI-only change. No sidecar code touched. MikAI HEAD before this ticket: `8140c8c — Add configurable OpenReel sidecar URL`. Sidecar HEAD unchanged: `50bfde1 — Keep MikAI timing patches start-only`.

## 1. Problem

`OPENREEL.URL.1` made the OpenReel sidecar's own URL configurable, but the `mikaiExportUrl` query param embedded in the `Open in Advanced Editor` link was still built from `NEXT_PUBLIC_MIKAI_ORIGIN ?? "http://localhost:3000"`. On a server/Tailscale setup, `localhost:3000` resolves to the client machine, not the MikAI server — the sidecar (running in the user's browser) would try to fetch the export JSON from itself and fail.

## 2. Audit Summary

- `NEXT_PUBLIC_MIKAI_ORIGIN` was read in exactly one place: `src/app/projects/[projectId]/sequences/[sequenceId]/nle-prototype/page.tsx`, used to build `absoluteExportUrl = ${mikaiOrigin}${editorialExportHref}`, which becomes the `mikaiExportUrl` query param.
- `mikaiExportUrl` is only ever constructed at that one call site — no other file needed changing.
- To avoid duplicating the DB-setting/env-var/fallback logic, the exact same shape already established for `openreel_sidecar_url` in `OPENREEL.URL.1` was reused: a getter in `src/lib/settings.ts`, a save action in `src/actions/settings.ts`, a dedicated client form component, one new `app_settings` key. `app_settings` is a generic key/value table (`src/db/schema.ts`) — no schema/migration needed for the new key.
- New key: `mikai_public_base_url`.
- Fallback: `http://localhost:3000` — kept identical to the prior hardcoded default (not `127.0.0.1`, unlike the sidecar setting) specifically to preserve existing setups' behavior unchanged; the setting is what lets an operator move to `127.0.0.1`, a tailnet IP, or a public domain.

## 3. Setting Added

Settings → **Advanced Editor (OpenReel)** card (same card as `OPENREEL.URL.1`'s `OpenReel Sidecar URL`, in its own sub-section below a divider), field **MikAI Public Base URL**:

> Browser-facing URL used by the OpenReel sidecar to call back into MikAI. Use a full URL, including protocol and port.
>
> Examples: `http://127.0.0.1:3000` · `http://100.x.y.z:3000` · `https://mikai-prodlab.tailnet-name.ts.net`. Must be reachable from the browser that opens OpenReel, not just from the MikAI server itself.

`src/components/MikAIPublicBaseUrlSettingsForm.tsx` — new dedicated client component (separate from `OpenReelSidecarSettingsForm.tsx`, kept independent per-field save so a mistake in one field can't block saving the other).

## 4. Save Action / Validation

`saveMikAIPublicBaseUrl(url)` in `src/actions/settings.ts`, mirrors `saveOpenReelSidecarUrl`:
- Trims whitespace.
- Strips a trailing slash (or slashes).
- Must start with `http://` or `https://`, or rejected with `"Invalid URL. Must start with http:// or https://."`.
- Empty value on save restores the fallback (`http://localhost:3000`) rather than storing an unusable empty string.

## 5. Read Priority

`getMikAIPublicBaseUrl()` in `src/lib/settings.ts`:

```text
DB setting "mikai_public_base_url"
  → legacy env var NEXT_PUBLIC_MIKAI_ORIGIN
  → fallback "http://localhost:3000"
```

Both the DB value and the env var are trailing-slash-stripped before being returned, so a value saved (or set via env) with a trailing slash never produces a double slash in the generated link.

## 6. Link Construction

`nle-prototype/page.tsx` now does:

```ts
const mikaiOrigin = await getMikAIPublicBaseUrl();     // trailing slash stripped
const sidecarOrigin = await getOpenReelSidecarUrl();   // trailing slash stripped
const absoluteExportUrl = `${mikaiOrigin}${editorialExportHref}`;
const advancedEditorHref = `${sidecarOrigin}/?${new URLSearchParams({
  mikaiExportUrl: absoluteExportUrl,
  mikaiProjectId: String(pid),
  mikaiSequenceId: String(sid),
}).toString()}`;
```

`URLSearchParams` handles the encoding of `mikaiExportUrl`, so the embedded URL's own `://` and `/` are correctly percent-encoded.

## 7. Interaction with OpenReel Sidecar URL

Both settings are read independently and combine into the final link. Verified against the ticket's exact example:

- `OpenReel Sidecar URL = http://100.64.1.2:5173`
- `MikAI Public Base URL = http://100.64.1.2:3000/` (trailing slash)

produces:

```text
http://100.64.1.2:5173/?mikaiExportUrl=http%3A%2F%2F100.64.1.2%3A3000%2Fapi%2Fprojects%2F4%2Fsequences%2F30%2Feditorial-export&mikaiProjectId=4&mikaiSequenceId=30
```

— matching the ticket's expected output exactly, including the trailing slash on the stored `MikAI Public Base URL` being stripped before use.

## 8. Tailscale / Server Setup Notes

```text
For Tailscale/server setups:
- OpenReel Sidecar URL must point to the browser-facing OpenReel address.
- MikAI Public Base URL must point to the browser-facing MikAI address.
- MIKAI_EDITOR_CORS_ORIGINS must include the OpenReel sidecar origin.
```

`MIKAI_EDITOR_CORS_ORIGINS` (`src/lib/cors/editorSidecarCors.ts`, unchanged by this ticket) already supports additive origins on top of the `localhost`/`127.0.0.1` defaults. For a Tailscale deployment where the sidecar runs at `https://mikai-openreel.tailnet-name.ts.net`, set:

```text
MIKAI_EDITOR_CORS_ORIGINS=http://100.x.y.z:5173,https://mikai-openreel.tailnet-name.ts.net
```

so the sidecar's tailnet origin (now itself potentially different from the sidecar's own configurable URL if a proxy/DNS name is used) is allowed to fetch MikAI's `editorial-export`/`editorial-timing-patch`/`uploads` routes cross-origin. This CORS allowlist is a separate, server-side setting (env var) from the two `app_settings`-backed URL fields added across `OPENREEL.URL.1`/`MIKAI.ORIGIN.1`, since CORS must be enforced by MikAI's server regardless of what URL the browser was told to use.

## 9. Tests / Verification

No existing automated test suite covers `src/actions/settings.ts` or `src/lib/settings.ts` — this ticket follows that existing convention (same as `OPENREEL.URL.1`) and relies on manual/documented verification.

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — compiled successfully, all routes generated (same pre-existing, unrelated Turbopack NFT-tracing warning as before, on `next.config.ts` / `api/uploads/[...path]/route.ts`).
- Manual verification against the live dev server (direct DB read/write via `better-sqlite3`, no browser automation tool available):
  1. **No settings**: link correctly falls back to `mikaiExportUrl=http%3A%2F%2Flocalhost%3A3000%2F...`.
  2. **Both settings set, `MikAI Public Base URL` with a trailing slash** (`http://100.64.1.2:3000/`) and `OpenReel Sidecar URL = http://100.64.1.2:5173`: generated link matched the ticket's exact expected output, no double slash anywhere.
  3. **Invalid URL rejection**: verified by code inspection — `saveMikAIPublicBaseUrl("100.64.1.2:3000")` (no scheme) returns `{ ok: false, error: "Invalid URL. Must start with http:// or https://." }`, matching `saveOpenReelSidecarUrl`'s already-established behavior (same validation pattern, unverified-by-automated-tests elsewhere in this file, e.g. `saveComfySettings`).
  4. **Empty value**: `saveMikAIPublicBaseUrl("")` restores the fallback (`http://localhost:3000`) by code inspection, same as the empty-value path already exercised for `openreel_sidecar_url`.
  5. Settings page rendered both fields correctly pre-filled with their trailing-slash-stripped stored values.
  - Removed both test rows afterwards; confirmed the link reverted to the full fallback (`localhost:3000` + `127.0.0.1:5173`).

## 10. Confirmations

- No `src/db/schema.ts` change — `app_settings` is a generic key/value table, no migration needed.
- No `package.json`/lockfile change.
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign — only the `mikaiOrigin` line and its import changed (same pattern as `OPENREEL.URL.1`'s `sidecarOrigin` change).
- No `SequencePreviewPlayer` change.
- No runtime DB/uploads/outputs/storage committed (the `data/mikailab.db` writes used for manual verification were temporary and reverted).
- **No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched** — this ticket is entirely MikAI-side link generation; the sidecar already reads `mikaiExportUrl` verbatim from the query string with no assumptions about its host.
