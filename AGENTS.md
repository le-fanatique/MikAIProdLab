<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MikAI Production Lab — permanent agent rules

Injected into every conversation, so it holds only what binds **every** agent
whichever protocol runs. Anything tied to one protocol, role or phase belongs
in a document read when that phase starts.

## Status — Codex supervision is dormant

The user has switched supervision to the **Opus protocol**
(`.agents/SUPERVISION_PROTOCOL.md`, section 0; `CLAUDE.md`, section
`Active Supervision Protocol`). Codex currently holds **no active role**: it
prepares no ticket, writes no review, and issues no verdict.

While this status holds:

- the ticket lives in `.agents/supervised_task.md`, not `current_task.md`;
- the commit gate is an explicit user go, not `.agents/codex_verdict.json`.

**Nothing was deleted.** The Codex protocol — its context policy, its handoff
discipline, the `codex_verdict.json` commit gate, the five-check review pass
and the closure rules — moved verbatim to
`docs/CODEX_SUPERVISOR_STRATEGY.md`, section "Dormant — the Codex supervision
protocol", on 2026-08-23. It was resident in this file at every conversation
while applying to nothing. Switching back is the user's decision, and requires
updating this section, `CLAUDE.md`, and section 0 of
`.agents/SUPERVISION_PROTOCOL.md` together — plus carrying the workspace test
(`CLAUDE.md` § Start Here) into whatever prepares tickets.

## Context policy

Progressive context. Do not load every durable document for a simple status
answer, an operational command, or a narrowly scoped review. Follow the links
from the active ticket instead.

- **Always read `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4 and §5 before
  preparing, implementing, or reviewing any LLM Workspace ticket.** Both are
  acceptance references: §4 holds the three founding use cases in the user's
  own words, §5 the prompt mechanics (ingredients, jars, recipes), binding on
  anything that assembles, generates, stores or formats a prompt. Such a ticket
  states which of UC1/UC2/UC3 it brings closer, which it constrains, and which
  it leaves untouched. "None" is acceptable; not asking is not. What the
  omission of this contract cost until 2026-08-15 is recorded in that file's
  own "Reachability" section — read it before arguing the rule is heavy.
- **`docs/WHERE_THE_RULES_LIVE.md` before asserting that a mechanism, a field
  or a rule does not exist** — in a review, an audit, or a ticket's premise.
  The entity schema does not carry rules; this repository puts each one in a
  single extracted module, and a dozen of them exist because a rule had been
  written twice. Claiming a gap without opening this file is how three wrong
  conclusions reached a document on 2026-08-24;
- `docs/PROJECT_STATE.md` when repository/product state must be reconciled;
- `docs/ROADMAP.md` for prioritization or ticket sequencing;
- `docs/ARCHITECTURE_DECISIONS.md` for architecture, migration, ownership,
  persistence, runtime, or cross-domain decisions;
- `docs/DEVELOPMENT_WORKFLOW.md` for process changes, ticket preparation,
  review, commit, or closure.

`CLAUDE.md` and `docs/AGENT_CONTEXT_STRATEGY.md` define the executor-oriented
policy. `docs/CODEX_SUPERVISOR_STRATEGY.md` defines the Codex-specific one.

## `docs/USER_FEEDBACK.md` is an idea box, not a development input

Decided by the user on 2026-08-15. An entry in it is an observation awaiting
the user's arbitration — never a requirement, never a justification for a
ticket, never a reason to change code. Do not read it to decide what to build,
what to prioritise, or how to scope. Read it only when the user explicitly asks
about feedback, or to update an entry's status for a ticket they already
approved.

When an entry does become load-bearing for a chantier, its substance is copied
into that chantier's own document — as `docs/LLM_WORKSPACE_ARCHITECTURE.md`
§1.1 already does for the four entries the LLM Workspace rests on — so the
chantier stays self-contained and the 5 000-line idea box never has to be
opened to work on it.

When a ticket addresses an entry, reference its feedback ID in the ticket and
update that entry's status as part of the work. Never delete completed
feedback; retain its resolution, ticket, and date so open observations cannot
be confused with already handled ones.

## Agents and language

Claude Code is the implementation agent. Prompts for Claude must be in French.
MikAI UI labels, tooltips, messages, and errors must remain in English.

Cline / Mimo v2.5 Pro is the primary backup implementation agent. It may work
only on a ticket explicitly assigned to it, must follow `.cline/rules/`, use
`.cline/skills/` when enabled, and stop instead of inventing any missing
backend or product contract. The same review, commit, push, language, scope,
and safety gates apply to every implementation agent.

Use subagents for noisy exploration or logs when useful, returning only concise
findings to the main thread.

## Review, scope and safety — every agent, every protocol

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
After each completed feature that is visibly accessible in the product, give
the user a short manual testing workflow: where to navigate, which action to
take, and the expected result. Not for internal-only changes such as schema,
migration, or database-only work.

## `/clear`

The user does not need a new conversation or worktree for each ticket. A
`/clear` reset is recommended only after the current ticket is approved,
committed, pushed, reported, and any durable product or architecture knowledge
has been written to the correct repository document. Never clear during
implementation, review, a retake, or before commit/push completion.

After `/clear`, `CLAUDE.md`, this file, the ticket file named by the active
protocol, and the path-scoped `.claude/rules/` are the recovery contract. Never
re-run a ticket whose final report already records a successful commit and
push.
