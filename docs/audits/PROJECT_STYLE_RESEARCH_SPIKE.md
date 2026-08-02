# Project Style V1 — Web Research Contract Spike (`STYLE.RESEARCH.SPIKE.1`)

Date: 2026-07-23, retake after Codex `REVISE`. Read-only spike deliverable —
not application code. Status: historical source document — the
`STYLE.1.C` OpenRouter Web Search contract decided here was implemented and
`STYLE.1.ACCEPTANCE.1` was accepted by the user on 2026-08-02.

Feedback: `FB-20260723-001`.

## Verdict

**GO WITH LIMITS**, recommending the **current OpenRouter Server Tool**
(`tools: [{ type: "openrouter:web_search" }]`) as the retrieval/citation
contract for `STYLE.1.C.CORE`, used in a strict **two-stage pipeline**
(search-and-normalize, then a separate synthesis call over only the saved
excerpts), and a fixed MVP retention policy of **no arbitrary MikAI page
re-fetch** — only the provider's own bounded excerpts, metadata, and a
user-openable link.

This is "GO WITH LIMITS" rather than plain "GO" for reasons named
explicitly below: (1) MikAI's currently *configured* default OpenRouter
model does not support this Server Tool cleanly (a real HTTP 500, not a
graceful decline) — a real integration gap that `STYLE.1.C.CORE` must
resolve, either by switching the default research model or handling the
failure explicitly; (2) Tavily and Brave were compared from official
documentation only, never called, since no credential exists for either in
this environment; (3) `usage.server_tool_use.web_search_requests` was
`null` in the real response despite a real search having clearly happened
(citations were returned) — the documented usage-accounting field did not
behave as documented in this one real call, and should not yet be relied on
for cost tracking without further verification.

## Method

Mandatory reading completed: `PROJECT_STYLE_ORIGINAL_USER_STORY.md`,
`PROJECT_STYLE_MVP_DECISIONS.md`, `PROJECT_STYLE_MVP_SPEC.md`,
`PROJECT_STYLE_SUPERVISOR_HANDOFF.md`, `PROJECT_STYLE_EXECUTION_PLAN.md`,
`ARCHITECTURE_DECISIONS.md`, `DEVELOPMENT_WORKFLOW.md`, `USER_FEEDBACK.md`.

Code audit (read-only, no file modified): `src/lib/llm/ollama.ts`,
`src/lib/llm/openaiCompatible.ts`, `src/lib/llm/index.ts`,
`src/lib/settings.ts`, `src/db/schema.ts` (`appSettings`,
`generationJobs.payloadSnapshot`, `promptSegments`),
`src/lib/comfy/generationSnapshot.ts`, `src/lib/cameraLab/plyJobProvenance.ts`,
`src/lib/cors/editorSidecarCors.ts`.

Provider documentation read at the official source (see citations per
section below): Tavily Search API reference, the **current** OpenRouter
Server Tools web-search guide (`openrouter.ai/docs/guides/features/
server-tools/web-search`), Brave Search API get-started guide.

### Correction from the first pass

The first pass of this spike recommended the `:online` model-slug suffix
and `plugins: [{ id: "web" }]` — **both are deprecated** per OpenRouter's
current documentation, which now specifies the Server Tool shown above.
This retake re-reads the current doc, re-runs a real proof against the
current contract, and replaces every reference to the deprecated form. The
first pass's real-proof evidence file is superseded by the new evidence
below and was deleted along with the rest of that pass's harness.

Three real, paid network calls were executed across both passes of this
spike, **each after explicit user authorization requested and granted in
this session** (AGENTS.md and this ticket both require that authorization
before any paid call): one in the superseded first pass (deprecated
`:online` form), and two in this retake — one Server Tool search call and
one plain synthesis call, per the two-stage pipeline this review requires.
A fourth small diagnostic call (a different, known tool-compatible model,
to isolate why the configured default model failed) was also made under the
same retake authorization. No other network spend occurred. All calls used
`max_tokens` caps; none used unlimited output. The SSRF prototype made only
free, unauthenticated requests to public pages and deliberately-rejected
loopback/private-range literals that never left the process — it is
**not** part of the recommended MVP contract (see below).

## Current state (why this is a real gate, not a formality)

- `src/lib/llm/ollama.ts` and `src/lib/llm/openaiCompatible.ts` build every
  chat/generation request body by hand (`model`, `messages`,
  `temperature`/`options`, `stream`, `response_format`, `think`). **No file
  in the LLM layer builds a `tools`, `function_calling`, or `web_search`
  parameter today.** Web search is not a checkbox away — it is a new request
  shape.
- Provider API keys (`llm_openrouter_api_key`, `llm_api_key`,
  `comfyui_api_key`, `comfyui_cloud_api_key`) are stored **in plaintext** in
  the `app_settings` SQLite table (`src/lib/settings.ts`). No encryption
  layer exists. Any new search-provider key would follow this same existing
  (already-accepted) storage convention — this spike does not change that
  decision.
- No SSRF-hardened outbound fetch helper exists anywhere in `src` — not
  relevant to the recommended MVP contract below (which performs no MikAI
  page fetch at all), but relevant if a later ticket revisits the deferred
  re-fetch option.
- `generationJobs.payloadSnapshot` (`src/lib/comfy/generationSnapshot.ts`)
  and `plyJobProvenance.ts` are the closest existing conventions for a
  "durable, nullable, JSON-text snapshot captured at creation time" pattern.
  A future source/citation record system should follow this shape rather
  than invent a new provenance mechanism — see the retention contract below.
- No HTTP client dependency exists beyond native `fetch` (no axios,
  node-fetch, undici, cheerio, jsdom). Runtime: Next.js 16.2.9, Node
  `>=22 <23`. Native `fetch` is sufficient for the recommended contract —
  **no new package is required**.

## Provider comparison

Three contracts compared as the ticket requires: one dedicated Web-search
provider, the Web capability of an LLM provider MikAI already talks to, and
one further credible option.

### 1. Tavily Search API (dedicated search-for-LLM provider)

Source: `docs.tavily.com/documentation/api-reference/endpoint/search` (read
2026-07-23; not called — no credential exists in this environment and doing
so would require a new signup/cost decision out of this spike's scope).

- **Endpoint/auth**: `POST https://api.tavily.com/search`, `Authorization:
  Bearer tvly-<key>`.
- **Query/result format**: JSON body (`query`, `search_depth`, `max_results`,
  `topic`, `include_answer`, `include_raw_content`, `time_range`). Response
  items carry `title`, `url`, `content` (snippet), `score`; `raw_content`
  optionally returns full extracted text; date filtering exists via
  `time_range`/`start_date`/`end_date` rather than a `published` field on
  each result.
- **Citations/annotations**: none structured beyond `url` + `favicon` — no
  citation-id or span-offset scheme.
- **Cost/quota**: credit-based (`1` credit basic/fast, `2` advanced);
  documented error codes for rate limit (`429`) and plan/usage limits
  (`432`/`433`). No explicit always-free tier documented on this page.
- **Errors/retry**: standard HTTP status codes with JSON error bodies
  (`400`/`401`/`429`/`432`/`433`/`500`).
- **Integration**: plain HTTPS POST works — no SDK required.
- **Lock-in**: low — a single documented REST endpoint, easy to swap.
- **Real-vs-memory distinction**: strong — results are always live search
  results; MikAI would still need its own LLM call to synthesize across
  them (search and synthesis are two separate steps with this provider,
  same shape as the two-stage pipeline recommended below).

### 2. OpenRouter Server Tool `openrouter:web_search` (LLM provider already compatible with MikAI) — SELECTED

Source: `openrouter.ai/docs/guides/features/server-tools/web-search` (read
2026-07-23, current documentation; **called for real twice** in this
retake, see Real Network Proof below). OpenRouter is already MikAI's
configured `openrouter` provider (`src/lib/llm/openaiCompatible.ts`, base
URL `https://openrouter.ai/api/v1`), with a working non-empty API key
already present in `app_settings`.

- **Endpoint/auth**: same `POST {base}/chat/completions` MikAI already
  calls, `Authorization: Bearer <key>`. Web search is enabled by adding
  `tools: [{ type: "openrouter:web_search" }]` to the request body — no new
  endpoint, no new auth mechanism. **The deprecated `:online` suffix and
  `plugins: [{ id: "web" }]` form are explicitly superseded by this tool**
  per OpenRouter's current docs and must not be used for new work.
- **Search behavior**: the model decides autonomously whether and how many
  times to search per request ("0 to N times per request" per the docs);
  `max_tool_calls` (request-root field, default/max 30) bounds the total
  number of tool invocations, and an optional `parameters.max_results` on
  the tool object bounds results per search — both are real cost-control
  knobs confirmed to exist in the current schema.
- **Query/result format**: results come back as `message.annotations[]`
  entries of `type: "url_citation"`, each with `url`, `title`, and `content`
  (a bounded extractive excerpt — the real call below returned excerpts
  well under the documented 2,000–4,000 char range, typically under 200
  visible characters per result in the harness's own printed preview).
- **Citations/annotations**: structured, indexed per result — this is the
  shape the ticket's `claim -> source record ids` requirement needs, once
  MikAI normalizes each `url_citation` into its own `sourceId` (proven
  below).
- **Cost/quota**: Exa fallback search costs `$0.005` per request (up to 10
  results) plus `$0.001` per additional result; native-provider search
  (Anthropic/Google/OpenAI/Perplexity/xAI) has its own provider-specific
  pricing. Cost applies even on otherwise-free models. Usage is meant to be
  reported via `usage.server_tool_use.web_search_requests` — **observed
  `null` in the real call below despite a real search having occurred**;
  this field should not be trusted for billing/telemetry until re-verified.
- **Errors/retry**: standard OpenRouter chat-completion error shape for
  most models; **MikAI's currently configured default model
  (`qwen/qwen3.6-35b-a3b`) returned a real HTTP `500 Internal Server Error`
  with this tool attached** (confirmed twice — the exact two-stage proof
  call, and an isolated diagnostic call, both against that model) rather
  than a documented `400`-class rejection. `openai/gpt-4o-mini` handled the
  identical tool correctly (`200`, real citations). **Model-level Server
  Tool support is not universal across OpenRouter's catalogue and fails
  loudly/ungracefully for at least one real model MikAI already has
  configured** — `STYLE.1.C.CORE` must either pin a confirmed-compatible
  model for research calls (independent of the general chat default) or
  add an explicit try/catch with a clear user-facing message for a `500`
  from this tool.
- **Integration**: zero new package, zero new endpoint, reuses the exact
  chat-completion call MikAI already makes today.
- **Lock-in**: low-to-moderate — the `tools`/`annotations` shape is
  OpenRouter-specific, but the underlying request/response stays
  OpenAI-compatible JSON.
- **Real-vs-memory distinction**: structurally guaranteed for the search
  step — every `url_citation` is a real, provider-retrieved page (proven
  below). The retake's two-stage pipeline extends this guarantee to the
  *synthesis* step too, by construction (see below).

### 3. Brave Search API (further credible option)

Source: `api-dashboard.search.brave.com/app/documentation/web-search/get-started`
(read 2026-07-23; not called — no credential exists in this environment).

- **Endpoint/auth**: `GET https://api.search.brave.com/res/v1/web/search`,
  `X-Subscription-Token: <key>` header.
- **Query/result format**: query params (`q`, pagination via
  `offset`/`count`, freshness/date filters, safe-search, language/geo
  targeting, search operators). Results carry `title`, `url`, `description`
  (snippet), and up to 5 `extra_snippets` per result.
- **Citations/annotations**: none beyond the result list — same category as
  Tavily, no span-level citation linking.
- **Cost/quota**: pricing/free-tier specifics and rate limits were not
  fully visible on the fetched page — **a named gap**, not a silent
  omission.
- **Errors/retry**: not detailed on the fetched page.
- **Integration**: plain HTTPS GET, no SDK required.
- **Lock-in**: low — single REST endpoint.
- **Real-vs-memory distinction**: strong (separate search/synthesis steps)
  — Brave's own docs distinguish a dedicated "LLM Context" endpoint from
  the plain Web Search API for agent/chatbot use cases, worth reading
  before final adoption if Brave is reconsidered later.

### Why OpenRouter's Server Tool over Tavily/Brave for `STYLE.1.C.CORE`

- Zero new credential, zero new Settings surface, zero new package: the
  existing `llm_openrouter_api_key` and existing chat-completion call path
  already work end-to-end for the search step, proven live below.
- Citations arrive already itemized per result, which the two-stage
  pipeline below normalizes directly into MikAI source ids — Tavily/Brave
  would need the exact same normalization step, so this is not a
  differentiator on its own; the differentiator is reusing MikAI's existing
  call path with zero new credential surface.
- Trade-off accepted: per-search cost applies to every `Research influence`
  click (not just once per Project), model-level tool support is uneven
  (see the `500` finding above), and Exa/native-provider search quality is
  not benchmarked against Tavily/Brave in this spike — only compared on
  paper. If a future ticket needs cheaper bulk/background research (which
  the MVP explicitly defers), Tavily should be re-evaluated with a real
  credential at that time.

## Real network proof — two-stage pipeline

The prior pass's single combined call conflated search and synthesis and
returned an empty `message.content`, leaving the ticket's central
requirement — a synthesis whose claims cite real, saved sources — unproven.
This retake fixes that by proving two **separate** calls, matching the
product flow `discovered -> reviewed -> saved -> synthesized`:

```text
Stage 1: search call (tools: openrouter:web_search)
  -> real url_citation annotations
  -> normalized into MikAI source ids + bounded excerpts (the "saved" set)

Stage 2: SEPARATE plain chat call, no web tool, given ONLY the saved
  excerpts as context
  -> structured JSON claims, each citing one or more of those source ids
  -> validated: reject empty synthesis, reject any claim with no source,
     reject any claim citing an id outside the saved set
```

Model: `openai/gpt-4o-mini` (see the model-compatibility finding above for
why the configured default could not be used for this proof). Subject:
**Hayao Miyazaki** — an unambiguous real Creative Influence, same subject as
the superseded first pass for continuity.

### Stage 1 — real search, real sources

Real HTTP `200`. **5 real citations returned** (ticket minimum: 3), each
with a real `url`, real `title`, and a real bounded excerpt, normalized to
MikAI source ids:

| Source id | URL | Title |
|---|---|---|
| `src-0` | `academia.edu/35784472/...VISUAL_AND_DESCRIPTIVE_ANALYSIS...` | A Visual and Descriptive Analysis of Anime Movies by Hayao Miyazaki |
| `src-1` | `doi.org/10.5860/choice.44-3194` | The anime art of Hayao Miyazaki |
| `src-2` | `journal.animationstudies.org/article/id/91/` | Out of Gravity: Physics in animation and in the films of Hayao Miyazaki |
| `src-3` | `marekvandewatering.com/texts/vd_essay_miyazaki_marek_final.pdf` | Hayao Miyazaki: An Introduction |
| `src-4` | `academia.edu/24505389/Hayao_Miyazaki_as_Auteur...` | Hayao Miyazaki as Auteur: Techniques, Technology and Aesthetics in Animation |

`usage.server_tool_use.web_search_requests` was `null` in the raw response
— documented as a real gap above, not silently smoothed over.

### Stage 2 — real structured synthesis from the saved excerpts only

A second, separate call — **no web-search tool attached** — received only
the five bounded excerpts above (labeled by source id) and was asked to
return a JSON array of `{claim, sourceIds}` objects, using only the
provided excerpts. Real result: **5 claims**, each citing exactly one of
the five real source ids above (e.g. `"Miyazaki's artistic style
emphasizes the creation of alternative worlds through intentional graphic
substitutions of reality."` citing `src-2`). Every claim passed the
validator below with `ok: true`.

Full non-secret evidence (both stages, raw stage-2 response text, parsed
claims, validation result) was written to
`F:/AI/tmp-style-research-spike-retake/two-stage-pipeline-evidence.json`,
outside the repo, and deleted after this report was written — the tables
and quotes above are the retained transcript.

### Claim-to-source validator — real acceptance + synthetic adversarial proofs

One deterministic validator (harness-only, exact shape `STYLE.1.C.CORE`
needs) was used for both the real synthesis above and three adversarial
edge cases:

- **Real synthesis (5 claims, all citing real saved source ids)** →
  `{"ok": true, "acceptedClaims": [...5 claims...]}`.
- Empty synthesis (zero claims, synthetic) → **rejected**: `"empty (zero
  claims) — a synthesis must contain at least one claim."`
- A claim with no `sourceIds` (synthetic) → **rejected**: `"cites no source
  — every claim must be source-grounded."`
- A claim citing an invented id `"src-999-invented"` (synthetic) →
  **rejected**: `"cites unknown source id ... (fabricated/unsaved
  source)."`

This proves both directions the ticket requires: a real, well-formed
synthesis grounded in saved sources is accepted, and every tested way a
synthesis could smuggle in an ungrounded or fabricated claim is rejected
before it could reach a saved record.

## MVP retention policy: no arbitrary MikAI page re-fetch

The first pass of this spike proposed a MikAI-owned re-fetch of full pages
as "mandatory" while simultaneously documenting an open DNS-rebinding/
TOCTOU gap in its own SSRF prototype — an unresolved contradiction the
review correctly rejected. This retake fixes the policy explicitly instead
of deferring it:

**For the MVP, MikAI performs no arbitrary fetch of third-party pages.**
`STYLE.1.C.CORE` stores and displays only:

- the canonical URL (as returned by the Server Tool, opened by the user in
  a new tab — never fetched server-side by MikAI);
- the title and bounded excerpt already provided by the Server Tool
  response (proven above — real, provider-retrieved, already bounded to a
  few hundred characters in practice);
- standard metadata (access date, the search query used, the source id).

This removes the need for any SSRF-hardened fetch code in `STYLE.1.C.CORE`
entirely — there is no MikAI-initiated outbound request to an
arbitrary user- or LLM-supplied URL anywhere in this contract. The only
outbound calls are to `openrouter.ai`, a fixed, trusted, first-party
endpoint MikAI already calls today.

### SSRF prototype — status: exploratory, not part of the MVP contract

An SSRF-mitigation prototype (protocol/credential/DNS/redirect/size/
content-type/timeout checks, native `fetch`/`dns`/`net` only, no package)
was still built and exercised in a prior pass, entirely outside the repo,
as due diligence for a **possible future** re-fetch capability. It passed
15/15 tests including real rejections of `http:`, embedded credentials,
loopback IPv4/IPv6, the cloud-metadata link-local address shape
(`169.254.169.254`), a private `192.168.0.0/16` literal, a malformed URL,
an `ftp:` scheme, a real binary content-type, and two real successful
public-page fetches.

**This prototype must never be described as "SSRF-safe" on its own**: it
resolves DNS once for validation, then `fetch()` resolves again internally
to connect — a real, unclosed TOCTOU/DNS-rebinding window exists between
those two resolutions. Closing it fully requires either connecting to the
already-validated IP directly (manual TLS/SNI handling) or an egress-level
network control independent of application code. **It is out of scope for
the MVP contract recommended above and must not be adopted without that gap
being closed**, per this review's explicit instruction. If a future ticket
needs full-page retrieval (not required by the accepted MVP decisions),
that ticket must either prove the IP-pinned/egress-safe contract, or accept
and explicitly document the residual risk with product sign-off — this
spike does not make that call for it.

## Retention/citation contract for `STYLE.1.C.CORE`

Minimal fields proposed (no migration in this ticket — for the next
ticket's schema design), revised for the no-re-fetch MVP policy:

- `provider`, `query` — which contract and what was searched;
- `canonicalUrl`, `title`, `publisherOrHost` (parsed from the URL),
  `accessedDate` (no `publishedDate` field is guaranteed by the Server Tool
  — omit rather than fabricate one);
- `boundedExcerpt` (the Server Tool's own excerpt, stored as-is, hard
  capped at e.g. 2,000 chars as a defensive ceiling even though observed
  excerpts were much shorter), `retrievalStatus` fixed to `provider-only`
  for the MVP (the `mikai-refetched` state is reserved for a future ticket,
  not implemented now);
- `sourceHash` (of the bounded excerpt, for change detection across
  re-searches) and a `sourceVersion`/`retrievedAt` pair rather than
  mutating a saved source in place;
- `relevanceNote` (why this source matters) and `userDecision`
  (`saved`|`dismissed`), matching the MVP's explicit save/dismiss flow;
- `synthesisRevision` — an integer/version, never overwriting a prior
  synthesis (matches `docs/PROJECT_STYLE_MVP_DECISIONS.md` §6.4); a
  synthesis is only ever created by the Stage 2 call type proven above,
  never inline with a search call;
- `claimOrRule -> sourceRecordId[]` — a join table/array, validated at
  write time by the exact mechanism proven above (reject empty synthesis,
  reject unsourced claims, reject unknown source ids);
- a clear status distinction across four record kinds: **candidate source**
  (shown, not yet decided) -> **saved source** (user-approved, persisted,
  Stage 1 output) -> **synthesis** (versioned, Stage 2 output, references
  saved sources) -> **approved Style rule** (explicitly promoted from a
  synthesis candidate, editable).

**Retention limit**: MikAI stores the provider's bounded excerpt only —
never a full page, never a MikAI-side fetch of one — per
`docs/PROJECT_STYLE_MVP_SPEC.md` §6.3 ("must not copy and store a complete
copyrighted article by default"). This is now structurally guaranteed by
the no-re-fetch policy above, not just a storage-layer character cap.

## Validation checklist (per ticket)

- No API key value appears anywhere in this document, in console output
  reviewed, or in either retained evidence file — confirmed by `grep`
  before writing this report (both the superseded first-pass evidence file
  and this retake's evidence file).
- `git status` before and after this spike (both passes): no application
  file (`src/`, `scripts/`, schema, migration, package, lockfile) was
  touched — only this document and `.agents/claude_report.md` are
  new/changed.
- Harness directories (`F:/AI/tmp-style-research-spike/`,
  `F:/AI/tmp-style-research-spike-retake/`, and the in-repo
  `.tmp-style-spike-harness/`/`.tmp-style-spike-retake-harness/` used only
  for non-secret, boolean/name-only DB reads) were deleted after
  transcription into this report.
- Official documentation links cited above for all three providers,
  including the corrected current OpenRouter Server Tool doc URL.
- Real results (the 5-source table, the real 5-claim synthesis, the 15/15
  SSRF test run, the real+synthetic validator proofs) are clearly separated
  from deduction/recommendation text throughout this document.
- `git diff --check` is clean on the only two changed/new files
  (documentary only).

## Open items for `STYLE.1.C.CORE`

1. Decide the research-call model: pin a confirmed Server-Tool-compatible
   model (e.g. verify `openai/gpt-4o-mini` or another candidate against
   MikAI's actual account/routing) independently of the general chat
   default, or add explicit `500`-from-tool handling if the configured
   default must be kept.
2. Re-verify `usage.server_tool_use.web_search_requests` behavior before
   relying on it for cost display/telemetry — it was `null` in the one real
   call made here despite a real search occurring.
3. Design the Settings surface for a per-Project or global research-call
   cost ceiling (`max_tool_calls`, a request count, or a spend cap), since
   Server Tool cost is per-`Research influence` click, not a one-time fee.
4. Implement Stage 1 (search -> normalize -> save) and Stage 2 (synthesize
   from saved excerpts) as two distinct server actions, never one combined
   call — this is now a proven, not just recommended, separation.
5. If full-page retrieval is ever reconsidered (not required by the
   accepted MVP decisions), it needs its own ticket proving an IP-pinned or
   egress-safe contract — the exploratory prototype here is not sufficient
   on its own, by this review's explicit instruction.
6. If bulk/background research is ever reconsidered (currently explicitly
   deferred), re-evaluate Tavily with a real credential — its separate
   search/synthesis steps already mirror the two-stage shape proven here
   and may be cheaper at volume than per-click Server Tool calls.
