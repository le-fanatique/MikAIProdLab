# SUPERVISION.LOOP.1 — File-based Codex supervision loop

## 1. Audit

`.agents/` already existed with a real Codex-produced pair of files from a prior manual test:

- `.agents/codex_review.md` — verdict `NEEDS_USER`, with two blocking findings: `.agents/current_task.md` and `.agents/claude_report.md` both missing, and `git diff` empty.
- `.agents/codex_verdict.json` — same verdict, machine-readable, with `blocking: true`.

This is exactly the expected behavior described in the ticket: Codex correctly refused to invent a review with no task/report/diff to look at. These two files are genuinely **live** artifacts (not templates) from a real run — decided to leave them untouched on disk (not committed, not deleted) as the working example that motivated this ticket, and to build the rest of the structure around them rather than replace them.

**Decision: live files vs. templates.** Went with the ticket's own recommendation: `.agents/templates/*` are committed (blank forms), the live `.agents/*.md`/`*.json` working files are git-ignored (per-ticket scratch state, regenerated every time). Rationale: these files churn every single ticket — committing them would mean a commit per review cycle with no lasting value, and `git diff`/`git log` on them would be noise, not history. If a specific review is worth keeping permanently, the convention is to copy it into `docs/` by hand (same pattern already used for every ticket's own `docs/TICKET_NAME.md` report).

## 2. Structure

```
.agents/
  README.md                          (committed — workflow docs)
  templates/
    current_task.md                  (committed — blank template)
    claude_report.md                 (committed — blank template)
    codex_review.md                  (committed — blank template)
    codex_verdict.json               (committed — blank template)
    claude_followup.md               (committed — blank template)
    user_arbitration.md              (committed — blank template)
  current_task.md                    (git-ignored — live, per ticket)
  claude_report.md                   (git-ignored — live, per ticket)
  codex_review.md                    (git-ignored — live, per ticket)
  codex_verdict.json                 (git-ignored — live, per ticket)
  claude_followup.md                 (git-ignored — live, per ticket)
  user_arbitration.md                (git-ignored — live, per ticket)
```

`.gitignore` lists the six live filenames explicitly (not a wildcard like `.agents/*.md`, which would also swallow `README.md`).

## 3. Roles

- **Claude Code** — developer. Implements the ticket in `current_task.md`, runs validation, writes `claude_report.md`. Never commits until `codex_verdict.json` says `APPROVED` + `safeToCommit: true`.
- **Codex** (VS Code extension or CLI) — reviewer. Reads `current_task.md` + `claude_report.md`, inspects the real `git diff`, writes `codex_review.md` (human-readable) and `codex_verdict.json` (machine-readable, strict schema).
- **User** — product arbiter. Only engaged when the verdict is `NEEDS_USER`, via `user_arbitration.md`.

## 4. The cycle

```
current_task.md → claude_report.md → codex_review.md + codex_verdict.json
                                              |
                        +---------------------+---------------------+
                        |                     |                     |
                    APPROVED               REVISE               NEEDS_USER
                        |                     |                     |
                 Claude commits      claude_followup.md      user_arbitration.md
                                        (fix, re-review)      (user decides, resume)
```

## 5. `NEEDS_USER` when context is missing

Codex can only review what's actually on disk. If `current_task.md` or `claude_report.md` is absent, or `git diff` is empty, there is no implementation surface to validate — the only honest verdict is `NEEDS_USER`, asking a human to supply the missing piece. This was confirmed as the real, correct behavior from the pre-existing `.agents/codex_review.md`/`codex_verdict.json` in this repo (see §1) — not a bug to route around.

## 6. Verdict schema (`codex_verdict.json`)

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

Rule: `safeToCommit` may only be `true` when `verdict` is `"APPROVED"`.

## 7. Scripts added

- **`npm run ai:init`** (`scripts/agents-init.mjs`) — copies every file in `.agents/templates/` into `.agents/` if the live file doesn't already exist. Never overwrites silently; `--force` backs the existing file up to `<name>.bak-<timestamp>` first, then overwrites. Node built-ins only (`fs`), no new dependency.
- **`npm run ai:review`** (`scripts/agents-review-instructions.mjs`) — checks that `current_task.md` and `claude_report.md` exist and look filled-in (not just an untouched template), reports the current `git status --short` / `git diff --stat`, and — only if there's actually something to review — prints the exact prompt to paste into Codex. **Deliberately does not call a Codex CLI**: no such integration has been installed or tested against this repo (`command -v codex` → not found in this environment), so inventing one would be exactly the kind of unverified integration this ticket's constraints explicitly forbid. Never crashes on missing files — every failure path prints guidance and exits 0 or 1 cleanly.

## 8. Manual workflow (today)

```powershell
cd F:\AI\MikAIProdLab
npm run ai:init
# fill in .agents/current_task.md
# ... Claude implements the ticket, writes .agents/claude_report.md ...
npm run ai:review
# paste the printed prompt into Codex (CLI or VS Code extension)
# read .agents/codex_verdict.json
```

## 9. Future: semi-automatic workflow

Once a Codex CLI is installed and its exact invocation confirmed working
against this repo (not assumed here), `agents-review-instructions.mjs`
could be extended to actually `spawn` it and capture its output directly
into `codex_review.md`/`codex_verdict.json`, removing the copy-paste step.
Deliberately not built in this ticket — no CLI was available to verify
against, and guessing the invocation would produce a script that looks
automated but silently fails or does the wrong thing.

## 10. Commit conventions

Same as every other ticket in this repo: explicit paths only, never `git add .`, no runtime/DB/upload file. The one addition from this ticket: **Claude does not commit at all until `.agents/codex_verdict.json` says `APPROVED`** (see `feedback_mikailab.md` memory entry, 2026-07-11). This ticket itself is the bootstrap exception — the loop didn't exist yet when it started, so its own commit follows the ticket's literal Étape 10 instructions rather than gating on a verdict file the ticket itself was building.

## Confirmations

- No schema/migration change.
- No new npm package (Node built-ins only: `fs`, `path`, `child_process.spawnSync`).
- ComfyUI/generation/job runner/polling code untouched.
- `SequencePreviewPlayer` untouched.
- OpenReel sidecar untouched.
- No runtime/upload/storage/local-DB file committed — the live `.agents/*` working files are git-ignored, not committed.
