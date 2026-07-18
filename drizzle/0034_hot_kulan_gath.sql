PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shot_reference_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`image_path` text NOT NULL,
	`source_filename` text,
	`label` text,
	`image_role` text,
	`notes` text,
	`source_storyboard_image_id` integer,
	`source_shot_video_candidate_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_storyboard_image_id`) REFERENCES `storyboard_images`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_shot_video_candidate_id`) REFERENCES `shot_video_candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_shot_reference_images`("id", "shot_id", "order_index", "image_path", "source_filename", "label", "image_role", "notes", "source_storyboard_image_id", "source_shot_video_candidate_id", "created_at", "updated_at") SELECT "id", "shot_id", "order_index", "image_path", "source_filename", "label", "image_role", "notes", "source_storyboard_image_id", "source_shot_video_candidate_id", "created_at", "updated_at" FROM `shot_reference_images`;--> statement-breakpoint
DROP TABLE `shot_reference_images`;--> statement-breakpoint
ALTER TABLE `__new_shot_reference_images` RENAME TO `shot_reference_images`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `shot_reference_images_source_candidate_unique` ON `shot_reference_images` (`source_shot_video_candidate_id`);