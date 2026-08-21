ALTER TABLE `shots` ADD `camera_position` text;--> statement-breakpoint
ALTER TABLE `shots` ADD `movement_speed` text;--> statement-breakpoint
ALTER TABLE `shots` ADD `camera_subject` text;
--> statement-breakpoint
-- B19b — the one data recovery this migration is allowed to make.
-- `OTS` and `POV` were literally listed as `framing` values in the
-- instruction that produced these rows, so the model obeyed: in this data
-- they are camera placements, not shot sizes. Deterministic, hence safe to
-- move here. Measured 2026-08-21: 6 rows, all `OTS`.
-- Every other out-of-palette value is deliberately left untouched — those
-- need a human, and a migration is the worst place to freeze a judgement.
UPDATE shots
SET camera_position = shot_size, shot_size = NULL
WHERE lower(trim(shot_size)) IN ('ots', 'pov');
