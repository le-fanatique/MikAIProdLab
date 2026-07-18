CREATE TABLE `shot_video_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`split_run_id` integer NOT NULL,
	`split_segment_id` integer NOT NULL,
	`clip_path` text NOT NULL,
	`source_start_seconds` real NOT NULL,
	`source_end_seconds` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`split_run_id`) REFERENCES `sequence_video_split_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`split_segment_id`) REFERENCES `sequence_video_split_segments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shot_video_candidates_shot_id_idx` ON `shot_video_candidates` (`shot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_video_candidates_split_segment_id_unique` ON `shot_video_candidates` (`split_segment_id`);