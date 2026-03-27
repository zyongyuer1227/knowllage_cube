CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  archive_path VARCHAR(500),
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_contents (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  raw_text TEXT,
  markdown_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  markdown_content TEXT NOT NULL,
  change_note VARCHAR(500),
  changed_by BIGINT,
  metadata_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, version_no)
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGSERIAL PRIMARY KEY,
  operator_id BIGINT,
  operation VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_operator_time ON operation_logs(operator_id, created_at DESC);
