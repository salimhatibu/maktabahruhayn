ALTER TABLE payment_request ADD COLUMN mpesa_review INTEGER NOT NULL DEFAULT 0;

CREATE TABLE mpesa_checkout (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES cart (id),
  phone TEXT NOT NULL,
  amount_minor INTEGER,
  checkout_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('starting', 'pending', 'confirmed', 'failed', 'review')),
  receipt TEXT,
  verified_by TEXT CHECK (verified_by IN ('callback')),
  review_reason TEXT CHECK (review_reason IN ('uncertain', 'callback_mismatch')),
  result_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX mpesa_checkout_one_active_cart_idx ON mpesa_checkout (cart_id)
  WHERE status IN ('starting', 'pending', 'confirmed', 'review');
CREATE UNIQUE INDEX mpesa_checkout_receipt_idx ON mpesa_checkout (receipt) WHERE receipt IS NOT NULL;

CREATE TRIGGER mpesa_checkout_block_card_start
BEFORE INSERT ON payment
WHEN NEW.provider = 'stripe' AND NEW.cart_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM mpesa_checkout m JOIN cart c ON c.id = m.cart_id
    WHERE m.cart_id = NEW.cart_id AND c.completed_order_id IS NULL
      AND m.status IN ('starting', 'pending', 'confirmed', 'review')
)
BEGIN
  SELECT RAISE(ABORT, 'M-Pesa payment is being processed');
END;

CREATE TRIGGER mpesa_checkout_cart_fields_lock
BEFORE UPDATE OF email, currency_code, country_code, shipping_address, billing_address,
  shipping_option_id, shipping_total, promotion_code, gift_note ON cart
WHEN EXISTS (
  SELECT 1 FROM mpesa_checkout WHERE cart_id = OLD.id
    AND status IN ('starting', 'pending', 'confirmed', 'review')
) AND OLD.completed_order_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'M-Pesa payment is being processed');
END;

CREATE TRIGGER mpesa_checkout_cart_item_insert_lock
BEFORE INSERT ON cart_item
WHEN EXISTS (
  SELECT 1 FROM mpesa_checkout m JOIN cart c ON c.id = m.cart_id
    WHERE m.cart_id = NEW.cart_id AND c.completed_order_id IS NULL
      AND m.status IN ('starting', 'pending', 'confirmed', 'review')
)
BEGIN
  SELECT RAISE(ABORT, 'M-Pesa payment is being processed');
END;

CREATE TRIGGER mpesa_checkout_cart_item_update_lock
BEFORE UPDATE ON cart_item
WHEN EXISTS (
  SELECT 1 FROM mpesa_checkout m JOIN cart c ON c.id = m.cart_id
    WHERE m.cart_id = OLD.cart_id AND c.completed_order_id IS NULL
      AND m.status IN ('starting', 'pending', 'confirmed', 'review')
)
BEGIN
  SELECT RAISE(ABORT, 'M-Pesa payment is being processed');
END;

CREATE TRIGGER mpesa_checkout_cart_item_delete_lock
BEFORE DELETE ON cart_item
WHEN EXISTS (
  SELECT 1 FROM mpesa_checkout m JOIN cart c ON c.id = m.cart_id
    WHERE m.cart_id = OLD.cart_id AND c.completed_order_id IS NULL
      AND m.status IN ('starting', 'pending', 'confirmed', 'review')
)
BEGIN
  SELECT RAISE(ABORT, 'M-Pesa payment is being processed');
END;
