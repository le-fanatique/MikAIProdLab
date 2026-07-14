---
name: ux-audit
description: Run a read-only ergonomics and information-architecture audit of MikAI ProdLab across source code, rendered screens, and end-to-end creative journeys.
argument-hint: [optional route, journey, or focus area]
disable-model-invocation: true
---

# MikAI UX Audit

Run this as an audit-only workflow. Do not edit application code and do not
commit or push.

## 1. Establish context

Read `AGENTS.md`, `docs/PROJECT_STATE.md`, `docs/ROADMAP.md`,
`docs/ARCHITECTURE_DECISIONS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, and
`docs/audits/MIKAI_UX_AUDIT_BRIEF.md` when present. Inspect the route tree,
shared shells, navigation, cards, panels, forms, editors, modals, and reusable
controls.

## 2. Inspect the real product

Use the repository's documented launch procedure. Use available browser or
Chrome integration when possible. Inspect desktop and at least one narrower
viewport where practical. Capture screenshots or record exact route and state
for important findings. Do not generate expensive media solely for the audit.

Review at minimum:

- Project Detail;
- Story Workspace;
- Outline Builder;
- Assets list and Asset Detail;
- Sequence Detail;
- Shot Detail and Shot Prompt Workspace;
- Asset Generation and Shot Generation;
- Settings and Workflow Library;
- Right Panel and LLM Chat.

Follow these journeys:

### Story to Shots

Project -> Story -> Outline -> Sequences -> Shots -> Shot Prompt.

### Asset preparation

Assets -> extraction/review -> Asset Detail -> Description/Asset Bible ->
reference images -> Generation.

### Shot generation

Shot -> casting/prompt -> Generate Content -> workflow -> text/image inputs ->
preview or approval surface.

## 3. Evaluate each screen

Record primary purpose, primary action, secondary/tertiary actions, visible
fields/buttons/links/menus/tabs/cards/panels, approximate density, dominant
patterns, and the user's next-action clarity.

Explicitly evaluate progressive disclosure, sensible defaults, empty states,
button hierarchy, terminology, form length, field grouping, contextual
actions, navigation depth, context preservation, responsive behavior, panel
density, cognitive load, discoverability, destructive-action safety,
validation/feedback, and premature exposure of advanced controls.

## 4. Produce the report

Write only the audit report at
`docs/audits/MIKAI_UX_ERGONOMICS_AUDIT.md`. Do not create implementation
changes. Include:

1. Executive summary;
2. UX inventory by major screen;
3. cross-application findings;
4. screen-by-screen findings;
5. simplification opportunities;
6. durable MikAI UX principles;
7. prioritized `UX.1`, `UX.2`, and `UX.3` work packages;
8. three candidate screens for redesign;
9. limitations and evidence quality;
10. ten highest-priority findings.

Use severity values `Critical`, `High Friction`, `Moderate Friction`, `Polish`,
and `Structural Opportunity`. Use effort values `Quick Win`, `Small Refactor`,
`Medium Redesign`, and `Structural Redesign`.

Every finding needs route/component, evidence or screenshot state, observation,
user impact, recommendation, risk, effort, and confidence. Group related
observations into coherent work packages rather than turning every detail into
a separate feature ticket.
