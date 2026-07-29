CREATE TABLE `look_test_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`look_test_id` integer NOT NULL,
	`reference_image_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`look_test_id`) REFERENCES `look_tests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_image_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `look_test_references_test_idx` ON `look_test_references` (`look_test_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `look_test_references_test_reference_unique` ON `look_test_references` (`look_test_id`,`reference_image_id`);--> statement-breakpoint
CREATE TABLE `look_test_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`look_test_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`generation_job_id` integer NOT NULL,
	`kind` text NOT NULL,
	`file_path` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'candidate' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`look_test_id`) REFERENCES `look_tests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `look_test_results_test_idx` ON `look_test_results` (`look_test_id`);--> statement-breakpoint
CREATE INDEX `look_test_results_project_status_idx` ON `look_test_results` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `look_test_results_generation_job_id_unique` ON `look_test_results` (`generation_job_id`);--> statement-breakpoint
CREATE TABLE `look_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`source` text NOT NULL,
	`mode` text NOT NULL,
	`subject` text NOT NULL,
	`action` text NOT NULL,
	`style_source_kind` text NOT NULL,
	`style_draft_revision` integer,
	`style_version_id` integer,
	`style_snapshot` text NOT NULL,
	`style_compiled_text` text NOT NULL,
	`workflow_id` integer NOT NULL,
	`workflow_kind` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`style_version_id`) REFERENCES `project_style_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `comfy_workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `look_tests_project_idx` ON `look_tests` (`project_id`);--> statement-breakpoint
CREATE INDEX `look_tests_style_version_idx` ON `look_tests` (`style_version_id`);--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `look_test_id` integer REFERENCES look_tests(id);