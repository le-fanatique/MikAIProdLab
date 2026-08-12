# Incremental Code Quality

Last updated: 2026-07-24

## Policy

MikAI uses incremental zero-debt discipline:

> Every ticket must leave the touched area at least as clean as it was before.

This is not authorization for a repository-wide refactor. Cleanup must be
caused by, or directly adjacent to, the ticket.

## Per-Ticket Gate

Before editing:

1. search for equivalent helpers, components, validators, services and types;
2. inspect direct callers and reverse references;
3. state what existing contract will be reused;
4. identify the execution path that becomes obsolete;
5. name any compatibility path that must remain and why.

Before reporting completion:

- remove replaced paths in the same diff;
- confirm every new file, export and helper has a real caller;
- confirm no package was added without explicit authorization;
- check for avoidable duplication in neighboring code;
- check for unexplained TODOs, new cycles, orphaned files and obsolete tests;
- run targeted ESLint on changed TypeScript/JavaScript files when applicable;
- run the ticket's typecheck, build, tests and `git diff --check`.

Never use broad automatic deletion or repository-wide `--fix` during a feature
ticket. Dynamic Next.js entry points and framework conventions require review.

## Measured Baseline

Measured on 2026-07-24:

- `npx tsc --noEmit` passes in the normal project configuration.
- Enabling `noUnusedLocals` and `noUnusedParameters` globally currently reports
  16 historical findings across unrelated modules.
- `npm run lint` did not complete inside a 120-second measurement window.
- Knip, dependency-cruiser and jscpd are not installed or configured.

Therefore:

- unused checks are not yet global blocking compiler options;
- global lint is not used as a per-edit hook;
- tickets must not be charged for unrelated baseline findings;
- targeted lint and diff-local review are mandatory now.

## Future Quality Baseline Ticket

`QUALITY.BASELINE.1` should be prepared separately before installing tools.
It must explicitly authorize package changes and:

1. configure real Next.js entry points and generated-file exclusions;
2. record baselines for dead code, architecture and duplication;
3. classify false positives before enforcement;
4. add non-regression checks rather than demanding an immediate zero baseline;
5. evaluate hook duration before enabling any automatic Claude/Cline hook;
6. avoid automatic deletion (`knip --fix`) in CI or hooks.

Candidate tools to evaluate:

- Knip for unused files, exports and dependencies;
- dependency-cruiser for cycles and dependency direction;
- jscpd for duplication;
- existing ESLint and TypeScript for file-local findings.

No candidate tool is approved as a dependency until that ticket is reviewed.
