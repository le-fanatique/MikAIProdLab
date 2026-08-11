CREATE TABLE `shot_reference_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`video_path` text NOT NULL,
	`source_filename` text,
	`label` text,
	`notes` text,
	`duration_seconds` real,
	`width` integer,
	`height` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shot_reference_videos_shot_id_idx` ON `shot_reference_videos` (`shot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_reference_videos_video_path_unique` ON `shot_reference_videos` (`video_path`);