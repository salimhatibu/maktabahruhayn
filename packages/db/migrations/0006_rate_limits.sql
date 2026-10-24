-- Fixed-window counters for throttling sign-in, sign-up, promo codes, reviews
-- and other public forms. A row is one key in one window; old rows are pruned
-- as new ones are written.
CREATE TABLE rate_limit (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX rate_limit_window_idx ON rate_limit (window_start);
