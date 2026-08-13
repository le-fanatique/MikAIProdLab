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
  | "ASSET.REFERENCES";

/**
 * Identifier of a specialisation knowledge document (§3.3, `KB.*`). Opaque
 * for now — the knowledge document registry is not part of Phase B's
 * descriptor tickets, and none of the eight flat-JSON operations references
 * one.
 */
export type KnowledgeId = string;

/**
 * Identifier of an existing, named, reviewed Server Action invoked at
 * Approve (§3.2, e.g. `shots.insertBetween`). Opaque for now — the action
 * registry is B4's ticket (`LLMW.ACTION.REGISTRY.1`), not this one.
 */
export type ActionId = string;

/**
 * Names a field on the operation's anchor entity, for a `preconditions`
 * entry (§4.1, correction 6) or a `messages.chainNotFound` level. The entity
 * is already known from `anchor.entity`, so the reference only needs to name
 * the field.
 */
export type FieldRef = string;

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
  output: {
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
 * `shotPrompt.assist`), a named render form of an intent parameter, or a
 * named render form of the operation's selected `intent.mode`. A block that
 * renders empty is dropped before the list is joined by its separator
 * (§4.1 correction 4, widened 2026-08-13 with the `variables` and `mode`
 * forms after `LLMW.DESCRIPTOR.RENDER.1`'s proof found two shapes the
 * original three variants could not declare honestly: a mode-conditional
 * fragment referenced as if it were an `intent.parameters` entry, and a
 * multi-variable render form that named only one of the variables it
 * actually read).
 */
export type Block =
  | { text: string }
  | { variable: VariableId; render: string }
  | { variables: VariableId[]; render: string } // a render form that reads more than one variable — declares all of them
  | { parameter: string; render: string } // an intent parameter, e.g. targetSections
  | { mode: true; render: string }; // the operation's selected intent.mode
