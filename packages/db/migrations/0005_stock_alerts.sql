-- Back-in-stock notification requests.
CREATE TABLE stock_alert (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES variant (id) ON DELETE CASCADE,
  email      TEXT NOT NULL COLLATE NOCASE,
  status     TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notified_at TEXT
);
CREATE INDEX stock_alert_product_idx ON stock_alert (product_id, status);
CREATE UNIQUE INDEX stock_alert_unique_idx ON stock_alert (product_id, variant_id, email) WHERE status = 'waiting';
