@AGENTS.md

# MikAI Production Lab - Context Map

Keep this file short. It is a map, not the repository encyclopedia.

## Start Here

1. Read `.agents/current_task.md`.
2. Read only the permanent documents required by `AGENTS.md`.
3. Follow ticket-specific links from `current_task.md`; do not scan all `docs/`.
4. Use `docs/AGENT_CONTEXT_STRATEGY.md` for context and token discipline.
5. If the active ticket is already recorded as committed and pushed, stop and
   wait for Codex to replace `.agents/current_task.md`.

## After `/clear`

`/clear` removes conversation history, not repository instructions. Reload this
file, `AGENTS.md`, and `.agents/current_task.md`. The ticket file is the active
contract; durable product knowledge lives in `docs/`.

Use this restart prompt:

```text
Implement the active ticket in .agents/current_task.md.
Follow CLAUDE.md and AGENTS.md.
Do not commit or push before a fresh Codex approval.
```

## Domain Map

- Product state and roadmap: `docs/PROJECT_STATE.md`, `docs/ROADMAP.md`
- Architecture and durable decisions: `docs/ARCHITECTURE_DECISIONS.md`
- Supervision workflow: `docs/DEVELOPMENT_WORKFLOW.md`
- User observations: `docs/USER_FEEDBACK.md`
- Project Style: `docs/PROJECT_STYLE_EXECUTION_PLAN.md`
- Generation / ComfyUI: `src/lib/comfy/`, generation actions, `/api/jobs`
- Storyboard / Sequence video: `src/lib/sequenceVideoSplit/`, related actions
- Camera Lab: `src/lib/cameraLab/`, Camera Lab actions and components
- Editorial / OpenReel: `src/lib/editorial/`, editorial actions and routes

## Commands

```text
npx tsc --noEmit
npm run build
npm run db:generate
git diff --check
```

Run targeted tests first. Broaden validation according to risk and the ticket.

## Definition Of Done

- ticket scope implemented without opportunistic changes;
- existing equivalents searched before creating files or abstractions;
- replaced paths removed in the same diff unless compatibility is required;
- every new file, export, helper, and package has a real use;
- no new avoidable duplication, cycle, orphan, or untracked TODO;
- touched modules are no more indebted than before the change;
- targeted behavior and failure paths validated;
- changed TypeScript/JavaScript files pass targeted lint when applicable;
- required static checks pass;
- temporary harnesses/processes cleaned up;
- `.agents/claude_report.md` updated honestly;
- no staging, commit, or push before a fresh Codex approval.
