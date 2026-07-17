CREATE TABLE `sequence_video_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sequence_id` integer NOT NULL,
	`source_storyboard_image_id` integer,
	`job_id` integer,
	`workflow_id` integer,
	`video_path` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prompt_snapshot` text,
	`references_snapshot` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`approved_at` text,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_storyboard_image_id`) REFERENCES `sequence_storyboard_images`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workflow_id`) REFERENCES `comfy_workflows`(`id`) ON UPDATE no action ON DELETE set null
);
