# Codex Supervisor Context Strategy

Last updated: 2026-08-23

## Goal

Keep Codex effective across a long product and development conversation without
reloading implementation history that belongs to Claude or to completed
tickets.

Codex is not the executor. Its high-value context is:

- current product intent and recent user decisions;
- active roadmap priority;
- ticket scope and forbidden boundaries;
- architecture and migration arbitration;
- implementation review findings;
- user validation still required;
- exact next action.

Raw logs, detailed test transcripts, and step-by-step implementation history
belong in the ticket report, not in the supervisor conversation or handoff.

## Context Layers

### 1. Permanent Rules

`AGENTS.md` is injected as the permanent supervision contract. Keep it short
and limited to rules that apply repeatedly.

### 2. Volatile Supervisor Handoff

`.agents/codex_handoff.md` is the first recovery document after compaction,
interruption, or a later session. Keep it under roughly 80 lines.

It contains only:

- repository head and worktree cautions;
- active ticket or explicit `none`;
- latest closed ticket;
- current product decisions;
- unresolved risks or user validation;
- next roadmap candidate and responsible model;
- next supervisor action.

It must not contain old ticket narratives, full diffs, test logs, copied
reports, or speculative backlog.

### 3. Active Ticket Artifacts

Load only while the ticket is active:

```text
.agents/current_task.md
.agents/claude_report.md
.agents/codex_review.md
.agents/codex_verdict.json
```

At review time, inspect Git state and diff before reopening broad product
documentation. Read code around changed contracts and their callers, not the
entire domain.

### 4. Durable Product Sources

Load conditionally:

- `docs/PROJECT_STATE.md`: state reconciliation and durable capability status;
- `docs/ROADMAP.md`: priority and sequencing;
- `docs/ARCHITECTURE_DECISIONS.md`: durable technical arbitration;
- `docs/USER_FEEDBACK.md`: observations, retakes, and validation status;
- domain specifications: only when linked by the active ticket or product
  discussion.

Durable knowledge must be written to these sources before old conversational
context is allowed to disappear.

## Turn Classification

Before reading files, classify the request:

- **Status or roadmap**: handoff, then Project State/Roadmap as needed.
- **Product discussion**: handoff, relevant specification, then targeted code
  only if feasibility depends on it.
- **Ticket preparation**: handoff, roadmap, relevant architecture/feedback,
  linked domain spec, and bounded code audit.
- **Implementation review**: active ticket artifacts, Git state/diffs, changed
  contracts and callers, then targeted tests.
- **Operational command**: use the narrow command directly; do not preload
  product documentation.
- **External/current fact**: browse authoritative sources only when temporal or
  factual verification is needed.

## Review Discipline

For code reviews:

1. inspect staged and unstaged scope separately;
2. map changed files to the ticket;
3. identify invariants and failure paths;
4. read only relevant callers and persistence boundaries;
5. inspect replacement cleanup, reverse references, new exports/files,
   duplication and architecture boundaries;
6. run the narrowest decisive checks;
7. lead with findings, not a narrative recap;
8. write the verdict files;
9. keep the user-facing summary short.

The review priority is:

1. functional and data regressions;
2. stale or unreachable paths left behind by replacement;
3. unused new files, exports, helpers, packages, or tests;
4. duplication of an existing contract;
5. architecture boundary violations or new cycles;
6. unjustified complexity;
7. missing or obsolete tests.

Do not turn review into a repository-wide cleanup. Findings must be caused by,
or directly adjacent to, the ticket diff and include a credible path plus the
minimal correction.

Before authorizing a new dependency or repository-wide analyzer, require a
baseline ticket. Current quality-tool posture is recorded in
`docs/INCREMENTAL_CODE_QUALITY.md`.

Use a focused compressed subagent for noisy repository discovery, large logs,
or an independent diff review when it saves main-context space. Do not spawn
teams by default.

## Conversation Hygiene

- Do not repeat long roadmap lists unless requested.
- Do not paste Claude reports back into the conversation; extract decisions,
  findings, and limits.
- Prefer file references over copied source blocks.
- Keep intermediary updates to one or two useful sentences.
- Keep full command output inside tools; report exit status and decisive lines.
- At context transitions, trust the newest user request plus the handoff, not a
  stale conversational objective.
- Use automatic compaction naturally; a new ChatGPT conversation is optional,
  not required for each ticket.

Unlike Claude Code, Codex does not rely on a repository-controlled `/clear`
command. Continuity comes from `AGENTS.md`, `.agents/codex_handoff.md`, durable
documents, and active ticket artifacts.

## Boundary Checkpoint

Update `.agents/codex_handoff.md` when:

- a ticket is approved and pushed;
- the user changes roadmap priority;
- a product or architecture decision is accepted;
- user validation closes or reopens a ticket;
- supervision is blocked or handed to another model.

The checkpoint should describe the present and the next action. Completed
details remain in Git history, reports, feedback, and durable documentation.

---

## Dormant — the Codex supervision protocol

Moved here from `AGENTS.md` on 2026-08-23, verbatim in substance. Nothing was
deleted: it was resident in every conversation while applying to nothing,
because Codex supervision is dormant. It becomes binding again the day the user
switches back, which requires updating the `Status` section of `AGENTS.md`,
`CLAUDE.md` § `Active Supervision Protocol`, and section 0 of
`.agents/SUPERVISION_PROTOCOL.md` together.

Codex is the user's main supervisor for product, UX, architecture, roadmap,
ticket preparation, review, and final arbitration.

### Context policy, Codex-side

- always read `.agents/codex_handoff.md` when present;
- read `.agents/current_task.md` for ticket preparation, implementation
  supervision, or review;
- read `.agents/claude_report.md`, `.agents/codex_review.md`, and
  `.agents/codex_verdict.json` only for active review or closure.

At meaningful ticket boundaries, Codex updates `.agents/codex_handoff.md` with
only current state, decisions, risks, pending validation, and the next action.
Do not copy historical implementation narratives or raw command output into
that handoff.

### The commit gate

Never commit unless `.agents/codex_verdict.json` has:

```json
{
  "verdict": "APPROVED",
  "safeToCommit": true
}
```

### The five-check review pass

Review every implementation with separate checks for:

- `git status`
- `git diff --cached --stat`
- `git diff --cached`
- `git diff --stat`
- `git diff`

The zero-debt checklist that follows these five checks is **not** dormant and
stays in `AGENTS.md`: it binds every implementation agent under every protocol.

### Closure

After an `APPROVED` verdict with `safeToCommit: true`, Codex must ask Claude to
commit and push in the same follow-up instruction. Do not request a commit-only
step and wait for a separate push request, unless the user explicitly asks to
keep the commit local.

For simple Claude staging, commit, and push tasks, explicitly tell Claude not
to use extended thinking: execute the prescribed git workflow directly and
report the result. Reserve deeper reasoning for implementation, debugging, or
review tasks where it materially helps.

Codex must replace a closed ticket in `.agents/current_task.md` before asking
Claude to implement again.

### Carried forward when Codex returns

The **workspace test** (`CLAUDE.md` § Start Here, `mikai-method` §10,
`docs/ARCHITECTURE_DECISIONS.md` 2026-08-23) fires before a technical solution
is designed. Under the Opus protocol the main thread runs it. Under Codex it is
ticket preparation, so this section must carry it — otherwise tickets will be
prepared without the test, which is the exact gap the rule was written to
close.
