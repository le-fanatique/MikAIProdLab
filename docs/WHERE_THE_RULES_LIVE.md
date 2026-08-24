# Where the rules live

Short on purpose. It is a map of **decisions**, not a catalogue of modules —
`CLAUDE.md`'s rule about itself applies here too, and `mikai-method` §8 is
explicit that a document a reading contract forces open costs on every visit.

Written 2026-08-24, after an audit of the Shot prompt got three things wrong
before it got them right. Each time the same way: **a mechanism had been built,
was correct, and was invisible from the entity schema.** The audit reasoned
about behaviour from data shape, and behaviour lives in the path.

---

## 1. Why this file exists, in one paragraph

This codebase answers "where does rule X live" with **one extracted pure
module, deliberately**. A dozen of them exist *because* the rule had been
written twice and the copies drifted — `pruneDynamicBatchSelection`,
`resolveShotDurationScalarDefault`, `orderStoryboardReferences`,
`resolveStoryboardLighting`, `insertDraftRule` all say so in their own headers.
So the question is never "does this exist?" but **"which module owns it?"** —
and answering it from `src/db/schema/**` is how you conclude, wrongly, that it
does not exist at all.

## 2. Where is it decided that…

| Question | Owner | The trap |
| --- | --- | --- |
| which image carries `@ImageN` | `src/lib/prompts/orderStoryboardReferences.ts` | the **batch's own selected order and subset**, never the stored order. `guideDefault.conformReferences` is a second, wrong implementation of the same rule, sitting dead on the Shot path |
| which images a workflow may be fed | `src/lib/comfy/mapWorkflowInputs.ts` — `buildRuntimeImageOptions` | Shot references first, then the cast Assets' references; the asset-sourced options **carry `assetName`/`assetType`**, so the asset↔image binding already exists here |
| the slot names the engine actually receives | `src/lib/comfy/expandDynamicBatch.ts` | `image1`, `image2`, … from the index in the user's **selected list**. `DynamicBatchImageList` displays those labels and offers Move Up / Move Down — the author arranges them by hand |
| what text is queued for one Shot | `src/lib/prompts/compileShotPrompt.ts` | only `shotPrompt`, plus `Timeline:` for a video Shot with Prompt Segments. The cast, references and segments `runShotGeneration` resolves are **not read** |
| a Shot's storyboard body | `src/lib/llmWorkspace/composition/storyboardShot.ts` | the seven-part composition; wired **only** to the Sequence package, never to a single Shot |
| how the camera fields are asked of a model | `src/lib/llmWorkspace/cameraInstruction.ts` | the only place engine-facing camera knowledge lives. `cameraVocabulary.ts` is the catalogue and deliberately carries none |
| a Shot's effective lighting | `src/lib/llmWorkspace/composition/resolveStoryboardLighting.ts` | **precedence, never accumulation**: the Shot's own field, else the Sequence's, else its cast environment Assets' |
| how a reference-image role reaches an engine | catalogue: `src/lib/referenceImageRoles.ts` · rendering: `conformation/profiles/guideDefault.ts` | the catalogue never learns an engine exists. Five roles of twenty have a named mode; the rest keep their tag and get none |
| the Project Style text | `src/lib/projectStyle/compileStyleSnapshot.ts` | polarity is carried by **which block a rule lands in**, never by an inline label |
| what a workspace action writes | `src/lib/llmWorkspace/actions/registry.ts` — `columns.written` | a **declaration**, not the behaviour. See §3 |

## 3. Rules that live in two places and must move together

The highest-value section, because grepping one name finds one half.

- **A model field's bound.** The action enforces it (`str(value, n)` in
  `normalizeShot`, `src/actions/llm/sequenceShots.ts`); the descriptor
  *declares* it (`output.…fields[].truncateTo`). Changing the descriptor alone
  changes nothing at runtime — proven on 2026-08-24, when a fix raised the
  descriptor and the end-to-end test still reproduced the truncation.
- **What an action writes.** The insert statement is the truth;
  `ACTION_REGISTRY[id].columns.written` is the declaration. They are held
  together by a correspondence assertion in `tests/actions/registry.test.ts` —
  **which not every action has**. An action without one can, and did, drift
  four columns behind its own insert while its own test proved the opposite.
- **Preview and queued payload.** A generation panel recomputes what the
  server action recomputes. They are kept honest by calling the same builder
  (`buildGenerationPayload`, `resolveStoryboardLighting`,
  `resolveProjectStyle`); a resolution written twice is the recurring defect
  this codebase extracts modules to prevent.

## 4. Before claiming a mechanism is missing

The discipline `mikai-method` now carries. Repeated here because this is the
file an audit opens.

1. **Trace backwards from what is consumed**, never forwards from the entity.
   Ask what the queued payload, the assembled prompt or the inserted row
   actually contains, and read the function that produced it.
2. **Grep the effect, not the name.** The `@ImageN` rule is not in a file
   called anything like `imageOrder`; it is in a module named for the
   storyboard, extracted out of a page.
3. **Check for a second implementation** before writing the first. Two of the
   three audit errors were proposing something that already existed.
4. **A module header is documentation.** In this repository they carry the
   decision, its date, the author's own words and what was tried and rejected.
   Reading `cameraInstruction.ts`'s header would have prevented calling the
   camera "debt"; reading `resolveStoryboardLighting.ts`'s would have
   prevented calling lighting "a missing ingredient".
5. **An empty field is not a missing mechanism.** Lighting resolves through
   three levels that work; every one of them is simply unfilled.

## 5. What this file is not

Not a module index — `src/lib` has over a hundred modules with self-declaring
headers and listing them would defeat the purpose. Entries earn their place by
having **already cost a wrong conclusion**. Add one when that happens; do not
add one speculatively.

Related: `docs/AGENT_CONTEXT_STRATEGY.md` for token discipline,
`docs/SHOT_PROMPT_SD25_AUDIT.md` §5 for the worked example this file
generalises.
