# Current Task

## Ticket
<!-- e.g. TICKET.CODE.1 — Short title -->

## Goal
<!-- Describe exactly what Claude is implementing. -->

## Scope
- In scope item 1
- In scope item 2

## Out of Scope
- Out of scope item 1

## Constraints
- No schema/migration unless explicitly authorized.
- No package changes unless explicitly authorized.
- No `git add .`.
- No runtime files committed.

## Incremental Debt Budget
- Existing contracts/helpers to inspect and reuse:
- Replaced paths that must be removed:
- Compatibility paths intentionally retained and why:
- New files/exports/dependencies authorized:

## Expected Validation
- `npx tsc --noEmit`
- targeted ESLint for changed TypeScript/JavaScript files
- `npm run build`
- Manual validation if needed.

## Expected Final Report
Claude must write the final report into:
`.agents/claude_report.md`
