import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { sequences, shots } from "./core";
import { assets } from "./assets";
import { lookTests } from "./lookDevelopment";

export const comfyWorkflows = sqliteTable("comfy_workflows", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["image", "video"] }).notNull(),
  description: text("description"),
  workflowJson: text("workflow_json").notNull(),
  sourceFilename: text("source_filename"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ComfyWorkflow = typeof comfyWorkflows.$inferSelect;
export type NewComfyWorkflow = typeof comfyWorkflows.$inferInsert;

export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .references(() => shots.id, { onDelete: "cascade" }),
    assetId: int("asset_id")
      .references(() => assets.id, { onDelete: "cascade" }),
    // SEQGEN.STORYBOARD.3 — Sequence-level generation target (a single
    // contact-sheet storyboard image spanning every Shot of a Sequence,
    // not one Shot/Asset). Application-level rule (see
    // assertSingleGenerationTarget in src/actions/generation.ts): exactly
    // one of shotId/assetId/sequenceId is set per job, never a DB CHECK
    // constraint — consistent with every other applicative-only rule in
    // this schema (e.g. "at most one approved draft" on storyboardImages).
    sequenceId: int("sequence_id")
      .references(() => sequences.id, { onDelete: "cascade" }),
    // STYLE.1.G.CORE.1 — the 4th generation target: a Look Development test
    // (never a Shot/Asset/Sequence). Same application-level "exactly one
    // target" rule as the three columns above — see
    // isSingleGenerationTarget in src/lib/comfy/generationTarget.ts, now
    // widened to this 4th column. A Look job must never be treated as a
    // Shot/Asset/Sequence job by any existing switch — every such switch
    // was audited (see claude_report.md) and either extended explicitly or
    // left alone where a Look target genuinely cannot reach it (e.g.
    // Shot-only retry/delete helpers, which a Look job never calls).
    // STYLE.1.G.CORE.1 retake: the real DB FK is NO ACTION because
    // SQLite's ALTER TABLE ADD COLUMN never emits ON DELETE from the
    // schema declaration.  Deletion is handled explicitly by
    // deleteProject's synchronous transaction.  Changing this to
    // "no action" makes schema.ts honest about the actual DB state.
    lookTestId: int("look_test_id")
      .references(() => lookTests.id, { onDelete: "no action" }),
    workflowId: int("workflow_id")
      .notNull()
      .references(() => comfyWorkflows.id),
    status: text("status", {
      enum: ["pending", "uploading", "queued", "running", "done", "failed", "timeout"],
    })
      .notNull()
      .default("pending"),
    promptId: text("prompt_id"),
    clientId: text("client_id"),
    outputPath: text("output_path"),
    errorMessage: text("error_message"),
    // GEN.SEEDANCE.1 — serialized GenerationSnapshot (see
    // src/lib/comfy/generationSnapshot.ts): workflow id, context, selections
    // and their order, Dynamic Batch expansion info, warnings, final
    // prompt/inputs, override indication and the exact queued payload.
    // Never a binary file — text/JSON only. Nullable: jobs created before
    // this ticket, and jobs that fail before a snapshot could be built,
    // simply have none.
    payloadSnapshot: text("payload_snapshot"),
    // COMFY.PROVIDER.1 — the ComfyUI runtime provider (local server vs Comfy
    // Cloud) this job was actually queued against, captured durably at
    // creation time so a later Settings switch can never make an in-flight
    // or historical job get polled/downloaded from the wrong backend.
    // Additive column, NOT NULL DEFAULT 'local': existing rows backfill to
    // 'local' automatically (they all predate Cloud support), new rows
    // always stamp the provider active at creation time explicitly — see
    // src/actions/generation.ts / sequenceGeneration.ts / sequenceVideoGeneration.ts.
    runtimeProvider: text("runtime_provider", { enum: ["local", "cloud"] })
      .notNull()
      .default("local"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  }
);

export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;

// ---------------------------------------------------------------------------
// GEN.MULTIOUT.1 — one row per file a prompt actually produced.
//
// `generation_jobs.output_path` is one column, and a prompt can return many
// files: `ImageGridtoBatch → SaveImage` publishes a whole batch into a single
// `images` array. Job 544 returned four images and MikAI kept one.
//
// `output_path` is deliberately NOT replaced. It keeps pointing at index 0,
// because roughly twenty call sites read it — video approval, reference
// attachment, storyboard, sequence video, the Camera Lab PLY cache and five
// pages — and none of them changes. This table is additive: the extra files
// become reachable without any existing path being rewritten.
// ---------------------------------------------------------------------------
export const generationJobOutputs = sqliteTable(
  "generation_job_outputs",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    jobId: int("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    /**
     * Position in the job's result, 0-based. Index 0 is the same file as
     * `generation_jobs.output_path`. This is the batch order ComfyUI returned
     * — panel 1, panel 2, … for a grid — and it is the only ordering the user
     * ever sees. Never re-derive it from the filename: Cloud names its outputs
     * by content hash, so alphabetical order is meaningless.
     */
    outputIndex: int("output_index").notNull(),
    /** Repository-relative, always under `outputs/jobs/<jobId>/`. */
    path: text("path").notNull(),
    kind: text("kind", { enum: ["image", "video", "gif"] }).notNull(),
    /**
     * The name ComfyUI itself gave the file, kept for provenance: it is what
     * `/view` (local) and `/api/view` (Cloud) are queried with, so a missing
     * local file can be traced back to — or re-fetched from — its source.
     */
    sourceFilename: text("source_filename").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // One row per position per job: makes a double-publish by two concurrent
    // polls a constraint violation rather than a duplicated gallery entry.
    unique("generation_job_outputs_job_index_unique").on(table.jobId, table.outputIndex),
  ]
);

export type GenerationJobOutput = typeof generationJobOutputs.$inferSelect;
export type NewGenerationJobOutput = typeof generationJobOutputs.$inferInsert;
