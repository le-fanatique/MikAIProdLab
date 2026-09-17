CREATE TABLE `invoke_boards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`board_id` text NOT NULL,
	`board_name` text NOT NULL,
	`last_known_image_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoke_boards_owner_unique` ON `invoke_boards` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoke_boards_board_id_unique` ON `invoke_boards` (`board_id`);--> statement-breakpoint
CREATE TABLE `invoke_pushed_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoke_board_id` integer NOT NULL,
	`image_name` text NOT NULL,
	`source_image_path` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoke_board_id`) REFERENCES `invoke_boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoke_pushed_images_image_name_unique` ON `invoke_pushed_images` (`image_name`);