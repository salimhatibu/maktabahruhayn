-- Automatic promotions apply to every cart that qualifies, with no code to
-- enter. They still carry an internal code so orders can record which
-- promotion was used.
ALTER TABLE promotion ADD COLUMN automatic INTEGER NOT NULL DEFAULT 0;

-- Shippo is gone: drop the delivery methods that depended on it.
DELETE FROM shipping_option WHERE provider = 'shippo';
