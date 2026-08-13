# LLM Operations Inventory

Ticket: `PROMPTS.INVENTORY.CLEANUP.1`. Produced 2026-08-13 by direct reading
of `src/actions/llm/` (15 files) and `src/lib/prompts/` (24 files, after the
orphan `sequences-from-story.ts` was removed in the same ticket — see
`.agents/executor_report.md`).

This document is descriptive only. It records what the code does today; it
does not propose a design. It is a design **input** for `docs/LLM_WORKSPACE_ARCHITECTURE.md`
§3.1 (variable registry), §3.2 (action registry) and §4 (template format).

## Scope and line unit

`src/actions/llm/` contains 15 files but **27 exported async functions**
(server actions, each file starts with `"use server"`). Every one of the 27
is tabulated below as one row — none are folded into another row and none
are silently merged by file. The directory also exports **5 TypeScript
types** (not callable actions); those are listed separately in
"Non-action exports" at the end of this document, per the ticket's
instruction not to fold them into the action table.

Total exports in `src/actions/llm/`: `grep -rn "^export" src/actions/llm/*.ts`
returns 32 lines (27 async functions + 5 types).

## Scope limitation — read this before treating the table as exhaustive

The table covers `src/actions/llm/` only, as the ticket scoped it. That
directory is **not** the whole LLM surface, in two directions.

**Writes happen elsewhere.** Most LLM actions return a draft and write
nothing — the `Champs écrits: aucun (draft only)` rows are accurate, but they
describe only half the pipeline. The Approve half lives in generic write
actions outside `src/actions/llm/`, which the assist panel calls directly
once the user accepts the proposal. Six assist panels reach five such
actions:

| Write action | Module | Called by |
| --- | --- | --- |
| `updateAssetDetailsInline` | `@/actions/assets` | `AssetBibleEnhancePanel` |
| `updateAssetDescriptionFieldInline` | `@/actions/assets` | `AssetDescriptionEnhancePanel`, `BatchAssetDescriptionEnhancePanel` |
| `applyBatchAssetDescriptionDraftsInline` | `@/actions/assets` | `BatchAssetDescriptionEnhancePanel` |
| `updateShotPrompt` | `@/actions/shots` | `ShotPromptLLMAssistPanel`, `PromptCompilerPanel` |
| `updateSequencePrompt` | `@/actions/sequences` | `SequencePromptLLMAssistPanel` |

(`PromptComposerPanel` also calls `updateShotPrompt`; it was not checked
against the assist-panel definition used here, so it is named but not
counted.)

These five are what the action registry of §3.2 must actually describe. A
registry built by scanning `src/actions/llm/` would find the readers and miss
every writer.

**Prompt building happens elsewhere too.** `translateTextField` builds its
messages via `src/lib/llm/translationPrompt.ts`, outside `src/lib/prompts/`.
Same failure mode, mirrored: a variable registry built by scanning
`src/lib/prompts/` would miss it.

The consequence for Phase B is one sentence: **neither registry can be built
by directory discovery.** Both need an explicit declaration per operation.

## Column definitions actually used

- **Action** — export name and declaring file.
- **Constructeurs de prompt** — files under `src/lib/prompts/` the action
  actually imports and calls (verified by reading the action file, not by
  assumption). `aucun` means the action calls no file in that directory,
  even if it calls the LLM by building its message inline, or if its actual
  prompt builder lives outside `src/lib/prompts/`.
- **Composant d'assist** — the component that calls the action, found by
  repository-wide search for the export name. `aucun` when no caller exists
  anywhere in `src/`.
- **Entité d'ancrage** — the entity the operation is scoped to (input
  identity), not the entity it eventually affects.
- **Champs écrits** — table.column(s) the action itself writes. `aucun` when
  the action only returns a proposal (draft) with no DB write.
- **Cardinalité** — one entity in/out, or several.
- **Format de sortie** — the shape the action's own parsing code expects
  from the model's raw response. `n/a (pas d'appel LLM)` for actions that
  never call the model.

## Action table (27 rows)

| Action (file) | Constructeurs de prompt | Composant d'assist | Entité d'ancrage | Champs écrits | Cardinalité | Format de sortie |
| --- | --- | --- | --- | --- | --- | --- |
| `generateAssetBibleDraft` (`assetBible.ts`) | `asset-bible-from-context.ts` (prompt), `assetBibleContext.ts` (ownership/read resolver, not a prompt builder), `assetBibleDraft.ts` (response parser) | `AssetBibleEnhancePanel.tsx` | Asset | aucun (draft only) | une entité | JSON flat object `{visual_identity, usage_rules, forbidden_variations}` |
| `generateAssetDescriptionOnlyDraft` (`assetDescription.ts`) | `asset-description-from-context.ts` (`buildAssetDescriptionOnlyPrompt`) | `AssetDescriptionEnhancePanel.tsx` | Asset | aucun (draft only) | une entité | JSON single-key object `{description_draft}`, strictly validated (exactly one key, string, ≤4000 chars) |
| `generateAssetNotesOnlyDraft` (`assetDescription.ts`) | `asset-description-from-context.ts` (`buildAssetNotesOnlyPrompt`) | `AssetDescriptionEnhancePanel.tsx` | Asset | aucun (draft only) | une entité | JSON single-key object `{notes_draft}`, same strict validation |
| `generateAssetDescriptionDraft` (`assetDescription.ts`) | `asset-description-from-context.ts` (`buildAssetDescriptionFromContextPrompt`) | **aucun** — no caller found anywhere in `src/` (see anomalies) | Asset | aucun (draft only) | une entité | JSON flat object `{description_draft, notes_draft}` |
| `generateBatchAssetDescriptionDrafts` (`assetDescription.ts`) | `asset-description-from-context.ts` (`buildAssetDescriptionFromContextPrompt`, one call per asset, sequential) | `BatchAssetDescriptionEnhancePanel.tsx` | Asset (lot, jusqu'à 10 par appel — `BATCH_LIMIT`) | aucun (draft only) | plusieurs | per-item JSON flat object `{description_draft, notes_draft}`; action wraps results in `{results: BatchAssetDraftResult[], errors: BatchAssetDraftError[]}` |
| `generateAssetCandidatesDraft` (`assetExtraction.ts`) | `assets-from-project.ts` | `AssetsLLMExtractPanel.tsx` | Project | aucun (draft only) | plusieurs | JSON array-wrapped `{assets: [{name, assetType, description, notes, sourceLevel, sourceExcerpt, duplicateWarning}]}` |
| `createSelectedAssets` (`assetExtraction.ts`) | aucun (persists already-generated candidates; no LLM call) | `AssetsLLMExtractPanel.tsx` | Project | `assets`: `name`, `type`, `description`, `notes`, `orderIndex`, `projectId` | plusieurs | n/a (pas d'appel LLM) |
| `generateCastingSuggestionsDraft` (`castingSuggestions.ts`) | `casting-from-sequence.ts` | `CastingSuggestionsPanel.tsx` | Sequence (avec ses Shots) | aucun (draft only) | plusieurs | JSON array-wrapped `{suggestions: [{targetType, targetId, targetLabel, assetId, assetName, assetType, reason, confidence}]}` |
| `applySelectedCastingSuggestions` (`castingSuggestions.ts`) | aucun (persists already-generated suggestions; no LLM call) | `CastingSuggestionsPanel.tsx` | Sequence | `shotAssets`: `shotId`, `assetId` **or** `sequenceAssets`: `sequenceId`, `assetId` | plusieurs | n/a (pas d'appel LLM) |
| `sendChatMessage` (`chat.ts`) | aucun (system/user messages built inline in `chat.ts`, not via `src/lib/prompts/`) | `SidebarLLMChat.tsx` | aucune (chat session, no project/entity scope) | aucun | n/a (une conversation) | texte libre (pas de schéma JSON); translation sub-mode also returns free text |
| `generateChatImages` (`chat.ts`) | aucun | `SidebarLLMChat.tsx` | aucune | aucun | plusieurs (jusqu'à 8 images) | images + texte libre, pas de schéma JSON |
| `listChatSystemPrompts` (`chat.ts`) | aucun (reads configured prompts via `@/actions/settings`) | `SidebarLLMChat.tsx` | aucune | aucun | plusieurs | n/a (pas de génération de contenu par le modèle) |
| `listChatModels` (`chat.ts`) | aucun | `SidebarLLMChat.tsx` | aucune | aucun | plusieurs | n/a (interroge le catalogue de modèles du provider) |
| `saveLLMChatImageAsReference` (`chatImageReferences.ts`) | aucun (persists an already-generated image; no LLM call) | `SidebarLLMChat.tsx` | Asset ou Shot (selon `targetType`) | `assetReferenceImages` **ou** `shotReferenceImages`: `imagePath`, `sourceFilename`, `label`, `imageRole`, `notes`, `orderIndex`, `assetId`/`shotId` | une entité | n/a (pas d'appel LLM) |
| `listImageModels` (`imageGeneration.ts`) | aucun | `SidebarLLMChat.tsx` | aucune | aucun | plusieurs | n/a (interroge le catalogue OpenRouter) |
| `generateOutlineDraft` (`outlineGeneration.ts`) | `outline-from-story.ts` | `OutlineGenerationPanel.tsx` | Project | aucun (draft only) | une entité | JSON flat object `{outline}` |
| `applyGeneratedOutline` (`outlineGeneration.ts`) | aucun (no LLM call) | `OutlineGenerationPanel.tsx` | Project | `projects`: `outline`, `updatedAt` | une entité | n/a (pas d'appel LLM) |
| `generatePromptCompilerDraft` (`promptCompiler.ts`) | `buildPromptCompilationContext.ts`, `promptCompilerPresets.ts`, `promptCompilerSystemPrompt.ts` | `PromptCompilerPanel.tsx` | Shot | aucun (draft only, never persisted by this action) | une entité | texte libre (pas de JSON — `callLLMChat`, not `callLLMJson`) |
| `generateSequencesFromOutlineDraft` (`sequenceGeneration.ts`) | `sequences-from-outline.ts` | `SequencesGenerationPanel.tsx` | Project | aucun (draft only) | plusieurs | JSON array-wrapped `{sequences: [{title, summary, description, narrative_purpose, mood, location_hint, order_index}]}` |
| `createGeneratedSequences` (`sequenceGeneration.ts`) | aucun (no LLM call) | `SequencesGenerationPanel.tsx` | Project | `sequences`: `sequenceCode`, `title`, `summary`, `description`, `narrativePurpose`, `mood`, `locationHint`, `orderIndex`, `projectId` | plusieurs | n/a (pas d'appel LLM) |
| `generateSequencePromptDraft` (`sequencePrompt.ts`) | `sequence-prompt-from-context.ts` | `SequencePromptLLMAssistPanel.tsx` | Sequence | aucun (draft only) | une entité | JSON flat object `{sequence_prompt}` |
| `generateShotsFromSequenceDraft` (`sequenceShots.ts`) | `shots-from-sequence.ts` | `SequenceShotsLLMAssistPanel.tsx` | Sequence | aucun (draft only) | plusieurs | JSON array-wrapped `{shots: [{title, shot_code, description, duration_seconds, continuity_in, action_pitch, camera_pitch, framing, camera_movement, continuity_out, shot_prompt}]}` |
| `createGeneratedShots` (`sequenceShots.ts`) | `defaultShotPrompt.ts` (`resolveShotPromptWithDefault` — deterministic fallback text, not an LLM prompt builder; no LLM call in this action) | `SequenceShotsLLMAssistPanel.tsx` | Sequence | `shots`: `shotCode`, `title`, `description`, `durationSeconds`, `actionPitch`, `cameraPitch`, `framing`, `cameraMovement`, `continuityIn`, `continuityOut`, `shotPrompt`, `orderIndex`, `sequenceId` | plusieurs | n/a (pas d'appel LLM) |
| `generateShotPromptDraft` (`shotPrompt.ts`) | `shot-prompt-from-context.ts` | `ShotPromptLLMAssistPanel.tsx` | Shot | aucun (draft only) | une entité | JSON flat object `{shot_prompt}` |
| `generateStory` (`story.ts`) | `story-from-pitch.ts` | `StoryGenerationPanel.tsx` | Project | aucun (draft only) | une entité | JSON flat object `{story}` |
| `applyGeneratedStory` (`story.ts`) | aucun (no LLM call) | `StoryGenerationPanel.tsx` | Project | `projects`: `story`, `updatedAt` | une entité | n/a (pas d'appel LLM) |
| `translateTextField` (`translation.ts`) | aucun **dans `src/lib/prompts/`** — the actual message builder is `buildTranslationMessages` in `src/lib/llm/translationPrompt.ts` (a different directory; see anomalies) | `TextFieldTranslationButton.tsx` | aucune (generic text field, no project/entity scope) | aucun | une entité (un champ texte) | texte libre (pas de JSON) |

## Synthèse factuelle

### 1. Constructeurs partagés entre plusieurs actions

`src/lib/prompts/` contains **24 files** after this ticket's deletion of the
orphan `sequences-from-story.ts` (25 before). Of those 24, only **16** are
actually invoked from `src/actions/llm/` exports; the other 8
(`asset-alignment-from-context.ts`, `buildSequenceGenerationPackage.ts`,
`buildSequenceStoryboardPrompt.ts`, `buildSequenceVideoPrompt.ts`,
`compilePromptSegments.ts`, `compileShotPrompt.ts`, `composeShotPrompt.ts`,
`promptCompilerHandoff.ts`) are called exclusively from outside
`src/actions/llm/` (`src/actions/assetAlignment.ts`,
`src/actions/sequenceGeneration.ts`, `src/actions/sequenceVideoGeneration.ts`,
various page/component files) — out of this ticket's scope, but recorded
here because the "25/24 constructeurs" premise in the ticket only makes
sense against the full directory, not the subset actually reachable from
`src/actions/llm/`.

Among the 16 files reachable from `src/actions/llm/`, only **one is shared
by more than one action**: `asset-description-from-context.ts`, called by
4 actions (`generateAssetDescriptionOnlyDraft`, `generateAssetNotesOnlyDraft`,
`generateAssetDescriptionDraft`, `generateBatchAssetDescriptionDrafts`) via
3 different exported builder functions in that one file. Every other
constructor reachable from `src/actions/llm/` is used by exactly one action.
Real sharing rate today: 1 shared file out of 16 (6%).

### 2. Actions écrivant les mêmes champs de la même table

Seven of the 27 actions write to the database, spread over 7 files
(`assetExtraction.ts`, `castingSuggestions.ts`, `chatImageReferences.ts`,
`outlineGeneration.ts`, `sequenceGeneration.ts`, `sequenceShots.ts`,
`story.ts`). Note that 10 actions make no LLM call, but 3 of those
(`listChatSystemPrompts`, `listChatModels`, `listImageModels`) only read —
"no LLM call" and "writes" are not the same set.

Only one overlap was found among those 7 write actions:
`applyGeneratedOutline` and `applyGeneratedStory` both write
`projects.updatedAt` (in addition to their own distinct field, `outline` and
`story` respectively). No other pair of actions writes the same column of
the same table — each of the other 5 write actions (`createSelectedAssets`,
`applySelectedCastingSuggestions`, `createGeneratedSequences`,
`createGeneratedShots`, `saveLLMChatImageAsReference`) targets a table/column
set no other action in this inventory touches.

### 3. Formats de sortie qui s'écartent de la forme dominante

Of the 17 actions that call the model at all (10 of the 27 never call an
LLM — see the `n/a (pas d'appel LLM)` rows above):

- **Dominant form** — flat JSON object with one or more string keys, no
  array wrapper: 9 actions (`generateAssetBibleDraft`,
  `generateAssetDescriptionOnlyDraft`, `generateAssetNotesOnlyDraft`,
  `generateAssetDescriptionDraft`, `generateBatchAssetDescriptionDrafts`
  per item, `generateOutlineDraft`, `generateSequencePromptDraft`,
  `generateShotPromptDraft`, `generateStory`).
- **Array-wrapped list** — `{<key>: [...]}`: 4 actions
  (`generateAssetCandidatesDraft`, `generateCastingSuggestionsDraft`,
  `generateSequencesFromOutlineDraft`, `generateShotsFromSequenceDraft`).
  These are exactly the outliers a single-JSON-object proposal component
  would need list support for.
- **Free text, no JSON at all** — 2 actions (`generatePromptCompilerDraft`,
  `translateTextField`), both call `callLLMChat` rather than `callLLMJson`.
  These resist a JSON-shaped proposal component entirely.
- **Free-form chat/image, no schema** — 2 actions (`sendChatMessage`,
  `generateChatImages`), conversational/image output with no defined
  response contract to validate against.

## Non-action exports (5) — not part of the table above

These are exported from `src/actions/llm/` but are TypeScript types, not
callable Server Actions. Listed separately per the ticket's instruction not
to fold non-action exports into the action table.

| Export (file) | Kind | Caller |
| --- | --- | --- |
| `BatchAssetDraftResult` (`assetDescription.ts`) | type | `BatchAssetDescriptionEnhancePanel.tsx` |
| `BatchAssetDraftError` (`assetDescription.ts`) | type | `BatchAssetDescriptionEnhancePanel.tsx` |
| `ChatImageSaveOptions` (`chatImageReferences.ts`) | type | none found outside `chatImageReferences.ts` itself — used only internally by `saveLLMChatImageAsReference`'s own parameter type |
| `GeneratePromptCompilerDraftInput` (`promptCompiler.ts`) | type | none found outside `promptCompiler.ts` itself — used only internally by `generatePromptCompilerDraft`'s own signature |
| `GeneratePromptCompilerDraftResult` (`promptCompiler.ts`) | type | none found outside `promptCompiler.ts` itself — used only internally by `generatePromptCompilerDraft`'s own signature |

## Anomalies observed, not corrected (out of this ticket's scope)

- `generateAssetDescriptionDraft` (`src/actions/llm/assetDescription.ts`)
  has **zero callers** anywhere in `src/` (repository-wide search for the
  export name returns only its own declaration). It is a second orphan
  candidate, distinct from the one this ticket was authorized to delete.
  Not removed — the ticket authorizes deleting only
  `src/lib/prompts/sequences-from-story.ts`.
- `translateTextField` (`src/actions/llm/translation.ts`) builds its LLM
  message via `buildTranslationMessages` in `src/lib/llm/translationPrompt.ts`
  — a prompt constructor that lives outside `src/lib/prompts/`, breaking the
  otherwise consistent convention that prompt builders live in that
  directory. Not moved — out of this ticket's scope.
- `ChatImageSaveOptions`, `GeneratePromptCompilerDraftInput` and
  `GeneratePromptCompilerDraftResult` are exported but have no consumer
  outside their own declaring file — exporting them adds no reach beyond
  what a local (non-exported) type would provide. Not changed — out of this
  ticket's scope (would be a signature/behavior-adjacent edit).
