ALTER TABLE IF EXISTS documents DROP CONSTRAINT IF EXISTS documents_created_by_fkey;
ALTER TABLE IF EXISTS documents DROP CONSTRAINT IF EXISTS documents_updated_by_fkey;
ALTER TABLE IF EXISTS document_versions DROP CONSTRAINT IF EXISTS document_versions_changed_by_fkey;
ALTER TABLE IF EXISTS operation_logs DROP CONSTRAINT IF EXISTS operation_logs_operator_id_fkey;
ALTER TABLE IF EXISTS recycle_bin DROP CONSTRAINT IF EXISTS recycle_bin_deleted_by_fkey;

DROP INDEX IF EXISTS idx_operation_logs_operator_time;
CREATE INDEX IF NOT EXISTS idx_operation_logs_operator_time ON operation_logs(operator_id, created_at DESC);

DROP TABLE IF EXISTS users;
