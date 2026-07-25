CREATE TABLE `project_style_research_candidate_rule_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidate_rule_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`candidate_rule_id`) REFERENCES `project_style_research_candidate_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `project_style_research_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_candidate_rule_sources_unique` ON `project_style_research_candidate_rule_sources` (`candidate_rule_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `project_style_research_candidate_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`influence_id` integer NOT NULL,
	`synthesis_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`original_instruction` text NOT NULL,
	`original_pillar` text,
	`original_section` text,
	`original_category` text,
	`original_strength` text,
	`original_applicability` text,
	`instruction` text NOT NULL,
	`pillar` text,
	`section` text,
	`category` text,
	`strength` text,
	`applicability` text,
	`rationale` text NOT NULL,
	`confidence` text NOT NULL,
	`uncertainty` text,
	`approved_draft_rule_id` integer,
	`approved_snapshot` text,
	`approved_at` text,
	`rejected_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`synthesis_id`) REFERENCES `project_style_research_syntheses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_draft_rule_id`) REFERENCES `project_style_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_candidate_rules_synthesis_order_unique` ON `project_style_research_candidate_rules` (`synthesis_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_style_research_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`influence_id` integer NOT NULL,
	`run_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`normalized_url` text NOT NULL,
	`url_hash` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`title` text NOT NULL,
	`publisher_host` text NOT NULL,
	`author_or_publisher` text,
	`source_type` text NOT NULL,
	`source_tier` text NOT NULL,
	`bounded_excerpt` text NOT NULL,
	`relevance_summary` text,
	`usefulness_rationale` text,
	`confidence` text NOT NULL,
	`uncertainty` text,
	`state` text DEFAULT 'pending_review' NOT NULL,
	`decision_revision` integer DEFAULT 0 NOT NULL,
	`saved_source_id` integer,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `project_style_research_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_source_id`) REFERENCES `project_style_research_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_candidates_run_ordinal_unique` ON `project_style_research_candidates` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_candidates_run_url_evidence_unique` ON `project_style_research_candidates` (`run_id`,`url_hash`,`evidence_hash`);--> statement-breakpoint
CREATE TABLE `project_style_research_claim_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`claim_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `project_style_research_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `project_style_research_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_claim_sources_unique` ON `project_style_research_claim_sources` (`claim_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `project_style_research_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`synthesis_id` integer NOT NULL,
	`claim_key` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`confidence` text NOT NULL,
	`uncertainty` text,
	`order_index` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`synthesis_id`) REFERENCES `project_style_research_syntheses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_claims_synthesis_key_unique` ON `project_style_research_claims` (`synthesis_id`,`claim_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_claims_synthesis_order_unique` ON `project_style_research_claims` (`synthesis_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_style_research_leases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`influence_id` integer NOT NULL,
	`operation` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_leases_influence_op_unique` ON `project_style_research_leases` (`influence_id`,`operation`);--> statement-breakpoint
CREATE TABLE `project_style_research_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`influence_id` integer NOT NULL,
	`run_number` integer NOT NULL,
	`request_key` text NOT NULL,
	`query` text NOT NULL,
	`provider` text DEFAULT 'openrouter' NOT NULL,
	`model` text NOT NULL,
	`contract_version` integer NOT NULL,
	`max_results` integer NOT NULL,
	`max_tool_calls` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_runs_influence_run_unique` ON `project_style_research_runs` (`influence_id`,`run_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_runs_influence_request_unique` ON `project_style_research_runs` (`influence_id`,`request_key`);--> statement-breakpoint
CREATE TABLE `project_style_research_source_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`domain` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `project_style_research_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_source_domains_unique` ON `project_style_research_source_domains` (`source_id`,`domain`);--> statement-breakpoint
CREATE TABLE `project_style_research_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`influence_id` integer NOT NULL,
	`normalized_url` text NOT NULL,
	`url_hash` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`title` text NOT NULL,
	`publisher_host` text NOT NULL,
	`author_or_publisher` text,
	`source_type` text NOT NULL,
	`source_tier` text NOT NULL,
	`bounded_excerpt` text NOT NULL,
	`relevance_summary` text,
	`usefulness_rationale` text,
	`confidence` text NOT NULL,
	`uncertainty` text,
	`user_notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`saved_at` text NOT NULL,
	`withdrawn_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_sources_influence_url_evidence_unique` ON `project_style_research_sources` (`influence_id`,`url_hash`,`evidence_hash`);--> statement-breakpoint
CREATE TABLE `project_style_research_syntheses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`influence_id` integer NOT NULL,
	`version_number` integer NOT NULL,
	`request_key` text NOT NULL,
	`provider` text DEFAULT 'openrouter' NOT NULL,
	`model` text NOT NULL,
	`contract_version` integer NOT NULL,
	`input_snapshot` text NOT NULL,
	`summary` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`influence_id`) REFERENCES `project_style_influences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_syntheses_influence_version_unique` ON `project_style_research_syntheses` (`influence_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_syntheses_influence_request_unique` ON `project_style_research_syntheses` (`influence_id`,`request_key`);--> statement-breakpoint
CREATE TABLE `project_style_research_synthesis_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`synthesis_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`source_revision` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`synthesis_id`) REFERENCES `project_style_research_syntheses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `project_style_research_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_style_research_synthesis_sources_unique` ON `project_style_research_synthesis_sources` (`synthesis_id`,`source_id`);