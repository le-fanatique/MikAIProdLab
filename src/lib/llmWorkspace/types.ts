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
  | "SEQ.IDENTITY";

/**
 * Identifier of a specialisation knowledge document (§3.3, `KB.*`). Opaque
 * for now — the knowledge document registry is not part of Phase B's
 * descriptor tickets, and none of the eight flat-JSON operations references
 * one.
 */
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
  | "createShotAtPosition";

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
        fields: Array<{
          field: string; // entity field, e.g. "shotPrompt"
          jsonKey: string; // model key,   e.g. "shot_prompt"
          maxLength?: number; // 4000 on the single-field asset parsers: reject
          truncateTo?: number; // 800 on the Asset Bible fields: silently cut.
          // Distinct from maxLength — one refuses, the other keeps a shortened
          // value. B3b first reproduced this in the adapter, which left
          // operation-specific output logic outside the descriptor: a stored
          // descriptor (§4.2) would then be incomplete, and B4's registry would
          // describe an operation that quietly does more than it declares.
        }>;
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
  | { freeText: true; render: string }; // the operation's free-text director's note (intent.freeText)
