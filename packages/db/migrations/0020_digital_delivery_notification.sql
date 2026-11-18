CREATE TABLE order_notification_new (
  order_id TEXT NOT NULL REFERENCES "order" (id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('order_placed', 'order_completed', 'review_request', 'digital_delivery')),
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (order_id, event)
);

INSERT INTO order_notification_new (order_id, event, status, updated_at)
  SELECT order_id, event, status, updated_at FROM order_notification;

DROP TABLE order_notification;
ALTER TABLE order_notification_new RENAME TO order_notification;
