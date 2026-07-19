// ---------------------------------------------------------------------------
// types.ts — SHOT.VIDEO.LIBRARY.1
//
// Pure types shared by the Shot Video Library server actions and UI. No
// process spawning, no filesystem, no Date.now().
//
// The ComfyUI-facing video-input mapping type (`RuntimeVideoOption`) lives
// in `src/lib/comfy/mapWorkflowInputs.ts` instead, alongside
// `RuntimeImageOption` — the canonical home the Lot C audit identified for
// every runtime input-mapping type, never duplicated here.
// ---------------------------------------------------------------------------

export type ShotVideoSource = "generation" | "sequence_split";

/** Plain, UI/action-facing projection of a `shot_videos` row. */
export type ShotVideoLibraryEntry = {
  id: number;
  shotId: number;
  source: ShotVideoSource;
  videoPath: string;
  durationSeconds: number | null;
  generationJobId: number | null;
  sourceCandidateId: number | null;
  createdAt: string;
  updatedAt: string;
};
