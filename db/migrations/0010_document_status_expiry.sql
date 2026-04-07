-- Adds status and expiry_date (previously added by missing 0009_minimal_document_columns.sql)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'effective',
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Repairs void_reason and void_at which were declared in 0003_document_void_fields.sql
-- but never actually applied to the database
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS void_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS void_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON documents(expiry_date);
