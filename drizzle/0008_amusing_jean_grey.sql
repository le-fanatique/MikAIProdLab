CREATE TABLE `prompt_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`label` text NOT NULL,
	`prompt_text` text NOT NULL,
	`start_seconds` real,
	`duration_seconds` real,
	`segment_type` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade
);
