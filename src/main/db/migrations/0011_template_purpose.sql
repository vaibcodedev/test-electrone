-- «Для чого» a message template is: freelance / jobs / any. Added, never recreated (CLAUDE.md → migrations).
ALTER TABLE `message_templates` ADD `purpose` text DEFAULT 'any' NOT NULL;
--> statement-breakpoint
-- The templates that existed before the field get it from their situation (SITUATION_PURPOSE in
-- shared/domain/freelance.ts). Part of this migration, so it runs exactly once per database (the migrator records
-- it), before anyone could choose a value — a purpose the person sets later is never touched again. A backup from
-- before the field, restored later, gets the same once-only fill when it is opened.
UPDATE `message_templates` SET `purpose` = CASE
  WHEN `situation` IN ('cover_letter', 'recruiter', 'thank_you') THEN 'jobs'
  WHEN `situation` IN ('proposal', 'estimate', 'tz_questions', 'revisions', 'small_talk', 'closing') THEN 'freelance'
  ELSE 'any'
END;
