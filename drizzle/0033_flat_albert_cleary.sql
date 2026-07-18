CREATE TABLE `shot_storyboard_thumbnails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`reference_image_id` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_image_id`) REFERENCES `shot_reference_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shot_storyboard_thumbnails_shot_id_unique` ON `shot_storyboard_thumbnails` (`shot_id`);--> statement-breakpoint
ALTER TABLE `shot_reference_images` ADD `source_shot_video_candidate_id` integer REFERENCES shot_video_candidates(id);--> statement-breakpoint
CREATE UNIQUE INDEX `shot_reference_images_source_candidate_unique` ON `shot_reference_images` (`source_shot_video_candidate_id`);