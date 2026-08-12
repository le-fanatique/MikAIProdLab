# Agent Context Strategy

Last updated: 2026-07-23

## Goal

Reduce repeated repository discovery and noisy context without losing the
continuous Codex supervisor / Claude executor conversation chosen by the user.

This document primarily governs Claude Code as executor. Codex has a different
context shape documented in `docs/CODEX_SUPERVISOR_STRATEGY.md`: product
decisions, roadmap state, review boundaries, and user validation matter more
than implementation logs.

Cline / Mimo v2.5 Pro follows the same progressive-loading principle through
`.clineignore`, `.cline/rules/`, and on-demand `.cline/skills/`. Its shorter
startup prompt is `.agents/deepseek_developer_prompt.md`; it must not preload
all durable documents or attempt Sonnet-assigned foundation work.

## Conversation And Reset Policy

MikAI does **not** require a new conversation or worktree for every ticket.
Within an active ticket, keep the conversation because it contains current
implementation and review context.

After a ticket is fully closed, `/clear` is recommended to remove accumulated
logs and obsolete implementation history. Ticket files provide the reset
boundary:

```text
current_task -> claude_report -> codex_review -> codex_verdict
```

Start a separate worktree or conversation only when Codex explicitly asks for
isolated parallel work, a risky spike, or a different repository.

## Safe `/clear` Gate

Run `/clear` only when all of these are true:

1. the latest Codex verdict is `APPROVED` with `safeToCommit: true`;
2. the approved paths were committed explicitly and pushed;
3. `.agents/claude_report.md` records the commit hash and push range;
4. temporary harnesses, test data, and processes are cleaned up;
5. durable product, roadmap, feedback, or architecture knowledge has been
   written to its proper document;
6. Codex has either prepared the next `.agents/current_task.md` or explicitly
   confirmed that no ticket is currently queued.

Do not run `/clear` during implementation, review, a retake, user validation,
or between approval and commit/push.

`/clear` itself remains a user-issued Claude Code command. A repository skill
can verify readiness and print the instruction, but must not claim to have
cleared its own conversation context.

## Recovery After `/clear`

Claude Code reloads the repository instructions. The recovery chain is:

```text
CLAUDE.md
-> @AGENTS.md
-> .agents/current_task.md
-> ticket-linked domain documents
-> relevant code symbols
```

Use the short restart prompt stored in `CLAUDE.md`. If `current_task.md` still
describes a ticket whose final report says it was committed and pushed, Claude
must stop instead of implementing it again.

## Progressive Loading

Always load:

- `CLAUDE.md`;
- `AGENTS.md`;
- `.agents/current_task.md`;
- the permanent documents required by `AGENTS.md`.

Then load only:

- documents linked by the active ticket;
- files found through symbols/references;
- neighboring code needed to understand an established contract.

Avoid:

- reading every file under `docs/`;
- replaying old `.agents/claude_report.md` content unrelated to the ticket;
- broad source scans before identifying likely symbols;
- pasting complete build/test logs into the main conversation.

## Navigation

Prefer this order:

1. LSP definition/references/diagnostics when the TypeScript LSP plugin is
   installed;
2. `rg` for exact symbols, routes, labels, and contracts;
3. `rg --files` for bounded file discovery;
4. targeted file reads around relevant lines.

Install the Claude Code TypeScript LSP plugin locally:

```text
/plugin install typescript-lsp@claude-plugins-official
```

The plugin is a developer-machine capability, not a repository dependency.
Do not modify `package.json` merely to record it.

## Subagents

Use a focused subagent when the raw work would pollute the main context:

- locating an unfamiliar flow;
- reading large logs;
- comparing external documentation;
- reviewing a completed diff independently.

Give one bounded question and explicit scope. Ask for:

- conclusions;
- file/line evidence;
- risks or unknowns;
- no raw log dump.

Do not launch agent teams by default. Parallel agents are justified only when
independent work streams materially reduce elapsed time.

## Testing And Output

Use a validation funnel:

1. pure/module tests for the changed contract;
2. route/action/DB tests for affected integration points;
3. browser or SSR proof for visible UI;
4. mandatory repository checks from the ticket.

For verbose commands, retain full output in a temporary gitignored harness or
log only while debugging. Return to the conversation:

- exit code;
- failing test names;
- exact error;
- a small amount of surrounding context.

Delete temporary logs and harnesses before the final report.

## Incremental Code Quality

Every executor applies a zero-debt budget to the touched area:

- search for an existing equivalent before creating a file or abstraction;
- inspect callers before changing or removing an export;
- remove an obsolete path in the same diff when behavior is replaced;
- keep compatibility paths only when the ticket names the requirement;
- run targeted lint on changed TypeScript/JavaScript files when applicable;
- report any retained duplication or compatibility branch with its reason.

Do not run broad automatic deletion tools or `--fix` across the repository.
The measured baseline and future analyzer rollout are documented in
`docs/INCREMENTAL_CODE_QUALITY.md`.

## Documentation Hygiene

- `CLAUDE.md`: concise map and universal commands only.
- `AGENTS.md`: permanent supervision and safety rules only.
- `docs/ARCHITECTURE_DECISIONS.md`: durable technical decisions.
- domain/spec documents: reusable product and contract knowledge.
- `.agents/current_task.md`: ticket-specific instructions.
- `.agents/claude_report.md`: ticket-specific evidence and limitations.

Do not move one-off debugging details into permanent instructions.

## Session Hygiene

- Keep the conversation while a ticket is active.
- Prefer `/clear` after a ticket passes the Safe `/clear` Gate.
- Use the active ticket files as source of truth over conversational memory.
- Rename sessions only if it helps human navigation; it is optional.
- Check context/usage periodically in Claude Code.
- When context becomes large, first write durable state to the correct file,
  then compact only if needed to continue the same task.
