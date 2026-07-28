CREATE TABLE `asset_style_alignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`project_style_version_id` integer NOT NULL,
	`asset_content_fingerprint` text NOT NULL,
	`reviewed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_style_version_id`) REFERENCES `project_style_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_style_alignments_version_idx` ON `asset_style_alignments` (`project_style_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_style_alignments_asset_id_unique` ON `asset_style_alignments` (`asset_id`);