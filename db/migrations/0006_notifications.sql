CREATE TABLE IF NOT EXISTS reminder_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL,
  reminder_days INTEGER NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'system',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reminder_days, channel)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rule_id BIGINT REFERENCES reminder_rules(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'system',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, rule_id, channel)
);

INSERT INTO reminder_rules (rule_name, reminder_days, channel, enabled)
VALUES
  ('Expiry reminder 7 days', 7, 'system', TRUE),
  ('Expiry reminder 15 days', 15, 'system', TRUE)
ON CONFLICT (reminder_days, channel) DO NOTHING;
