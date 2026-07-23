CREATE TABLE `project_style_active_pointers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`active_version_id` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_version_id`) REFERENCES `project_style_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_active_pointers_project_id_unique` ON `project_style_active_pointers` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_style_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`direction_brief` text,
	`world_general_direction` text,
	`world_negative_constraints` text,
	`visual_general_direction` text,
	`visual_negative_constraints` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_drafts_project_id_unique` ON `project_style_drafts` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_style_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_id` integer NOT NULL,
	`instruction` text NOT NULL,
	`pillar` text,
	`section` text,
	`category` text,
	`strength` text,
	`applicability` text,
	`provenance_notes` text,
	`status` text DEFAULT 'approved' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `project_style_drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_style_rules_draft_idx` ON `project_style_rules` (`draft_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_style_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_id` integer NOT NULL,
	`pillar` text NOT NULL,
	`heading` text NOT NULL,
	`content` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `project_style_drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_style_sections_draft_idx` ON `project_style_sections` (`draft_id`,`pillar`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_style_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`version_number` integer NOT NULL,
	`content_snapshot` text NOT NULL,
	`compiled_text` text NOT NULL,
	`published_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_style_versions_project_idx` ON `project_style_versions` (`project_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_versions_project_version_unique` ON `project_style_versions` (`project_id`,`version_number`);