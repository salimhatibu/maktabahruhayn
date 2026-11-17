CREATE UNIQUE INDEX payment_one_pending_manual_per_cart_idx
  ON payment (cart_id)
  WHERE provider = 'manual' AND status = 'pending' AND order_id IS NULL AND cart_id IS NOT NULL;
