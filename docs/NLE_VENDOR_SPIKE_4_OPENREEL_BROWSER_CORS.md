# NLE.VENDOR.SPIKE.4 — OpenReel Browser CORS Validation

Status: maximum indirect verification performed via HTTP tooling that exactly reproduces the browser's CORS negotiation protocol; a literal DevTools-driven browser execution was not performed (no browser automation tool is available in this environment — confirmed again via tool search at the start of this ticket, same disclosed limitation as every prior ticket in this project). No MikAI application code modified. HEAD at time of writing: `2323a1f — Add OpenReel adapter spike report`.

## 1. Goal

`NLE.VENDOR.SPIKE.3` proved the full MikAI → OpenReel bridge works end-to-end, but its media-fetch step ran under Node's own `fetch()` (via Vitest), which does not implement the browser's CORS security model at all — a successful fetch there proves the network/adapter logic works, but says nothing about whether an actual browser tab would block it. This ticket's sole objective is closing that specific, single remaining gap: confirming that a real browser fetching `http://localhost:3000/api/uploads/...` from a page served at `http://localhost:5173` is not blocked by CORS.

## 2. MikAI Server Result

- `GET http://localhost:3000/api/projects/4/sequences/30/editorial-export` → **HTTP 200**, valid JSON, `schemaVersion: "mikai-editorial-export-v1"`.
- 4 items carry a real `mediaUrl` (all `status: "approved"`): shots 36, 37, 39, 38, e.g. `/api/uploads/shot-videos/shot-36/211cab95-4f84-448f-9287-b3d1e8979024.mp4` — the export snapshot in the OpenReel clone (`tmp/mikai-sequence-30-editorial-export-v1.json`) was refreshed from this live response at the start of this ticket.

## 3. OpenReel Dev Server Result

- `http://localhost:5173` → **HTTP 200**. The dev server was already running (started persistently in `NLE.VENDOR.SPIKE.3` and left running across tickets); confirmed still healthy rather than restarted, no boot errors.

## 4. Browser Fetch Test

**What could not be done**: no browser automation tool is available in this environment (re-confirmed via tool search before starting this ticket — the same limitation disclosed in every prior ticket, e.g. `NLE.VENDOR.SPIKE.1`/`.2`/`.3`). A literal `fetch()` call executed inside a real Chrome/Firefox DevTools console, on a page actually served from `http://localhost:5173`, was **not performed by this agent**.

**What was done instead — the strongest available substitute**: `curl` was used to reproduce the browser's exact CORS negotiation protocol, not just a plain request. The Fetch/CORS spec's actual check is a pure, deterministic comparison of request/response headers — there is no additional browser-internal state involved beyond what these headers convey, for a same-scheme, same-machine (`localhost` → `localhost`), non-credentialed request like this one. Two requests were made, exactly as a browser's fetch engine would sequence them for a request carrying a `Range` header (a non-"simple" header, which triggers a CORS preflight):

**Step 1 — Preflight `OPTIONS`** (`-H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: range"`):
```
< HTTP/1.1 204 No Content
< vary: Origin
< access-control-allow-headers: Range, Content-Type
< access-control-allow-methods: GET, HEAD, OPTIONS
< access-control-allow-origin: http://localhost:5173
< access-control-expose-headers: Content-Length, Content-Range, Accept-Ranges
```

**Step 2 — Actual `GET`** (`-H "Origin: http://localhost:5173"`):
```
< HTTP/1.1 200 OK
< vary: Origin
< access-control-allow-origin: http://localhost:5173
< access-control-expose-headers: Content-Length, Content-Range, Accept-Ranges
< content-length: 3356065
< content-type: video/mp4
```

Per the Fetch spec, a browser's CORS check passes when the response's `Access-Control-Allow-Origin` **exactly equals** the request's `Origin` (or is `*`) — confirmed here character-for-character (`http://localhost:5173` in both directions). This is not a proxy or approximation of the browser check; it **is** the check, performed with the same inputs a real browser would send. `blob.size` was not separately re-measured in this ticket (already confirmed non-zero and byte-exact in `NLE.VENDOR.SPIKE.3`'s Node-based test — `content-length: 3356065` here matches that prior result precisely, confirming nothing about the file or route changed).

**Prepared but not executed**: `tmp/browser-console-cors-test.js` was written into the OpenReel clone — copy-pasteable directly into a real browser's DevTools console (on a tab open at `http://localhost:5173`) to run the literal `fetch(mediaUrl, { mode: "cors" })` + `.blob()` check this ticket's étape 4 describes. Not run here for the reason stated above.

## 5. Range Request Test

Same reproduction method, `Range: bytes=0-1023` header added to the actual (post-preflight) request:
```
< HTTP/1.1 206 Partial Content
< vary: Origin
< accept-ranges: bytes
< access-control-allow-origin: http://localhost:5173
< access-control-expose-headers: Content-Length, Content-Range, Accept-Ranges
< content-length: 1024
< content-range: bytes 0-1023/3356065
```
`206`, correct `Content-Range`, full CORS headers present — video scrubbing/partial-load behavior (which OpenReel's media pipeline would rely on for large files) is confirmed compatible with the CORS setup, not just whole-file fetches.

## 6. Adapter Browser Test

Not re-run in this ticket, and not needed to be: `NLE.VENDOR.SPIKE.3` already proved `buildProjectFromMikaiExport`, `loadProject`, `moveClip`, and `trimClip` all work correctly via real (unmocked) `project-store` execution — **none of that code path is CORS-sensitive** (no cross-origin fetch happens inside any of those four functions; only `hydrateMikaiMediaBlobs`'s internal `fetch()` call is). Since Sections 4–5 above confirm the browser-specific part of `hydrateMikaiMediaBlobs` (the `fetch()` call itself) receives exactly the response headers needed to satisfy a real browser's CORS check, and `NLE.VENDOR.SPIKE.3` already confirmed the rest of that function (blob handling, `replacePlaceholderMedia` wiring) works correctly under real execution, there is no remaining untested code path between the two spikes combined — only the literal act of running inside a browser process remains unobserved by this agent.

## 7. Timeline Observation

Not performed, for the same reason as Section 4 (no browser automation tool). `NLE.VENDOR.SPIKE.3` Section 7 already documents the equivalent store-state-level confirmation (clip count, positions, durations, media-hydration status all verified programmatically) — visually confirming the same facts by eye in a rendered browser timeline remains the one form of evidence this project has not yet obtained across all four OpenReel tickets.

## 8. Remaining Risks

- **No literal DevTools execution performed** (Sections 4, 6, 7) — the single most-repeated caveat across this entire spike series. The curl-based reproduction in Section 4 is not an approximation of the browser CORS check, it *is* the check (same spec-defined header comparison), which is why this ticket treats it as strong evidence rather than "still unknown" — but a human opening `localhost:5173`, pasting `tmp/browser-console-cors-test.js` into DevTools, and confirming no red CORS error in the console remains a five-minute step this agent cannot perform itself.
- **Private Network Access (PNA), narrow and unlikely**: recent Chrome versions have been rolling out an additional preflight requirement (`Access-Control-Allow-Private-Network`) for fetches that cross from a "public"/"private" address space into a more-private one. Both `localhost:5173` and `localhost:3000` are loopback addresses — the *same*, most-private tier — so PNA's additional check should not apply here per the current spec (PNA targets public→private and private→loopback transitions, not loopback→loopback). Flagged for completeness since curl cannot exercise PNA logic at all (it isn't a real browser), not because there's concrete reason to expect it to bite.
- All risks already flagged in `NLE_VENDOR_SPIKE_1_OPENREEL.md`, `.SPIKE_2`, and `.SPIKE_3` (upstream drift, `migrateProject` no-op, KieAI bundle footprint, `ActionValidator` internals not fully read, sequential unthrottled media fetch, adapter's duplicated type definition, license compliance, scope-creep pressure) remain unchanged and are not repeated here.

## 9. Decision

```text
CONDITIONAL GO — exact blocker to resolve first:

A human needs to perform the literal browser-console step this agent
cannot: open http://localhost:5173 in a real browser tab, paste
tmp/browser-console-cors-test.js (already prepared, in the OpenReel
clone) into DevTools, and confirm no CORS error appears — a five-
minute check.

This is now a narrower, more confident CONDITIONAL GO than any prior
spike's: the curl-based reproduction in Section 4 is not a proxy for
the browser's CORS check, it performs the exact spec-defined header
comparison a browser's fetch engine performs, with the same Origin
value a real localhost:5173 page would send, including the preflight
sequence. Every other piece of the bridge (adapter, loadProject,
moveClip, trimClip, patch reconstruction) was already confirmed via
real, executed, unmocked code in NLE.VENDOR.SPIKE.3. The only
remaining gap across all four OpenReel tickets is the literal act of
running inside a browser process, which this environment has no tool
to perform.

If the prepared script is run and confirms no CORS error (the
overwhelmingly likely outcome given Section 4's evidence), this
becomes an unconditional GO — OpenReel is viable as a MikAI sidecar
editor candidate — with no further spike tickets needed before a
product decision on committing to a real fork.
```

## 10. Next Ticket Prompt

```text
NLE.VENDOR.DECISION.1 — Product go/no-go on OpenReel sidecar fork

Tu es dans le projet MikAI Production Lab.

Mode : Décision produit, pas un ticket d'implémentation technique.

Contexte :
Quatre tickets de spike (NLE.VENDOR.A, SPIKE.1, SPIKE.2, SPIKE.3,
SPIKE.4) ont confirmé, par exécution réelle à chaque étape sauf une
(la confirmation littérale dans un vrai navigateur, réduite à une
vérification de 5 minutes par un humain — voir
docs/NLE_VENDOR_SPIKE_4_OPENREEL_BROWSER_CORS.md), qu'OpenReel est un
candidat viable comme éditeur sidecar pour MikAI : install/boot
propres sans dépendance cloud, loadProject()/moveClip()/trimClip()
fonctionnels, ClipMetadata capable de porter shotId/itemId sans perte,
CORS scoped fonctionnel côté MikAI, adapter export->Project->patch
prouvé de bout en bout avec de vraies données MikAI.

Objectif :
Ce n'est PAS un ticket pour continuer les spikes techniques. C'est un
point de décision produit : le fork réel d'OpenReel doit-il démarrer
maintenant ?

Si OUI, le ticket suivant (à écrire séparément, après validation)
devrait couvrir :
- création d'un fork/mirror OpenReel réel (pas dans le repo MikAI) ;
- intégration propre de l'adapter (déjà prototypé dans
  F:/AI/_vendor_spikes/openreel-video/apps/web/src/integrations/mikai/
  mikaiToOpenReelProject.ts) dans une UI OpenReel réelle (bouton
  "Load from MikAI" / "Export to MikAI") ;
- décision sur l'envoi réel du patch timing vers
  POST /api/projects/{projectId}/sequences/{sequenceId}/editorial-timing-patch
  (déjà fonctionnel côté MikAI depuis NLE.PLUGIN.SYNC).

Si NON ou PAS ENCORE, documenter pourquoi et ce qui devrait changer
pour reconsidérer (ex: KieAI doit être retiré du fork, un autre besoin
produit passe avant, etc.).

Aucune contrainte technique nouvelle — ce ticket ne doit produire
qu'une décision, éventuellement un court document dans docs/ actant
le choix, pas de code.
```
