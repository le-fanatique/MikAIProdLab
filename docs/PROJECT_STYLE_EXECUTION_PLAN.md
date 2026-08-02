# Project Style V1 - Execution And Model Allocation

Last updated: 2026-07-23

Status: accepted planning baseline, fully executed. All `STYLE.1` tickets
allocated by this plan are complete, and `STYLE.1.ACCEPTANCE.1` was
accepted by the user on 2026-08-02. Kept as the historical execution-order
and model-allocation record, not as a live status page.
`STYLE.1.C.ARCHITECTURE.1` is complete; its reconciled contract is
`docs/PROJECT_STYLE_RESEARCH_ARCHITECTURE.md`.

Primary feedback: `FB-20260723-001`.

## Purpose

This plan refines the accepted `STYLE.1` delivery stack into bounded tickets
that can be assigned safely either to:

- **Sonnet**: architecture, data model, security, LLM contracts, generation
  integration and high-blast-radius behavior;
- **Cline / Mimo v2.5 Pro**: constrained implementation over contracts already
  merged or explicitly frozen by Codex; UI is the default, while an
  exceptional CORE ticket requires a reconciled architecture first.

This allocation is based on ticket risk and coupling, not on a claim that one
model can never perform the other category.

## Permanent Assignment Rules

Cline / Mimo tickets must never independently design or change:

- schema/migrations;
- add packages;
- server actions or API routes;
- implement Web retrieval, URL validation or credential handling;
- change file publication/deletion semantics;
- change prompt compilers, generation payloads, job runner or polling;
- alter ownership, versioning, provenance or publication rules;
- touch OpenReel or `SequencePreviewPlayer`.

An exceptional Mimo CORE ticket may change one of those boundaries only when:

- an external or Sonnet architecture deliverable has been reconciled against
  the repository by Codex;
- `.agents/current_task.md` explicitly authorizes the exact contracts and file
  categories;
- schema and migration behavior are fixed before implementation;
- the executor stops on any mismatch instead of redesigning the contract.

Every ordinary Cline / Mimo UI ticket starts only after its CORE prerequisite
is merged. Its allowed props, actions, routes and files must be named
explicitly. Codex reviews every full diff. Any contract ambiguity returns to
Codex rather than being guessed by Mimo.

All tickets stop before staging. Commit and push are requested together only
after a fresh Codex `APPROVED` verdict with `safeToCommit: true`.

## Delivery Order

| Order | Ticket | Recommended agent | Main reason |
|---|---|---|---|
| 1 | `STYLE.RESEARCH.SPIKE.1` | Sonnet | Web security, provider arbitration, citations |
| 2 | `STYLE.1.A` | Sonnet | Core schema, versions, compiler and first workspace |
| 3 | `STYLE.1.B.CORE` | Sonnet | Project-owned media, provenance and deletion safety |
| 4 | `STYLE.1.B.UI` | Cline / Mimo v2.5 Pro | Bounded Reference Board and dossier UI |
| 5 | `STYLE.1.C.ARCHITECTURE.1` | External Chat (`GPT-5.6 SOL`) | Read-only architecture over a bounded verified context packet |
| 6 | `STYLE.1.C.CORE` | Cline / Mimo v2.5 Pro | Repository audit and implementation against the reconciled architecture |
| 7 | `STYLE.1.C.UI` | Cline / Mimo v2.5 Pro | Review/apply UI over stable research actions |
| 8 | `STYLE.1.D.CORE` | Sonnet | Inheritance and full-replacement resolver |
| 9 | `STYLE.1.D.UI` | Cline / Mimo v2.5 Pro | Sequence panel over stable resolver/actions |
| 10 | `STYLE.1.E` | Sonnet | Cross-surface prompt and payload provenance |
| 11 | `STYLE.1.F.CORE` | Sonnet | Style-aware Asset proposal/apply contract |
| 12 | `STYLE.1.F.UI` | Cline / Mimo v2.5 Pro | Asset alignment preview/edit/apply UI |
| 13 | `STYLE.1.G.CORE` | Sonnet | New durable generation target and output lifecycle |
| 14 | `STYLE.1.G.UI` | Cline / Mimo v2.5 Pro | Look comparison, notes and target controls |
| 15 | `STYLE.1.B.ANALYSIS.CORE` | Sonnet | Multimodal Reference Board analysis, provenance and candidate traits |
| 16 | `STYLE.1.B.ANALYSIS.UI` | Sonnet | Explicit reference selection, analysis review and approval workflow |

Do not run two tickets that edit the same files concurrently.

## Ticket Cards

### `STYLE.RESEARCH.SPIKE.1` - Web Research Contract

**Agent:** Sonnet.

Prove a real search/retrieval/citation contract before production code.
Compare viable providers, execute at least one real query when a usable
credential/free contract exists, retrieve bounded source content through an
SSRF-safe prototype, and map factual synthesis claims to source records.

No production UI, schema, migration, package or application runtime change.
Output a GO/NO-GO audit with credential, cost, rate-limit, URL safety,
copyright-retention and citation decisions.

### `STYLE.1.A` - Durable Style Foundation

**Agent:** Sonnet.

Add the relational Working Draft and immutable published-version foundation,
Project ownership, sparse World & Design Language / Visual Treatment content,
optional atomic rules, exact empty-field compiler, publication history,
Project Style route and enabled navigation.

This ticket owns the first workspace UX because it defines the sparse
authoring model and progressive-disclosure behavior. It does not include
references, research, Sequence overrides, prompt injection or Look
Development.

Additive migration is expected and must be generated by Drizzle after backup
and preservation checks.

### `STYLE.1.B.CORE` - Project References And Influence Data

**Agent:** Sonnet.

Add Project-owned reference images and Creative Influence dossiers with
manual notes, domains, provenance, applicability and approval metadata.
Implement validated upload, ownership checks and honest deletion/compensation.

No Web research yet. No reuse of fake Asset or Shot ownership.

### `STYLE.1.B.UI` - Reference Board And Influence Surfaces

**Agent:** Claude Code / Sonnet.

Render the Reference Board and Creative Influence dossier interfaces over the
merged `STYLE.1.B.CORE` actions and types. Include compact cards, source/image
preview, filters, progressive disclosure, empty states and explicit links.

No action, schema, storage helper or ownership logic change. Default/Custom,
desktop/narrow and keyboard behavior are mandatory.

### `STYLE.1.C.ARCHITECTURE.1` - Research Architecture

**Agent:** external Chat model (`GPT-5.6 SOL`), without repository access.

Produce a read-only implementation architecture from the bounded,
repository-verified packet prepared by Codex. Define the relational model,
state machine, provider and synthesis contracts, provenance, transactions,
failure matrix, cost controls and adversarial test plan.

The external model never edits the repository and never claims repository
knowledge beyond the packet. Codex reconciled its result into
`docs/PROJECT_STYLE_RESEARCH_ARCHITECTURE.md`; this ticket is complete.

### `STYLE.1.C.CORE` - Influence Auto-Feed And Synthesis

**Agent:** Cline / Mimo v2.5 Pro after Codex reconciliation.

Implement the provider contract selected by the spike and frozen by
`docs/PROJECT_STYLE_RESEARCH_ARCHITECTURE.md`:

```text
discovered -> reviewed -> saved -> synthesized -> proposed -> approved
```

Persist bounded source records, versioned source-grounded syntheses and
candidate rules. Every claim/rule must retain source provenance. Nothing is
saved, synthesized or approved implicitly.

This ticket explicitly owns credentials, URL safety and LLM/source contracts.
It must follow the reconciled architecture document and inspect the real
repository before editing. Any mismatch or missing backend contract stops the
ticket for Codex arbitration instead of being guessed.

### `STYLE.1.C.UI` - Research Review Workflow

**Agent:** Cline / Mimo v2.5 Pro.

Build the review UI for candidate sources, saved sources, synthesis versions
and candidate Style rules using only merged CORE actions. The user can save,
dismiss, edit and approve explicitly.

No network calls from the client, no direct `fetch(userUrl)`, no server-action
or provenance change.

### `STYLE.1.D.CORE` - Sequence Resolution And Override

**Agent:** Sonnet.

Add the additive Sequence override model and one canonical resolver:

```text
no override -> current active Project Style
override -> complete Sequence-local replacement
```

Prove inheritance after Project publication, override stability, reset,
Shot-wide resolution and absence of Shot-level overrides.

### `STYLE.1.D.UI` - Sequence Project Style Panel

**Agent:** Cline / Mimo v2.5 Pro.

Render the Sequence `Project Style` panel with inherited/customized state,
active version summary, `Customize for Sequence`, explicit save and
`Reset to Project Style`, using only merged CORE actions.

No resolver, schema or server-action change.

### `STYLE.1.E` - Prompt And Generation Integration

**Agent:** Sonnet.

Add one inspectable sparse Style source to Asset, Storyboard Shot, Sequence
contact sheet, Sequence video and Shot image/video compilation. Resolve
Project or Sequence Style according to the accepted matrix and preserve exact
Style revision/text in canonical payload provenance.

Empty Style must preserve existing behavior. Prompt-size accounting must
include Style. This is a high-blast-radius ticket and cannot be delegated to
Cline / Mimo v2.5 Pro.

### `STYLE.1.F.CORE` - Asset Creative Alignment Contract

**Agent:** Sonnet.

Make Asset assistance Style-aware and implement deterministic context plus an
LLM proposal contract for `Align with Project Style`. Existing Description,
Notes and Asset Bible data remain untouched until explicit apply.

Include the original space-postman test: the proposal must improve design
content, not merely append rendering vocabulary.

### `STYLE.1.F.UI` - Asset Alignment Review

**Agent:** Cline / Mimo v2.5 Pro.

Add the compact preview/edit/apply/regenerate interface on Asset Detail using
the merged CORE contract and the existing AI Assist disclosure conventions.

No LLM prompt, action, DB write contract or apply semantics may change.

### `STYLE.1.G.CORE` - Look Development Runtime And Data

**Agent:** Sonnet.

Extend the canonical generation target/provenance model for durable
Style-scoped image and video tests. Add safe output publication/deletion,
duplication, comparison data, review notes and Look Target state without
mutating Assets or Shots.

This ticket explicitly authorizes its additive migration and narrowly scoped
generation-target extension. It must not create a second ComfyUI runtime.

### `STYLE.1.G.UI` - Look Development Bench

**Agent:** Cline / Mimo v2.5 Pro.

Build the workflow selector, test-source editor, result comparison grid,
review-note controls, duplicate action and `Mark as Look Target` UI over the
merged CORE contracts.

No generation payload, job polling, file lifecycle, schema or action changes.

### `STYLE.1.B.ANALYSIS.CORE` - Reference Board Visual Analysis

**Agent:** Claude Code / Sonnet.

This is a mandatory `STYLE.1` MVP closure gate. Implement an explicit
multimodal-analysis contract for one or more Project Reference Board images.
Only references marked `Approved for Style analysis` may be submitted.

Persist bounded analysis provenance and reviewable observations or candidate
traits. Reuse the existing Language Model provider conventions and the
Working Draft candidate-rule/apply boundaries where semantically valid. Never
silently mutate a Working Draft or a published Style, never treat Look
Development generation as analysis, and never reuse the Web-only Creative
Influence Research contract as if it had inspected images.

The ticket must freeze exact selected reference ids, relevant metadata,
provider/model identity and the analyzed input contract. It must define cost
confirmation, concurrency, retry/idempotency, stale-reference handling and
honest partial-failure behavior before implementation.

### `STYLE.1.B.ANALYSIS.UI` - Reference Analysis Review

**Agent:** Claude Code / Sonnet.

Build the explicit `Analyze References` workflow over the merged CORE:
eligible-reference selection, analysis scope, clear cost disclosure, progress
and failure states, source-linked observations, edit/reject/approve controls,
and explicit promotion of accepted proposals into the current Working Draft.

The UI must explain that analysis is optional and never automatic. It must
show which images support each proposal and refuse approval when the Working
Draft or analyzed references have gone stale. It must not add a second
provider, image-upload or candidate-rule implementation.

`STYLE.1` may not be declared MVP-complete until both analysis tickets are
implemented, reviewed, committed, pushed and manually validated.

### Deferred `STYLE.2.LOOK.CORRECTIONS.1` - Result Feedback To Style

Formerly considered as `STYLE.1.G.CORRECTIONS.1`, this capability is now
explicitly outside the `STYLE.1` MVP. A future bounded `STYLE.2` contract must
define how Look Result feedback produces proposed Style corrections and how
each proposal is accepted, edited or rejected without mutating a published
Style implicitly.

## Review Strategy

For Sonnet tickets, Codex reviews architecture, migration preservation,
transactions, security boundaries, provenance and end-to-end behavior.

For Cline / Mimo tickets, Codex additionally checks:

- no forbidden backend file changed;
- no duplicated business logic moved into the client;
- all action results and error states are rendered;
- text and controls fit at desktop and narrow widths;
- keyboard/focus behavior is complete;
- no capability was silently dropped from the stable CORE contract.

If a Mimo implementation reveals a missing contract, stop that ticket and
create a bounded Sonnet retake. Do not let the weaker model invent the missing
backend behavior.
