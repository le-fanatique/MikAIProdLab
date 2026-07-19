PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shot_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`source` text NOT NULL,
	`video_path` text NOT NULL,
	`duration_seconds` real,
	`generation_job_id` integer,
	`source_candidate_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_candidate_id`) REFERENCES `shot_video_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shot_videos`("id", "shot_id", "source", "video_path", "duration_seconds", "generation_job_id", "source_candidate_id", "created_at", "updated_at") SELECT "id", "shot_id", "source", "video_path", "duration_seconds", "generation_job_id", "source_candidate_id", "created_at", "updated_at" FROM `shot_videos`;--> statement-breakpoint
DROP TABLE `shot_videos`;--> statement-breakpoint
ALTER TABLE `__new_shot_videos` RENAME TO `shot_videos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `shot_videos_shot_id_idx` ON `shot_videos` (`shot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_videos_video_path_unique` ON `shot_videos` (`video_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_videos_source_candidate_id_unique` ON `shot_videos` (`source_candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_videos_generation_job_id_unique` ON `shot_videos` (`generation_job_id`);