CREATE TABLE cart_reminder (
  cart_id TEXT PRIMARY KEY REFERENCES cart (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
