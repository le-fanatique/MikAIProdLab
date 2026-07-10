CREATE TABLE `sequence_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`sequence_id` integer NOT NULL,
	`source_mode` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`video_path` text,
	`duration_seconds` real,
	`cut_manifest` text,
	`editorial_snapshot` text,
	`notes` text,
	`warnings` text,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sequence_results_sequence_idx` ON `sequence_results` (`sequence_id`,`status`);