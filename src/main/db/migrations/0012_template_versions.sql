-- Text versions of a message template (translations, a short variant). Added, never recreated: `body` stays the
-- first version, `body_name` names it ('' — «Основна»), `versions` holds the rest as JSON [{name, body}]. One row
-- per template keeps trash, restore, «Скасувати», export and backups working on it without a child table.
ALTER TABLE `message_templates` ADD `body_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_templates` ADD `versions` text DEFAULT '[]' NOT NULL;
