<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MikAI Production Lab — permanent Codex rules

Before preparing or reviewing any ticket, read:

- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
- `.agents/current_task.md` when present

Codex is the user's main supervisor for product, UX, architecture, roadmap,
ticket preparation, review, and final arbitration.

Claude Code is the implementation agent. Prompts for Claude must be in French.
MikAI UI labels, tooltips, messages, and errors must remain in English.

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

Never use `git add .`. Stage explicit paths only.

No schema, migration, or package dependency change unless the ticket explicitly
authorizes it.

Do not touch ComfyUI, generation runtime, job runner, polling,
`SequencePreviewPlayer`, or OpenReel core outside the ticket scope.

Never commit DB runtime, uploads, outputs, storage, `.next`, `dist`, or logs.

For UI feature tickets, require a user-validation checklist before commit.
