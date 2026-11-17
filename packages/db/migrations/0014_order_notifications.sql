CREATE TABLE order_notification (
  order_id TEXT NOT NULL REFERENCES "order" (id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('order_placed', 'order_completed')),
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (order_id, event)
);

CREATE TABLE order_display_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_display_id INTEGER NOT NULL
);

INSERT INTO order_display_sequence (id, last_display_id)
SELECT 1, COALESCE(MAX(display_id), 999) FROM "order";

CREATE TRIGGER order_display_sequence_insert AFTER INSERT ON "order"
BEGIN
  UPDATE order_display_sequence SET last_display_id = MAX(last_display_id, NEW.display_id) WHERE id = 1;
END;
