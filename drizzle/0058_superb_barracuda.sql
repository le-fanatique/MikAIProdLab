CREATE TABLE `generation_job_outputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`output_index` integer NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`source_filename` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_job_outputs_job_index_unique` ON `generation_job_outputs` (`job_id`,`output_index`);