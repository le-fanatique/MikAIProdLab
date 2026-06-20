CREATE TABLE `generation_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`workflow_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`prompt_id` text,
	`client_id` text,
	`output_path` text,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `comfy_workflows`(`id`) ON UPDATE no action ON DELETE no action
);
