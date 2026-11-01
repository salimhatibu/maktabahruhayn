-- Who is on the site right now. One row per browser, refreshed by a heartbeat
-- and swept once it goes stale, so the count is of live visitors rather than
-- a running total.
CREATE TABLE IF NOT EXISTS presence (
  token     TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS presence_last_seen_idx ON presence (last_seen);
