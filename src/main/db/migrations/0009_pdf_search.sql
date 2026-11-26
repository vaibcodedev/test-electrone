-- Text of attached PDFs for global search (AttachmentTextStore, src/main/services/attachment-text.ts).
-- Derived data (read again from the files), so not modelled in the drizzle schema and not in the JSON export.
-- A row per processed file, whatever the outcome: `status` ok / empty (no text layer — a scan) / encrypted /
-- too-large / failed; `text` only for ok. Files without a row are still waiting (picked up at every start).
-- `id` is the stable rowid the FTS index below points at (an implicit rowid may change on VACUUM).
CREATE TABLE `attachment_texts` (
  `id` integer PRIMARY KEY NOT NULL,
  `attachment_id` text NOT NULL UNIQUE REFERENCES `attachments`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL,
  `text` text DEFAULT '' NOT NULL,
  `extracted_at` integer NOT NULL
);
--> statement-breakpoint
-- Full-text index of that text, one document per file. External content: the text is stored once (above), the
-- index holds only tokens, and snippets are never asked of it (SearchIndex cuts them in JS). Separate from
-- `search_index`, so saving a record never re-tokenizes its PDFs and the chat ШІ never searches them.
CREATE VIRTUAL TABLE `file_index` USING fts5(
  `text`,
  content = 'attachment_texts',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
--> statement-breakpoint
-- Kept in sync by triggers: they also fire for the ON DELETE CASCADE from `attachments` (a removed file, a purged
-- record), so no code path can leave a removed file searchable.
CREATE TRIGGER `attachment_texts_ai` AFTER INSERT ON `attachment_texts` BEGIN
  INSERT INTO `file_index` (rowid, `text`) VALUES (new.`id`, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `attachment_texts_ad` AFTER DELETE ON `attachment_texts` BEGIN
  INSERT INTO `file_index` (`file_index`, rowid, `text`) VALUES ('delete', old.`id`, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `attachment_texts_au` AFTER UPDATE ON `attachment_texts` BEGIN
  INSERT INTO `file_index` (`file_index`, rowid, `text`) VALUES ('delete', old.`id`, old.`text`);
  INSERT INTO `file_index` (rowid, `text`) VALUES (new.`id`, new.`text`);
END;
