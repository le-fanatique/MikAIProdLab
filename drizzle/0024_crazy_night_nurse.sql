ALTER TABLE `asset_reference_images` ADD `variant_state` text;--> statement-breakpoint
ALTER TABLE `asset_reference_images` ADD `usage_notes` text;--> statement-breakpoint
ALTER TABLE `asset_reference_images` ADD `approved_for_generation` integer DEFAULT false NOT NULL;