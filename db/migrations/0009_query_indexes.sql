CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_archive_path ON documents(archive_path);

CREATE INDEX IF NOT EXISTS idx_document_contents_doc_created_at
  ON document_contents(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc_version_no
  ON document_versions(document_id, version_no DESC);

CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operation_time
  ON operation_logs(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_target_time
  ON operation_logs(target_type, target_id, created_at DESC);
