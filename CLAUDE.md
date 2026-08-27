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

**No chained queue is running — updated 2026-08-27.** Chantier 1 finished on
2026-08-20 (`docs/PROJECT_STATE.md`), and until 2026-08-27 this section still
described its queue B12 → E1 → B15 → B16 → B13 → B14 → B20 as live, telling a
fresh session to chain tickets *without waiting*. That instruction was a week
stale and is removed.

**The rule is one ticket at a time, and an explicit user go before each
commit.** Do not prepare or start the next ticket on your own initiative;
after a push, close the status in the three files (`mikai-method` §9) and
stop. If a future chantier is to run chained again, the user says so by
rewriting this paragraph — nothing else may reinstate it.

**Migrations are never applied automatically**, chained or not: generate, show
the user the SQL, and wait for him to run `db:migrate`. The four interrupt
cases in `.agents/SUPERVISION_PROTOCOL.md` §5 still apply.

## Start Here

0. **Invoke the `mikai-method` skill.** It is the working method — net before
   code, mutation as proof, migration safety, verification against real data,
   when to stop instead of guessing. Load it at the start of any ticket,
   review, migration, refactor or bug fix, and before spawning
   `mikai-executor`. This section says who does what; the skill says how.
   Its body is not resident, so loading it costs nothing until it is needed.
1. **Avant de concevoir quoi que ce soit : tester le besoin contre le LLM
   Workspace.** Tout besoin qui implique une opération assistée par LLM —
   proposer, rédiger, analyser, ajuster un champ — se teste d'abord contre le
   workspace, et le ticket porte la réponse : couvert tel quel par un
   descripteur existant ; couvert en ajoutant une brique nommée ; ou hors
   périmètre, avec la raison. Le troisième cas est une réponse légitime : la
   règle interdit de ne pas poser la question, pas de répondre non. Le skill
   `mikai-method` §10 dit comment mener le test.
2. Read `.agents/supervised_task.md`.
3. Read only the permanent documents required by `AGENTS.md`.
4. Follow ticket-specific links from the ticket; do not scan all `docs/`.
5. Use `docs/AGENT_CONTEXT_STRATEGY.md` for context and token discipline.
6. If the active ticket is already recorded as committed and pushed, stop and
   wait for a replacement ticket. Never re-run a closed ticket.

## After `/clear`

`/clear` removes conversation history, not repository instructions — but it
does remove every protocol decision taken in conversation. Reload this file,
`AGENTS.md`, and the ticket file named by the active protocol above. The ticket
is the active contract; durable product knowledge lives in `docs/`.

Use this restart prompt:

```text
Invoke the mikai-method skill.
Supervise the active ticket in .agents/supervised_task.md.
Active protocol: Opus — see the Active Supervision Protocol section of CLAUDE.md.
Spawn mikai-executor to implement it; do not implement it yourself.
Follow CLAUDE.md and AGENTS.md.
Do not commit or push before an explicit user go.
```

## Domain Map

- Product state and roadmap: `docs/PROJECT_STATE.md`, `docs/ROADMAP.md`
- **LLM Workspace user vision: `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4 and
  §5 — mandatory reading for any LLM Workspace ticket, and the acceptance
  reference: a design that cannot express all three founding use cases is the
  wrong design. Terms in `AGENTS.md` § Context policy.**
- **Which module owns which decision: `docs/WHERE_THE_RULES_LIVE.md`** — open
  it before concluding that a mechanism is missing. The schema describes
  entities, not rules, and this repository puts each rule in one extracted
  module on purpose. Three wrong conclusions in one audit, 2026-08-24, are why
  this line exists.
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
  under the Opus protocol, a Codex verdict under the Codex protocol;
- **after the push, the ticket's status is closed in the same breath** — in
  `.agents/supervised_task.md`, `docs/ROADMAP.md` and `docs/PROJECT_STATE.md`.
  All three go stale together, and a stale ticket file gets the work re-run.
  Why, and what each one must say: `mikai-method` §9.
