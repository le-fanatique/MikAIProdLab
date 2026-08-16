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
  | "SEQ.SHOTS";

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
  | "updateShotNarrativeContext";

/**
 * Names a field on the operation's anchor entity, for a `preconditions`
 * entry (§4.1, correction 6) or a `messages.chainNotFound` level. The entity
 * is already known from `anchor.entity`, so the reference only needs to name
 * the field.
 */
export type FieldRef = string;

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
    parameters?: Array<{
      id: string;
      type: "integer" | "string";
      label: string;
      default?: number | string;
      min?: number;
      max?: number;
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
  preconditions?: Array<{
    fields: FieldRef[]; // on the anchor entity
    require: "all" | "any"; // every declared field non-empty, or at least one
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
        // (`assetExtraction.ts:202`, `castingSuggestions.ts:289`).
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

  commit: ActionId[]; // section 3.2

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
