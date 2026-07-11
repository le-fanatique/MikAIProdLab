# .agents/ — file-based Codex supervision loop

This directory is the mailbox between three participants working on this
repo:

- **Claude Code** (this extension) — the developer. Implements tickets,
  runs validation, writes `.agents/claude_report.md`.
- **Codex** (VS Code extension or CLI) — the reviewer. Reads the task and
  report, inspects the diff, writes `.agents/codex_review.md` and
  `.agents/codex_verdict.json`.
- **User** — the product arbiter. Only steps in when Codex's verdict is
  `NEEDS_USER`, via `.agents/user_arbitration.md`.

## Live files vs. templates

`.agents/templates/*` are committed — they're the blank forms every ticket
starts from. The **live** working files (`current_task.md`,
`claude_report.md`, `codex_review.md`, `codex_verdict.json`,
`claude_followup.md`, `user_arbitration.md`, directly under `.agents/`) are
**git-ignored** — they're per-ticket scratch state, regenerated/overwritten
every time, not a history worth keeping in the repo. If a review is worth
keeping as a permanent record, copy it into `docs/` by hand.

## The cycle

```
1. current_task.md      (Claude or user) — what this ticket is
2. claude_report.md     (Claude)          — what was actually done
3. codex_review.md +
   codex_verdict.json   (Codex)           — APPROVED | REVISE | NEEDS_USER
4a. REVISE   → claude_followup.md (Claude) → back to step 3
4b. NEEDS_USER → user_arbitration.md (user) → back to step 2 or 3
4c. APPROVED → Claude commits (only now, and only with safeToCommit: true)
```

**Claude never commits until `codex_verdict.json` says `"verdict":
"APPROVED"` and `"safeToCommit": true`.** If the verdict is `REVISE`,
Claude reads `claude_followup.md`'s target (the blocking issues in
`codex_verdict.json`), fixes them, and re-requests review — no commit in
between. If the verdict is `NEEDS_USER`, Claude stops completely and waits;
it does not guess.

## `NEEDS_USER` because context is missing

Codex can only review what's on disk. If `current_task.md` or
`claude_report.md` is missing, or `git diff` is empty, there is nothing to
validate — Codex's only correct verdict is `NEEDS_USER`, asking for the
missing piece. This is expected behavior, not a bug in the loop: it means
"ask a human to supply what's missing," never "guess and proceed."

## Getting started (manual workflow, today)

1. `npm run ai:init` — creates `.agents/current_task.md` and
   `.agents/claude_report.md` from the templates if they don't already
   exist (never overwrites without confirmation).
2. Fill in `current_task.md` with the ticket.
3. Claude implements the ticket and writes `claude_report.md`.
4. `npm run ai:review` — checks that both files exist and prints the
   exact prompt/commands to paste into Codex (CLI or VS Code extension)
   to get it to read this repo's `.agents/` state and produce
   `codex_review.md` + `codex_verdict.json`. This script does **not**
   invoke Codex itself — no Codex CLI integration has been tested yet
   (see `docs/SUPERVISION_LOOP_1_FILE_BASED_CODEX_REVIEW.md`'s "Future"
   section). Automating this call is a future ticket once the exact CLI
   invocation is confirmed working locally.
5. Read `codex_verdict.json`. Act per the cycle above.

## Verdict format (`codex_verdict.json`)

```json
{
  "verdict": "APPROVED | REVISE | NEEDS_USER",
  "summary": "",
  "blockingIssues": [],
  "nonBlockingNotes": [],
  "userArbitrationNeeded": false,
  "question": null,
  "options": [],
  "safeToCommit": false,
  "reviewedFiles": [],
  "validationChecked": []
}
```

`safeToCommit` may only be `true` when `verdict` is `"APPROVED"`.
