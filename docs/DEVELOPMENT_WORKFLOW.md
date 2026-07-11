# Development Workflow

Last updated: 2026-07-11

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

Codex writes `.agents/current_task.md` in French before Claude implements.

### Claude Code

Claude Code is the implementation agent.

Claude reads `.agents/current_task.md`, implements the scoped work, runs the
requested validation, and writes `.agents/claude_report.md`.

Claude does not commit unless Codex has approved.

## Loop

```text
User talks to Codex
→ Codex writes .agents/current_task.md
→ Claude reads the ticket and implements
→ Claude writes .agents/claude_report.md
→ Codex reviews report and diff
→ APPROVED / REVISE / NEEDS_USER
→ Claude fixes or commit/push
```

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

## Implementation

Claude implements only the ticket.

No `git add .`.

Stage explicit paths only.

Do not commit runtime DB, uploads, outputs, storage, `.next`, `dist`, or logs.

MikAI UI labels, tooltips, messages, and errors must be in English.

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
