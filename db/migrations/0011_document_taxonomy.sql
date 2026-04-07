ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS business_domain VARCHAR(100),
  ADD COLUMN IF NOT EXISTS business_subdomain VARCHAR(100),
  ADD COLUMN IF NOT EXISTS legal_level VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_documents_business_domain ON documents(business_domain);
CREATE INDEX IF NOT EXISTS idx_documents_legal_level ON documents(legal_level);
