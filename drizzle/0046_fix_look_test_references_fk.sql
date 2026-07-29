PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_look_test_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`look_test_id` integer NOT NULL,
	`reference_image_id` integer NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`look_test_id`) REFERENCES `look_tests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_image_id`) REFERENCES `project_style_reference_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_look_test_references`("id", "look_test_id", "reference_image_id", "order_index", "created_at") SELECT "id", "look_test_id", "reference_image_id", "order_index", "created_at" FROM `look_test_references`;--> statement-breakpoint
DROP TABLE `look_test_references`;--> statement-breakpoint
ALTER TABLE `__new_look_test_references` RENAME TO `look_test_references`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `look_test_references_test_idx` ON `look_test_references` (`look_test_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `look_test_references_test_reference_unique` ON `look_test_references` (`look_test_id`,`reference_image_id`);