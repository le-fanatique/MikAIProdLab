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
//      all six fields (ASSET.LIGHTING.PLACE.1 widened it from five), and a
//      blank field becomes `null`.
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
//
// LLMW.ACTION.INSERT.1 (B7c-w) widens the registry to the three write
// actions of the list operations (§3.2's `commit`, §3.4's Approve step):
// `createGeneratedShots`, `createSelectedAssets`, `createGeneratedSequences`
// each `INSERT` one new row per retained item, rather than `UPDATE` an
// existing one like the eight entries above. `ActionRegistryEntry.operation`
// distinguishes the two; `columns.written` and `writeSemantics` (new value
// `"insertPerItem"`) carry a different sense for an `"insert"` entry, each
// field's own comment says which.
//
// LLMW.ACTION.CASTING.1 (B7h-a) adds one more `"insert"` entry,
// `applySelectedCastingSuggestions` — the write side of the casting
// suggestions' Approve step (`src/actions/llm/castingSuggestions.ts`). Unlike
// every entry above, it does not always write the same table: it inserts
// into `shot_assets` or `sequence_assets` depending on each item's own
// `targetType`. `target` (`{ entity }` -> `{ entity } | { entities }`) and
// `columns.written`'s `writesUpdatedAt` (`true` -> `boolean`) are widened for
// this one entry alone; every other entry keeps its original, narrower
// value. Not yet wired to a descriptor's `commit` (`casting.fromSequence` is
// B7h-b) — declared ahead of being reachable, the same discipline B7c-w
// applied to its own three entries.
//
// STYLE.LLM.ACTIONS.1 adds `addRuleAction` — the write side ticket 3
// (`STYLE.LLM.ADJUST.1`) needs. Unlike every `"insert"` entry above, a single
// call writes TWO tables in the same transaction: it `INSERT`s one row into
// `project_style_rules` (`status` forced to `"approved"`) AND `UPDATE`s
// `project_style_drafts.revision`/`updatedAt` on the same call — the format
// has no field for "insert here, bump revision there", so the created row's
// own columns go in `columns.written` and the draft-side effect is declared
// explicitly in `notes` instead of being folded silently into `columns`. It
// also has a particularity no earlier entry has: on `expectedRevision ===
// null` it CREATES the Working Draft row itself when none exists yet
// (every other action either always requires a draft or never creates one);
// on any other mismatch — including `expectedRevision: null` against an
// EXISTING draft — it refuses as stale. Not yet wired to a descriptor's
// `commit` (its own descriptor is STYLE.LLM.ADJUST.1) — declared ahead of
// being reachable, the same discipline B7c-w's and B7h-a's own entries
// followed.
// ---------------------------------------------------------------------------

import type { ActionId, EntityKind } from "../types";

export type ActionRegistryEntry = {
  id: ActionId;

  /** Where the action is exported from, and under which name. Documentation
   * only — this module imports neither the action nor its host file. */
  source: { module: string; export: string };

  /** `"update"` — the action mutates one or more already-existing rows
   * (the original seven, plus `updateShotNarrativeContext`). `"insert"` —
   * the action creates one new row per retained item
   * (`LLMW.ACTION.INSERT.1`, B7c-w: `createGeneratedShots`,
   * `createSelectedAssets`, `createGeneratedSequences`). Every field below
   * that reads differently depending on which value this is says so where it
   * matters — most importantly `columns.written`. */
  operation: "update" | "insert";

  /** The entity whose row(s) the action writes. `entities` (plural) for an
   * action whose target depends on its input — `applySelectedCastingSuggestions`
   * inserts into `shot_assets` or `sequence_assets` depending on each item's
   * own `targetType` (LLMW.ACTION.CASTING.1, B7h-a). Documentation only: no
   * code reads this field. */
  target: { entity: EntityKind } | { entities: EntityKind[] };

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
        /** `false` on every entry that had one before LLMW.ACTION.INSERT_AT.1
         * (B11-a), per behaviour 4: the check is a separate `SELECT`, the
         * mutation a separate `UPDATE`/`INSERT` — not `db.transaction`. A
         * concurrent reassignment landing between the two statements would
         * not be caught. This is a structural fact about the source (cited
         * in each entry's `notes`), not something a single-process,
         * single-connection `better-sqlite3` unit test can force to
         * interleave — B0 recorded the same limitation ("low impact under
         * single-process SQLite but not a conformance"). Proven here by
         * source citation, not by a race test; see `registry.test.ts`'s
         * structural assertion.
         *
         * `true` for two entries. `createShotAtPosition`
         * (LLMW.ACTION.INSERT_AT.1, B11-a): its own `orderIndex` shift and
         * insert run inside one real `db.transaction`, not a separate
         * `SELECT` and `UPDATE`/`INSERT` — widened from the literal `false`
         * to `boolean` for this one fact, the same way `columns.writesUpdatedAt`
         * is widened below for `applySelectedCastingSuggestions`.
         * `addRuleAction` (STYLE.LLM.ACTIONS.1): its own draft
         * lookup/creation, rule insert, and `project_style_drafts.revision`
         * bump all run inside one real `db.transaction`
         * (`src/actions/projectStyle.ts`) — same shape, different reason:
         * not an ordering hazard like `createShotAtPosition`'s shift, but
         * the optimistic-concurrency check (`expectedRevision` against the
         * real row) must be read and acted on without a window for a
         * concurrent write to land in between. Every other entry keeps
         * `false` unchanged. See each entry's own `notes` for why it cannot
         * share B7c-w2's untransacted-loop reasoning. */
        transactional: boolean;
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
    /** For an `"update"` entry: the deterministic columns the action
     * rewrites on an already-existing row, excluding `updatedAt` (declared
     * separately below because every entry writes it and its value is never
     * asserted for equality, only for shape/monotonicity). For
     * `updateAssetDescriptionFieldInline`, both are listed because which one
     * is written is a caller-supplied argument (`field`), not two different
     * actions — one entry, one column set, exercised at both values in
     * `registry.test.ts`. For `applyBatchAssetDescriptionDraftsInline`, both
     * are listed for the same reason, plus behaviour 1: a column is only
     * actually written when its per-item draft is non-blank.
     *
     * For an `"insert"` entry (`LLMW.ACTION.INSERT.1`, B7c-w): the same
     * field name carries a different sense — the columns populated on each
     * newly created row, including ones the action itself computes rather
     * than receives from the caller (e.g. `createGeneratedShots`'s
     * `shotCode`, from the nomenclature settings, not the model's proposed
     * `shot_code`; every insert entry's own `orderIndex`, computed from the
     * scope's current max). The row's primary key and `createdAt` are never
     * listed (schema-assigned, not action-computed); the anchor foreign key
     * is listed because the action itself supplies its value on every call.
     * For `applySelectedCastingSuggestions` (`LLMW.ACTION.CASTING.1`,
     * B7h-a), which targets two different tables: both foreign key columns
     * (`shotId`, `sequenceId`) are listed because both are reachable — one
     * column set is written per created row depending on the item's own
     * `targetType`, the same "both listed, only one written per call"
     * convention as `updateAssetDescriptionFieldInline` above. */
    written: string[];
    /** `true` on every entry so far: every table an existing entry targets
     * has an `updated_at` column, and every one of those actions writes it.
     * `false` for `applySelectedCastingSuggestions` (`LLMW.ACTION.CASTING.1`,
     * B7h-a) — `shot_assets` and `sequence_assets`
     * (`src/db/schema/assets.ts:32-66`) have no `updated_at` column at all
     * (only `created_at`, schema-assigned, never rewritten), so there is
     * nothing to write. Widened from the literal `true` to `boolean` for
     * this one fact, the same way `target` above is widened for the same
     * entry — every other entry keeps `true` unchanged. */
    writesUpdatedAt: boolean;
  };

  /** `"replace"` — every declared column is written on every successful
   * call (a blank input becomes `null` on `updateAssetDetailsInline`,
   * behaviour 3; a single field is fully replaced on
   * `updateAssetDescriptionFieldInline`, `updateShotPrompt`,
   * `updateSequencePrompt`, `applyGeneratedStory`, `applyGeneratedOutline`).
   * `"partialPerItem"` — only `applyBatchAssetDescriptionDraftsInline`:
   * a column is written for an item only when that item's own draft for it
   * is non-blank, and the batch as a whole commits whichever items
   * succeeded even when a sibling item failed (behaviour 1). `"insertPerItem"`
   * — the three `"insert"` entries (`LLMW.ACTION.INSERT.1`, B7c-w): one new
   * row per item retained after the entry's own validation, in the order the
   * (already-filtered) list arrives at the action — the list's own order is
   * the insertion order, and therefore the `orderIndex` order. */
  writeSemantics: "replace" | "partialPerItem" | "insertPerItem";

  /** Free-text particularities, each naming which of the six B0 behaviours
   * it is and where it is proven. */
  notes: string[];
};

export const ACTION_REGISTRY = {
  updateAssetDetailsInline: {
    id: "updateAssetDetailsInline",
    operation: "update",
    source: { module: "@/actions/assets", export: "updateAssetDetailsInline" },
    target: { entity: "asset" },
    response: "returnValue",
    ownership: { checked: true, transactional: false },
    columns: {
      written: [
        "description",
        "notes",
        "visualIdentity",
        "usageRules",
        "forbiddenVariations",
        "lighting",
        "promptCard",
        "bibleSourceFingerprint",
      ],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Behaviour 3 — full replacement: all seven fields (the five original plus `lighting` (ASSET.LIGHTING.PLACE.1) and `promptCard` (ASSET.PROMPTCARD.1)) are set on every call, and a blank/whitespace-only input becomes null (src/actions/assets.ts). Proven by tests/actions/updateAssetDetailsInline.test.ts, \"trims each field and stores null when a field is blank\" and \"overwrites every field on each call\", plus its own \"writes lighting alongside the other fields, changing only lighting when the rest repeat their current values\" and \"writes promptCard alongside the other fields, changing only promptCard when the rest repeat their current values\".",
      "Behaviour 4 — ownership check (SELECT) and mutation (UPDATE) are two separate statements, no db.transaction. Structural fact, cited here; see registry.test.ts's structural assertion rather than a race test.",
      "SCHEMA.BIBLE_FRESHNESS.1 (S1b) — bibleSourceFingerprint is written only on the calls that actually change the Asset Bible: this action rewrites all six columns on every call, so a plain description/notes/lighting edit reports the Bible back unchanged, and capturing on every call would have marked a Bible that had just gone stale as current. The three normalized Bible values are compared against the stored row first, and the fingerprint key is included in `.set()` only when at least one differs — otherwise the column is left untouched. `lighting` and `promptCard` play no part in that comparison, same as description/notes. Proven by tests/actions/updateAssetDetailsInline.test.ts and tests/actions/assetBibleFreshness.test.ts, the latter asserting that a description-only edit leaves the Bible stale.",
    ],
  },

  updateAssetDescriptionFieldInline: {
    id: "updateAssetDescriptionFieldInline",
    operation: "update",
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
    operation: "update",
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
    operation: "update",
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
    operation: "update",
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
    operation: "update",
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
    operation: "update",
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

  // LLMW.UC2.RETAKE.1 (B9b) — the eighth action, the write side of
  // `shot.retakeDirected`. Not from B0/B4a's original seven; declared per the
  // same discipline (real semantics, proven against a real database), not on
  // parole.
  updateShotNarrativeContext: {
    id: "updateShotNarrativeContext",
    operation: "update",
    source: { module: "@/actions/shots", export: "updateShotNarrativeContext" },
    target: { entity: "shot" },
    response: "returnValue",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["description", "actionPitch", "cameraSubject"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Full replacement: `set({ ...data })` writes all three fields on every call (src/actions/shots.ts:155-158) — a caller passing null for a field nulls the column. Proven by tests/actions/registry.test.ts's own column-correspondence case for this entry.",
      "Ownership check (src/actions/shots.ts:143-153, two SELECTs — shot->sequence, sequence->project) and mutation (src/actions/shots.ts:155-158, UPDATE) are three separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
      "Never redirects, never touches shotPrompt/shotSize/cameraMovement/shotCode/title/duration/continuity — the narrow surface §0bis of the ticket arbitrated updateShot out for.",
    ],
  },

  // LLMW.ACTION.INSERT.1 (B7c-w) — the write side of the three list
  // operations' Approve step. `createGeneratedShots`, `createSelectedAssets`
  // and `createGeneratedSequences` each `INSERT` one new row per retained
  // item; none of them `UPDATE` an existing row. Only `createGeneratedShots`
  // is reachable from a descriptor's `commit` today (`shots.fromSequence`)
  // — the other two are declared here for the same reason B4a declared all
  // seven original entries together (a shared shape described honestly),
  // without yet being wired to a descriptor of their own (future tickets).
  createGeneratedShots: {
    id: "createGeneratedShots",
    operation: "insert",
    source: { module: "@/actions/llm/sequenceShots", export: "createGeneratedShots" },
    target: { entity: "shot" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      // `cameraPitch` is gone with its column (B19c/B19h): no model writes
      // it, and `shots.cameraPitch` no longer exists to be written.
      //
      // **Corrected 2026-08-24.** This note used to say the opposite of the
      // code, and had done since B19d: that the action "still writes
      // `shots.cameraPitch`", and that `cameraPosition`/`movementSpeed`/
      // `cameraSubject` were "deliberately NOT added here" because
      // `createGeneratedShots` had "no code path writing those three columns
      // at all". That gap was closed — `sequenceShots.ts:127-132` writes all
      // five camera columns — and the note outlived it, describing a hole a
      // future session would have set out to dig again. The four missing
      // names are added below.
      //
      // Why nothing caught it: unlike `createShotAtPosition` and
      // `addRuleAction`, this action had no assertion comparing this
      // declaration against the row it actually produces. Its own test even
      // proved `cameraSubject` was written while this list denied it, and
      // the two never met. `registry.test.ts` now closes that loop for this
      // action too, so the drift cannot come back silently.
      written: [
        "sequenceId",
        "shotCode",
        "title",
        "description",
        "durationSeconds",
        "actionPitch",
        "shotSize",
        "cameraPosition",
        "cameraMovement",
        "movementSpeed",
        "cameraSubject",
        "cameraLens",
        // SHOTGEN.INSTRUCTION.1 — added alongside `lighting` joining the
        // model's JSON output (`shots-from-sequence.ts`'s `jsonSchemaBlock`)
        // and `normalizeShot`/the insert above. Same shape as the four
        // camera columns above it: declared here the moment the action
        // actually writes it, not after.
        "lighting",
        "continuityIn",
        "continuityOut",
        "shotPrompt",
        "orderIndex",
      ],
      writesUpdatedAt: true,
    },
    writeSemantics: "insertPerItem",
    notes: [
      "One `db.insert(shots).values(...)` call per parsed item, inside a plain for-loop (src/actions/llm/sequenceShots.ts:185-209), not wrapped in db.transaction — a later item's insert failing (e.g. a DB error mid-loop) leaves the earlier items' rows committed. No test proves this partiality; it is a structural fact about the loop shape, reported rather than exercised (nothing in the loop body is expected to fail on valid input). Arbitrated 2026-08-16 (LLMW.ACTION.INSERT.2, B7c-w2): rather than an oversight, the risk is a race between two concurrent Approve calls on the same sequence — not reachable on a single-connection, single-process, local SQLite application.",
      "`shotCode` (src/actions/llm/sequenceShots.ts:196) is never the model's own proposed `shot_code` — it is regenerated from the project's nomenclature template (`getNomenclatureSettings`, `generateSequentialCodes`, src/actions/llm/sequenceShots.ts:176-183). The model's `shot_code` is parsed by `normalizeShot` (sequenceShots.ts:38) but its value is read nowhere in `createGeneratedShots`. Proven by registry.test.ts: the created row's `shotCode` differs from the item's supplied `shot_code` and matches the nomenclature template.",
      "`orderIndex` (src/actions/llm/sequenceShots.ts:169-174,207) is `max(shots.orderIndex) for this sequenceId, then +1, then +i` per item — a separate SELECT before the insert loop, no db.transaction enclosing the SELECT and the loop. Two concurrent calls for the same sequence could read the same max and assign colliding orderIndex values to different rows; not observable on better-sqlite3's single connection, reported as a structural fact rather than exercised as a race. Continuation (not restarting at 0) is proven by registry.test.ts against a pre-seeded row.",
      "Ownership check: `sequences` is selected by `sequenceId` and `sequence.projectId !== projectId` is verified (src/actions/llm/sequenceShots.ts:151-154) before any insert — a one-level chain (sequence→project), not atomic with the insert loop that follows (separate statements, no db.transaction). Refusal writes no row; proven by registry.test.ts against a sequence belonging to another project.",
      "`revalidatePath(\"/\", \"layout\")` is called before the success redirect (src/actions/llm/sequenceShots.ts:211) — present, like `createSelectedAssets` and `createGeneratedSequences` below.",
    ],
  },

  createSelectedAssets: {
    id: "createSelectedAssets",
    operation: "insert",
    source: { module: "@/actions/llm/assetExtraction", export: "createSelectedAssets" },
    target: { entity: "asset" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: [
        "projectId",
        "name",
        "type",
        "description",
        "notes",
        "sourceLevel",
        "sourceExcerpt",
        "duplicateWarning",
        "orderIndex",
      ],
      writesUpdatedAt: true,
    },
    writeSemantics: "insertPerItem",
    notes: [
      "One `db.insert(assets).values(...)` call per parsed candidate, inside a plain for-loop (src/actions/llm/assetExtraction.ts:244-254), not wrapped in db.transaction. Arbitrated 2026-08-16 (LLMW.ACTION.INSERT.2, B7c-w2): rather than an oversight, the risk is a race between two concurrent Approve calls on the same project — not reachable on a single-connection, single-process, local SQLite application.",
      "Ownership check: `projects` is selected by `projectId` (src/actions/llm/assetExtraction.ts:214-217) and the action refuses with `errRedirect(\"Project not found.\")` (src/actions/llm/assetExtraction.ts:218-220) before any insert if no row matches — not atomic with the insert loop that follows (separate statements, no db.transaction). Refusal writes no row; proven by registry.test.ts against a nonexistent projectId.",
      "`orderIndex` (src/actions/llm/assetExtraction.ts:237-242,252) is `max(assets.orderIndex) for this projectId, then +1, then +i` per item — a separate SELECT before the insert loop, no db.transaction enclosing both. Same structural, unraced-on-sqlite concurrency note as `createGeneratedShots` above. Continuation is proven by registry.test.ts against a pre-seeded row.",
      "`visualIdentity`, `usageRules`, `forbiddenVariations` are never written by this action (only `updateAssetDetailsInline` touches them) — proven null on the created row by registry.test.ts, the same way `sequencePrompt` is proven untouched for `createGeneratedSequences` below.",
      "The candidate's `sourceLevel`, `sourceExcerpt` and `duplicateWarning` (parsed by `normalizeCandidate`, src/actions/llm/assetExtraction.ts:42-63) are now written to their own `assets` columns (SCHEMA.ASSET_SOURCING.1, S1a) — `sourceLevel` always has a value (`normalizeCandidate` defaults it to `\"outline\"`), `sourceExcerpt` and `duplicateWarning` are written as-is and land `NULL` when absent from the submitted JSON, never an empty string.",
      "`revalidatePath(\"/\", \"layout\")` is called before the success redirect (src/actions/llm/assetExtraction.ts:256, added by LLMW.ACTION.INSERT.2, B7c-w2) — present, like `createGeneratedShots` and `createGeneratedSequences`.",
    ],
  },

  createGeneratedSequences: {
    id: "createGeneratedSequences",
    operation: "insert",
    source: { module: "@/actions/llm/sequenceGeneration", export: "createGeneratedSequences" },
    target: { entity: "sequence" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: [
        "projectId",
        "sequenceCode",
        "title",
        "summary",
        "description",
        "narrativePurpose",
        "mood",
        "locationHint",
        "orderIndex",
      ],
      writesUpdatedAt: true,
    },
    writeSemantics: "insertPerItem",
    notes: [
      "One `db.insert(sequences).values(...)` call per parsed candidate, inside a plain for-loop (src/actions/llm/sequenceGeneration.ts:224-237), not wrapped in db.transaction. Arbitrated 2026-08-16 (LLMW.ACTION.INSERT.2, B7c-w2): rather than an oversight, the risk is a race between two concurrent Approve calls on the same project — not reachable on a single-connection, single-process, local SQLite application.",
      "Ownership check: `projects` is selected by `projectId` (src/actions/llm/sequenceGeneration.ts:184-187) and the action refuses with `errRedirect(\"Project not found.\")` (src/actions/llm/sequenceGeneration.ts:188-190) before any insert if no row matches — not atomic with the insert loop that follows (separate statements, no db.transaction). Refusal writes no row; proven by registry.test.ts against a nonexistent projectId.",
      "`sequenceCode` (src/actions/llm/sequenceGeneration.ts:228) is generated from the nomenclature template (`getNomenclatureSettings`, `generateSequentialCodes`, lines 216-222), never from the model — `GeneratedSequence`/`normalizeSequence` (sequenceGeneration.ts:54-74) has no code field to ignore in the first place, unlike `createGeneratedShots`.",
      "The model's `order_index` (`normalizeSequence`, sequenceGeneration.ts:60-63,72) is used only to sort the candidate array before insertion (sequenceGeneration.ts:196-199, `.sort((a,b) => a.order_index - b.order_index)`) — the stored `orderIndex` column is `max(sequences.orderIndex) for this projectId, then +1, then +i` in that sorted order (sequenceGeneration.ts:208-213,235), never the model's own number. Proven by registry.test.ts alongside orderIndex continuation.",
      "`sequencePrompt`, `rowBackgroundImagePath`, `rowBackgroundOpacity` are never written by this action — proven null on the created row by registry.test.ts.",
      "`revalidatePath(\"/\", \"layout\")` is called before the success redirect (src/actions/llm/sequenceGeneration.ts:239) — present, like `createGeneratedShots`.",
    ],
  },

  // LLMW.ACTION.CASTING.1 (B7h-a) — the write side of the casting
  // suggestions' Approve step. The first `"insert"` entry whose target is
  // not one table: each retained item is inserted into `shot_assets` or
  // `sequence_assets`, chosen per item by its own `targetType`, hence
  // `target: { entities: [...] }` rather than `{ entity: ... }`.
  applySelectedCastingSuggestions: {
    id: "applySelectedCastingSuggestions",
    operation: "insert",
    source: { module: "@/actions/llm/castingSuggestions", export: "applySelectedCastingSuggestions" },
    target: { entities: ["shot", "sequence"] },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["shotId", "sequenceId", "assetId"],
      writesUpdatedAt: false,
    },
    writeSemantics: "insertPerItem",
    notes: [
      "Writes one of two tables per item, chosen by the item's own `targetType` (src/actions/llm/castingSuggestions.ts:342-348): `db.insert(shotAssets).values({ shotId, assetId })` for `\"shot\"`, `db.insert(sequenceAssets).values({ sequenceId, assetId })` for `\"sequence\"` — never both columns on the same row, and never `notes` (schema-allowed on both tables, always left null by this action).",
      "An item whose `assetId` does not exist in the current project, whose `targetId` (`targetType: \"shot\"`) does not belong to the current sequence, or whose `targetId` (`targetType: \"sequence\"`) is not the current sequence, is dropped silently before the insert attempt (src/actions/llm/castingSuggestions.ts:337-339) — `continue`, no error, no counter, no message. Reported as a fact, not repaired: the same discipline B7c-w applied to its own three insert entries.",
      "A duplicate (the tables' own unique constraint on (shotId|sequenceId, assetId)) is swallowed by an empty `catch` (src/actions/llm/castingSuggestions.ts:350-352) and does not increment `inserted` — no error surfaces to the caller for that item either.",
      "Not atomic: one independent insert per item inside a plain for-loop (src/actions/llm/castingSuggestions.ts:334-353), no enclosing `db.transaction`. Arbitrated 2026-08-16 (LLMW.ACTION.INSERT.2, B7c-w2), cited rather than reopened: the risk is a race between two concurrent Approve calls on the same sequence — not reachable on a single-connection, single-process, local SQLite application.",
      "Ownership check: `sequences` is selected by `sequenceId` and `sequence.projectId !== projectId` is verified (src/actions/llm/castingSuggestions.ts:303-309) before any insert, redirecting with \"Sequence not found.\" if the chain is broken — not atomic with the insert loop that follows (separate statements, no db.transaction). Refusal writes no row.",
      "`writesUpdatedAt: false` — unlike every entry above, because neither `shot_assets` nor `sequence_assets` (`src/db/schema/assets.ts:32-66`) has an `updated_at` column at all; both only have `created_at` (schema-assigned, never rewritten by this action).",
      "Redirects on every path (`Promise<void>`), never a return value: `castingsError` on refusal (src/actions/llm/castingSuggestions.ts:293) or `castingsApplied=<inserted count>` on success (src/actions/llm/castingSuggestions.ts:356) — the same shape as `createGeneratedShots`/`createSelectedAssets`/`createGeneratedSequences` above.",
      "Unlike the three `createGenerated*`/`createSelectedAssets` insert entries above, this action calls no `revalidatePath` on any path (verified absent from src/actions/llm/castingSuggestions.ts) — reported, not fixed.",
    ],
  },

  // LLMW.ACTION.INSERT_AT.1 (B11-a) — the write side of UC1's "insert a
  // plan between two existing plans". Unlike every `"insert"` entry above,
  // this one does NOT always write at `max(orderIndex) + 1`: `afterShotId`
  // names an arbitrary position, and every later shot's `orderIndex` must
  // shift by one to make room. Not yet reachable from a descriptor's
  // `commit` (its own descriptor, UC1's insertion descriptor, is B11-bd) —
  // declared ahead of being wired, the same discipline B7c-w's and B7h-a's
  // own entries followed.
  createShotAtPosition: {
    id: "createShotAtPosition",
    operation: "insert",
    source: { module: "@/actions/llm/shotInsertion", export: "createShotAtPosition" },
    target: { entity: "shot" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: true },
    columns: {
      // `cameraPitch` removed (B19d) — see the module header, decision 4,
      // and `.agents/executor_report.md`. `shotInsertion.ts`'s own
      // `ProposedShot`/`normalizeProposedShot`/`createShotAtPosition` are
      // untouched by this ticket (only `shot.insertDirected`'s
      // `output.fields` and this declaration change): the action still
      // reads a raw `cameraPitch` key when a caller supplies one and still
      // writes `shots.cameraPitch` from it — this list documents what a
      // model-driven Approve populates, which no longer includes it now
      // that the descriptor stops asking the model for it.
      // `cameraPosition`/`movementSpeed`/`cameraSubject` are deliberately
      // NOT added here: `createShotAtPosition`'s `ProposedShot` has no field
      // for any of the three, so a bench draft carrying them has that data
      // silently dropped on Approve — flagged, not fixed, in
      // `.agents/executor_report.md`; `shot_size`'s own value (including a
      // "MS to WS" interval) still writes through unchanged, `shotSize`
      // being a plain string column with no format check on either side.
      written: [
        "sequenceId",
        "shotCode",
        "title",
        "description",
        "durationSeconds",
        "actionPitch",
        "continuityNotes",
        "shotSize",
        "cameraMovement",
        "continuityIn",
        "continuityOut",
        "shotPrompt",
        "orderIndex",
      ],
      writesUpdatedAt: true,
    },
    writeSemantics: "insertPerItem",
    notes: [
      "`transactional: true` — the one exception to `ownership.transactional: false`/no-`db.transaction` every other insert entry above declares. B7c-w2 (2026-08-16) arbitrated an untransacted per-item loop acceptable for the three `create*` insert actions because a mid-loop failure there only ever leaves FEWER rows committed than requested — an incomplete but still coherent order. That reasoning does not carry over here: this action shifts every existing shot's `orderIndex >= targetIndex` by +1 and then inserts the new row at `targetIndex` (src/actions/llm/shotInsertion.ts), and a failure landing between the shift and the insert would leave the sequence with a gap OR two shots sharing the same `orderIndex` — a corrupted order, not an incomplete one. Both steps run inside one synchronous `db.transaction` (same primitive as `src/actions/assetAlignment.ts:174`, `src/actions/cameraLabSnapshot.ts:237`) so they commit together or not at all. Proven by tests/actions/registry.test.ts: each of the four declared refusals writes no row and shifts no `orderIndex`, and three insertion positions (start, middle, after-the-last) are proven to leave `0,1,2,3` with no gap and no duplicate.",
      "`shotCode` (src/actions/llm/shotInsertion.ts) is never read from `shotJson` — the accepted shape does not even declare a `shotCode` key — and is generated from the project's nomenclature template (`getNomenclatureSettings`, `generateNextCode`), the same dispositif `createGeneratedShots` and `createShot` (src/actions/shots.ts:41-49) use. Proven by registry.test.ts against a pre-seeded shot code.",
      "`shotJson` is read under the entity's own field names (`title`, `durationSeconds`, `actionPitch`, ...), not through a `snake_case` model-key translation like `normalizeShot` — this ticket declares only the write action, no descriptor exists yet to fix a model-facing JSON shape (B11-bd).",
      "Ownership check: `sequences` is selected by `sequenceId` and `sequence.projectId !== projectId` is verified before any read/write; when `afterShotId` is present, the named shot must also exist and belong to this `sequenceId` — refusing with \"Shot not found.\" otherwise, the guard that stops an id from another project's sequence being used to insert into this one. Both checks happen before the transaction opens; refusal writes no row and shifts no `orderIndex`. Proven by registry.test.ts against a sequence belonging to another project and an `afterShotId` from a foreign sequence.",
      "A titled but otherwise-empty `shotJson`, or an unparsable one, refuses with \"Invalid shot data.\" and writes nothing — a visible refusal, deliberately NOT `createShot`'s silent `if (!title?.trim()) return;` (src/actions/shots.ts:31, the documented defect at docs/PROJECT_STATE.md section B9b). This ticket's own contract requires the visible refusal for this action; `createShot` itself is unchanged.",
      "`revalidatePath(\"/\", \"layout\")` is called before the success redirect — present, like every `create*`/`applySelectedCastingSuggestions` insert entry above.",
    ],
  },

  // LLMW.JAR.1 (B12a) — the narrative prompt jar's write side (§5.3). Not
  // yet reachable from a descriptor's `commit` — the operation that fills
  // the jar is B12b, the next ticket. Declared and proven against a real
  // database ahead of that consumer, same discipline as
  // `createGeneratedShots`/`applySelectedCastingSuggestions`/`createShotAtPosition`
  // above.
  updateShotNarrativePrompt: {
    id: "updateShotNarrativePrompt",
    operation: "update",
    source: { module: "@/actions/shots", export: "updateShotNarrativePrompt" },
    target: { entity: "shot" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["narrativePrompt"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Mirrors `updateShotPrompt` exactly (src/actions/shots.ts) — same FormData input shape, same shot→sequence→project ownership chain (two separate SELECTs, no db.transaction), same redirect-only outcome on both the success and the error path — over `narrativePrompt` instead of `shotPrompt`, and `shotPrompt` is never read or rewritten by this action. Proven by tests/actions/updateShotNarrativePrompt.test.ts, including a read-after-write assertion that `shotPrompt` stays unchanged.",
      "Ownership check (src/actions/shots.ts, two SELECTs — shot→sequence, sequence→project) and mutation (UPDATE) are three separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
    ],
  },

  // LLMW.LIGHTING.1 (B15a) — the lighting field's write side, one action per
  // level (§5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md). None of the three
  // is yet reachable from a descriptor's `commit` — this ticket delivers no
  // surface, no descriptor, no model call (B15b/B16 are that consumer).
  // Declared and proven against a real database ahead of it, the same
  // discipline every earlier action declared before its own descriptor
  // (`createGeneratedShots`, `applySelectedCastingSuggestions`,
  // `createShotAtPosition`, `updateShotNarrativePrompt`).

  updateShotLighting: {
    id: "updateShotLighting",
    operation: "update",
    source: { module: "@/actions/shots", export: "updateShotLighting" },
    target: { entity: "shot" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["lighting"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Mirrors `updateShotNarrativePrompt` exactly (src/actions/shots.ts) — same FormData input shape, same shot→sequence→project ownership chain (two separate SELECTs, no db.transaction), same redirect-only outcome on both the success and the error path — over `lighting` instead of `narrativePrompt`, and neither `narrativePrompt` nor `shotPrompt` is ever read or rewritten by this action. Proven by tests/actions/updateShotLighting.test.ts, including a read-after-write assertion that both sibling columns stay unchanged.",
      "Ownership check (src/actions/shots.ts, two SELECTs — shot→sequence, sequence→project) and mutation (UPDATE) are three separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
    ],
  },

  updateSequenceLighting: {
    id: "updateSequenceLighting",
    operation: "update",
    source: { module: "@/actions/sequences", export: "updateSequenceLighting" },
    target: { entity: "sequence" },
    response: "redirectOnly",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["lighting"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Mirrors `updateSequencePrompt` exactly (src/actions/sequences.ts) — same FormData input shape, same sequence→project ownership check (one SELECT, no db.transaction), same redirect-only outcome on both the success and the error path — over `lighting` instead of `sequencePrompt`, and `sequencePrompt` is never read or rewritten by this action. Proven by tests/actions/updateSequenceLighting.test.ts, including a read-after-write assertion that `sequencePrompt` stays unchanged.",
      "Ownership check (src/actions/sequences.ts, one SELECT) and mutation (UPDATE) are two separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
      "This action only ever writes the Sequence's own `lighting` column — it never reads or writes an environment Asset's `lighting`. `SEQ.LIGHTING` (variables/registry.ts) is the read side that combines the two; this action has no part in that fallback.",
    ],
  },

  updateAssetLightingInline: {
    id: "updateAssetLightingInline",
    operation: "update",
    source: { module: "@/actions/assets", export: "updateAssetLightingInline" },
    target: { entity: "asset" },
    response: "returnValue",
    ownership: { checked: true, transactional: false },
    columns: {
      written: ["lighting"],
      writesUpdatedAt: true,
    },
    writeSemantics: "replace",
    notes: [
      "Same shape as `updateAssetDescriptionFieldInline` (src/actions/assets.ts) — a caller-supplied object, not FormData; ownership check (SELECT) and mutation (UPDATE) as two separate statements, no db.transaction; `{ ok: true } | { ok: false; error }` — narrowed to one field with no append/replace mode: always a full replacement, and a blank/whitespace-only value clears the column to null. Proven by tests/actions/updateAssetLightingInline.test.ts, including a read-after-write assertion that `description`/`notes` stay unchanged.",
      "Ownership check (src/actions/assets.ts, SELECT) and mutation (UPDATE) are two separate statements, no db.transaction. Structural fact; see registry.test.ts's structural assertion.",
    ],
  },

  // STYLE.LLM.ACTIONS.1 — the write side ticket 3 of "L'assistant de Project
  // Style" (STYLE.LLM.ADJUST.1) needs. Not yet reachable from a descriptor's
  // `commit` — declared and proven against a real database ahead of that
  // consumer, the same discipline every earlier action declared before its
  // own descriptor.
  addRuleAction: {
    id: "addRuleAction",
    operation: "insert",
    source: { module: "@/actions/projectStyle", export: "addRuleAction" },
    target: { entity: "project" },
    response: "returnValue",
    ownership: { checked: true, transactional: true },
    columns: {
      // The columns of the newly-created `project_style_rules` row
      // (`src/lib/projectStyle/insertDraftRule.ts:66-82`, the shared insert
      // step `addRuleAction` calls). `draftId` (the anchor foreign key) is
      // listed because the action itself supplies its value on every call,
      // same convention as `sequenceId`/`projectId` on the insert entries
      // above; the primary key is not (schema-assigned). `status` IS listed
      // even though its value never varies (always `"approved"`) — unlike
      // `createdAt`/the primary key, it is not schema-assigned: the action
      // itself sets it on every insert, and `RuleFields`
      // (`src/actions/projectStyle.ts:459-467`) has no field the caller
      // could use to request anything else, so a disabled rule can never be
      // proposed through this action.
      written: [
        "draftId",
        "instruction",
        "pillar",
        "section",
        "category",
        "strength",
        "applicability",
        "provenanceNotes",
        "status",
        "orderIndex",
      ],
      writesUpdatedAt: true,
    },
    writeSemantics: "insertPerItem",
    notes: [
      "`status` forced to `\"approved\"` on every insert (src/lib/projectStyle/insertDraftRule.ts:77) — `RuleFields` (src/actions/projectStyle.ts:459-467) has no `status` field at all, so nothing a caller submits can produce a `\"disabled\"` row through this action. Proven by tests/actions/registry.test.ts.",
      "Writes a SECOND table in the same call: `project_style_drafts.revision` is bumped by exactly 1 and `updatedAt` rewritten (src/lib/projectStyle/insertDraftRule.ts:84-88), inside the same `db.transaction` as the rule insert (src/actions/projectStyle.ts:517-568). No field of this format expresses \"insert here, bump revision there\" — the created row's own columns are declared in `columns.written` above, this draft-side effect is declared here instead of being folded silently into it. Proven by tests/actions/registry.test.ts.",
      "Creates the Working Draft itself, but ONLY when `expectedRevision === null` and no draft row exists yet (src/actions/projectStyle.ts:521-535) — a particularity no entry above has (every `insertPerItem` entry above either always requires its anchor to pre-exist, or, per behaviour 5, never verifies it and no-ops on a missing one; this one actively creates a row of its own). When a draft already exists, `expectedRevision: null` does NOT reach that creation branch — it falls to the `else if` below and is refused as stale, the row is left untouched. Proven by tests/actions/registry.test.ts.",
      "Optimistic concurrency: `expectedRevision` is compared against the draft's real `revision`, read inside the same transaction (src/actions/projectStyle.ts:536-538), and a mismatch is refused with `{ ok: false, error, currentRevision }` — never merged, no row written. A caller applying N rules in one Approve step (STYLE.LLM.ADJUST.1, ticket 3) must therefore make N sequential calls, each one's `expectedRevision` taken from the previous call's own returned `revision` — a batch call passing one fixed `expectedRevision` for every item would have every item after the first refused as stale. Proven by tests/actions/registry.test.ts.",
      "Ownership check: `assertProjectExists` (src/actions/projectStyle.ts:507) runs BEFORE `db.transaction` opens (src/actions/projectStyle.ts:517) — a separate statement from every write that follows, the same `checked: true` shape every other entry declares. `ownership.transactional: true` here describes a different fact: unlike `checked`, which is about the existence check, `transactional` (widened for `createShotAtPosition`, LLMW.ACTION.INSERT_AT.1) is about whether the action's OWN write steps are atomic with each other — and here the draft lookup/creation, the rule insert, and the revision bump all run inside the one `db.transaction` at src/actions/projectStyle.ts:517-568, never as separate statements. Proven by tests/actions/registry.test.ts's structural assertion.",
    ],
  },
} as const satisfies Record<ActionId, ActionRegistryEntry>;

export type ActionRegistryId = keyof typeof ACTION_REGISTRY;
