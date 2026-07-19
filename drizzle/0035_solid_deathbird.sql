CREATE TABLE `shot_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`source` text NOT NULL,
	`video_path` text NOT NULL,
	`duration_seconds` real,
	`generation_job_id` integer,
	`source_candidate_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_candidate_id`) REFERENCES `shot_video_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shot_videos_shot_id_idx` ON `shot_videos` (`shot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_videos_video_path_unique` ON `shot_videos` (`video_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_videos_source_candidate_id_unique` ON `shot_videos` (`source_candidate_id`);