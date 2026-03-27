ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS metadata_snapshot JSONB;
