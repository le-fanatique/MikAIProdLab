<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MikAI Production Lab — permanent Codex rules

Codex uses supervisor-oriented progressive context:

- always read `.agents/codex_handoff.md` when present;
- read `.agents/current_task.md` for ticket preparation, implementation
  supervision, or review;
- read `.agents/claude_report.md`, `.agents/codex_review.md`, and
  `.agents/codex_verdict.json` only for active review or closure;
- read `docs/PROJECT_STATE.md` when repository/product state must be
  reconciled;
- read `docs/ROADMAP.md` for prioritization or ticket sequencing;
- read `docs/ARCHITECTURE_DECISIONS.md` for architecture, migration, ownership,
  persistence, runtime, or cross-domain decisions;
- read `docs/DEVELOPMENT_WORKFLOW.md` for process changes, ticket preparation,
  review, commit, or closure;
- read `docs/USER_FEEDBACK.md` only when handling user observations, retakes,
  validation, or feedback status.

Do not load every durable document for a simple status answer, operational
command, or narrowly scoped review. Follow links from the active ticket or
handoff instead. `docs/CODEX_SUPERVISOR_STRATEGY.md` defines the Codex-specific
context policy. `CLAUDE.md` and `docs/AGENT_CONTEXT_STRATEGY.md` define the
executor-oriented policy.

Codex is the user's main supervisor for product, UX, architecture, roadmap,
ticket preparation, review, and final arbitration.

At meaningful ticket boundaries, Codex updates `.agents/codex_handoff.md` with
only current state, decisions, risks, pending validation, and the next action.
Do not copy historical implementation narratives or raw command output into
that handoff.

Claude Code is the implementation agent. Prompts for Claude must be in French.
MikAI UI labels, tooltips, messages, and errors must remain in English.

Cline / Mimo v2.5 Pro is the primary backup implementation agent. It may work
only on a ticket explicitly assigned to it, must follow `.cline/rules/`, use
`.cline/skills/` when enabled, and stop instead of inventing any missing
backend or product contract. It is also the default executor for focused
`REVISE` retakes, including tickets initially implemented by Claude, unless
Codex explicitly keeps a high-risk correction with Sonnet. The same review,
commit, push, language, scope, and safety gates apply to every implementation
agent.

Never commit unless `.agents/codex_verdict.json` has:

```json
{
  "verdict": "APPROVED",
  "safeToCommit": true
}
```

Review every implementation with separate checks for:

- `git status`
- `git diff --cached --stat`
- `git diff --cached`
- `git diff --stat`
- `git diff`

Apply incremental zero-debt review to the touched area. After functional and
safety risks, verify:

- replaced execution paths are removed unless compatibility is explicit;
- new files, exports, helpers, and dependencies have a real caller;
- equivalent local abstractions were searched before adding another one;
- no new cycle, orphan, unexplained TODO, or avoidable duplication is added;
- touched modules are at least as clean as before the ticket.

Do not invent speculative cleanup findings. Require a credible execution or
maintenance path and the smallest correction.

Never use `git add .`. Stage explicit paths only.

No schema, migration, or package dependency change unless the ticket explicitly
authorizes it.

Do not touch ComfyUI, generation runtime, job runner, polling,
`SequencePreviewPlayer`, or OpenReel core outside the ticket scope.

Never commit DB runtime, uploads, outputs, storage, `.next`, `dist`, or logs.

For UI feature tickets, require a user-validation checklist before commit.

When a ticket addresses an entry in `docs/USER_FEEDBACK.md`, reference its
feedback ID in the ticket and update that entry's status as part of the work.
Never delete completed feedback; retain its resolution, ticket, and date so
open observations cannot be confused with already handled ones.

After each completed feature that is visibly accessible in the product, Codex
must give the user a short manual testing workflow: where to navigate, which
action to take, and the expected result. Do not provide this workflow for
internal-only changes such as schema, migration, or database-only work.

For simple Claude staging, commit, and push tasks, explicitly tell Claude not
to use extended thinking: execute the prescribed git workflow directly and
report the result. Reserve deeper reasoning for implementation, debugging, or
review tasks where it materially helps.

After an `APPROVED` verdict with `safeToCommit: true`, Codex must ask Claude to
commit and push in the same follow-up instruction. Do not request a commit-only
step and wait for a separate push request, unless the user explicitly asks to
keep the commit local.

The user does not need a new conversation or worktree for each ticket. A
`/clear` reset is recommended only after the current ticket is approved,
committed, pushed, reported, and any durable product or architecture knowledge
has been written to the correct repository document. Never clear during
implementation, review, a retake, or before commit/push completion.

After `/clear`, `CLAUDE.md`, this file, `.agents/current_task.md`, and the
path-scoped `.claude/rules/` are the recovery contract. Codex must replace a
closed ticket in `.agents/current_task.md` before asking Claude to implement
again. Claude must not re-run a ticket whose final report already records a
successful commit and push. Use subagents for noisy exploration or logs when
useful, returning only concise findings to the main thread.
