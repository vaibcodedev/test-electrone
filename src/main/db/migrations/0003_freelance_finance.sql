CREATE TABLE `credit_txs` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`kind` text DEFAULT 'purchase' NOT NULL,
	`amount` integer NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`at` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_txs_platform_idx` ON `credit_txs` (`platform_id`,`at`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`at` integer NOT NULL,
	`subscription_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_at_idx` ON `expenses` (`at`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`metric` text NOT NULL,
	`period` text DEFAULT 'month' NOT NULL,
	`target` real NOT NULL,
	`platform_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`situation` text DEFAULT 'proposal' NOT NULL,
	`title` text NOT NULL,
	`trigger` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`niche` text DEFAULT '' NOT NULL,
	`copy_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`folder` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platforms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`color` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`credits_name` text DEFAULT '' NOT NULL,
	`credit_price` real DEFAULT 0 NOT NULL,
	`default_fee_percent` real DEFAULT 0 NOT NULL,
	`pre_checklist` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`niche` text DEFAULT '' NOT NULL,
	`client` text DEFAULT '' NOT NULL,
	`problem` text DEFAULT '' NOT NULL,
	`what_done` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`stack` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`text_en` text DEFAULT '' NOT NULL,
	`project_id` text,
	`cover_path` text
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`platform_id` text NOT NULL,
	`job_title` text NOT NULL,
	`job_url` text DEFAULT '' NOT NULL,
	`job_description` text DEFAULT '' NOT NULL,
	`niche` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` integer,
	`credits` integer DEFAULT 0 NOT NULL,
	`boost_credits` integer DEFAULT 0 NOT NULL,
	`bid_type` text DEFAULT 'fixed' NOT NULL,
	`bid_amount` real DEFAULT 0 NOT NULL,
	`fee_percent` real,
	`cover_letter` text DEFAULT '' NOT NULL,
	`template_id` text,
	`client_id` text,
	`client_name` text DEFAULT '' NOT NULL,
	`client_country` text DEFAULT '' NOT NULL,
	`client_rating` real,
	`client_spent` real,
	`client_hire_rate` real,
	`payment_verified` integer,
	`proposals_on_job` text DEFAULT '' NOT NULL,
	`checks` text DEFAULT '[]' NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`replied_at` integer,
	`hired_at` integer,
	`project_id` text
);
--> statement-breakpoint
CREATE INDEX `proposals_platform_idx` ON `proposals` (`platform_id`,`status`);--> statement-breakpoint
CREATE INDEX `proposals_sent_idx` ON `proposals` (`sent_at`);--> statement-breakpoint
CREATE TABLE `red_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`signs` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`severity` integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`billing_day` integer DEFAULT 1 NOT NULL,
	`billing_month` integer DEFAULT 0 NOT NULL,
	`category` text DEFAULT 'subscription' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`started_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`fee` real DEFAULT 0 NOT NULL,
	`rate` real DEFAULT 1 NOT NULL,
	`received_currency` text DEFAULT 'UAH' NOT NULL,
	`received` real DEFAULT 0 NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`at` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `withdrawals_at_idx` ON `withdrawals` (`at`);--> statement-breakpoint
ALTER TABLE `clients` ADD `platform_id` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `country` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `rating` real;--> statement-breakpoint
ALTER TABLE `clients` ADD `total_spent` real;--> statement-breakpoint
ALTER TABLE `clients` ADD `hire_rate` real;--> statement-breakpoint
ALTER TABLE `clients` ADD `payment_verified` integer;--> statement-breakpoint
ALTER TABLE `clients` ADD `how_to_communicate` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `platform_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `fee_percent` real;--> statement-breakpoint
ALTER TABLE `projects` ADD `proposal_id` text;