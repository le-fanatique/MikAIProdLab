// ---------------------------------------------------------------------------
// loadRuntimeVideoOptions.ts — SHOT.VIDEO.LIBRARY.1, Lot C
//
// Server-only shared query: a Shot's durable video library, projected into
// `RuntimeVideoOption[]` (src/lib/comfy/mapWorkflowInputs.ts) ready for a
// ComfyUI video-input picker. Used by every surface that needs this exact
// list — `ShotGenerationPanel.tsx`, the `/map` page, and the queue action
// (`runWorkflowGeneration` in generation.ts) — so provenance labels and
// "Approved" status can never drift between the preview shown and the
// payload actually queued.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shots, shotVideos, shotVideoCandidates, sequenceVideoSplitSegments } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { buildRuntimeVideoOptions, type RuntimeVideoOption, type RuntimeShotVideo } from "@/lib/comfy/mapWorkflowInputs";

export async function loadRuntimeVideoOptionsForShot(shotId: number): Promise<RuntimeVideoOption[]> {
  const [shot] = await db.select({ approvedVideoPath: shots.approvedVideoPath }).from(shots).where(eq(shots.id, shotId));
  const rows = await db.select().from(shotVideos).where(eq(shotVideos.shotId, shotId)).orderBy(desc(shotVideos.createdAt));
  if (rows.length === 0) return [];

  const candidateIds = rows.map((r) => r.sourceCandidateId).filter((id): id is number => id !== null);
  const candidates = candidateIds.length > 0 ? await db.select().from(shotVideoCandidates).where(inArray(shotVideoCandidates.id, candidateIds)) : [];
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const segmentIds = candidates.map((c) => c.splitSegmentId);
  const segments =
    segmentIds.length > 0
      ? await db.select({ id: sequenceVideoSplitSegments.id, orderIndex: sequenceVideoSplitSegments.orderIndex }).from(sequenceVideoSplitSegments).where(inArray(sequenceVideoSplitSegments.id, segmentIds))
      : [];
  const orderIndexBySegmentId = new Map(segments.map((s) => [s.id, s.orderIndex]));

  const shotVideoInputs: RuntimeShotVideo[] = rows.map((row) => {
    const candidate = row.sourceCandidateId !== null ? candidateById.get(row.sourceCandidateId) : undefined;
    const provenanceLabel =
      row.source === "sequence_split"
        ? `Split Run #${candidate?.splitRunId ?? "?"}${candidate ? ` · Segment #${(orderIndexBySegmentId.get(candidate.splitSegmentId) ?? -1) + 1}` : ""}`
        : "Generation Content";
    return {
      id: row.id,
      videoPath: row.videoPath,
      source: row.source,
      durationSeconds: row.durationSeconds,
      isApproved: shot?.approvedVideoPath === row.videoPath,
      provenanceLabel,
    };
  });

  return buildRuntimeVideoOptions(shotVideoInputs);
}
