---
name: validate-ticket
description: Validate a MikAI implementation efficiently with a targeted-to-broad test funnel, compact error-focused output, cleanup checks, and honest browser/runtime evidence. Use before writing the final Claude report or resubmitting a retake.
---

# Validate Ticket

Use this order:

1. Run pure or module-level tests for changed contracts.
2. Run affected action, route, DB, or provider tests.
3. Validate SSR/browser behavior for visible UI.
4. Run targeted ESLint on changed TypeScript/JavaScript files when applicable.
5. Audit the changed area:
   - no replaced path remains accidentally reachable;
   - every new file/export/helper has a real caller;
   - no equivalent abstraction was duplicated;
   - no unexplained TODO, orphan, cycle, or obsolete test was introduced.
6. Run ticket-mandated repository checks, normally:
   - `npx tsc --noEmit`;
   - `npm run build`;
   - `npm run db:generate`;
   - `git diff --check`.
7. Inspect `git status`, scoped diff, temporary files, ports, and test data.

Keep successful output summarized. For failures, record the exact command,
exit code, failing case, error, and only useful surrounding lines. Do not claim
browser, network, paid-provider, filesystem-race, or concurrency proof that was
not actually executed. Never run repository-wide automatic dead-code deletion
or broad `--fix` as part of validation.
