PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_look_tests` (
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
	`workflow_id` integer,
	`workflow_kind` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`style_version_id`) REFERENCES `project_style_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `comfy_workflows`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_look_tests`("id", "project_id", "source", "mode", "subject", "action", "style_source_kind", "style_draft_revision", "style_version_id", "style_snapshot", "style_compiled_text", "workflow_id", "workflow_kind", "created_at", "updated_at") SELECT "id", "project_id", "source", "mode", "subject", "action", "style_source_kind", "style_draft_revision", "style_version_id", "style_snapshot", "style_compiled_text", "workflow_id", "workflow_kind", "created_at", "updated_at" FROM `look_tests`;--> statement-breakpoint
DROP TABLE `look_tests`;--> statement-breakpoint
ALTER TABLE `__new_look_tests` RENAME TO `look_tests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `look_tests_project_idx` ON `look_tests` (`project_id`);--> statement-breakpoint
CREATE INDEX `look_tests_style_version_idx` ON `look_tests` (`style_version_id`);