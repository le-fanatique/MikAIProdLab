CREATE TABLE `sequence_storyboard_extraction_regions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extraction_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`illustration_height` integer,
	`text_separation_detected` integer DEFAULT false NOT NULL,
	`confidence` real NOT NULL,
	`detection_mode` text DEFAULT 'border' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`target_shot_id` integer,
	`crop_image_path` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`extraction_id`) REFERENCES `sequence_storyboard_extractions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sequence_storyboard_extractions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sequence_id` integer NOT NULL,
	`source_storyboard_image_id` integer,
	`source_image_path` text NOT NULL,
	`source_width` integer NOT NULL,
	`source_height` integer NOT NULL,
	`detection_mode` text DEFAULT 'border' NOT NULL,
	`status` text DEFAULT 'detecting' NOT NULL,
	`params_json` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_storyboard_image_id`) REFERENCES `sequence_storyboard_images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `storyboard_images` ADD `extraction_region_id` integer REFERENCES sequence_storyboard_extraction_regions(id);