ALTER TABLE `credentials` ADD `kind` text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `secrets` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `own_expense` integer DEFAULT true NOT NULL;