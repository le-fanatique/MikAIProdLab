# Project Style Research Architecture

Last updated: 2026-07-25

Status: accepted implementation contract for `STYLE.1.C.CORE`, fully
implemented. `STYLE.1.ACCEPTANCE.1` was accepted by the user on
2026-08-02. Kept as the historical architecture contract, not as a live
status page.

Sources:

- `docs/audits/PROJECT_STYLE_RESEARCH_SPIKE.md`;
- `docs/PROJECT_STYLE_MVP_SPEC.md`;
- external proposal `STYLE.1.C.ARCHITECTURE.1.md`, reconciled against the
  repository by Codex.

## 1. Decision

Project Style research is a Project-owned subdomain attached to one
`project_style_influences` record. Its explicit lifecycle is:

```text
Search
-> review candidates
-> save or dismiss candidates
-> synthesize selected saved sources
-> review/edit candidate rules
-> approve a candidate rule into the existing Working Draft
```

The MVP uses two separate OpenRouter requests:

1. Web discovery through
   `tools: [{ type: "openrouter:web_search", parameters: { max_results: 5 } }]`
   and `max_tool_calls: 1`;
2. plain structured synthesis without tools, receiving only bounded records
   explicitly saved by the user.

Nothing is searched, saved, synthesized, proposed, rejected or approved
implicitly. MikAI never fetches a cited third-party URL.

## 2. Reconciliation Of The External Proposal

| External decision | Verdict | Accepted adaptation |
|---|---|---|
| Dedicated Research subdomain | `CONFIRMED` | Project and Influence ownership is verified on every operation. |
| Separate search and synthesis requests | `CONFIRMED` | The synthesis request never receives a Web tool. |
| Fixed OpenRouter research model | `CONFIRMED` | Pin `openai/gpt-4o-mini` for both MVP stages; do not inherit the general LLM model and do not silently fall back. |
| No MikAI page re-fetch | `CONFIRMED` | Store only provider annotations, bounded excerpts and user-authored metadata. |
| DB lease and idempotency | `CONFIRMED` | One lease row per Influence and operation, with a token and expiry. |
| Persist dismissed candidates | `CONFIRMED` | Candidate decisions are durable audit data. |
| Immutable syntheses and claims | `CONFIRMED` | A new synthesis gets a new monotonic version. |
| Strict claim-to-source validation | `CONFIRMED` | Empty, unsourced and unknown-source claims reject the complete synthesis before persistence. |
| Separate generated suggestion then `Propose` action | `ADAPTED` | An explicit user-triggered `Synthesize research` action may create editable `proposed` Candidate Rules. They remain non-authoritative until approval. |
| Immutable Candidate Rule revision table | `REJECTED` | Candidate Rules are mutable only while `proposed`, guarded by optimistic `revision`; original generated fields and final approval snapshot are retained. |
| Separate approval history table | `REJECTED` | Candidate Rule status, approved snapshot, timestamp and resulting draft-rule id form the MVP approval record. |
| Publication-origin join table in this ticket | `DEFERRED` | Approval writes bounded research ids into the existing rule `provenanceNotes`; this survives in `project_style_versions.contentSnapshot`. Exact cross-surface payload provenance belongs to `STYLE.1.E`. |
| Blocking Project deletion to retain research | `REJECTED` | Existing Project deletion remains authoritative and cascades Project-owned research. |
| Hard-block Influence deletion whenever any search exists | `ADAPTED` | Deletion is blocked once at least one saved source exists. Pending/dismissed discovery-only data may cascade with the Influence. |
| URL query sorting and tracking-parameter removal | `REJECTED` | Those transformations can change semantic or signed URLs. Preserve path and query semantics. |
| Persist provider usage/cost when present | `DEFERRED` | The real spike found unreliable usage data. Store no invented estimate in the MVP. |

## 3. State Model

### Search candidate

```text
pending_review -> saved
pending_review -> dismissed
```

Both decisions use an expected `decisionRevision`. A terminal candidate is not
reopened. A later search may discover the same URL again in a different Run.

### Saved source

```text
active -> withdrawn
```

Withdrawal excludes a source from future syntheses and approvals. It never
rewrites an existing synthesis.

### Synthesis

A synthesis and its claims are immutable. New work creates version `N + 1`.

### Candidate Rule

```text
proposed -> proposed (edit with revision CAS)
proposed -> rejected
proposed -> approved
```

Rejected and approved rules are immutable. Approval requires an existing
Working Draft and its exact expected revision. It never creates or publishes a
draft.

## 4. Additive Relational Model

All timestamps are ISO text, matching the existing Style schema. Drizzle
generates the migration; no SQL migration is handwritten.

### `project_style_research_leases`

- `id`;
- `influenceId`, FK cascade;
- `operation`: `search | synthesis`;
- `token`, globally unique;
- `expiresAt`;
- `createdAt`;
- unique `(influenceId, operation)`.

### `project_style_research_runs`

- `id`;
- `projectId`, FK cascade;
- `influenceId`, FK cascade;
- `runNumber`, monotonic per Influence;
- `requestKey`, validated UUID supplied for idempotency;
- `query`;
- `provider`: fixed `openrouter`;
- `model`;
- `contractVersion`;
- `maxResults`;
- `maxToolCalls`;
- `createdAt`;
- unique `(influenceId, runNumber)`;
- unique `(influenceId, requestKey)`.

Raw provider bodies, prompts, headers and secrets are never persisted.

### `project_style_research_sources`

- `id`;
- `projectId`, FK cascade;
- `influenceId`, FK cascade;
- `normalizedUrl`;
- `urlHash`;
- `evidenceHash`;
- `title`;
- `publisherHost`;
- `authorOrPublisher`, nullable;
- `sourceType`: `article | interview | review | documentation | portfolio | other`;
- `sourceTier`: `primary | secondary | unknown`;
- `boundedExcerpt`;
- `relevanceSummary`, nullable;
- `usefulnessRationale`, nullable;
- `confidence`: `high | medium | low | unknown`;
- `uncertainty`, nullable;
- `userNotes`, nullable;
- `status`: `active | withdrawn`;
- `revision`;
- `savedAt`;
- `withdrawnAt`, nullable;
- `createdAt`, `updatedAt`;
- unique `(influenceId, urlHash, evidenceHash)`.

Provider evidence fields are immutable. Only user notes, status and revision
are mutable.

### `project_style_research_candidates`

- `id`;
- `projectId`, FK cascade;
- `influenceId`, FK cascade;
- `runId`, FK cascade;
- `ordinal`;
- the same normalized evidence fields used to create a Source;
- `state`: `pending_review | saved | dismissed`;
- `decisionRevision`;
- `savedSourceId`, nullable FK `SET NULL`;
- `decidedAt`, nullable;
- `createdAt`, `updatedAt`;
- unique `(runId, ordinal)`;
- unique `(runId, urlHash, evidenceHash)`.

Saving creates or reuses the exact Source inside the same transaction, then
links it through `savedSourceId`.

### `project_style_research_source_domains`

- `id`;
- `sourceId`, FK cascade;
- `domain`;
- `createdAt`;
- unique `(sourceId, domain)`.

Domain normalization reuses `validationB.ts`.

### `project_style_research_syntheses`

- `id`;
- `projectId`, FK cascade;
- `influenceId`, FK cascade;
- `versionNumber`, monotonic per Influence;
- `requestKey`, UUID and idempotent per Influence;
- `provider`, `model`, `contractVersion`;
- `inputSnapshot`, immutable bounded JSON containing only selected source ids,
  revisions and the exact bounded text sent to the provider;
- `summary`;
- `promptHash`;
- `createdAt`;
- unique `(influenceId, versionNumber)`;
- unique `(influenceId, requestKey)`.

### `project_style_research_synthesis_sources`

- `id`;
- `synthesisId`, FK cascade;
- `sourceId`, FK restrict;
- `sourceRevision`;
- `createdAt`;
- unique `(synthesisId, sourceId)`.

### `project_style_research_claims`

- `id`;
- `synthesisId`, FK cascade;
- `claimKey`, stable only inside one synthesis;
- `kind`: `shared_trait | limited_observation | disagreement | uncertainty | project_principle`;
- `text`;
- `confidence`: `high | medium | low`;
- `uncertainty`, nullable;
- `orderIndex`;
- `createdAt`;
- unique `(synthesisId, claimKey)`;
- unique `(synthesisId, orderIndex)`.

### `project_style_research_claim_sources`

- `id`;
- `claimId`, FK cascade;
- `sourceId`, FK restrict;
- `createdAt`;
- unique `(claimId, sourceId)`.

Every claim has at least one row, enforced by the application transaction and
tests.

### `project_style_research_candidate_rules`

- `id`;
- `projectId`, FK cascade;
- `influenceId`, FK cascade;
- `synthesisId`, FK cascade;
- `orderIndex`;
- `status`: `proposed | rejected | approved`;
- `revision`;
- generated originals: `originalInstruction`, original pillar/section/
  category/strength/applicability;
- editable current fields matching `project_style_rules`;
- `rationale`;
- `confidence`: `high | medium | low`;
- `uncertainty`, nullable;
- `approvedDraftRuleId`, nullable FK `SET NULL`;
- `approvedSnapshot`, nullable immutable bounded JSON;
- `approvedAt`, `rejectedAt`, nullable;
- `createdAt`, `updatedAt`;
- unique `(synthesisId, orderIndex)`.

### `project_style_research_candidate_rule_sources`

- `id`;
- `candidateRuleId`, FK cascade;
- `sourceId`, FK restrict;
- `createdAt`;
- unique `(candidateRuleId, sourceId)`.

Every Candidate Rule has at least one direct source. A separate rule-to-claim
join is intentionally omitted because direct source provenance is
authoritative and each Candidate Rule belongs to one immutable synthesis.

## 5. URL And Evidence Contract

`normalizeResearchUrl` must:

- accept only absolute `http:` or `https:` URLs;
- reject credentials, malformed values and values over 2,048 characters;
- remove the fragment;
- lowercase scheme and hostname through the WHATWG `URL` serializer;
- remove only a default port;
- preserve pathname and query semantics;
- never resolve DNS and never fetch the URL.

`urlHash` hashes the normalized URL. `evidenceHash` hashes a canonical tuple of
normalized URL, title and bounded excerpt. No tracking denylist, query sorting,
slash rewriting or redirect resolution is allowed.

## 6. Provider Boundary

Use a dedicated server-only module with:

- fixed endpoint `https://openrouter.ai/api/v1/chat/completions`;
- fixed model `openai/gpt-4o-mini`;
- the existing OpenRouter key lookup and environment fallback;
- native `fetch`, `AbortController`, no new package;
- search timeout 45 seconds, synthesis timeout 60 seconds;
- no retry and no fallback model;
- sanitized English errors that never include headers, prompts, excerpts or
  raw provider bodies.

The general LLM provider, configurable base URL and active model are not used.
`src/lib/settings.ts` may expose one narrowly scoped server-only OpenRouter key
resolver so existing key precedence is not duplicated.

### Search request

```json
{
  "model": "openai/gpt-4o-mini",
  "messages": [{ "role": "user", "content": "bounded research prompt" }],
  "tools": [{
    "type": "openrouter:web_search",
    "parameters": { "max_results": 5 }
  }],
  "max_tool_calls": 1,
  "max_tokens": 2000,
  "temperature": 0.2
}
```

Only `url_citation` annotations with a valid URL, non-empty title and non-empty
bounded content are candidates. At most five unique candidates are persisted.
Optional structured relevance content may enrich a matching citation only
when it validates strictly. Invalid or absent relevance content does not
fabricate metadata and does not invalidate valid citations.

### Synthesis request

The prompt contains bounded Influence fields, 2 to 12 selected active Sources,
aliases `source-<id>`, and the exact output schema. No tool is attached.

```json
{
  "schemaVersion": 1,
  "summary": "string",
  "claims": [{
    "key": "claim-1",
    "kind": "shared_trait",
    "text": "string",
    "confidence": "high",
    "uncertainty": null,
    "sourceAliases": ["source-12"]
  }],
  "candidateRules": [{
    "instruction": "string",
    "pillar": "visual",
    "section": null,
    "category": null,
    "strength": "Preferred",
    "applicability": null,
    "rationale": "string",
    "confidence": "medium",
    "uncertainty": null,
    "sourceAliases": ["source-12"]
  }]
}
```

Unknown fields, aliases outside the selected corpus, empty citations, malformed
enums, duplicate aliases or any out-of-bound value reject the whole response.

## 7. Limits

| Value | Limit |
|---|---:|
| Concurrent search per Influence | 1 |
| Concurrent synthesis per Influence | 1 |
| Candidates per Search | 5 |
| Search query | 1,200 chars |
| Influence context sent to Search | 4,000 chars |
| Title / author-publisher | 300 chars |
| Provider excerpt retained | 1,200 chars |
| Relevance / usefulness / uncertainty | 600 chars each |
| User source notes | 2,000 chars |
| Source domains | 8 |
| Sources per Synthesis | 2-12 |
| Total evidence sent to Synthesis | 14,400 chars |
| Influence context sent to Synthesis | 6,000 chars |
| Claims | 1-20 |
| Candidate Rules | 0-8 |
| Rule instruction | existing Style rule limit |
| Search response bytes | 64 KiB |
| Synthesis response bytes | 128 KiB |
| Automatic retries | 0 |

## 8. Operations And Transactions

### Search

1. Validate Project, Influence, request key and bounded query.
2. Return an existing Run for the same request key.
3. Acquire the `search` lease transactionally before network spend.
4. Call OpenRouter outside a DB transaction.
5. Parse and validate the bounded response.
6. In one synchronous transaction, verify the same unexpired lease token,
   allocate the Run number, insert Run and Candidates, then delete the lease.
7. On provider/parse failure, delete only the owned lease. No Run or Candidate
   is written.

A late response whose lease expired or changed cannot persist.

### Save or dismiss candidate

Validate ownership and expected decision revision in one transaction. Save
creates or reuses the exact Source, replaces its domains when supplied, links
the Candidate and marks it saved. Dismiss changes only the Candidate. Exactly
one terminal transition wins.

### Synthesize

1. Validate 2-12 unique active Sources owned by the same Influence.
2. Return an existing Synthesis for the same request key.
3. Acquire the `synthesis` lease.
4. Snapshot source ids, revisions and bounded context.
5. Call the plain provider outside a transaction.
6. Parse and validate all Claims and Candidate Rules.
7. In one transaction, re-check ownership, source activity and revisions,
   verify the lease token, allocate the version, insert the immutable
   Synthesis, joins, Claims, Claim Sources, Candidate Rules and Rule Sources,
   then remove the lease.

Any mismatch or insert failure rolls back the complete synthesis.

### Edit or reject Candidate Rule

Require `status=proposed` and exact `revision`. Edit changes only current
editable fields and increments revision. Reject changes status once.

### Approve Candidate Rule

Require Project/Influence ownership, proposed status, exact Candidate Rule and
Working Draft revisions, and active linked Sources.

Inside one synchronous transaction:

1. re-read all conditions;
2. insert a normal `project_style_rules` row using the existing validation,
   normalization and ordering contract;
3. set bounded `provenanceNotes` containing Influence, Synthesis, Candidate
   Rule and Source ids, but no URL or excerpt;
4. increment the Working Draft revision;
5. mark the Candidate Rule approved and store its exact approved snapshot and
   resulting draft-rule id.

Shared synchronous draft-rule insertion logic must be extracted once and used
by both manual `addRuleAction` and Research approval.

If the Working Draft does not exist, approval fails without creating one.
Publication remains a separate existing user action.

## 9. Deletion And Retention

- Project deletion continues to cascade all Project-owned Research rows.
- Influence deletion is refused when a saved Source exists, including a
  withdrawn Source. A future explicit purge workflow is out of scope.
- Discovery-only Runs and pending/dismissed Candidates may cascade when an
  otherwise-empty Influence is deleted.
- Sources are withdrawn, not hard-deleted through CORE actions.
- Syntheses and Claims have no update/delete action.
- Candidate Rules retain generated originals and approval snapshots.
- Publishing may delete the Working Draft and its rules as today;
  `approvedDraftRuleId` becomes null while the approval snapshot and published
  snapshot's `provenanceNotes` remain.

## 10. Security And Cost

- No API key, key suffix, Authorization header or raw settings row reaches a
  DTO, HTML, log, error, snapshot or database record.
- No client code calls OpenRouter.
- No source URL is fetched, probed, previewed server-side or followed.
- Provider errors are redacted before logging and user display.
- Paid actions require explicit submission; opening a page, saving,
  dismissing, editing, rejecting or approving makes no provider call.
- No real paid network test is allowed without fresh explicit user
  authorization stating model, maximum calls and bounds.
- Unit/integration validation uses mocked provider responses by default.

## 11. CORE Surface

`STYLE.1.C.CORE` delivers server contracts only:

- read model for one Influence's Runs, Candidates, Sources, Syntheses, Claims
  and Candidate Rules;
- `researchInfluenceAction`;
- `saveResearchCandidateAction`;
- `dismissResearchCandidateAction`;
- `updateResearchSourceAction`;
- `withdrawResearchSourceAction`;
- `synthesizeInfluenceResearchAction`;
- `updateResearchCandidateRuleAction`;
- `rejectResearchCandidateRuleAction`;
- `approveResearchCandidateRuleAction`.

No visible Research UI is part of CORE. `STYLE.1.C.UI` consumes these contracts
afterward.

## 12. Required Proof

- Pure tests for every validator, URL rule, bound, parser and state transition.
- Migration on a backup/copy of the real DB with all existing table counts
  preserved and `PRAGMA foreign_key_check` clean.
- Search mocks for success, auth/rate/server failures, timeout, oversized body,
  malformed annotations, duplicates and invalid optional assessments.
- Synthesis mocks for valid provenance, unknown aliases, missing sources,
  malformed JSON, out-of-range arrays and zero Claims.
- Real DB proofs for ownership, idempotency, lease conflict/expiry, late
  response, save-vs-dismiss, duplicate Source, withdrawal race, synthesis
  rollback, stale Candidate Rule, stale Working Draft and double approval.
- Fault injection proving no partial Synthesis and no draft Rule survives a
  failed approval.
- Non-regression of manual Influence CRUD, Reference Board, manual Working
  Draft Rules and publication.
- Secret scans over HTML, action results, logs, DB fixtures and Git diff.
- `tsc`, build, `db:generate`, targeted ESLint and `git diff --check`.

## 13. Deferred Work

- Research review UI: `STYLE.1.C.UI`.
- Exact published-version and generation-payload provenance: `STYLE.1.E`.
- Full-page retrieval, SSRF-safe egress, screenshots or article archives.
- Background crawling, scheduling, automatic retries and bulk research.
- Provider/model selection in Settings and cost telemetry.
- Research purge/retention controls.

## 14. Implementation Stop Conditions

Mimo must stop with `NEEDS_CODEX_CONTRACT` before editing when:

- a repository fact contradicts this document;
- the current OpenRouter annotation shape differs from the proven spike;
- existing draft-rule insertion cannot be shared without changing behavior;
- a migration would alter or rebuild an existing table;
- a secret would need to cross a client boundary;
- any behavior requires MikAI to fetch a Source URL;
- a real paid call appears necessary for implementation validation.
