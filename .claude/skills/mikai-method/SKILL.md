---
name: mikai-method
description: The MikAI Production Lab working method — how a ticket is supervised, proven and closed. Load at the start of any ticket, review, migration, refactor or bug fix in this repository, and before spawning mikai-executor. Covers the net-before-code discipline, mutation proof, migration safety, verification against real data, and when to stop instead of guessing.
---

# The MikAI method

`CLAUDE.md` says **who** does what and **which** protocol is active. This skill
says **how the work is done**. If the two ever disagree, `CLAUDE.md` wins — it
carries the user's decisions, this file carries technique.

Everything below was learned here, on this repository, from work that failed
before it worked. The examples are real and the commits exist.

---

## 1. The net comes before the code

**Write the characterization test first, then touch the code.** Not after, not
"if time allows".

A characterization test records what the code **does**, not what it should do.
When behaviour looks wrong, the test still pins it as it is, and the finding
goes in the report. A correction is a separate ticket, with the net already in
place — that is the whole point of the order.

Sometimes the net cannot come first: code inlined in a Server Component is
callable by nothing. Then the order is **mechanical extraction proven by
`tsc`, then the net**. Say so plainly in the report; do not pretend the
extraction was proven by tests.

## 2. A green test proves nothing until you break the code

**Mutation is the standard of proof here.** Change the code so the behaviour is
wrong, watch a test fail, restore. If nothing fails, the net is decoration.

This is not ceremony. It has caught real gaps in this repository:

- `updateShot` stopped writing `camera_pitch` — correct, and **358 tests still
  passed**. One line reinstated would have wiped the only trace of camera angle
  on 88 shots, with no error at all. The test exists because the mutation
  proved it was missing.
- Reversing a sort order, collapsing a count to a constant, disabling a
  confinement guard, accepting a one-sided interval — each was tried, and each
  had to make a test fail before the work was accepted.

Report which mutations were run and how many tests each one broke.

## 3. Verify against the real data, not against examples

Examples confirm what you already believe. Real rows do not.

Run the new code over the actual database — **read-only, on a consistent
snapshot** (`better-sqlite3`'s `db.backup()`, never a plain file copy: the main
`.db` without its WAL is a stale view, and that mistake has already produced a
count of 139 rows where there were 118, and a list of 9 projects where there
were 6).

This is how the false intervals were found: five shots reading
`"MS - Medium Shot of Max on phone call"` were being parsed as a start-to-end
interval, and no invented example had shown it.

## 4. Migrations are never applied automatically

The user runs `db:migrate`. Always. Generate, paste the **complete** SQL in the
report, and wait.

Before the user runs it, check for the traps:

- **A rename must be declared as a rename.** `drizzle-kit` asks interactively,
  and the wrong answer emits a `DROP`. It has already offered to rename
  `framing` into `camera_subject`, having paired one dropped column against
  four new ones. **Split the change into passes** so only one pairing is
  possible: the rename alone first, the additions after.
- **No TTY, no guessing.** If the prompt cannot be answered in this
  environment, stop and hand it to the user rather than hand-write a migration
  around it.
- **Grep the generated file for `DROP`** before showing it.
- **A migration is the worst place for a judgement.** Only deterministic data
  moves belong there. Anything needing a human stays untouched, to be handled
  later under review, where it can be redone.
- The app is broken between generate and migrate. Say so, and tell the user not
  to run it in the meantime.

## 5. There is no DOM test harness, and that is a decision

No `jsdom`, no `testing-library`. Vitest runs in `node`. The user decided this
and reconfirmed it.

Consequences, and they are binding:

- **nothing that carries state moves** — no `useState`, `useEffect`, `useRef`,
  `useMemo`, no handler body leaves its file. Only JSX is extracted, into
  components taking props, so `tsc` checks the whole seam;
- prefer a form the platform can do without state: `<input list>` plus
  `<datalist>` over a stateful combobox, CSS-only tooltips over JS ones, Server
  Components over client ones;
- **rendering is verified in a real browser**, with Playwright against the
  running dev server, and the report says what was seen.

Do not install a harness to work around this. If one is ever needed, it is
scoped to a single file the user has decided to refactor.

## 6. Stop rather than guess

Handing back incomplete work with a clear reason is **correct behaviour**, and
is preferred to finishing on an assumption.

Stop and say so when: an interactive prompt cannot be answered safely; a
ticket's premise turns out to be false; a file needs more than the ticket
allows; deleting a row would orphan a file; a vocabulary cannot classify a real
value. Never invent a direction the data does not state — `tracking` is not
`truck left`, and `dolly` is not `dolly in`.

## 7. Files are not deleted casually

Before removing rows or files: look at the target, verify ownership, and never
act on a bare id.

- distinguish a **file the row owns** from a **provenance snapshot** of another
  row's file, by reading the code that *writes* the column — never by its name;
- never unlink a path a surviving row still references;
- confinement is a hard refusal, not a warning: an unconfined path aborts the
  whole operation, naming the row;
- back up first with `npm run backup:create`, and verify it.

## 8. Length is not a defect

Measure before proposing a refactor. It is cheap, and it has changed the plan
more than once:

- splitting a 1109-line page presentationally gained **42 lines**, because only
  a fifth of it was render. The measurement produced the useful ticket, which
  was the server-side resolution;
- the eight largest client files carry about 10 000 lines of state and have
  between **1 and 17 commits** in three months, with at most one fix each.
  Nobody touches them, so netting them buys nothing today.

A net pays the day the code is modified. Code nobody opens costs nothing —
whereas a 2 200-line document a reading contract forces open costs on every
visit. Optimise where something forces the reading.

## 9. Scope, and the end of a ticket

The ticket is the contract. No opportunistic change, no drive-by rename, no
reformatting. Search for an existing equivalent before creating a file, an
export or an abstraction — `src/lib/referenceImageRoles.ts` was the precedent
for the camera vocabulary, and following it kept engine knowledge out of the
catalogue.

Before handing back:

- `npx tsc --noEmit`, `npm run build`, the **whole** suite, targeted lint;
- the baseline test count is stated in the ticket and must be matched exactly —
  no existing assertion changed;
- temporary scripts and harnesses removed;
- nothing staged, committed or pushed;
- the report is honest: what was inferred rather than instructed, what was left
  undone and why, and every behaviour the net froze that looks wrong.

That last list is usually the most valuable thing a ticket produces.

### And after the push, close the status in the same breath

A commit does not close a ticket. Three files carry its status, they go stale
together, and a session that reads them afterwards has no way to know they lie:

- `.agents/supervised_task.md` — replaced by the next ticket, or by an explicit
  "no active ticket". A shipped ticket left here **will** be re-run;
- `docs/ROADMAP.md` — the item leaves "En cours"; if nothing replaces it, that
  section says so rather than describing finished work;
- `docs/PROJECT_STATE.md` — what shipped, and what it cost to learn.

Written on 2026-08-22, after all three were found describing a ticket that had
been committed, pushed and migrated hours earlier. Nothing in the repository
would have caught it: no test reads a roadmap.

## 10. The workspace is tested before a bespoke solution is designed

A need that involves an LLM-assisted operation is tested against the LLM
Workspace **before** any technical solution is drawn. Three answers, and the
ticket carries the one that applies:

- **covered as is** — an existing descriptor, an existing variable, an existing
  action. The work is authoring, not development;
- **covered by adding one named brick** — the format cannot express something
  the need requires. That brick is the ticket. `B16a` is the precedent: the
  multimodal capability already existed and was hardened, but the descriptor
  format could not declare an image input, so the format grew. The operation
  was never dropped for want of a format;
- **out of scope** — with the reason stated. This is a legitimate answer and
  must stay one. A rule that only accepts "yes" turns into a shoehorn, and a
  workflow forced into a descriptor it does not fit costs more than the bespoke
  screen it replaced.

The reference for the test is `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4 and §5,
already binding on any workspace ticket. §8 states the target this rule serves:
adding an assistant should mean writing a template, not an action plus a prompt
builder plus a panel.

This does not replace the UC1/UC2/UC3 question — that one fires once a ticket
is known to be a workspace ticket. This one fires earlier, and decides whether
it is.

## 11. Where things are

- the active ticket, under the Opus protocol: `.agents/supervised_task.md`
- the executor's report: `.agents/executor_report.md`
- current state: `docs/PROJECT_STATE.md` — 469 lines, readable in full
- workspace architecture: `docs/LLM_WORKSPACE_ARCHITECTURE.md`, sections 3 and
  4 are the live reference; section 11.3 holds the queue
- product vision, binding on any LLM Workspace ticket:
  `docs/LLM_WORKSPACE_PRODUCT_VISION.md` sections 4 and 5
- `docs/archive/` — finished planning. **Never read as background.**
- `docs/USER_FEEDBACK.md` — an idea box, never a development input.
