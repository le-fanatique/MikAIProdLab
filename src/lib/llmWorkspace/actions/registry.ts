// ---------------------------------------------------------------------------
// actions/registry.ts — LLMW.ACTION.REGISTRY.1a (B4a)
//
// The §3.2 action registry (write side). Symmetric to the §3.1 variable
// registry: a `commit` step invokes an existing, named, reviewed Server
// Action rather than a generic "write row" primitive.
//
// This module's own data carries no runtime import — `source` stays
// documentation. `ActionId` (`../types.ts`) is the closed set of identifiers
// a descriptor's `commit` array may reference; this module is what each of
// those seven identifiers actually resolves to, and the compiler keeps the
// two in lockstep via `satisfies Record<ActionId, ActionRegistryEntry>`
// below. `actions/bindings.ts` (B4b) is the runtime resolution — the seven
// Approve-side callers listed there import `ACTION_BINDINGS` instead of the
// action directly; no caller imports this module itself for a production
// mutation.
//
// Every entry declares the action's real semantics, never an idealised one
// — per §3.2 and the six behaviours frozen by B0
// (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.2, "B0 — outcome, and what B4
// inherits"), arbitrated by the user on 2026-08-13 as the contract, not as
// defects to describe away:
//
//   1. `applyBatchAssetDescriptionDraftsInline` applies partially — one
//      independent `UPDATE` per item, no enclosing transaction.
//   2. The same action answers `ok: true` with `applied: []` when every item
//      is refused.
//   3. `updateAssetDetailsInline` is a full replacement: every call writes
//      all five fields, and a blank field becomes `null`.
//   4. On the five actions B0 measured, the ownership check (`SELECT`) and
//      the mutation (`UPDATE`) are two separate statements, not one
//      transaction.
//   5. `applyGeneratedStory` and `applyGeneratedOutline` never verify the
//      Project exists — a nonexistent id still answers `ok: true`, having
//      written nothing (the `UPDATE ... WHERE id = ?` matches zero rows).
//   6. `updateShotPrompt` and `updateSequencePrompt` answer via `redirect()`,
//      never a return value.
//
// Proof lives in `tests/actions/registry.test.ts`: for each entry, the
// declared `columns.written` is checked against a real full-row diff on a
// disposable seeded database, and every particularity above is either
// re-verified there or, where doing so would duplicate an existing proof
// under `tests/actions/`, referenced by comment instead (per this ticket's
// instructions) rather than re-run.
// ---------------------------------------------------------------------------

import type { ActionId, EntityKind } from "../types";

export type ActionRegistryEntry = {
  id: ActionId;

  /** Where the action is exported from, and under which name. Documentation
   * only — this module imports neither the action nor its host file. */
  source: { module: string; export: string };

  /** The entity whose row(s) the action writes. */
  target: { entity: EntityKind };

  /** How the caller receives the outcome. `"returnValue"` — an `{ ok }`
   * object; `"redirectOnly"` — the action's return type is `Promise<void>`
   * and the only observable outcome is the `redirect()` target (behaviour
   * 6). Neither shape is invoked from here: this is what a runner would
   * have to branch on, once one exists. */
  response: "returnValue" | "redirectOnly";

  /** The ownership / existence check the action performs before writing,
   * and whether that check and the mutation are one atomic unit. */
  ownership:
    | {
        /** A chain (asset→project, shot→sequence→project, or
         * sequence→project) is verified before the mutation runs. */
        checked: true;
        /** `false` on every entry that has one, per behaviour 4: the check
         * is a separate `SELECT`, the mutation a separate `UPDATE` by
         * primary key alone — not `db.transaction`. A concurrent
         * reassignment landing between the two statements would not be
         * caught. This is a structural fact about the source (cited in
         * each entry's `notes`), not something a single-process,
         * single-connection `better-sqlite3` unit test can force to
         * interleave — B0 recorded the same limitation ("low impact under
         * single-process SQLite but not a conformance"). Proven here by
         * source citation, not by a race test; see `registry.test.ts`'s
         * structural assertion. */
        transactional: false;
      }
    | {
        /** `applyGeneratedStory` / `applyGeneratedOutline` only —
         * behaviour 5. The action is defensible only because a Project is
         * the root of its own chain; it stops being defensible the moment
         * either is reached through something other than a direct
         * `projectId` argument. */
        checked: false;
      };

  columns: {
    /** Deterministic columns the action can write, excluding `updatedAt`
     * (declared separately below because every entry writes it and its
     * value is never asserted for equality, only for shape/monotonicity).
     * For `updateAssetDescriptionFieldInline`, both are listed because
     * which one is written is a caller-supplied argument (`field`), not
     * two different actions — one entry, one column set, exercised at both
     * values in `registry.test.ts`. For `applyBatchAssetDescriptionDraftsInline`,
     * both are listed for the same reason, plus behaviour 1: a column is
     * only actually written when its per-item draft is non-blank. */
    written: string[];
    writesUpdatedAt: true;
  };

  /** `"replace"` — every declared column is written on every successful
   * call (a blank input becomes `null` on `updateAssetDetailsInline`,
   * behaviour 3; a single field is fully replaced on
   * `updateAssetDescriptionFieldInline`, `updateShotPrompt`,
   * `updateSequencePrompt`, `applyGeneratedStory`, `applyGeneratedOutline`).
   * `"partialPerItem"` — only `applyBatchAssetDescriptionDraftsInline`:
   * a column is written for an item only when that item's own draft for it
   * is non-blank, and the batch as a whole commits whichever items
   * succeeded even when a sibling item failed (behaviour 1). */
  writeSemantics: "replace" | "partialPerItem";

  /** Free-text particularities, each naming which of the six B0 behaviours
   * it is and where it is proven. */
  notes: string[];
};

export const ACTION_REGISTRY = {
  updateAssetDetailsInline: {
    id: "updateAssetDetailsInline",
    source: { module: "@/actions/assets", export: "updateAssetDetailsInline" },
    target: { entity: "asset" },
    response: "returnValue",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["description", "notes", "visualIdentity", "usageRules", "forbiddenVariations"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Behaviour 3 — full replacement: all five fields are set on every call, and a blank/whitespace-only input becomes null (src/actions/assets.ts:292-302). Proven by tests/actions/updateAssetDetailsInline.test.ts, \"trims each field and stores null when a field is blank\" and \"overwrites every field on each call\".",
      "Behaviour 4 — ownership check (src/actions/assets.ts:283-290, SELECT) and mutation (src/actions/assets.ts:292-302, UPDATE) are two separate statements, no db.transaction. Structural fact, cited here; see registry.test.ts's structural assertion rather than a race test.",
    ],
  },

  updateAssetDescriptionFieldInline: {
    id: "updateAssetDescriptionFieldInline",
    source: { module: "@/actions/assets", export: "updateAssetDescriptionFieldInline" },
    target: { entity: "asset" },
    response: "returnValue",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["description", "notes"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Targets exactly one of description/notes per call, selected by the caller-supplied `field` argument (src/actions/assets.ts:160-171) — one action, one registry entry, not two. Both columns are declared because both are reachable; a single call only ever writes one. Proven by tests/actions/updateAssetDescriptionFieldInline.test.ts, \"replaces description...\" and \"writes notes when the notes field is targeted\".",
      "Behaviour 4 — ownership check (src/actions/assets.ts:151-158, SELECT) and mutation (src/actions/assets.ts:168-171, UPDATE) are two separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
    ],
  },

  applyBatchAssetDescriptionDraftsInline: {
    id: "applyBatchAssetDescriptionDraftsInline",
    source: { module: "@/actions/assets", export: "applyBatchAssetDescriptionDraftsInline" },
    target: { entity: "asset" },
    response: "returnValue",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["description", "notes"],
      writesUpdatedAt: true,
    },
    writeSemantics: "partialPerItem",
    notes: [
      "Behaviour 1 — not atomic: one independent UPDATE per item inside a for-loop (src/actions/assets.ts:176-266), no enclosing transaction. Arbitrated 2026-08-13: partial application is the contract, not a defect. Proven by tests/actions/applyBatchAssetDescriptionDraftsInline.test.ts, \"batch atomicity\" > \"is NOT all-or-nothing...\".",
      "Behaviour 2 — answers { ok: true, applied: [], errors: [...] } when every item is refused; a caller checking only `result.ok` reads success. Proven by tests/actions/applyBatchAssetDescriptionDraftsInline.test.ts, \"foreign chain refusal\" > \"refuses an asset owned by another project and writes nothing for it\" (applied: [], ok: true).",
      "Behaviour 4 — per item, the ownership check (SELECT) and the mutation (UPDATE) are two separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
      "Per-item column is written only when that item's own draft is non-blank (src/actions/assets.ts:229-244) — a column can be absent from one item's write and present in a sibling's, within the same batch call.",
    ],
  },

  updateShotPrompt: {
    id: "updateShotPrompt",
    source: { module: "@/actions/shots", export: "updateShotPrompt" },
    target: { entity: "shot" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["shotPrompt"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Behaviour 6 — the exported signature is (formData: FormData) => Promise<void>; the only observable outcome is the redirect() target, on both the success and the error path (src/actions/shots.ts:582-629). Proven by tests/actions/updateShotPrompt.test.ts via its captureRedirect() helper on every case.",
      "Behaviour 4 — ownership check is a two-level chain (shot→sequence, sequence→project; src/actions/shots.ts:606-617, two SELECTs) and the mutation (src/actions/shots.ts:622-625, UPDATE) is a third, separate statement — no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
    ],
  },

  updateSequencePrompt: {
    id: "updateSequencePrompt",
    source: { module: "@/actions/sequences", export: "updateSequencePrompt" },
    target: { entity: "sequence" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["sequencePrompt"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Behaviour 6 — the exported signature is (formData: FormData) => Promise<void>; the only observable outcome is the redirect() target, on both the success and the error path (src/actions/sequences.ts:272-306). Proven by tests/actions/updateSequencePrompt.test.ts via its captureRedirect() helper on every case.",
      "Behaviour 4 — ownership check (src/actions/sequences.ts:293-296, SELECT) and mutation (src/actions/sequences.ts:300-303, UPDATE) are two separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
    ],
  },

  applyGeneratedStory: {
    id: "applyGeneratedStory",
    source: { module: "@/actions/llm/story", export: "applyGeneratedStory" },
    target: { entity: "project" },
    response: "returnValue",
    ownership: { checked: false },
    columns: {
      written: ["story"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Behaviour 5 — never verifies the Project exists (src/actions/llm/story.ts:35-52): a nonexistent projectId still answers { ok: true }, because the UPDATE ... WHERE id = ? matches zero rows and drizzle-orm/sqlite does not throw on a no-op UPDATE. Proven by tests/actions/applyGeneratedStory.test.ts, \"nonexistent project\" > \"returns ok:true without touching any row...\".",
      "Defensible only because Project is the root of its own ownership chain (docs/LLM_WORKSPACE_ARCHITECTURE.md §11.2, B1a scope correction) — stops being defensible the moment this action is reached through anything other than a direct projectId argument.",
    ],
  },

  applyGeneratedOutline: {
    id: "applyGeneratedOutline",
    source: { module: "@/actions/llm/outlineGeneration", export: "applyGeneratedOutline" },
    target: { entity: "project" },
    response: "returnValue",
    ownership: { checked: false },
    columns: {
      written: ["outline"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Behaviour 5 — never verifies the Project exists (src/actions/llm/outlineGeneration.ts:43-58): a nonexistent projectId still answers { ok: true }, because the UPDATE ... WHERE id = ? matches zero rows and drizzle-orm/sqlite does not throw on a no-op UPDATE. Proven by tests/actions/applyGeneratedOutline.test.ts, \"nonexistent project\" > \"returns ok:true without touching any row...\".",
      "Defensible only because Project is the root of its own ownership chain (docs/LLM_WORKSPACE_ARCHITECTURE.md §11.2, B1a scope correction) — stops being defensible the moment this action is reached through anything other than a direct projectId argument.",
    ],
  },
} as const satisfies Record<ActionId, ActionRegistryEntry>;

export type ActionRegistryId = keyof typeof ACTION_REGISTRY;
