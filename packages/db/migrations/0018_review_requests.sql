-- When an order was marked delivered; review requests go out 3 days later.
ALTER TABLE "order" ADD COLUMN delivered_at TEXT;

UPDATE "order" SET delivered_at = updated_at WHERE fulfillment_status = 'delivered';

-- SQLite cannot alter a CHECK constraint, so the table is rebuilt.
CREATE TABLE order_notification_new (
  order_id TEXT NOT NULL REFERENCES "order" (id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('order_placed', 'order_completed', 'review_request')),
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (order_id, event)
);

INSERT INTO order_notification_new (order_id, event, status, updated_at)
  SELECT order_id, event, status, updated_at FROM order_notification;

-- Orders delivered before this migration must not suddenly be emailed.
INSERT OR IGNORE INTO order_notification_new (order_id, event, status)
  SELECT id, 'review_request', 'sent' FROM "order" WHERE fulfillment_status = 'delivered';

DROP TABLE order_notification;
ALTER TABLE order_notification_new RENAME TO order_notification;
