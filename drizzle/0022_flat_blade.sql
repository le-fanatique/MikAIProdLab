CREATE TABLE `film_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`video_path` text,
	`duration_seconds` real,
	`sequence_result_manifest` text,
	`project_snapshot` text,
	`notes` text,
	`warnings` text,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `film_results_project_idx` ON `film_results` (`project_id`,`status`);