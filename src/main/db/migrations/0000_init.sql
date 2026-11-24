CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`path` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `board_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`color` text,
	`is_done` integer DEFAULT false NOT NULL,
	`position` real NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_columns_board_idx` ON `board_columns` (`board_id`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text,
	`project_id` text,
	`idea_id` text,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'article' NOT NULL,
	`status` text DEFAULT 'queue' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `bookmarks_status_idx` ON `bookmarks` (`status`);--> statement-breakpoint
CREATE TABLE `card_checklist` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` real NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_checklist_card_idx` ON `card_checklist` (`card_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`board_id` text NOT NULL,
	`column_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`due_at` integer,
	`position` real NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cards_board_idx` ON `cards` (`board_id`,`column_id`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`due_at`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_id` text NOT NULL,
	`text` text NOT NULL,
	`hint` text DEFAULT '' NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`done_at` integer,
	`position` real NOT NULL,
	FOREIGN KEY (`checklist_id`) REFERENCES `checklists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_items_list_idx` ON `checklist_items` (`checklist_id`);--> statement-breakpoint
CREATE TABLE `checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'template' NOT NULL,
	`template_id` text,
	`project_id` text
);
--> statement-breakpoint
CREATE TABLE `claude_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`works` integer DEFAULT false NOT NULL,
	`copy_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claude_kind_idx` ON `claude_items` (`kind`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`messenger` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`default_rate` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`client_id` text,
	`label` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`login` text DEFAULT '' NOT NULL,
	`secret` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `designs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'site' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`colors` text DEFAULT '[]' NOT NULL,
	`image_path` text,
	`image_width` integer,
	`image_height` integer
);
--> statement-breakpoint
CREATE TABLE `entity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_type` text NOT NULL,
	`from_id` text NOT NULL,
	`to_type` text NOT NULL,
	`to_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_links_unique` ON `entity_links` (`from_type`,`from_id`,`to_type`,`to_id`);--> statement-breakpoint
CREATE INDEX `entity_links_to_idx` ON `entity_links` (`to_type`,`to_id`);--> statement-breakpoint
CREATE TABLE `entity_tags` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`, `tag_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entity_tags_tag_idx` ON `entity_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`remind_minutes` integer,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`color` text,
	`reminded_for` integer
);
--> statement-breakpoint
CREATE INDEX `events_start_idx` ON `events` (`start_at`);--> statement-breakpoint
CREATE TABLE `fixes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`error_text` text DEFAULT '' NOT NULL,
	`cause` text DEFAULT '' NOT NULL,
	`solution` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`resolved` integer DEFAULT true NOT NULL,
	`project_id` text
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'inbox' NOT NULL,
	`impact` integer DEFAULT 0 NOT NULL,
	`board_id` text
);
--> statement-breakpoint
CREATE INDEX `ideas_status_idx` ON `ideas` (`status`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`npm_url` text DEFAULT '' NOT NULL,
	`github_url` text DEFAULT '' NOT NULL,
	`docs_url` text DEFAULT '' NOT NULL,
	`install_cmd` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'want' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moodboard_items` (
	`moodboard_id` text NOT NULL,
	`design_id` text NOT NULL,
	`position` real NOT NULL,
	PRIMARY KEY(`moodboard_id`, `design_id`),
	FOREIGN KEY (`moodboard_id`) REFERENCES `moodboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `moodboards` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'expected' NOT NULL,
	`due_at` integer,
	`paid_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payments_project_idx` ON `payments` (`project_id`);--> statement-breakpoint
CREATE TABLE `pins` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`client_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`billing` text DEFAULT 'hourly' NOT NULL,
	`rate` real DEFAULT 0 NOT NULL,
	`fixed_price` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`budget_hours` real DEFAULT 0 NOT NULL,
	`start_at` integer,
	`due_at` integer,
	`repo_url` text DEFAULT '' NOT NULL,
	`staging_url` text DEFAULT '' NOT NULL,
	`prod_url` text DEFAULT '' NOT NULL,
	`admin_url` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);--> statement-breakpoint
CREATE TABLE `snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'typescript' NOT NULL,
	`copy_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`minutes` integer DEFAULT 0 NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `time_project_idx` ON `time_entries` (`project_id`);--> statement-breakpoint
CREATE INDEX `time_started_idx` ON `time_entries` (`started_at`);--> statement-breakpoint
CREATE TABLE `ui_components` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'tsx' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`preview_bg` text DEFAULT 'light' NOT NULL,
	`cover_path` text
);
--> statement-breakpoint
CREATE TABLE `word_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`grade` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `word_reviews_at_idx` ON `word_reviews` (`reviewed_at`);--> statement-breakpoint
CREATE TABLE `words` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`term` text NOT NULL,
	`translation` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'word' NOT NULL,
	`transcription` text DEFAULT '' NOT NULL,
	`example` text DEFAULT '' NOT NULL,
	`example_translation` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`ease` real DEFAULT 2.5 NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`last_reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `words_due_idx` ON `words` (`due_at`);