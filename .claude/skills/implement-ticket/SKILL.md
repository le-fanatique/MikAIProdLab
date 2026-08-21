---
name: implement-ticket
description: Implement the active MikAI ticket from .agents/current_task.md with progressive context loading, strict scope control, targeted validation, and a concise evidence report. Use for normal Claude Code implementation and retake work.
---

# Implement Ticket

**Written for the dormant Codex protocol.**

It names `.agents/current_task.md`, `.agents/claude_report.md` and
`.agents/codex_verdict.json`. Under the **Opus** protocol in force those are
`.agents/supervised_task.md`, `.agents/executor_report.md` and
`.agents/supervisor_verdict.json`, and the commit gate is an explicit user go.
For how work is actually done here, load the **`mikai-method`** skill.


1. Read `CLAUDE.md`, `AGENTS.md`, and `.agents/current_task.md`.
2. Read the latest report and verdict status only far enough to detect whether
   `current_task.md` still names a ticket already committed and pushed. If it
   does, stop and request a new active ticket; never implement it again.
3. Load only ticket-linked domain documents and relevant symbols.
4. Capture baseline `git status --short` and the scoped diff.
5. Audit existing contracts before editing; use LSP first when available, then
   `rg`. Search for equivalent helpers, components, validators, services, and
   reverse references before creating or replacing them.
6. Record the touched-area debt budget: what is reused, what old path must be
   removed, and what compatibility path is intentionally retained.
7. Implement the smallest complete change. Remove replaced code in the same
   diff unless the ticket explicitly requires compatibility. New abstractions
   must have a real caller in the delivered flow.
8. Do not stop for plan approval unless
   the ticket requires arbitration or a contract is missing.
9. Run targeted tests while iterating, then all mandatory ticket checks.
10. Use focused subagents for noisy exploration/logs; request concise findings.
11. Remove temporary harnesses and processes.
12. Write `.agents/claude_report.md` with scope, evidence, limitations, the
   debt-budget result, and final
   Git state.
13. Stop without staging, commit, or push until Codex approves.

For a retake, read the latest Codex review first and change only files needed
to address its findings. Preserve already-approved behavior.
