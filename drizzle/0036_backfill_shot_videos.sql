-- SHOT.VIDEO.LIBRARY.1 — versioned, idempotent backfill of `shot_videos`.
-- Safe to run on a database that already has some/all backfilled rows
-- (e.g. the dev DB this was originally hand-backfilled against): every
-- INSERT is guarded by a NOT EXISTS check on the exact uniqueness rule the
-- schema itself enforces (source_candidate_id, video_path), so re-running
-- this migration is a strict no-op the second time.

-- 1) One row per existing Split-pushed candidate (source = "sequence_split").
INSERT INTO shot_videos (shot_id, source, video_path, duration_seconds, source_candidate_id, created_at, updated_at)
SELECT svc.shot_id, 'sequence_split', svc.clip_path, (svc.source_end_seconds - svc.source_start_seconds), svc.id, svc.created_at, svc.updated_at
FROM shot_video_candidates svc
WHERE NOT EXISTS (SELECT 1 FROM shot_videos sv WHERE sv.source_candidate_id = svc.id);
--> statement-breakpoint

-- 2) One row per Shot's current approvedVideoPath NOT already covered by (1)
-- above (e.g. a legacy Generation-approved video that predates any Split
-- candidate). Provenance is not reconstructible for these — generation_job_id
-- stays NULL, honestly.
INSERT INTO shot_videos (shot_id, source, video_path, duration_seconds, generation_job_id, created_at, updated_at)
SELECT s.id, 'generation', s.approved_video_path, NULL, NULL, s.updated_at, s.updated_at
FROM shots s
WHERE s.approved_video_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM shot_videos sv WHERE sv.video_path = s.approved_video_path);
