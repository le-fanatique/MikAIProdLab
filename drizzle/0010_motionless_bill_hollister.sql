CREATE TABLE `asset_reference_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`image_path` text NOT NULL,
	`source_filename` text,
	`label` text,
	`image_role` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shot_reference_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`image_path` text NOT NULL,
	`source_filename` text,
	`label` text,
	`image_role` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade
);
