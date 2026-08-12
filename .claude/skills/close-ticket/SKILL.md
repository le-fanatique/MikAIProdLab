---
name: close-ticket
description: Audit whether a MikAI ticket is fully approved, committed, pushed, documented, and safe for the user to run /clear without losing development rules or durable product context.
---

# Close Ticket

This skill verifies readiness. It does not execute `/clear`.

1. Read `CLAUDE.md`, `AGENTS.md`, `.agents/current_task.md`,
   `.agents/claude_report.md`, and `.agents/codex_verdict.json`.
2. Require a verdict for the same ticket with:

   ```json
   {
     "verdict": "APPROVED",
     "safeToCommit": true
   }
   ```

3. Verify the report records:
   - the final commit hash;
   - the successful push range;
   - cleanup of temporary harnesses, processes, and test data;
   - the final Git status and all remaining out-of-scope changes.
4. Verify the commit contains only explicitly approved paths and the branch is
   pushed to its expected remote. Never stage, commit, or push while running
   this audit.
5. Check whether the ticket created durable product, roadmap, feedback, or
   architecture knowledge. Confirm it was written to the appropriate document
   rather than left only in conversation or the temporary report.
6. Confirm Codex has replaced `.agents/current_task.md` with the next ticket,
   or explicitly recorded that no ticket is queued.
7. If any condition is missing, report the exact blocker and do not recommend
   `/clear`.
8. If every condition passes, output:

   ```text
   Ticket safely closed. Run /clear.
   ```

   Then provide the restart prompt:

   ```text
   Implement the active ticket in .agents/current_task.md.
   Follow CLAUDE.md and AGENTS.md.
   Do not commit or push before a fresh Codex approval.
   ```
