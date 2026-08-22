ALTER TABLE `comfy_workflows` ADD `category` text;--> statement-breakpoint
ALTER TABLE `comfy_workflows` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `comfy_workflows` ADD `contexts` text;--> statement-breakpoint
ALTER TABLE `comfy_workflows` ADD `thumbnail_path` text;--> statement-breakpoint
ALTER TABLE `comfy_workflows` ADD `thumbnail_source_filename` text;--> statement-breakpoint
ALTER TABLE `comfy_workflows` ADD `status` text DEFAULT 'active' NOT NULL;