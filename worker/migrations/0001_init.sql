-- GymBro D1 schema. One table holds every log type; the body is the cleaned
-- record JSON exactly as the web app sends it. Indexed columns are copies of
-- the body fields we query by.

CREATE TABLE IF NOT EXISTS records (
  owner_uid  TEXT    NOT NULL,
  kind       TEXT    NOT NULL,              -- WebMeals | WebWorkouts | WebProfile | Archive | FoodLibrary
  id         TEXT    NOT NULL,
  date       TEXT    NOT NULL DEFAULT '',   -- YYYY-MM-DD, '' for FoodLibrary
  updated_at TEXT    NOT NULL DEFAULT '',   -- revision used for optimistic concurrency
  deleted    INTEGER NOT NULL DEFAULT 0,    -- soft delete only; rows are never removed
  body       TEXT    NOT NULL,
  seq        INTEGER NOT NULL,              -- change sequence for incremental sync
  PRIMARY KEY (owner_uid, kind, id)
) WITHOUT ROWID;

-- Day / date-range queries with stable keyset pagination.
CREATE INDEX IF NOT EXISTS records_by_date ON records (owner_uid, kind, date, id);
-- "What changed since N" for polling sync.
CREATE INDEX IF NOT EXISTS records_by_seq ON records (owner_uid, seq);

CREATE TABLE IF NOT EXISTS users (
  uid          TEXT PRIMARY KEY,
  email        TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT ''
);

-- Monotonic change counter; bumped once per write batch inside the batch transaction.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('seq', 0);

-- A write batch inserts 1 here per expected revision; CHECK(ok = 1) aborts the
-- whole batch (D1 batches are transactions) when a revision does not match.
CREATE TABLE IF NOT EXISTS revision_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
