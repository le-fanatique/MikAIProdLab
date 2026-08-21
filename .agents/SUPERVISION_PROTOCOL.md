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

### Arbitration — who implements

The user's rules, recorded here so they survive a `/clear`. The supervisor owns
this arbitration and makes it itself; it does not hand the question back to the
user.

**Default: the executor implements.** The supervisor's job is to prepare the
ticket well enough that a cheaper model cannot go wrong — frozen contracts,
named files, explicit checks, no invention left to the executor. A ticket vague
enough to be misread is a supervisor failure, not an executor failure.

**But the supervisor must anticipate the executor's risk on the task at hand.**
When the speed / risk / cost balance turns bad, it says so and implements the
work itself rather than spending the user's money on a result it will have to
redo.

The deciding test is the one already in section 2: **can the ticket state a
check that proves it correct?**

- Work with such a check is executor work. Its error is caught the same day.
- Work with no such check has no safety net. A wrong answer looks plausible and
  surfaces two tickets later, in code built on top of it. That work belongs to
  the supervisor.

**Risk is not proportional to volume — often the inverse.** High-volume,
repetitive, provable work is exactly where the cost gap pays, and where the
supervisor's tokens would be wasted on transcription. Small, one-shot,
contract-defining work is cheap in tokens and expensive to get wrong.

A ticket straddling both natures is **split along that line**, one half each.
The supervisor states the arbitration and its reason to the user, and shows any
frozen contract before dependent work starts — the user must see a contract
that a whole phase inherits, not discover it three tickets later.

Worked example: `LLMW.DESCRIPTOR.FORMAT.1` (B1). The descriptor format, the
closed variable registry and the `context.userAdjustable` decision change no
production path, so no test can fail if they are wrong — supervisor. The eight
per-action descriptors are volume work proven by an equality check against what
each action assembles today — executor.

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

  **Option in force for the Chantier 1 queue — decided by the user 2026-08-17.**
  A **standing go**: the supervisor commits and pushes each ticket it approves,
  after re-running the checks itself. It stops and asks the user only for:

  1. a known regression that would ship with the commit;
  2. a product decision (behaviour, naming, repository policy);
  3. a schema, migration or dependency authorization;
  4. two failed corrective rounds, or a blocker that changes the ticket's scope.

  Paid browser validation is **not** on that list: the user authorized it in
  advance, on the condition that it always runs against a **throwaway project
  the supervisor creates and deletes**, with the cost reported. Engine-only
  tickets need none.

  This standing go covers the Chantier 1 queue (`docs/LLM_WORKSPACE_ARCHITECTURE.md`
  §11.3). It is not a blanket authorization for anything else, and it lapses
  when that queue ends.

  **Extended 2026-08-18, when the queue was re-derived as B12 → E1 → B15 → B16
  → B13 → B14 → B20.** The user will **review Chantier 1 as a whole, at its
  end** — not ticket by ticket. So the supervisor **chains tickets**: on
  approving one it commits, pushes, writes the durable documentation, prepares
  the next and starts it, without waiting for a per-ticket user validation.
  The four interrupt cases above are unchanged and remain the only reasons to
  stop.

  Two of them will fire by construction and are not failures: **case 3**
  (schema) on B12a and B15, since the user generates nothing automatically and
  runs `db:migrate` himself — the supervisor generates the migration, shows him
  the SQL, and waits. Queue design should therefore put a schema change at a
  **ticket boundary**, never in the middle of one.
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

## 9. Two Conversations, One Working Tree

**The user decided on 2026-08-21 that two developments may run in parallel**,
in two Claude Code conversations, against the same checkout. This section is
what keeps them from overwriting each other; the live occupancy — who owns
which paths right now — lives in `.agents/parallel_lanes.md`, which is
gitignored because it is true only while the lanes are open.

**Claim before you start, clear when you finish.** A stale lane is worse than
no lane: it makes an idle path look occupied. Two lanes maximum — past that,
`git status` stops being usable as a review surface.

What genuinely cannot be shared:

- **The ticket files are single-occupant.** This protocol has one
  `.agents/supervised_task.md`, and overwriting it destroys the other lane's
  contract. The same holds for `executor_report.md`, `supervisor_review.md`
  and `supervisor_verdict.json`. A second lane either does work the supervisor
  carries itself without a ticket, or the user opens it a ticket file under
  another name, explicitly.
- **One `mikai-executor` at a time.** Two executors on one tree write files
  without seeing each other, and neither report can be verified afterwards.
- **Staging is explicit, always.** Never `git add .`, never `git add -A`, never
  a path outside your lane. This is the only real protection, and it is what
  held on the first parallel run.
- **A full suite run includes the other lane's in-flight work.** A red is not
  necessarily yours, and a green does not mean your neighbour is finished.
  Check `git status` before concluding.
- **Mutation proof stays allowed**, on one condition: restore with
  `git checkout -- <path>` and verify the checksum before and after. Never
  mutate a file the other lane has modified — there is no clean version to
  return to.
- **`docs/` shares badly.** Two lanes writing `PROJECT_STATE.md` or
  `ROADMAP.md` produce a silent conflict, since neither re-reads the whole file
  before writing. Whoever wants it says so in the lane board first.

## 10. Escalation To The User

The supervisor stops and asks when:

- the ticket needs a decision that is the user's to make (repository policy,
  product behaviour, naming);
- an authorization is missing (schema, migration, dependency);
- two corrective rounds have failed;
- the executor reports a blocker that changes the ticket's scope.

Everything else is decided by the supervisor without interrupting the user.
