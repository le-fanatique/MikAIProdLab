# MikAI UX Audit Brief

Status: validated product brief
Date: 2026-07-14
Ticket: `UX.AUDIT.1`

## Purpose

MikAI ProdLab has accumulated text fields, buttons, cards, AI-assist actions,
editing controls, navigation links, generation controls, and contextual panels.
The next priority is to understand the resulting ergonomics before adding more
large features.

The audit must protect two product pillars:

1. MikAI should feel like a tool for creating an animated film or short film,
   not like a collection of forms.
2. MikAI must preserve useful granularity: project overview first, then
   progressive descent into Story, Outline, Sequence, Shot, Asset, image,
   prompt, and generation details.

## Audit stance

This is an audit-only phase. It must inspect source code and the running
application, but must not redesign or modify product code. Recommendations
should prefer progressive disclosure, hierarchy, contextual actions, sensible
defaults, and preservation of user context over feature deletion.

## Required audit coverage

- Project Detail
- Story Workspace
- Outline Builder
- Assets list and Asset Detail
- Sequence Detail
- Shot Detail and Shot Prompt Workspace
- Asset Generation and Shot Generation
- Settings and Workflow Library
- Right Panel and LLM Chat

Required journeys:

- Story to Shots: project, story, outline, sequences, shots, prompt.
- Asset preparation: assets, extraction, description, Asset Bible, references,
  generation.
- Shot generation: casting, prompt, workflow, inputs, preview, approval.

## Evaluation criteria

For each screen and journey, identify:

- primary purpose and primary action;
- secondary and tertiary actions;
- visible controls and approximate density;
- duplicated information or actions;
- weak visual or functional hierarchy;
- controls that should be contextual, grouped, collapsed, or advanced;
- terminology, navigation, feedback, empty states, responsive behavior,
  accessibility, and destructive-action safety;
- whether the next action is understandable without knowing the codebase.

## Required deliverables

- `.claude/agents/mikai-ux-auditor.md`: read-only specialist agent;
- `.claude/skills/ux-audit/SKILL.md`: repeatable `/ux-audit` workflow;
- `docs/audits/MIKAI_UX_ERGONOMICS_AUDIT.md`: findings and recommendations.

The audit report must classify findings as `Critical`, `High Friction`,
`Moderate Friction`, `Polish`, or `Structural Opportunity`, and effort as
`Quick Win`, `Small Refactor`, `Medium Redesign`, or `Structural Redesign`.
Each finding should include the route/component, evidence or screenshot state,
user impact, recommendation, risk, effort, and confidence.

The report must end with three grouped stages:

- `UX.1`: immediate decluttering and hierarchy fixes;
- `UX.2`: shared interaction-pattern consolidation;
- `UX.3`: structural workspace redesigns.

## Constraints

- no application code changes during the audit;
- no schema, migration, dependency, runtime, generation, ComfyUI, or OpenReel
  changes;
- no commit or push by the audit agent;
- UI terminology remains English;
- do not remove capabilities merely to make the interface look cleaner.

## Rollback checkpoint

The pre-audit product baseline is tagged on GitHub as
`pre-ux-audit-20260714`, pointing to commit `9149c01`.
