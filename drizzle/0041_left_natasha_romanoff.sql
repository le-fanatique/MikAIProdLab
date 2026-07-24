CREATE TABLE `project_style_influence_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`influence_id` integer NOT NULL,
	`domain` text NOT NULL,
	`weight` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_influence_domains_unique` ON `project_style_influence_domains` (`influence_id`,`domain`);--> statement-breakpoint
CREATE TABLE `project_style_influence_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`influence_id` integer NOT NULL,
	`reference_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_influence_references_unique` ON `project_style_influence_references` (`influence_id`,`reference_id`);--> statement-breakpoint
CREATE TABLE `project_style_influences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`subject_type` text NOT NULL,
	`subject_name` text NOT NULL,
	`disambiguation` text,
	`role_or_discipline` text,
	`period_or_works` text,
	`what_interests_me` text,
	`what_to_avoid` text,
	`research_notes` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_style_reference_consumers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_id` integer NOT NULL,
	`consumer` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`reference_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_reference_consumers_unique` ON `project_style_reference_consumers` (`reference_id`,`consumer`);--> statement-breakpoint
CREATE TABLE `project_style_reference_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_id` integer NOT NULL,
	`domain` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`reference_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_reference_domains_unique` ON `project_style_reference_domains` (`reference_id`,`domain`);--> statement-breakpoint
CREATE TABLE `project_style_reference_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`image_path` text NOT NULL,
	`source_filename` text,
	`label` text,
	`source_url` text,
	`provenance_notes` text,
	`what_interests_me` text,
	`what_to_avoid` text,
	`approved_for_analysis` integer DEFAULT false NOT NULL,
	`approved_for_generation` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
