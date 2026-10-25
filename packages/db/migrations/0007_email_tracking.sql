-- Track the provider's message ID so we can query delivery status.
ALTER TABLE email_log ADD COLUMN provider_id TEXT;

-- Widen the allowed statuses beyond sent/failed to match Resend events.
-- SQLite cannot ALTER a CHECK constraint, so we drop and recreate:
CREATE TABLE email_log_new (
  id          TEXT PRIMARY KEY,
  template    TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  subject     TEXT,
  status      TEXT NOT NULL DEFAULT 'sent'
              CHECK (status IN ('sent','delivered','opened','clicked','bounced','complained','failed')),
  error       TEXT,
  provider_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO email_log_new (id, template, recipient, subject, status, error, created_at)
  SELECT id, template, recipient, subject, status, error, created_at FROM email_log;
DROP TABLE email_log;
ALTER TABLE email_log_new RENAME TO email_log;
CREATE INDEX email_log_created_idx ON email_log (created_at DESC);

-- Newsletter subscribers need a status column (subscribed / unsubscribed).
ALTER TABLE newsletter_subscriber ADD COLUMN status TEXT NOT NULL DEFAULT 'subscribed';
