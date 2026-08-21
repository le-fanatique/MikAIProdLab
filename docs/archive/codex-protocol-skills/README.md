# Codex-era ticket skills — archived

**Archived 2026-08-21. These are no longer skills.** They were moved out of
`.claude/skills/` so they stop being listed, and are kept as plain documents in
case the user ever returns to Codex supervision.

Three files: `implement-ticket.md`, `validate-ticket.md`, `close-ticket.md`.

## Why they were retired

They were written for the **Codex protocol**, dormant since the user switched
to Opus. They name paths and gates that the protocol in force does not use:

| they say | the Opus protocol uses |
| --- | --- |
| `.agents/current_task.md` | `.agents/supervised_task.md` |
| `.agents/claude_report.md` | `.agents/executor_report.md` |
| `.agents/codex_verdict.json` | an explicit user go |

An agent following them would have looked for a ticket file that no longer
holds the ticket, and waited on a verdict nobody writes. `CLAUDE.md` already
states that a ticket sitting in `current_task.md` is a protocol mismatch.

## What replaced them

`.claude/skills/mikai-method` — the working method, loaded as step 0 of
`CLAUDE.md`'s Start Here and by the `/clear` restart prompt. It covers what
these three covered, in the protocol actually in force, plus what was learned
since: mutation as proof, migration safety, verification against real data, and
when to stop rather than guess.

## Bringing one back

Restoring supervision to Codex is the user's decision, and requires updating
`CLAUDE.md`, `AGENTS.md` and section 0 of `.agents/SUPERVISION_PROTOCOL.md`
together. If that ever happens, copy the file back to
`.claude/skills/<name>/SKILL.md` — and reconcile it with `mikai-method` first,
rather than running both.
