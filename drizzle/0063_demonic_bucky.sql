PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generation_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer,
	`asset_id` integer,
	`sequence_id` integer,
	`look_test_id` integer,
	`workflow_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`prompt_id` text,
	`client_id` text,
	`output_path` text,
	`error_message` text,
	`payload_snapshot` text,
	`runtime_provider` text DEFAULT 'local' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`look_test_id`) REFERENCES `look_tests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_id`) REFERENCES `comfy_workflows`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_generation_jobs`("id", "shot_id", "asset_id", "sequence_id", "look_test_id", "workflow_id", "status", "prompt_id", "client_id", "output_path", "error_message", "payload_snapshot", "runtime_provider", "started_at", "completed_at", "created_at", "updated_at") SELECT "id", "shot_id", "asset_id", "sequence_id", "look_test_id", "workflow_id", "status", "prompt_id", "client_id", "output_path", "error_message", "payload_snapshot", "runtime_provider", "started_at", "completed_at", "created_at", "updated_at" FROM `generation_jobs`;--> statement-breakpoint
DROP TABLE `generation_jobs`;--> statement-breakpoint
ALTER TABLE `__new_generation_jobs` RENAME TO `generation_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;