CREATE TABLE IF NOT EXISTS document_conversion_tasks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message VARCHAR(500),
  source_filename VARCHAR(500) NOT NULL,
  source_ext VARCHAR(20) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_conversion_tasks_status ON document_conversion_tasks(status);
CREATE INDEX IF NOT EXISTS idx_doc_conversion_tasks_doc_id ON document_conversion_tasks(document_id);
