-- How many times a PDF has been read (AttachmentTextStore): a `failed` one (a timeout, a read error) is tried again
-- at the next starts, up to a limit. Rows from before get 1, so they are retried too.
ALTER TABLE `attachment_texts` ADD COLUMN `attempts` integer DEFAULT 1 NOT NULL;
