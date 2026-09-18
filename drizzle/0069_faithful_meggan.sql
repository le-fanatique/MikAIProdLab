CREATE TABLE `invoke_imported_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoke_board_id` integer NOT NULL,
	`image_name` text NOT NULL,
	`destination_table` text NOT NULL,
	`destination_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoke_board_id`) REFERENCES `invoke_boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoke_imported_images_image_name_unique` ON `invoke_imported_images` (`image_name`);