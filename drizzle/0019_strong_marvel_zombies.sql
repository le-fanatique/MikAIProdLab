CREATE TABLE `sequence_editorial_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sequence_id` integer NOT NULL,
	`type` text NOT NULL,
	`shot_id` integer,
	`order_index` integer DEFAULT 0 NOT NULL,
	`duration_seconds` real,
	`trim_in_seconds` real,
	`trim_out_seconds` real,
	`track_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sequence_editorial_items_seq_order_idx` ON `sequence_editorial_items` (`sequence_id`,`order_index`);