// ---------------------------------------------------------------------------
// types.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1) / 1b (B1b-2) / RENDER.1 (B1c)
//
// Transcription of the frozen `OperationDescriptor` contract from
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §4.1 ("Two corrections the eight
// flat-JSON actions force"), plus the auxiliary types it references.
// `intent` reflects the 2026-08-13 amendment: not a tagged union but a
// composable object (`freeText?` / `mode?` / `parameters?`), found necessary
// while writing B1b-1's `outline.generate` descriptor — `targetSections` is
// neither free text nor a mode.
//
// B1b-2 widens `EntityKind` to `shot | asset` and `VariableId` to the full
// thirteen-entry registry (§3.1), and widens `anchor` to the three-form
// union from §4.1 correction 3 (`entitySet`, for
// `generateBatchAssetDescriptionDrafts`'s bounded `assetIds`) — the
// remaining five flat-JSON operations exercise all of it. Nothing here is
// invented beyond that: every shape is copied from the frozen sketch.
//
// B1c (`LLMW.DESCRIPTOR.RENDER.1`) adds the `Block` type and replaces
// `expertise.systemPrompt: string` with `expertise.system: { blocks;
// separator }`, plus the new top-level `template: { blocks; separator }`
// field — both settled by `LLMW.RENDER.SPIKE.1` and frozen in §4.1
// correction 4. Both messages are a list of blocks joined by a separator; a
// block that renders empty is dropped before joining.
//
// LLMW.RUNNER.1a (B2a) replaces `output.fields: string[]` with the
// corrected §4.1 "correction 5" shape (`fields: [{field, jsonKey,
// maxLength?}]`, `require`, `exactKeysOnly?`, `errors`), read verbatim off
// the seven existing parsers rather than assumed — see
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §4.1. All eight descriptors' `output`
// are updated to the new shape for type coherence (this module's `output`
// type is shared by all eight through `descriptors/index.ts`'s `satisfies
// Record<string, OperationDescriptor>`), but only `story.generate`,
// `outline.generate` and `sequencePrompt.assist` carry runner-level proof in
// this ticket.
//
// Correction 6, added mid-ticket after B2a reported the pipeline had no
// field for its own pre-call refusal messages: `messages` (invalid
// identifiers / LLM not configured / chain-not-found, per level) and
// `preconditions` (replacing `intent.mode.modes[].requiresNonEmpty`, which
// carried no message and could not express a mode-independent gate such as
// `generateStory`'s "Add a pitch first."). All eight descriptors carry
// `messages`; only `sequencePrompt.ts` and `shotPrompt.ts` used
// `requiresNonEmpty` and are migrated to `preconditions`.
//
// `runner.ts` is the pipeline that consumes this module. It is not wired
// into any production path.
//
// LLMW.OUTPUT.LIST.1 (B7a) widens `output` from the single object shape
// above into a `kind`-discriminated union (`"object"` | `"list"`) — see the
// field itself for the list shape and its known limits. All eight existing
// descriptors gain `kind: "object"` mechanically; no other field of theirs
// changes.
//
// LLMW.OUTPUT.LIST.2 (B7b) closes six of the gaps B7a's own comment (below,
// preserved for the record of what was and was not representable at the
// time) signalled: numeric item fields, a second JSON-key fallback, an
// enum-with-default item field, an index-seeded default for a numeric field,
// a post-parse sort of the whole list, and a declared cherry-pick selection
// destination. `castingSuggestions` is still not representable — its gate
// needs a validity rule on non-string fields, which `item.validity` (§3.5 of
// this ticket) still does not express — and is not decided here (B7h).
//
// LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1) closes the gap `LLMW.OUTPUT.LIST.2`'s
// own comment above named ("The `"object"` variant is untouched.") — UC1
// needs `durationSeconds` on an `"object"`-kind result (the insertion
// descriptor, B11-bd), and the object field shape was plain text only.
// `ObjectOutputField` is a portage of `ListItemField`'s own union, not an
// invention: `"string"` carries every member the flat shape already had
// (`field`, `jsonKey`, `maxLength?`, `truncateTo?`), unchanged; `"number"`
// carries `exclusiveMin?`/`max?`, the same bounds `ListItemField`'s own
// `"number"` variant uses, and a mandatory `fallback` — but only `"omit"`,
// never `"index"`: `ListItemField`'s `"index"` fallback seeds a numeric field
// from the item's position in a list, and there is no such position outside
// a list. `output.fields` is retyped from the flat shape to
// `ObjectOutputField[]`; all ten existing descriptors gain `type: "string"`
// mechanically on every field (fifteen fields total), no other value
// changing.
//
// LLMW.TEXT.1 (B12b-1) adds a third `kind`, `"text"` — the runner's
// non-JSON call (`callLLMText`, `src/lib/llm/index.ts`), needed by §5.3's
// "cooking" stage: a generated narrative prompt is prose, not a JSON object
// to decode. See the field itself for the shape and the three decisions
// deliberately left out of it. No descriptor declares `kind: "text"` yet —
// this ticket ships the engine, not the narrative-prompt-composer descriptor
// (B12b-2) or any bench render surface for it.
// ---------------------------------------------------------------------------

/**
 * Closed set of anchor / target entity kinds (§3.1's full registry).
 */
export type EntityKind = "project" | "sequence" | "shot" | "asset";

/**
 * The closed variable registry (§3.1) — all thirteen entries, covering the
 * eight flat-JSON operations of Phase B (`docs/LLM_WORKSPACE_ARCHITECTURE.md`
 * §3.1, "The closed registry for Phase B").
 */
export type VariableId =
  | "PROJECT.IDENTITY"
  | "PROJECT.STYLE"
  | "SEQ.CONTEXT"
  | "SEQ.CURRENT_PROMPT"
  | "SHOT.CORE"
  | "SHOT.CURRENT_PROMPT"
  | "SHOT.CAST"
  | "SHOT.REFERENCES"
  | "ASSET.CORE"
  | "ASSET.BIBLE"
  | "ASSET.SEQ_APPEARANCES"
  | "ASSET.SHOT_APPEARANCES"
  | "ASSET.REFERENCES"
  // LLMW.UC2.RETAKE.1 (B9b) — the sequence's other shots, for a shot-anchored
  // descriptor that needs sibling-shot continuity (`shot.retakeDirected`, and
  // UC1's future insertion descriptor). See `variables/registry.ts` for the
  // resolver and its bound.
  | "SEQ.SHOTS"
  // LLMW.POSTRESPONSE.1 (B7g) — the outline's parsed "## " sections, typed
  // (never a formatted string, per the resolver contract), needed both by
  // `sequences.fromOutline`'s own builder branches and by its post-response
  // form (`postResponse` below). See `variables/registry.ts` for the
  // resolver, which shares its parsing with `sequenceGeneration.ts` through
  // the extracted `parseOutlineSections` (`src/lib/prompts/outlineSections.ts`).
  | "PROJECT.OUTLINE_SECTIONS"
  // LLMW.VAR.PROJECT_SCOPE.1 (B7c-n2) — the first project-scope collections:
  // every Sequence, every Shot (across every Sequence), and every Asset of a
  // Project, needed by `assetExtraction.ts`'s three project-wide reads
  // (`:118-127`, `:151-164`). No descriptor references any of the three yet
  // — declared and proven against a real database, per this ticket's own
  // reasoning for going first. See `variables/registry.ts` for the three
  // resolvers and their bounds (none — the action's own reads carry none
  // either).
  | "PROJECT.SEQUENCES"
  | "PROJECT.SHOTS"
  | "PROJECT.ASSETS"
  // LLMW.VAR.CASTING.1 (B7h-b1) — addressable entities and what is already
  // attributed, needed by `casting.fromSequence` (B7h-b2, not yet declared).
  // `SEQ.SHOT_TARGETS` / `PROJECT.ASSET_LIBRARY` carry the `id` `SEQ.SHOTS` /
  // `PROJECT.ASSETS` never project, so a plan or an asset can be designated
  // by the model. `SEQ.EXISTING_CASTINGS` is the plan-level and
  // sequence-level castings already posted for this sequence, kept distinct
  // — one variable answering one question, over two tables. See
  // `variables/registry.ts` for the three resolvers and their projections
  // (read verbatim off `CastingFromSequenceInput`,
  // `src/lib/prompts/casting-from-sequence.ts`).
  | "SEQ.SHOT_TARGETS"
  | "PROJECT.ASSET_LIBRARY"
  | "SEQ.EXISTING_CASTINGS"
  // LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §3bis. The sequence's own identity —
  // `id` and `title` — needed because `buildCastingFromSequencePrompt`
  // embeds the sequence anchor's own numeric id in four places
  // (`casting-from-sequence.ts:82,108,145,154`), which no existing variable
  // projects: `SEQ.CONTEXT` deliberately never carries `id` (narrative
  // context, not identity), and `SEQ.SHOT_TARGETS` / `PROJECT.ASSET_LIBRARY`
  // carry a *child* entity's id, never the parent sequence's own. Kept
  // separate from `SEQ.CONTEXT` rather than widening it — an anchor's own
  // identifier is a different concern from its narrative context, same
  // reasoning `SEQ.SHOT_TARGETS` already applied to "addressable" vs.
  // "descriptive". The overlap with `SEQ.CONTEXT.title` is accepted: each
  // serves a different phrase of the prompt. See `variables/registry.ts` for
  // the resolver.
  | "SEQ.IDENTITY"
  // LLMW.JAR.1 (B12a) — the narrative prompt jar itself, read back as an
  // ingredient (§5.2: "a jar is an ingredient like any other"). Mirrors
  // `SHOT.CURRENT_PROMPT` exactly, over the sibling column. Declared ahead of
  // its own consumer (B12b fills the jar) — see `variables/registry.ts` for
  // the resolver and `ActionId`'s own comment above for the same discipline
  // applied to this ticket's write action.
  | "SHOT.NARRATIVE_PROMPT"
  // LLMW.LIGHTING.1 (B15a) — the lighting field at its three levels (§5.9 of
  // docs/LLM_WORKSPACE_PRODUCT_VISION.md). `SHOT.LIGHTING` / `ASSET.LIGHTING`
  // are one-field reads, on the model of `SHOT.CURRENT_PROMPT`. `SEQ.LIGHTING`
  // is the one variable of the three that carries the user's own preséance
  // rule (2026-08-18): the Sequence's own field wins when non-blank after
  // `trim()`; otherwise it reads its `type: "environment"` Assets through
  // `sequence_assets`, ordered by `assets.name` — zero or several are both
  // normal, rendered as-is, no election rule invented. Its resolved data
  // carries its own source (`"own" | "environment" | "none"`) so a consumer
  // can always tell where the value came from. See `variables/registry.ts`
  // for the three resolvers and `SeqLightingData`'s own type.
  | "SHOT.LIGHTING"
  | "ASSET.LIGHTING"
  | "SEQ.LIGHTING";

/**
 * Identifier of a specialisation knowledge document (§3.3, `KB.*`). Opaque
 * for now — the knowledge document registry is not part of Phase B's
 * descriptor tickets, and none of the eight flat-JSON operations references
 * one.
 */
/**
 * The closed set of image families an operation may read — LLMW.DESCRIPTOR.IMAGE.1
 * (B16a). Declared here rather than beside the registry itself, for the same
 * reason `VariableId` is: `images/registry.ts` is `server-only`, and a
 * descriptor's type must stay importable from a client component.
 *
 * Two entries. `PROJECT_STYLE.REFERENCES` was added by B20c, for the migration
 * of `projectStyleReferenceAnalysis` into the workspace
 * (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3) — the second family, and the
 * one that proves the registry was worth having: it has its own storage root,
 * its own confinement predicate and its own approval gate, none of which the
 * first entry knows about.
 */
export type ImageSourceId = "ASSET.REFERENCE_IMAGES" | "PROJECT_STYLE.REFERENCES";

export type KnowledgeId = string;

/**
 * Identifier of an existing, named, reviewed Server Action invoked at
 * Approve (§3.2). Closed by `LLMW.ACTION.REGISTRY.1a` (B4a): the seven
 * Approve-side write actions the eight flat-JSON descriptors' `commit`
 * arrays reference, declared and proven against a real database in
 * `actions/registry.ts`. A `commit` entry naming anything else no longer
 * compiles — `actions/registry.ts`'s `ACTION_REGISTRY` is `satisfies
 * Record<ActionId, ActionRegistryEntry>`, so the two are kept in lockstep by
 * the compiler in both directions.
 */
export type ActionId =
  | "updateAssetDetailsInline"
  | "updateAssetDescriptionFieldInline"
  | "applyBatchAssetDescriptionDraftsInline"
  | "updateShotPrompt"
  | "updateSequencePrompt"
  | "applyGeneratedStory"
  | "applyGeneratedOutline"
  // LLMW.UC2.RETAKE.1 (B9b) — the write side of `shot.retakeDirected`
  // (§0bis of the ticket: `updateShot` is arbitrated out — it redirects,
  // silently rewrites `shotPrompt`, and no-ops on a blank title).
  | "updateShotNarrativeContext"
  // LLMW.ACTION.INSERT.1 (B7c-w) — the write side of the three list
  // operations' Approve step. Unlike the eight above, these `INSERT` a row
  // per retained item rather than `UPDATE` an existing one —
  // `ActionRegistryEntry.operation` in `actions/registry.ts` distinguishes
  // the two. Only `createGeneratedShots` is wired into a descriptor's
  // `commit` (`shots.fromSequence`); the other two are declared for the same
  // reason B4a declared all seven together — describing the shared shape
  // honestly — without yet being reachable (their own descriptors are future
  // tickets).
  | "createGeneratedShots"
  | "createSelectedAssets"
  | "createGeneratedSequences"
  // LLMW.ACTION.CASTING.1 (B7h-a) — the write side of the casting
  // suggestions' Approve step. `INSERT`s one row per retained item, like the
  // three above, but into one of *two* different link tables depending on
  // the item's own `targetType` — `actions/registry.ts`'s `target` field is
  // widened (`{ entity }` -> `{ entity } | { entities }`) for this one entry
  // to say so. Not yet reachable from a descriptor's `commit` (its own
  // descriptor, `casting.fromSequence`, is B7h-b) — declared for the same
  // reason B7c-w's three insert entries were declared ahead of being wired.
  | "applySelectedCastingSuggestions"
  // LLMW.ACTION.INSERT_AT.1 (B11-a) — the write side of UC1's "insert a
  // plan between two existing plans". `INSERT`s one row like the four
  // above, but at an arbitrary position (`afterShotId`) rather than always
  // at `max(orderIndex) + 1` — `actions/registry.ts`'s `ownership.transactional`
  // is `true` for this one entry alone; every entry above keeps `false`.
  // Not the ticket's own file list (`src/actions/shots.ts`,
  // `actions/registry.ts`, `actions/bindings.ts`, `benchRun.ts`,
  // `tests/actions/registry.test.ts`) — widening this union is a mechanical
  // consequence of `actions/registry.ts`'s own `satisfies Record<ActionId,
  // ActionRegistryEntry>` (a new key not in `ActionId` does not compile),
  // the same reason every earlier `ActionId` addition (B7c-w, B7h-a) also
  // touched this file despite never being named in those tickets' own scope
  // lists either. Reported in `.agents/executor_report.md` rather than
  // silently assumed. Not yet reachable from a descriptor's `commit` (its
  // own descriptor is B11-bd) — declared ahead of being wired, the same
  // discipline every earlier insert `ActionId` followed.
  | "createShotAtPosition"
  // LLMW.JAR.1 (B12a) — the narrative prompt jar's write side (§5.3 of
  // docs/LLM_WORKSPACE_PRODUCT_VISION.md): a generated narrative prompt is a
  // jar of its own, stored on `shots.narrative_prompt`, never merged into
  // `shotPrompt`. Not yet reachable from a descriptor's `commit` — the
  // operation that fills the jar is B12b, the next ticket. Declared and
  // proven against a real database ahead of that consumer, same discipline
  // as every earlier action declared before its own descriptor
  // (`createGeneratedShots`, `applySelectedCastingSuggestions`,
  // `createShotAtPosition`).
  | "updateShotNarrativePrompt"
  // LLMW.LIGHTING.1 (B15a) — the lighting field's write side, one action per
  // level (§5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md). `updateShotLighting`
  // mirrors `updateShotNarrativePrompt` exactly, over `shots.lighting`;
  // `updateSequenceLighting` mirrors `updateSequencePrompt` exactly, over
  // `sequences.lighting`; `updateAssetLightingInline` mirrors
  // `updateAssetDescriptionFieldInline` (one field, full replacement, no
  // append mode), over `assets.lighting`. Not yet reachable from a
  // descriptor's `commit` — this ticket delivers no surface, no descriptor,
  // no model call (B15b/B16). Declared and proven against a real database
  // ahead of that consumer, the same discipline every earlier action
  // declared before its own descriptor.
  | "updateShotLighting"
  | "updateSequenceLighting"
  | "updateAssetLightingInline";

/**
 * Names a field on the operation's anchor entity, for a `messages.chainNotFound`
 * level, or for the `anchorField` variant of `PreconditionRef` below. The
 * entity is already known from `anchor.entity`, so the reference only needs
 * to name the field.
 */
export type FieldRef = string;

/**
 * LLMW.DESCRIPTOR.ASSETS.1 (B7f). What a `preconditions` entry's `refs` array
 * names: a field on the anchor entity (the only form B2b's `fields:
 * FieldRef[]` used to allow), a normalized `intent.parameters` entry, or a
 * declared context variable's resolved data. Replaces `fields: FieldRef[]`
 * outright — no coexistence of the two shapes — because `assetsFromProject`'s
 * own two guards need a reference `fields` could not express: "Select at
 * least one asset type" gates on `intent.parameters.assetTypes` (not a field
 * of the `project` anchor at all), and "No narrative content found" needs
 * `PROJECT.SEQUENCES` alongside `pitch`/`story`/`outline` in the same `"any"`
 * rule (`assetExtraction.ts:129-133`'s `hasNarrative`).
 *
 * "Non-empty" is defined per variant, not by one shared rule:
 *   - `anchorField`: `isFieldNonEmpty`'s existing rule, unchanged (a
 *     non-blank string);
 *   - `parameter`: present after `normalizeIntentParameters` **and**
 *     non-empty — `false` is empty, `""` is empty, `[]` is empty, `0` is
 *     **not** empty (a declared numeric parameter of `0` is a real,
 *     meaningful value, not an absence);
 *   - `variable`: the resolved value must be an array, and "non-empty" means
 *     that array's own length — the only shape a `preconditions` consumer
 *     needs today (`PROJECT.SEQUENCES`). No other resolved shape has a
 *     consumer; the runner refuses loudly (`throw`) rather than guess a rule
 *     for one.
 */
export type PreconditionRef =
  | { anchorField: FieldRef }
  | { parameter: string }
  | { variable: VariableId };

/**
 * A single field of a `kind: "list"` item, discriminated on `type` — closed
 * by LLMW.OUTPUT.LIST.2 (B7b) §2.1, read off the four flat-JSON-array
 * parsers rather than designed. `type` is mandatory on every entry: no
 * silent fallback to `"string"`, on the same principle B7a already applied
 * to `output.kind` itself (a net refusal of an absent or unknown `kind`).
 */
export type ListItemField =
  | {
      type: "string";
      field: string;
      jsonKey: string;
      jsonKeyFallback?: string;
      truncateTo?: number;
    }
  | {
      type: "number";
      field: string;
      jsonKey: string;
      jsonKeyFallback?: string;
      exclusiveMin?: number; // value accepted if > exclusiveMin (strict)
      max?: number; // value accepted if <= max (inclusive bound)
      fallback: "omit" | "index"; // mandatory, never implicit
    }
  | {
      type: "enum";
      field: string;
      jsonKey: string;
      jsonKeyFallback?: string;
      values: string[];
      default: string; // must belong to values
    };

/**
 * A single field of a `kind: "object"` output, discriminated on `type` —
 * closed by LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1), a portage of
 * `ListItemField` above rather than a new invention. `type` is mandatory on
 * every entry, on the same "no silent fallback" principle `ListItemField`
 * and `output.kind` itself already apply.
 *
 * `"string"` carries exactly what the pre-B11-b1 flat shape carried:
 * `maxLength` refuses an over-length value, `truncateTo` cuts it silently —
 * both unchanged in `parseObjectOutput` (`runner.ts`).
 *
 * `"number"` carries `exclusiveMin`/`max`, the same bounds `ListItemField`'s
 * own `"number"` variant uses, validated the same way
 * (`typeof === "number"`, `Number.isFinite`, `exclusiveMin` exclusive, `max`
 * inclusive — see `runner.ts`'s shared validation). `fallback` is mandatory,
 * as on `ListItemField`, but admits only `"omit"`: `ListItemField`'s
 * `"index"` fallback seeds a numeric field from the item's position in a
 * list, and an `"object"` output has no such position to seed from.
 */
export type ObjectOutputField =
  | {
      type: "string";
      field: string;
      jsonKey: string;
      maxLength?: number;
      truncateTo?: number;
    }
  | {
      type: "number";
      field: string;
      jsonKey: string;
      exclusiveMin?: number; // value accepted if > exclusiveMin (strict)
      max?: number; // value accepted if <= max (inclusive bound)
      fallback: "omit"; // mandatory, never implicit — "index" has no meaning outside a list
    };

/**
 * A `kind: "composite"` list's item field — LLMW.OUTPUT.COMPOSITE.1 (B20a).
 * `ListItemField` plus one variant it has no consumer for outside a composite
 * answer: an **array of strings**.
 *
 * Deliberately a separate union rather than a widening of `ListItemField`
 * itself. Adding `"stringList"` there would make every `kind: "list"` result's
 * item values `string | number | string[]`, breaking ~14 declared consumers to
 * express something none of them can produce — `castingSuggestions`,
 * `sequenceShots`, `assetExtraction` and `sequenceGeneration` have no
 * array-valued field between them. The widening happens where the need is.
 *
 * `referenceKeys` on `projectStyleReferenceAnalysis`'s candidate rules is the
 * one real consumer (§5.9): every rule cites every reference supporting it.
 * Whether those keys are *valid* is a different question, and not this type's
 * — that is cross-item referential validity, B20b.
 */
export type CompositeListItemField =
  | ListItemField
  | {
      type: "stringList";
      field: string;
      jsonKey: string;
      /** Each member is trimmed; blank members are dropped. An absent or non-array value yields an empty list, never a refusal — item-level refusal is `validity`'s job. */
      maxItems?: number;
    };

/**
 * The frozen descriptor shape — copied verbatim from §4.1, substituting the
 * auxiliary types above for their placeholders.
 */
export type OperationDescriptor = {
  id: string;
  name: string;

  // Correction 3 (§4.1). `entitySet` exists because
  // `generateBatchAssetDescriptionDrafts` anchors on a bounded set of Assets,
  // not on one: it reads `assetIds` and refuses beyond `BATCH_LIMIT`.
  // Modelling it as a single entity would have forced the runner to invent
  // a loop the descriptor never declared.
  anchor:
    | { kind: "entity"; entity: EntityKind }
    | { kind: "insertionPoint"; entity: EntityKind }
    | { kind: "entitySet"; entity: EntityKind; maxSize: number };

  context: {
    variables: Array<{
      id: VariableId; // closed registry, section 3.1
      userAdjustable: boolean; // per variable — correction 1
    }>;
  };

  /**
   * LLMW.DESCRIPTOR.IMAGE.1 (B16a). The operation reads N stored images, in a
   * user-chosen order, each carrying an opaque per-run key (`R1..Rn`) the
   * prompt labels it with and the model's answer may cite.
   *
   * Designed against B20's needs and not only against B16b's single-image
   * lighting case — `docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3 states that
   * constraint explicitly, on the grounds that a declaration shaped around one
   * image would be widened immediately afterwards.
   *
   * Three things this shape deliberately does NOT carry:
   *
   *   - **no path, ever.** It names a `source` from the closed registry
   *     (`images/registry.ts`); confinement, storage root and per-file bound
   *     belong to the family that owns the files, not to a descriptor;
   *   - **no selection.** Which images, and in what order, is user input and
   *     arrives beside `intent` on the run input. This is precisely the
   *     primitive §11.3's "B8 dissolved" note found missing: "No variable can
   *     express 'the ordered subset the user just ticked'";
   *   - **no implicit bound.** `minCount`, `maxCount` and `maxTotalBytes` are
   *     all mandatory, on the same no-silent-fallback principle this format
   *     has applied since B7a made `output.kind` itself mandatory.
   */
  images?: {
    source: ImageSourceId;
    minCount: number; // below it, the operation refuses with `messages.noneSelected`
    maxCount: number; // above it, `messages.tooMany`
    maxTotalBytes: number; // cumulative raw bytes across the whole selection
    keyPrefix: string; // `"R"` produces `R1..Rn` — declared, never hard-coded in the runner
    messages: {
      noneSelected: string; // fewer than `minCount` selected — including none at all
      tooMany: string; // more than `maxCount` selected
      /** Prefix for a refusal the image family itself reported (a foreign id, a missing file, an undecodable one). The family's own reason follows it. */
      unavailable: string;
    };
  };

  expertise: {
    role: string;
    system: { blocks: Block[]; separator: string };
    knowledge: KnowledgeId[];
  };

  // Correction 2. Composable, not a tagged union: an operation may take a
  // mode AND a parameter. An empty object means "the user steers nothing".
  // `mode.modes[].requiresNonEmpty` (originally sketched here) is removed by
  // correction 6 — it carried no message and could not describe a gate that
  // applies in every mode; `preconditions` below replaces it.
  intent: {
    freeText?: { label: string };
    mode?: {
      modes: Array<{ id: string }>;
      defaultMode: string;
    };
    // LLMW.DESCRIPTOR.ASSETS.1 (B7f) adds `"boolean"` and `"multiEnum"` —
    // `assetsFromProject`'s `includeShots` checkbox and `assetTypes`
    // multi-select, the panel's own controls
    // (`AssetsLLMExtractPanel.tsx:63-69`), the first descriptor to need
    // either. `values` is `"multiEnum"`-only: the closed set of members a
    // provided array must be a subset of (see `normalizeIntentParameters`'s
    // own rule in `runner.ts` for what "valid" means per type).
    parameters?: Array<{
      id: string;
      type: "integer" | "string" | "boolean" | "multiEnum";
      label: string;
      default?: number | string | boolean | string[];
      min?: number; // "integer" only
      max?: number; // "integer" only
      values?: readonly string[]; // "multiEnum" only — the closed set of members
    }>;
  };

  template: { blocks: Block[]; separator: string };

  // Correction 6, reported by B2a: the pipeline refuses in several places
  // before it ever calls the model, and every refusal message differs per
  // operation — `generateStory` says "LLM provider not configured. Go to
  // Settings to configure Ollama."; `generateSequencePromptDraft` says "LLM
  // not configured. Go to Settings to set up Ollama." No generic runner text
  // can stand in for either without changing what the user reads, and B3 is
  // forbidden from changing observable behaviour
  // (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §4.1).
  //
  // Second round, same ticket: `invalidRequest` is optional —
  // `generateStory(projectId: number)` takes a typed positional argument and
  // never validates it, so there is no verbatim source text to carry; an
  // absent message is honest, an invented one is not. `invalidMode` is new:
  // "Invalid assist mode." is a real pre-call refusal on the five
  // mode-driven operations and needs a declared home or B3 loses it.
  messages: {
    invalidRequest?: string; // absent when the action has no id validation to reproduce
    invalidMode?: string; // "Invalid assist mode." — the five mode-driven operations
    notConfigured: string;
    chainNotFound: Partial<Record<EntityKind, string>>; // per level of the chain
  };

  // `preconditions` replaces `intent.mode.modes[].requiresNonEmpty`, which
  // carried no message and could not express a gate that is not mode-driven:
  // `generateStory` refuses with "Add a pitch first." on an empty pitch, in
  // every mode (it has no `intent.mode` at all). One concept: named fields
  // on the anchor entity that must satisfy a `require` rule, optionally
  // restricted to some modes, with its own message.
  //
  // Widened from a single `field: FieldRef` to `fields: FieldRef[]` plus
  // `require: "all" | "any"` — found insufficient by `LLMW.RUNNER.1b` (B2b)
  // against `assetBible.generate`: `resolveAssetBibleContext`
  // (`src/lib/prompts/assetBibleContext.ts`) refuses only when *both*
  // `description` and `notes` are empty, an "at least one of two" gate two
  // single-field entries cannot express without each wrongly refusing
  // whenever *its own* field alone is empty. `require` mirrors `output`'s own
  // field-satisfaction vocabulary (§4.1 correction 5) rather than inventing a
  // second one. Every existing single-field precondition migrates to
  // `fields: [x], require: "all"` — identical to `"any"` when there is only
  // one field, so no observable behaviour changes.
  //
  // `fields: FieldRef[]` -> `refs: PreconditionRef[]`, LLMW.DESCRIPTOR.ASSETS.1
  // (B7f). No coexistence of the two shapes: every existing entry (five
  // descriptors) migrates mechanically to `refs: [{anchorField: x}, ...]`,
  // same `require`, same message, same `modes` — an observable no-op. See
  // `PreconditionRef` above for what each ref variant means and how its own
  // "non-empty" is defined.
  preconditions?: Array<{
    refs: PreconditionRef[];
    require: "all" | "any"; // every declared ref non-empty, or at least one
    modes?: string[]; // absent = every mode
    message: string;
  }>;

  // Correction 5, read off the seven existing parsers rather than assumed.
  // `fields` named entity fields only, but the model answers in snake_case
  // and each operation validates differently. A runner cannot guess the key
  // mapping, the strictness, or the error text — and B3 must not change one
  // observable message (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §4.1).
  //
  // Widened to a discriminated union by `LLMW.OUTPUT.LIST.1` (B7a): `kind`
  // distinguishes the single-object shape above (now `"object"`, unchanged
  // in every other respect — mechanical on all eight existing descriptors)
  // from the list shape (`"list"`) the four flat-JSON-array operations need
  // (`sequenceShots.ts`, `assetExtraction.ts`, `sequenceGeneration.ts`,
  // `castingSuggestions.ts`). A `list?` field bolted onto the object shape
  // was rejected on purpose (ticket §3.1): two shapes cohabiting with an
  // implicit precedence is exactly how a format rots.
  //
  // LLMW.OUTPUT.LIST.1 (B7a) left the list shape deliberately narrower than
  // what all four parsers actually do; LLMW.OUTPUT.LIST.2 (B7b) closes five
  // of the six gaps it signalled — see `.agents/executor_report.md` before
  // writing a fifth list descriptor. What remains true after B7b:
  //   - item fields are now a discriminated union (`ListItemField`, §2.1) —
  //     `"string"`, `"number"` (with `exclusiveMin`/`max`/an obligatory
  //     `fallback`) and `"enum"` (with a mandatory `default`) — and
  //     `RunOperationResult`'s list items carry `string | number` (§2.3);
  //   - `item.validity` still only expresses "these fields, all/any
  //     non-empty", and only over fields of type `"string"` (§3.5).
  //     `castingSuggestions.ts`'s real gate needs a valid `targetType` enum
  //     plus two positive-integer ids checked for existence in the
  //     database — outside what any field-presence rule can express, so
  //     `castingSuggestions` is still not representable by this shape at
  //     all (§2 of the report). Not decided here — B7h;
  //   - a dual JSON-key fallback (`jsonKeyFallback`) and an enum-with-default
  //     are both now representable (§3.1, §3.4);
  //   - a post-parse `sort` and an index-seeded numeric `fallback` are both
  //     now representable (§3.3, §3.6), matching `sequenceGeneration.ts`'s
  //     `order_index` and its `.sort(order_index)`.
  output:
    | {
        kind: "object";
        target: { entity: EntityKind };
        // Widened from a flat `{field, jsonKey, maxLength?, truncateTo?}`
        // shape to `ObjectOutputField[]` (§2.1 above) by
        // LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1) — every existing descriptor's
        // fields gain `type: "string"` mechanically, no other value
        // changing. `maxLength` (reject) and `truncateTo` (silently cut) stay
        // exactly where they were, now on the `"string"` variant only. B3b
        // first reproduced this in the adapter, which left operation-specific
        // output logic outside the descriptor: a stored descriptor (§4.2)
        // would then be incomplete, and B4's registry would describe an
        // operation that quietly does more than it declares.
        fields: Array<ObjectOutputField>;
        require: "all" | "any"; // every declared field non-empty, or at least one
        exactKeysOnly?: boolean; // reject any key not declared — the strict
        // single-field asset parsers, which refuse a stray draft for the other
        // field
        errors: {
          unparsable: string; // JSON.parse failed, or the shape is wrong
          empty: string; // the `require` rule was not satisfied
        };
      }
    | {
        kind: "list";
        // The model's top-level array key — `shots` / `assets` / `sequences`
        // / `suggestions` on the four real operations (never assumed
        // uniform: each descriptor declares its own).
        arrayKey: string;
        item: {
          fields: Array<ListItemField>; // §2.1 of LLMW.OUTPUT.LIST.2 (B7b)
          // Item-validity gate: the subset of the fields above (by `field`
          // name) that must be non-empty for the item to survive, and
          // whether all or at least one must be. Mirrors `require`'s own
          // vocabulary rather than inventing a second one. All three
          // representable parsers (`sequenceShots`, `assetExtraction`,
          // `sequenceGeneration`) gate on exactly one field (`title` /
          // `title` / `name`), so `"all"` and `"any"` are equivalent for
          // them — `"all"` chosen for the same reason `preconditions`
          // standardised on it. `castingSuggestions` cannot be expressed
          // here at all (see the type-level note above and the report).
          // Only `"string"` fields can appear (§3.5 of the B7b ticket).
          validity: { fields: string[]; require: "all" | "any" };
        };
        // Present on `assetExtraction` (20) and `castingSuggestions` (60);
        // absent on `sequenceShots` and `sequenceGeneration` (no cap found
        // in either). Every capped parser truncates the already-filtered
        // array silently — neither refuses on overflow — so this shape has
        // no "refuse" variant; there is no evidence for one.
        maxItems?: number;

        // LLMW.OUTPUT.LIST.2 (B7b), §2.2 gap 5. A post-parse sort of the
        // whole filtered list. Only `sequenceGeneration.ts` sorts
        // (`.sort((a, b) => a.order_index - b.order_index)`), ascending, on
        // a numeric field — `direction` is therefore the literal `"asc"`
        // and nothing else; no parser evidences a descending or
        // string-keyed sort.
        sort?: { field: string; direction: "asc" };

        // LLMW.OUTPUT.LIST.2 (B7b), §2.2 gap 6. The `FormData` key that
        // carries the cherry-picked subset at Approve. The four write
        // actions share the same shape (identifiers + `returnTo` + one JSON
        // key) but not the same key name: `shotsJson`
        // (`sequenceShots.ts:137`), `sequencesJson`
        // (`sequenceGeneration.ts:173`), `selectedJson`
        // (`assetExtraction.ts:203`, `castingSuggestions.ts:289`).
        // Obligatory: a list operation with no declared selection
        // destination is not approvable, and B7d must not have to guess it.
        //
        // Carries only the destination key, not a second payload shape: the
        // four write actions re-parse the JSON they receive through their
        // own `normalize*`, so the payload must carry the model's own JSON
        // keys (`shot_code`, `duration_seconds`, `assetType`…), not entity
        // field names. B7d can rebuild that payload from the descriptor
        // alone — for each declared item field, emit `jsonKey: value` — and
        // the re-normalization is idempotent (an already-truncated string
        // re-truncates identically, an already-resolved enum is a member of
        // `values`, an omitted numeric field becomes `null` again). No
        // further field is therefore needed here, and none is added.
        selection: { formDataKey: string };

        errors: {
          unparsable: string; // JSON.parse failed
          // `parsed[arrayKey]` missing, or present but not an array — one
          // message, matching all four parsers: none of them distinguishes
          // "wrong top-level shape" from "key present but not an array",
          // both fall through the same `!Array.isArray(...)` check to the
          // same message.
          notArray: string;
          empty: string; // every item was filtered out by `item.validity`
        };
      }
    | {
        // LLMW.TEXT.1 (B12b-1). Free text, not decoded: `callLLMText`
        // (`src/lib/llm/index.ts`) is called instead of `callLLMJson`, and
        // the response is returned `.trim()`ed, nothing else. Three
        // decisions, already taken, not oversights:
        //   - no `unparsable`: nothing is parsed, so there is nothing that
        //     can fail to parse — this asymmetry with `"object"`/`"list"` is
        //     the whole point of a text-mode output, not a gap in it;
        //   - no `require`: there is exactly one value, and `errors.empty`
        //     already covers the one refusal a single value can need;
        //   - no `maxLength` / `truncateTo`: a word-count budget belongs to
        //     the conformation stage (§5.5 of the product vision, ticket
        //     B13), not to the runner. Not added "just in case" — a field
        //     with no consumer is debt, not readiness.
        // LLMW.OUTPUT.COMPOSITE.1 (B20a). One object holding a scalar AND
        // several named lists at once — the shape
        // `projectStyleReferenceAnalysis` answers with, and the second of the
        // three format gaps §5.9 lists for B20 (the first, the image input,
        // is closed by B16a).
        //
        // `output.kind` picks exactly one shape today: `"object"` for a flat
        // record, `"list"` for one array, `"text"` for prose. That analysis
        // returns `{summary, observations[], candidateRules[]}` — a scalar and
        // *two* lists, each with its own item shape — which none of the three
        // can express and which no combination of them can either, because
        // `kind` is singular by construction.
        //
        // Deliberately NOT "an object output whose fields may be lists": the
        // two lists need `item.validity`, `maxItems` and per-item field
        // typing, all of which already exist on the list shape and none of
        // which `ObjectOutputField` has. Reusing the list shape per named list
        // is the smaller move, and it keeps one definition of what an item is.
        kind: "composite";
        target: { entity: EntityKind };
        /** The scalar part. `ObjectOutputField` unchanged — `summary` is a plain string field and needs nothing new. */
        scalars: ObjectOutputField[];
        /** The named lists, in declaration order. Each carries its own model-side `arrayKey` and its own item contract — never one shared item shape across lists that hold different things. */
        lists: Array<{
          /** The key this list lands under in the result. Distinct from `arrayKey`: the model's own JSON key is its business, the result's key is the descriptor's. */
          key: string;
          arrayKey: string;
          item: {
            fields: CompositeListItemField[];
            validity: { fields: string[]; require: "all" | "any" };
            /**
             * LLMW.OUTPUT.REFVALIDITY.1 (B20b) — cross-item referential
             * validity, the third and last of §5.9's format gaps for B20:
             * *"Every observation cites exactly one attached reference; every
             * candidate rule cites every reference supporting it. No rule in
             * `item.validity` can state that today."*
             *
             * The keys are the ones the runner itself attached
             * (`descriptor.images`'s `R1..Rn`), so nothing here needs to be
             * declared twice or kept in sync.
             *
             * **An item citing an unattached key refuses the whole answer —
             * it is not filtered.** That is not a preference: it is what
             * `projectStyleReferenceAnalysis`'s own validator does today
             * (`validation.ts`'s `parseObservation` returns an error rather
             * than dropping the observation), and B20e is a migration, not a
             * redesign. A model inventing `R7` out of a four-image selection
             * has misunderstood the request, and keeping the half of its
             * answer that happens to parse is how a wrong answer gets stored.
             * No `onUnknown: "filter"` option is offered, because no consumer
             * wants one; if one ever does, that is a widening made then.
             */
            references?: {
              /** The field carrying the key(s). `mode` must match its declared type. */
              field: string;
              /** `"single"`: a `"string"` field holding exactly one attached key. `"subset"`: a `"stringList"` field whose every member is an attached key, and which must be non-empty. */
              mode: "single" | "subset";
              /**
               * Per-attached-key bounds across the whole list — how many items
               * must cite each key. Reproduces
               * `REFERENCE_ANALYSIS_LIMITS.minObservationsPerReference` /
               * `maxObservationsPerReference`, which today refuse an answer
               * that ignores one of the selected images entirely. Absent means
               * no coverage requirement.
               */
              coverage?: { min: number; max: number };
            };
          };
          maxItems?: number;
        }>;
        /** Every declared scalar non-empty, or at least one — same vocabulary as the `"object"` shape's own `require`. */
        require: "all" | "any";
        errors: {
          unparsable: string; // JSON.parse failed, or the shape is wrong
          notArray: string; // a declared list's `arrayKey` is missing or not an array
          empty: string; // the `require` rule over the scalars was not satisfied
          /** LLMW.OUTPUT.REFVALIDITY.1 (B20b) — an item cited a key that was never attached. Required only when some list declares `item.references`. */
          unknownReference?: string;
          /** LLMW.OUTPUT.REFVALIDITY.1 (B20b) — an attached key fell outside its declared `coverage`. Required only when some list declares `coverage`. */
          coverage?: string;
        };
      }
    | {
        kind: "text";
        target: { entity: EntityKind };
        // The single column the text lands in, from the same vocabulary as
        // `ObjectOutputField.field` — e.g. `"narrativePrompt"` for
        // `shots.narrative_prompt` (B12a's jar). No `jsonKey`: there is no
        // JSON to read a key from.
        field: string;
        errors: {
          empty: string; // the response was empty or entirely blank
        };
      };

  /** LLMW.POSTRESPONSE.1 (B7c-n3). A named transformation applied to the parsed
   * list, after `output` parsing and before the result reaches the caller — the
   * stage the pipeline had no place for. Declares every variable and every
   * intent parameter its form reads, on the same principle as the
   * `{variables, parameters, render}` block (B7c-n4): a form that reads
   * something it did not declare is a bug the declaration is meant to prevent.
   * Only meaningful for `output.kind === "list"`; no object-mode operation
   * evidences a need for it. */
  postResponse?: {
    form: string;
    variables: VariableId[];
    parameters?: string[];
  };

  commit: ActionId[]; // section 3.2

  /** LLMW.COMMIT.ADVISORY.1 (B10-f). What approving this operation leaves
   * stale, in the user's terms — shown after a successful commit, never
   * before. Declared by the operation because the operation is what knows;
   * the surfaces only render it. Optional: an operation that makes nothing
   * stale declares nothing, and an absent advisory renders nothing. */
  commitAdvisory?: string;

  executor: "inProcess" | "n8n";
  variation?: { seed: boolean };
};

/**
 * A block of a message (`expertise.system` or `template`). Static text, a
 * named render form of one variable, a named render form declaring every
 * variable it reads (when a source builder concatenates two variables'
 * fragments with no separator — see `sequencePrompt.assist` /
 * `shotPrompt.assist`), a named render form of an intent parameter, a named
 * render form of the operation's selected `intent.mode`, or a named render
 * form of the operation's free-text director's note (`intent.freeText`,
 * LLMW.INTENT.FREETEXT.1, B9a). A block that renders empty is dropped before
 * the list is joined by its separator (§4.1 correction 4, widened
 * 2026-08-13 with the `variables` and `mode` forms after
 * `LLMW.DESCRIPTOR.RENDER.1`'s proof found two shapes the original three
 * variants could not declare honestly: a mode-conditional fragment
 * referenced as if it were an `intent.parameters` entry, and a
 * multi-variable render form that named only one of the variables it
 * actually read; widened again by B9a with `freeText`, on the same model —
 * `intent.freeText` has no owning variable, no parameter id and is not the
 * selected mode, so it needs its own block shape rather than borrowing one
 * of the other four's).
 *
 * A seventh variant, `{variables, parameters, render}` (LLMW.BLOCK.VARPARAM.1,
 * B7c-n4), declares both a set of variables and a set of `intent.parameters`
 * entries a render form reads together — needed when the wording itself
 * branches on a variable's data (e.g. whether an Approved Sequence Prompt
 * exists) while also embedding a parameter value (the target shot count) in
 * that same branch's text, as `shots.fromSequence` does. Declares every
 * variable and parameter it reads by name, on the same principle as
 * `{variables, render}` above.
 */
export type Block =
  | { text: string }
  | { variable: VariableId; render: string }
  | { variables: VariableId[]; render: string } // a render form that reads more than one variable — declares all of them
  | { variables: VariableId[]; parameters: string[]; render: string } // a render form that reads variables AND intent.parameters together
  | { parameter: string; render: string } // an intent parameter, e.g. targetSections
  | { mode: true; render: string } // the operation's selected intent.mode
  | { freeText: true; render: string } // the operation's free-text director's note (intent.freeText)
  // LLMW.DESCRIPTOR.IMAGE.1 (B16a) — an eighth variant, on the same model as
  // `freeText` before it: the attached images have no owning variable, no
  // parameter id and are not the selected mode, so they need their own block
  // shape rather than borrowing one of the others. The render form receives
  // `Array<{key, metadata}>` and emits the per-image text blocks the prompt
  // needs to label what is attached (B20's per-reference context blocks are
  // exactly this).
  //
  // **The bytes never reach this block.** A render form sees a key and the
  // words the user typed about the image — never a path, never base64. Pixels
  // travel only as image parts of the outbound `ChatMessage`, the rule
  // `projectStyle/referenceAnalysis/prompt.ts` already imposes on itself.
  | { images: true; render: string };
