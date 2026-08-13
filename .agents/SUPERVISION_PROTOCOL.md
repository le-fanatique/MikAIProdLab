# Opus Supervision Protocol

A second, self-contained supervision loop running entirely inside one Claude
Code session: **Opus supervises, Sonnet executes.**

Date: 2026-08-13.

## 0. Status — active

This protocol is **the one in force**, by the user's decision. `CLAUDE.md` says
the same, in its `Active Supervision Protocol` section, and that is the copy
loaded automatically at the start of every session — including after a
`/clear`. Both must be edited together if the user switches protocols.

Consequence, stated once because it was ambiguous after a reset: the ticket
lives in `.agents/supervised_task.md`, the `mikai-executor` subagent
implements, and the main thread supervises without implementing. A ticket found
in `.agents/current_task.md` while this section says `active` is a mismatch to
raise with the user, not to implement.

## 1. Boundary With The Codex Protocol

This protocol **does not replace** the Codex protocol defined in `AGENTS.md`.
It runs beside it, on its own files, so the two never collide.

| Concern | Codex protocol | This protocol |
| --- | --- | --- |
| Ticket | `.agents/current_task.md` | `.agents/supervised_task.md` |
| Executor report | `.agents/claude_report.md` | `.agents/executor_report.md` |
| Review | `.agents/codex_review.md` | `.agents/supervisor_review.md` |
| Verdict | `.agents/codex_verdict.json` | `.agents/supervisor_verdict.json` |
| Supervisor | Codex (external tool) | Opus (main thread, this session) |
| Executor | Claude Code / Cline | `mikai-executor` subagent (Sonnet) |

Codex remains the user's main supervisor for product, UX, architecture,
roadmap and final arbitration. Nothing here overrides that.

## 2. When To Use This Protocol

Use it for tickets that are **mechanical and fully specified**:

- repository hygiene, file moves, module splits;
- deletion of proven-orphan code;
- inventory and documentation work;
- narrowly scoped, contract-free refactors.

Do **not** use it for:

- anything defining or changing a product contract;
- schema, migration or dependency changes, unless the ticket carries an
  explicit written authorization;
- UI feature work requiring user validation;
- ComfyUI, generation runtime, job runner, polling, `SequencePreviewPlayer`
  or OpenReel core;
- work whose correctness depends on judgement rather than on a check.

The test: **if the ticket cannot state a check that proves it correct, it does
not belong in this protocol.**

## 3. Roles

### Supervisor (Opus, main thread)

Owns the ticket, the review, and the verdict. Never delegates judgement.

1. Writes `.agents/supervised_task.md` — one ticket, in French, following the
   shape of `.agents/templates/current_task.md`.
2. Establishes the **baseline**: `git status --short` and `git diff --stat`
   before the executor starts. Without a baseline, pre-existing drift cannot
   be told apart from the executor's work.
3. Spawns `mikai-executor`.
4. Reviews the result with separate checks — `git status`,
   `git diff --stat`, `git diff` — and independently re-runs the ticket's
   validation commands rather than trusting the report.
5. Writes `.agents/supervisor_review.md` and `.agents/supervisor_verdict.json`.
6. On `REVISE`, re-spawns the executor with a corrective ticket. After two
   failed rounds, implements the correction directly or escalates to the user.

### Executor (`mikai-executor`, Sonnet)

Implements one ticket and stops. Never stages, commits, or pushes.
Definition: `.claude/agents/mikai-executor.md`.

## 4. Loop

```
Supervisor: write .agents/supervised_task.md
Supervisor: capture baseline (git status --short, git diff --stat)
      |
Executor:   implement + run the ticket's checks
Executor:   write .agents/executor_report.md, stop
      |
Supervisor: independent review + independent re-run of the checks
      |
      +-- REVISE  -> corrective ticket, re-spawn (max 2 rounds)
      +-- APPROVED -> verdict written, hand to the user for commit
```

## 5. Gates

- **The executor never stages, commits, or pushes.** Not once, not for a
  trivial ticket.
- **The supervisor never commits on its own verdict alone.** A commit requires
  either the user's explicit go, or a Codex verdict, per the option the user
  chose for the current phase.
- **Never `git add .`.** Explicit paths only.
- **No schema, migration or dependency change** without written authorization
  in the ticket body.
- Never commit DB runtime, uploads, outputs, storage, `.next`, `dist`, or logs.

## 6. Verdict Format

`.agents/supervisor_verdict.json`:

```json
{
  "verdict": "APPROVED | REVISE | BLOCKED",
  "safeToCommit": true,
  "ticket": "TICKET.CODE.1",
  "supervisor": "opus",
  "reviewedFiles": ["path/to/file.ts"],
  "excludedFiles": ["pre-existing drift to leave unstaged"],
  "checksRerun": ["npx tsc --noEmit", "npm run db:generate"],
  "summary": "One honest sentence: what was approved and what to stage."
}
```

`reviewedFiles` is the staging list. `excludedFiles` names pre-existing drift
that must stay unstaged — it is what protects the user's unrelated work in a
dirty tree.

`checksRerun` records what the **supervisor** ran, not what the executor
claimed. If a check was not re-run, it does not appear.

## 7. Honesty Rules

These are the reason the protocol exists at all. A supervision loop that
launders an executor's optimism is worse than no loop.

- The supervisor re-runs the checks. It does not approve on the strength of a
  report.
- A failed check is reported with its real output, never summarised as a
  success.
- A skipped step is stated as skipped.
- An under-specified ticket is answered with a blocked report, never with an
  invented contract, field name, or behaviour.
- A finding requires a credible execution or maintenance path. No speculative
  cleanup findings.

## 8. Language

Following `AGENTS.md`: the ticket body is written **in French**, because it is
a prompt for Claude. MikAI UI labels, tooltips, messages and errors remain in
**English**. This protocol document and the verdict file are in English, like
`AGENTS.md`.

## 9. Escalation To The User

The supervisor stops and asks when:

- the ticket needs a decision that is the user's to make (repository policy,
  product behaviour, naming);
- an authorization is missing (schema, migration, dependency);
- two corrective rounds have failed;
- the executor reports a blocker that changes the ticket's scope.

Everything else is decided by the supervisor without interrupting the user.
