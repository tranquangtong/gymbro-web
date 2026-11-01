-- Meal photos, kept 7 days so every signed-in device can see them.
-- data_url is the compressed JPEG (≤ 360,000 characters, see media.js PHOTO_LIMIT).
-- A daily cron (wrangler.toml [triggers]) deletes rows past expires_at; reads also refuse them.
CREATE TABLE IF NOT EXISTS photos (
  owner_uid  TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  meal_id    TEXT    NOT NULL,
  data_url   TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,   -- epoch milliseconds
  PRIMARY KEY (owner_uid, id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS photos_by_expiry ON photos (expires_at);
