@AGENTS.md

# MikAI Production Lab - Context Map

Keep this file short. It is a map, not the repository encyclopedia.

## Active Supervision Protocol — Opus

The **Opus protocol** (`.agents/SUPERVISION_PROTOCOL.md`) is the one in force.
The user decided this; only the user changes it, by editing this section.

This line is the only thing that carries the decision across a `/clear`. Do not
infer the active protocol from whichever ticket file happens to exist, and do
not infer it from a ticket's own wording.

Under it:

- the ticket lives in `.agents/supervised_task.md` — never `current_task.md`;
- the `mikai-executor` subagent implements; the main thread supervises and does
  not implement the ticket itself;
- artifacts are `.agents/executor_report.md`, `.agents/supervisor_review.md`,
  `.agents/supervisor_verdict.json`;
- a ticket sitting in `.agents/current_task.md` is a protocol mismatch: say so
  and ask the user, do not silently implement it.

## Start Here

1. Read `.agents/supervised_task.md`.
2. Read only the permanent documents required by `AGENTS.md`.
3. Follow ticket-specific links from the ticket; do not scan all `docs/`.
4. Use `docs/AGENT_CONTEXT_STRATEGY.md` for context and token discipline.
5. If the active ticket is already recorded as committed and pushed, stop and
   wait for a replacement ticket. Never re-run a closed ticket.

## After `/clear`

`/clear` removes conversation history, not repository instructions — but it
does remove every protocol decision taken in conversation. Reload this file,
`AGENTS.md`, and the ticket file named by the active protocol above. The ticket
is the active contract; durable product knowledge lives in `docs/`.

Use this restart prompt:

```text
Supervise the active ticket in .agents/supervised_task.md.
Active protocol: Opus — see the Active Supervision Protocol section of CLAUDE.md.
Spawn mikai-executor to implement it; do not implement it yourself.
Follow CLAUDE.md and AGENTS.md.
Do not commit or push before an explicit user go.
```

## Domain Map

- Product state and roadmap: `docs/PROJECT_STATE.md`, `docs/ROADMAP.md`
- Architecture and durable decisions: `docs/ARCHITECTURE_DECISIONS.md`
- Supervision workflow: `docs/DEVELOPMENT_WORKFLOW.md`
- User observations: `docs/USER_FEEDBACK.md` — **idea box, not a development
  input.** Never read it to decide what to build; see `AGENTS.md`.
- Project Style: `docs/PROJECT_STYLE_EXECUTION_PLAN.md`
- Generation / ComfyUI: `src/lib/comfy/`, generation actions, `/api/jobs`
- Storyboard / Sequence video: `src/lib/sequenceVideoSplit/`, related actions
- Camera Lab: `src/lib/cameraLab/`, Camera Lab actions and components
- Editorial / OpenReel: `src/lib/editorial/`, editorial actions and routes

## Commands

```text
npx tsc --noEmit
npm run build
npm run db:generate
git diff --check
```

Run targeted tests first. Broaden validation according to risk and the ticket.

## Definition Of Done

- ticket scope implemented without opportunistic changes;
- existing equivalents searched before creating files or abstractions;
- replaced paths removed in the same diff unless compatibility is required;
- every new file, export, helper, and package has a real use;
- no new avoidable duplication, cycle, orphan, or untracked TODO;
- touched modules are no more indebted than before the change;
- targeted behavior and failure paths validated;
- changed TypeScript/JavaScript files pass targeted lint when applicable;
- required static checks pass;
- temporary harnesses/processes cleaned up;
- the active protocol's executor report updated honestly
  (`.agents/executor_report.md` under the Opus protocol);
- no staging, commit, or push before a fresh approval — an explicit user go
  under the Opus protocol, a Codex verdict under the Codex protocol.
