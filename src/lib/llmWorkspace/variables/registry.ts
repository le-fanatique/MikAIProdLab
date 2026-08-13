import "server-only";

// ---------------------------------------------------------------------------
// variables/registry.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1)
//
// The closed variable registry (§3.1), narrowed to the 3 variables this
// ticket implements: `PROJECT.IDENTITY`, `SEQ.CONTEXT`,
// `SEQ.CURRENT_PROMPT`. Each resolver follows the settled resolver contract
// (§3.1, "Resolver contract (settled in B1a)"):
//
//   - async, reads the database;
//   - receives the already-verified anchor id — it never re-checks
//     ownership and never widens the chain the caller resolved;
//   - returns typed data, never a formatted string — formatting belongs to
//     the template/prompt builder.
//
// `resolveAssetBibleContext(projectId, assetId)` and
// `resolveAssetStyleContext(projectId)` are the existing precedent this
// generalises (`src/lib/prompts/assetBibleContext.ts`,
// `src/lib/projectStyle/assetAlignment/resolveAssetStyleContext.ts`).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { VariableId } from "../types";

// ---------------------------------------------------------------------------
// PROJECT.IDENTITY — anchors: project (this ticket only exercises the
// project anchor; §3.1 also lists sequence/shot/asset anchors, out of scope
// here since none of this ticket's 3 operations needs them).
// ---------------------------------------------------------------------------

export type ProjectIdentityData = {
  name: string;
  pitch: string | null;
  story: string | null;
  description: string | null;
};

export async function resolveProjectIdentity(projectId: number): Promise<ProjectIdentityData> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error(`resolveProjectIdentity: project ${projectId} not found.`);
  }
  return {
    name: project.name,
    pitch: project.pitch,
    story: project.story,
    description: project.description,
  };
}

// ---------------------------------------------------------------------------
// SEQ.CONTEXT — anchors: sequence
// ---------------------------------------------------------------------------

export type SeqContextData = {
  title: string;
  summary: string | null;
  description: string | null;
  mood: string | null;
  locationHint: string | null;
};

export async function resolveSeqContext(sequenceId: number): Promise<SeqContextData> {
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqContext: sequence ${sequenceId} not found.`);
  }
  return {
    title: sequence.title,
    summary: sequence.summary,
    description: sequence.description,
    mood: sequence.mood,
    locationHint: sequence.locationHint,
  };
}

// ---------------------------------------------------------------------------
// SEQ.CURRENT_PROMPT — anchors: sequence
// ---------------------------------------------------------------------------

export type SeqCurrentPromptData = {
  sequencePrompt: string | null;
};

export async function resolveSeqCurrentPrompt(sequenceId: number): Promise<SeqCurrentPromptData> {
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqCurrentPrompt: sequence ${sequenceId} not found.`);
  }
  return { sequencePrompt: sequence.sequencePrompt };
}

// ---------------------------------------------------------------------------
// The registry — one entry per `VariableId`. Resolver signatures differ
// across variables (project-anchored vs. sequence-anchored), matching the
// precedent's shape rather than forcing a uniform dispatch signature that
// no consumer needs yet — the runner that will dispatch by `VariableId`
// against a resolved anchor chain is B2's (`LLMW.RUNNER.1`).
// ---------------------------------------------------------------------------

export const VARIABLE_REGISTRY = {
  "PROJECT.IDENTITY": resolveProjectIdentity,
  "SEQ.CONTEXT": resolveSeqContext,
  "SEQ.CURRENT_PROMPT": resolveSeqCurrentPrompt,
} as const satisfies Record<VariableId, (anchorId: number) => Promise<unknown>>;
