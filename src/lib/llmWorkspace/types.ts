// ---------------------------------------------------------------------------
// types.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1)
//
// Transcription of the frozen `OperationDescriptor` contract from
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §4.1 ("Two corrections the eight
// flat-JSON actions force"), plus the auxiliary types it references.
// `intent` reflects the 2026-08-13 amendment: not a tagged union but a
// composable object (`freeText?` / `mode?` / `parameters?`), found necessary
// while writing this ticket's `outline.generate` descriptor —
// `targetSections` is neither free text nor a mode. Nothing else here is
// invented: every shape is copied from the frozen sketch, narrowed only
// where this ticket's scope (three operations, three variables) makes a
// wider union premature — see the comments below.
//
// This module is not wired into any production path. B2 is the runner that
// will consume it.
// ---------------------------------------------------------------------------

/**
 * Closed set of anchor / target entity kinds. §3.1's full registry (10
 * variables) declares anchors across `project | sequence | shot | asset`,
 * but this ticket implements only 3 of those variables and 3 operations
 * anchored on `project` and `sequence`. Widening this union to `shot` /
 * `asset` belongs to the ticket that implements the operations and
 * resolvers that actually need them — adding the literals here now, with
 * no resolver and no descriptor exercising them, would be exactly the kind
 * of unreviewed, untested surface the closed-registry design in §3.1 exists
 * to prevent.
 */
export type EntityKind = "project" | "sequence";

/**
 * The closed variable registry (§3.1), narrowed to the 3 variables this
 * ticket implements. `PROJECT.STYLE`, `SHOT.CORE`, `SHOT.CURRENT_PROMPT`,
 * `SHOT.CAST`, `SHOT.REFERENCES`, `ASSET.CORE`, `ASSET.BIBLE` belong to the
 * ticket that implements the operations that need them — see
 * `docs/LLM_WORKSPACE_ARCHITECTURE.md` §3.1, "The closed registry for
 * Phase B".
 */
export type VariableId = "PROJECT.IDENTITY" | "SEQ.CONTEXT" | "SEQ.CURRENT_PROMPT";

/**
 * Identifier of a specialisation knowledge document (§3.3, `KB.*`). Opaque
 * for now — the knowledge document registry is not part of this ticket and
 * none of the 3 operations covered here references one.
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

  anchor: { kind: "entity" | "insertionPoint"; entity: EntityKind };

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
