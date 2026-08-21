# Development Workflow

Last updated: 2026-07-23

## Roles

### User

The user owns product direction and final tradeoffs. The user talks to Codex,
not directly through copy-paste between multiple tools.

The user steps in for product arbitration when Codex returns `NEEDS_USER`.

### Codex

Codex is the main supervisor:

- product and UX reflection;
- architecture;
- roadmap;
- Claude ticket preparation;
- implementation review;
- verdict: `APPROVED`, `REVISE`, or `NEEDS_USER`.

Codex also arbitrates data-model evolution. Before a ticket is written,
Codex decides whether a migration is the best technical response to the
product need. If so, the ticket must explicitly authorize the migration and
describe the affected data, compatibility expectations, and validation. If
not, Claude must not add one as an implementation shortcut.

Codex writes `.agents/current_task.md` in French before Claude implements.

Codex maintains `.agents/codex_handoff.md` as a compact volatile checkpoint for
supervisor continuity. It is not a second roadmap or implementation report.
Its contents and update rules are defined in
`docs/CODEX_SUPERVISOR_STRATEGY.md`.

### Claude Code

Claude Code is the implementation agent.

Claude reads `.agents/current_task.md`, implements the scoped work, runs the
requested validation, and writes `.agents/claude_report.md`.

Claude does not commit unless Codex has approved.

### Cline / Mimo v2.5 Pro

Cline / Mimo v2.5 Pro is the primary backup implementation agent for bounded
work that Codex explicitly assigns to it.

Its persistent contract is:

- `AGENTS.md`;
- `.cline/rules/`;
- `.cline/skills/` when Cline Skills is enabled;
- `.agents/deepseek_developer_prompt.md`;
- `.agents/current_task.md`.

It uses `.clineignore` to avoid loading dependencies, builds, runtime data,
large media and generated snapshots automatically. Explicit file references
remain possible when a ticket legitimately requires an ignored file.

Mimo must stop on Sonnet-assigned tickets and when a required backend,
persistence, ownership, runtime, or product contract is missing. Codex should
prefer it for bounded UI over stable actions/types, accessibility, visual
polish, deterministic presentation helpers, and mechanical edits. Foundational
schema, migrations, Server Actions, filesystem compensation, security,
generation runtime and cross-domain provenance remain Sonnet work unless Codex
provides an unusually explicit exception.

After a Codex `REVISE`, Mimo is the default retake executor even when Claude
implemented the initial pass. Codex may explicitly retain Sonnet when the
finding itself concerns schema/migration design, security boundaries,
concurrency, filesystem compensation, credentials, generation runtime or
another high-risk contract. The retake ticket/review is the complete contract;
Mimo must preserve already-approved behavior and touch only the finding scope.

Cline writes the same `.agents/claude_report.md` artifact and follows the same
Codex review and commit/push gate.

## Loop

```text
User talks to Codex
→ Codex writes .agents/current_task.md
→ assigned implementation agent reads the ticket and implements
→ implementation agent writes .agents/claude_report.md
→ Codex reviews report and diff
→ APPROVED / REVISE / NEEDS_USER
→ assigned agent fixes or commit/push
```

## Progressive Context

MikAI keeps a continuous conversation while a ticket is active so current
implementation and review context are not lost. A new conversation or worktree
per ticket is not the default. After a ticket is fully closed, `/clear` is the
preferred lightweight reset because permanent rules and durable product state
are restored from repository files.

The context boundary is file-based:

- `.agents/current_task.md` is the active contract;
- `.agents/claude_report.md` is the implementation evidence;
- `.agents/codex_review.md` and `.agents/codex_verdict.json` are the current
  review state;
- durable product or architecture knowledge belongs in `docs/`, not in a
  growing conversational recap.

At ticket start, load context progressively:

1. read `CLAUDE.md`, `AGENTS.md`, and the active ticket;
2. read the permanent sources required by `AGENTS.md`;
3. follow only the domain links named by the ticket;
4. locate symbols with LSP when available, otherwise `rg`;
5. inspect neighboring implementations only where they establish a reusable
   pattern or contract.

Do not scan all `docs/`, reread every historical report, or reconstruct old
tickets unless the current contract explicitly depends on them. Never use
`/clear` while a ticket is active. `/compact` may be used when the same task
needs more room and the active file-based state has already been written.

Full policy: `docs/AGENT_CONTEXT_STRATEGY.md`.

## Ticket Closure And `/clear`

The ticket is safe to clear only after:

1. Codex approved it with `safeToCommit: true`;
2. Claude committed explicit approved paths and pushed them in the same step;
3. Claude updated `.agents/claude_report.md` with the hash, push range, final
   status, and remaining out-of-scope changes;
4. Codex recorded any durable roadmap, feedback, product, or architecture
   consequence;
5. the next `.agents/current_task.md` is ready, or Codex confirms that the
   queue is empty.

The `close-ticket` skill that audited this gate was **archived on 2026-08-21**
to `docs/archive/codex-protocol-skills/`, with the two others written for the
same dormant protocol. Under the Opus protocol the method lives in the
`mikai-method` skill, which `CLAUDE.md` loads as step 0. No skill can run
`/clear`: it is always the user who runs it.

After `/clear`, use:

```text
Implement the active ticket in .agents/current_task.md.
Follow CLAUDE.md and AGENTS.md.
Do not commit or push before a fresh Codex approval.
```

If the active ticket is already marked committed and pushed in the final
report, Claude stops and requests a new `current_task.md` instead of repeating
the work.

## Ticket Preparation

Codex must write tickets in French for Claude.

Each ticket should include:

- ticket id and title;
- goal;
- scope;
- out of scope;
- constraints;
- files or areas likely involved;
- validation expected;
- incremental debt budget: existing implementation to reuse, obsolete path to
  remove, and any compatibility path intentionally retained;
- UI validation checklist when relevant;
- explicit authorization for schema, migration, package, runtime, OpenReel core,
  ComfyUI/generation runtime/job runner/polling, or `SequencePreviewPlayer`
  changes if any are needed.

Without explicit authorization, these are forbidden:

- schema/migration changes;
- package dependency changes;
- ComfyUI/generation runtime/job runner/polling changes;
- `SequencePreviewPlayer` changes;
- OpenReel core changes.

This authorization rule is not an anti-migration rule. Durable product facts
such as storyboard outputs, approval states, selected references, and
generation provenance should use the database when the existing model cannot
represent them safely. Temporary UI state and derived summaries should remain
derived or local unless the product explicitly needs persistence.

## Implementation

Claude implements only the ticket.

Before creating a file, helper, component, validator, or service, search for
an equivalent contract and its callers. When a ticket replaces behavior,
remove the old execution path in the same diff unless the ticket explicitly
requires compatibility. New abstractions must have a real use in the delivered
flow; speculative helpers and duplicate services are not accepted.

The same rule applies to Cline/Mimo and other explicitly assigned backup
executors. A weaker model must stop rather than preserve two competing paths
because it is uncertain which one is canonical.

No `git add .`.

Stage explicit paths only.

Do not commit runtime DB, uploads, outputs, storage, `.next`, `dist`, or logs.

MikAI UI labels, tooltips, messages, and errors must be in English.

For substantial exploration, noisy logs, or independent final review, prefer
a focused subagent with a narrow question. The subagent must return a concise
summary with file/line evidence, not raw logs. Do not use multi-agent teams by
default.

Run the narrowest meaningful tests first. Broaden to the mandatory ticket
checks after the implementation stabilizes. Keep successful command output
compact; preserve the exact failing command, error, and useful surrounding
lines when a check fails.

For changed TypeScript/JavaScript files, run targeted ESLint where applicable.
Global lint and unused-code enforcement are not yet clean baselines; do not
silently convert historical findings into ticket failures. See
`docs/INCREMENTAL_CODE_QUALITY.md`.

## Claude Report

Claude writes `.agents/claude_report.md` with:

- ticket id;
- summary;
- files changed;
- validation run;
- known limitations;
- user decisions needed;
- git status summary;
- commit status.

## Codex Review

Codex must read:

- `.agents/current_task.md`;
- `.agents/claude_report.md`;
- `.agents/codex_review.md` when present;
- `.agents/codex_verdict.json` when present;
- `git status`;
- `git diff --cached --stat`;
- `git diff --cached`;
- `git diff --stat`;
- `git diff`.

Codex writes:

- `.agents/codex_review.md`;
- `.agents/codex_verdict.json`.

Codex reviews functional correctness first, then performs a distinct
incremental-debt pass over the diff: obsolete paths, unused additions,
duplication, dependency direction, complexity and tests. It does not request
unrelated repository cleanup.

## Verdicts

### `REVISE`

Use when implementation has fixable issues.

Claude must fix issues and request review again. No commit.

### `NEEDS_USER`

Use when product, scope, or missing context blocks a safe decision.

Claude stops. User decides through Codex, optionally recorded in
`.agents/user_arbitration.md`.

### `APPROVED`

Use only when implementation matches the ticket and has no blocking issue.

`safeToCommit` may be `true` only with `APPROVED`.

Commit gate:

```json
{
  "verdict": "APPROVED",
  "safeToCommit": true
}
```

## Commit And Push

After `APPROVED`, Codex provides Claude one prompt containing:

- exact commit scope;
- explicit paths to stage;
- reminder to avoid `git add .`;
- commit message;
- push instruction;
- final report expected from Claude.

Commit and push are one combined workflow by default. Codex must request both
in the same prompt immediately after approval; a commit-only handoff is not
allowed unless the user explicitly requests a local commit without push.
