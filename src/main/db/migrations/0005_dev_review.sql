CREATE TABLE `dev_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`editor` text DEFAULT 'vscode' NOT NULL,
	`main_script` text DEFAULT '' NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`github_repo` text DEFAULT '' NOT NULL,
	`last_opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`snapshot` text,
	`summary` text DEFAULT '' NOT NULL,
	`plan` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reviews_weekStart_unique` ON `weekly_reviews` (`week_start`);