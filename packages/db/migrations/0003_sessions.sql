-- Customer sessions.
--
-- A session is a random opaque token stored here rather than a signed cookie,
-- so signing out genuinely ends it and an expiry can be enforced server side.
-- Only the hash is stored: a leaked copy of this table cannot be replayed as
-- a login.
CREATE TABLE customer_session (
  token_hash  TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX customer_session_customer_idx ON customer_session (customer_id);
CREATE INDEX customer_session_expiry_idx ON customer_session (expires_at);
