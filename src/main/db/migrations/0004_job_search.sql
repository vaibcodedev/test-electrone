CREATE TABLE `application_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text DEFAULT 'screening' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`at` integer,
	`duration_min` integer DEFAULT 60 NOT NULL,
	`deadline_at` integer,
	`status` text DEFAULT 'planned' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`interviewers` text DEFAULT '' NOT NULL,
	`event_id` text,
	`deadline_event_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stages_application_idx` ON `application_stages` (`application_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`company_id` text,
	`company_name` text DEFAULT '' NOT NULL,
	`board_id` text,
	`url` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`applied_at` integer,
	`salary_min` real,
	`salary_max` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`format` text DEFAULT 'remote' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`resume_id` text,
	`template_id` text,
	`cover_letter` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`follow_up_at` integer,
	`notes` text DEFAULT '' NOT NULL,
	`replied_at` integer,
	`closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE INDEX `applications_applied_idx` ON `applications` (`applied_at`);--> statement-breakpoint
CREATE TABLE `board_checkins` (
	`board_id` text NOT NULL,
	`day` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`board_id`, `day`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`reviews_url` text DEFAULT '' NOT NULL,
	`stack` text DEFAULT '' NOT NULL,
	`size` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`contacts` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interview_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`category` text DEFAULT 'technical' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`question` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`lang` text DEFAULT 'ru' NOT NULL,
	`difficulty` integer DEFAULT 2 NOT NULL,
	`company_id` text,
	`application_id` text,
	`ease` real DEFAULT 2.5 NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`last_reviewed_at` integer
);
--> statement-breakpoint
CREATE TABLE `job_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`color` text,
	`daily_target` integer DEFAULT 1 NOT NULL,
	`weekdays` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resume_boards` (
	`resume_id` text NOT NULL,
	`board_id` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	PRIMARY KEY(`resume_id`, `board_id`)
);
--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`changes` text DEFAULT '' NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`file_path` text,
	`file_name` text DEFAULT '' NOT NULL,
	`mime` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `events` ADD `remind2_minutes` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `reminded2_for` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `source_type` text;--> statement-breakpoint
ALTER TABLE `events` ADD `source_id` text;