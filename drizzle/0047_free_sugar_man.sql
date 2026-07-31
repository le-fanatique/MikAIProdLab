CREATE TABLE `project_style_reference_analysis_candidate_rule_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidate_rule_id` integer NOT NULL,
	`reference_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`candidate_rule_id`) REFERENCES `project_style_reference_analysis_candidate_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_cand_rule_refs_unique` ON `project_style_reference_analysis_candidate_rule_references` (`candidate_rule_id`,`reference_id`);--> statement-breakpoint
CREATE TABLE `project_style_reference_analysis_candidate_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`run_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`original_instruction` text NOT NULL,
	`original_pillar` text,
	`original_section` text,
	`original_category` text,
	`original_strength` text,
	`original_applicability` text,
	`instruction` text NOT NULL,
	`pillar` text,
	`section` text,
	`category` text,
	`strength` text,
	`applicability` text,
	`rationale` text NOT NULL,
	`confidence` text NOT NULL,
	`uncertainty` text,
	`approved_draft_rule_id` integer,
	`approved_snapshot` text,
	`approved_at` text,
	`rejected_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `project_style_reference_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_draft_rule_id`) REFERENCES `project_style_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_cand_rules_run_order_unique` ON `project_style_reference_analysis_candidate_rules` (`run_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_style_reference_analysis_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`reference_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`domain` text,
	`original_observation` text NOT NULL,
	`observation` text NOT NULL,
	`rationale` text,
	`confidence` text NOT NULL,
	`uncertainty` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `project_style_reference_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_observations_run_order_unique` ON `project_style_reference_analysis_observations` (`run_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_style_reference_analysis_run_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`reference_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`reference_key` text NOT NULL,
	`reference_snapshot` text NOT NULL,
	`image_sha256` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `project_style_reference_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_run_refs_run_reference_unique` ON `project_style_reference_analysis_run_references` (`run_id`,`reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_run_refs_run_ordinal_unique` ON `project_style_reference_analysis_run_references` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_run_refs_run_key_unique` ON `project_style_reference_analysis_run_references` (`run_id`,`reference_key`);--> statement-breakpoint
CREATE TABLE `project_style_reference_analysis_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`request_key` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`contract_version` integer NOT NULL,
	`input_snapshot` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`summary` text,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_style_ref_analysis_runs_project_idx` ON `project_style_reference_analysis_runs` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_ref_analysis_runs_project_request_unique` ON `project_style_reference_analysis_runs` (`project_id`,`request_key`);