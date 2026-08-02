# Project Style V1 - Development Supervisor Handoff

Last updated: 2026-07-23

Status: product design complete. Implementation is complete and was
accepted by the user on 2026-08-02 (`STYLE.1.ACCEPTANCE.1`, `ACCEPTED`).
This document is kept as the historical execution-order and supervision
record for the epic, not as a live status page — see
`docs/PROJECT_STATE.md` and `docs/ROADMAP.md` for current state.

## 1. Handoff Purpose

This document gives the next development supervisor enough product,
architecture and repository context to prepare and supervise the `STYLE.1`
epic without reopening already accepted decisions or colliding with unrelated
work.

This is not an implementation ticket. Do not copy the entire epic into
`.agents/current_task.md`.

## 2. Mandatory Reading Order

Read these files before preparing any Project Style ticket:

1. `AGENTS.md`;
2. `docs/PROJECT_STATE.md`;
3. `docs/ROADMAP.md`;
4. `docs/ARCHITECTURE_DECISIONS.md`;
5. `docs/DEVELOPMENT_WORKFLOW.md`;
6. `docs/USER_FEEDBACK.md`, especially `FB-20260723-001`;
7. `docs/PRODUCT_VISION.md`;
8. `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`;
9. `docs/PROJECT_STYLE_MVP_DECISIONS.md`;
10. `docs/PROJECT_STYLE_MVP_SPEC.md`;
11. `docs/PROJECT_STYLE_ANALYSIS_QUESTIONS.md`;
12. `docs/PROJECT_STYLE_EXECUTION_PLAN.md`;
13. `.agents/current_task.md`.

Authority:

- original intent: `PROJECT_STYLE_ORIGINAL_USER_STORY.md`;
- accepted product decisions: `PROJECT_STYLE_MVP_DECISIONS.md`;
- detailed specification and acceptance criteria:
  `PROJECT_STYLE_MVP_SPEC.md`;
- execution order and model allocation:
  `PROJECT_STYLE_EXECUTION_PLAN.md`;
- current repository/ticket priority: `PROJECT_STATE.md` and
  `.agents/current_task.md`.

## 3. Current Work Boundary

At handoff time:

- `docs/PROJECT_STATE.md` says `CAMLAB.POLISH.2` is complete and user
  validated at commit `41d7004`;
- `.agents/current_task.md` still describes `CAMLAB.POLISH.2` as active;
- these two supervision sources must be reconciled before replacing the
  current task;
- Project Style remains planned future work;
- no Project Style schema, migration, route or application code has been
  implemented;
- no Project Style ticket has been promoted into `.agents/current_task.md`;
- the working tree already contains unrelated user-owned changes and untracked
  documentation.

Do not overwrite `.agents/current_task.md` until the supervisor has confirmed
the actual repository head, verdict, commit/push state and intended next
priority.

Do not stage or commit Project Style documentation as part of an unrelated
Camera Lab ticket.

## 4. One-Page Product Contract

Project Style is the durable artistic direction of a Project.

It contains:

```text
World & Design Language
+ Visual Treatment
+ Creative Influences
+ Project Reference Board
-> Working Draft
-> Look Development
-> published active Style
```

The active Project Style:

- informs Asset design and Asset Bible enhancement;
- is automatically available to Asset generation;
- is inherited by each Sequence;
- may be completely replaced once at Sequence level;
- reaches every Storyboard, Sequence generation and Shot through the resolved
  Sequence Style.

The MVP remains simple:

- every field is optional;
- empty content is never compiled;
- manual authoring works without an LLM;
- research, synthesis and alignment are proposal/apply flows;
- there is no Shot override;
- there is no semantic clash warning.

## 5. Confirmed Repository Baseline

### Existing foundations

- `src/components/ContextStrip.tsx` contains a disabled `Project Style`
  Project tab.
- `src/components/Sidebar.tsx` lists `Project Style` as a future module.
- `assets` already have optional `visualIdentity`, `usageRules` and
  `forbiddenVariations`.
- `AssetBibleEnhancePanel` already follows preview/edit/apply semantics.
- `asset_reference_images` and `shot_reference_images` already expose a shared
  role language, selection metadata and approval behavior.
- `buildPromptCompilationContext` normalizes selected prompt sources and
  removes empty optional context.
- `compileShotPrompt` provides deterministic text, used sections, sources and
  warnings.
- Prompt Compiler drafts are inspectable and explicitly handed off.
- Sequence Storyboard/video output models preserve prompt and reference
  snapshots.
- `generation_jobs.payloadSnapshot` is the canonical queued-payload
  provenance pattern.
- Local and Cloud ComfyUI use one canonical generation pipeline.

### Missing foundations

- no Project Style table or version;
- no Working Draft/active-version model;
- no Project reference-image table;
- no Creative Influence or research-source model;
- no Web search/retrieval tool contract;
- no Sequence Style inheritance/override field or relation;
- no Project Style prompt segment;
- no Asset alignment against Project Style;
- no Look Development route, test model or durable outputs;
- no Project Style target for `generation_jobs`.

### LLM reality

Current MikAI LLM calls send normal chat/JSON requests to Ollama, OpenRouter
or an OpenAI-compatible endpoint. The model receives only the messages MikAI
sends. There is no application-level browsing, search tool, retrieval,
citation or source-ingestion implementation.

Never claim that the LLM researched the Internet until the dedicated research
contract has been implemented and proven.

## 6. Architecture Arbitration

### Durable relational data is required

Codex has accepted that additive migrations will be required across the epic.
Each ticket must still specify the exact schema it authorizes and validate it
against a backup of the development database.

Do not store live Project Style business data in:

- `localStorage`;
- `app_settings`;
- `projects.description`;
- `sequences.sequencePrompt`;
- an opaque settings JSON blob;
- existing Asset or Shot reference tables with falsified ownership.

Immutable compilation and generation snapshots may use JSON where consistent
with existing provenance patterns.

### Project references are not Asset or Shot references

Project Style images need Project ownership and Style-specific analysis
directives. Do not attach them to a fake Asset or Shot.

They may later be offered as explicit workflow image options, but actual
mapping must respect the selected workflow's real inputs.

### Sequence override is full replacement

Do not design a hidden field-by-field merge for the MVP.

```text
no override -> current active Project Style
saved override -> complete Sequence replacement
```

Shots always consume the resolved Sequence Style. There is no Shot Style
column or local override.

### One canonical generation runtime

Look Development must reuse the existing generation pipeline. A dedicated
ticket may extend the generation target and output model, but must not create
a second ComfyUI client, job runner, polling loop or output downloader.

### Web ingestion is a security boundary

Any server-side source retrieval must define:

- allowed protocols;
- redirect handling;
- DNS/private-network/loopback protections;
- content-type allowlist;
- size and timeout limits;
- sanitization;
- rate limiting;
- error and retry behavior;
- credential storage;
- bounded copyrighted-content retention.

No package may be introduced unless the ticket explicitly authorizes it after
the research spike.

## 7. Recommended Ticket Order

The accepted stack is:

1. `STYLE.RESEARCH.SPIKE.1` - prove Web research and citation contract;
2. `STYLE.1.A` - durable Style foundation, manual authoring, versions,
   navigation and sparse compiler;
3. `STYLE.1.B` - Project references and Creative Influence dossiers;
4. `STYLE.1.C` - auto-feed, saved sources, synthesis and candidate rules;
5. `STYLE.1.D` - Sequence inheritance and complete replacement;
6. `STYLE.1.E` - Asset/Storyboard/Sequence/Shot prompt integration and
   provenance;
7. `STYLE.1.F` - Asset creative alignment;
8. `STYLE.1.G` - image/video Look Development.

Do not collapse these into one ticket.

The supervisor may refine file-level boundaries after auditing the real code,
but must preserve the product dependencies:

```text
research contract before auto-feed
durable Style before inheritance
inheritance before Shot/Sequence integration
canonical compilation before Look Development comparison
```

## 8. Ticket Preparation Requirements

Every `.agents/current_task.md` for this epic must be written in French for
Claude and include:

- ticket ID and product goal;
- feedback `FB-20260723-001` plus any narrower related feedback;
- exact in-scope and out-of-scope behavior;
- real files and call sites found by audit;
- schema/migration authorization or prohibition;
- package authorization or prohibition;
- generation runtime/job runner/polling authorization or prohibition;
- source preservation and rollback expectations;
- deterministic helper contracts;
- validation commands;
- explicit browser and persistence proofs;
- an English user-validation checklist;
- instruction not to stage, commit or push before Codex approval.

Before writing Next.js code, read the relevant guide in
`node_modules/next/dist/docs/`; the installed Next.js version has breaking
changes relative to standard assumptions.

## 9. Per-Lot Supervision Notes

### `STYLE.RESEARCH.SPIKE.1`

Must prove a real query, real returned sources, bounded retrieval and
claim-to-source citation. It should finish with a GO/NO-GO and a concrete
contract, not a production UI.

Do not accept:

- links fabricated by an LLM;
- an unsourced biography generated from model memory;
- unrestricted `fetch(userUrl)`;
- a new dependency without comparison and justification.

### `STYLE.1.A`

Must deliver:

- real Project Style navigation;
- manual sparse authoring;
- one Working Draft;
- immutable publication history;
- exact compiler helper that omits empty content;
- no LLM requirement for basic use.

Do not begin reference research, prompt integration or Look Development in
this foundation ticket.

### `STYLE.1.B`

Must keep Project ownership explicit and preserve file provenance/deletion
safety. Reuse the shared role language where semantically valid without
overloading Asset/Shot rows.

### `STYLE.1.C`

Must preserve:

```text
discovered -> reviewed -> saved -> synthesized -> proposed -> approved
```

No step after discovery is implicit.

### `STYLE.1.D`

Must prove:

- inheriting Sequence follows a newly published Project version;
- customized Sequence remains unchanged after Project publication;
- reset restores inheritance;
- every Shot resolves the same Sequence value;
- no Shot override exists.

### `STYLE.1.E`

Must identify every real compilation and generation surface. A UI-only
preview is insufficient: the exact Style text and version must reach the
queued payload snapshot.

Empty Style content must preserve byte/semantic behavior of the current
pipeline.

Prompt size accounting must include Style and remain compatible with
`FB-20260715-010`.

### `STYLE.1.F`

Must extend the proven preview/edit/apply pattern. No bulk or individual LLM
action may overwrite Asset data before explicit Apply.

Tests must include the original "space postman" failure mode: Style must be
able to change design content, not only rendering vocabulary.

### `STYLE.1.G`

Must use real compatible image and video workflows and durable outputs.

The ticket must explicitly authorize:

- the new generation target contract;
- any additive Look Development tables;
- exact provenance snapshots;
- safe output deletion and historical retention.

No real workflow means no fabricated capability.

Result-feedback proposals that modify the Style are not part of `STYLE.1.G`.
They are deferred to `STYLE.2.LOOK.CORRECTIONS.1` (formerly considered as
`STYLE.1.G.CORRECTIONS.1`) and require a separate product, LLM and atomic-apply
contract.

## 10. Validation Baseline

Each implementation ticket should normally include:

- targeted pure tests for compilers/resolvers;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm run db:generate`;
- migration validation when authorized;
- `git diff --check`;
- browser validation in Default and Custom themes;
- desktop and narrow layout checks;
- keyboard/focus checks;
- reload persistence;
- exact queued-payload/provenance inspection when generation is involved.

Do not spend on paid Cloud/Partner Nodes when a deterministic harness proves
the contract. Do not fabricate unavailable GPU, network or model proof.

## 11. Primary Risk Register

| Risk | Required response |
|---|---|
| Giant mandatory Style form | Progressive disclosure and sparse valid state |
| Empty template text in prompts | Pure compiler filters and exact preview tests |
| LLM invents research | Real search/retrieval contract with citations |
| Sources disappear or change | Persist metadata, access date, bounded notes and synthesis versions |
| Copyrighted pages copied wholesale | Store bounded evidence, metadata, notes and links |
| Project changes silently alter overridden Sequences | Full local replacement with explicit reset |
| Asset style is only a suffix | Separate creative alignment preview/apply |
| Style references overflow workflow inputs | Explicit selection and real input mapping |
| Look Development mutates production entities | Dedicated Style target and outputs |
| New runtime forks ComfyUI logic | Reuse canonical generation pipeline |
| Historical output cannot explain its look | Exact Style and prompt provenance |
| Epic implemented monolithically | Enforce ticket stack and independent review gates |

## 12. Handoff Completion Checklist

Before promoting the first Project Style ticket, the supervisor should verify:

- the Camera Lab/current-task status discrepancy is resolved;
- all mandatory documents above are still current;
- `FB-20260723-001` remains the primary Project Style feedback;
- the chosen ticket is one bounded lot;
- its migration/package/runtime permissions are explicit;
- unrelated working-tree changes are preserved;
- no `git add .` instruction is issued;
- user-visible acceptance includes a manual test workflow;
- commit and push will only be requested together after a fresh Codex
  `APPROVED` verdict with `safeToCommit: true`.
