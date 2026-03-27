CREATE TABLE IF NOT EXISTS document_folders (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  full_path VARCHAR(500) NOT NULL UNIQUE,
  parent_path VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_folders_parent_path ON document_folders(parent_path);
