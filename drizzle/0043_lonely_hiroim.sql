CREATE TABLE `sequence_style_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sequence_id` integer NOT NULL,
	`source_project_style_version_id` integer NOT NULL,
	`content_snapshot` text NOT NULL,
	`compiled_text` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_project_style_version_id`) REFERENCES `project_style_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sequence_style_overrides_source_version_idx` ON `sequence_style_overrides` (`source_project_style_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sequence_style_overrides_sequence_id_unique` ON `sequence_style_overrides` (`sequence_id`);