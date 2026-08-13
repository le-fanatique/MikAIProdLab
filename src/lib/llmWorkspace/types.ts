// ---------------------------------------------------------------------------
// types.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1) / 1b (B1b-2)
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
// This module is not wired into any production path. B2 is the runner that
// will consume it.
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
 * Names a field on the operation's anchor entity, for an `intent.mode`
 * precondition (§4.1, correction 2). The entity is already known from
 * `anchor.entity`, so the reference only needs to name the field.
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
    systemPrompt: string;
    knowledge: KnowledgeId[];
  };

  // Correction 2. Composable, not a tagged union: an operation may take a
  // mode AND a parameter. An empty object means "the user steers nothing".
  intent: {
    freeText?: { label: string };
    mode?: {
      modes: Array<{
        id: string;
        requiresNonEmpty?: FieldRef; // precondition, checked pre-call
      }>;
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

  output: { target: { entity: EntityKind }; fields: string[] };

  commit: ActionId[]; // section 3.2

  executor: "inProcess" | "n8n";
  variation?: { seed: boolean };
};
