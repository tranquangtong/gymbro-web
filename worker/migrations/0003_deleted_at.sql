-- When a record became soft-deleted (epoch ms, set by the Worker, never by the client).
-- The daily cron removes rows deleted more than 60 days ago.
ALTER TABLE records ADD COLUMN deleted_at INTEGER;
-- Rows already deleted before this migration start their 60 days now.
UPDATE records SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE deleted = 1;
CREATE INDEX IF NOT EXISTS records_by_deleted_at ON records (deleted_at) WHERE deleted_at IS NOT NULL;
