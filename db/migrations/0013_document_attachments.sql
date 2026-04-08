ALTER TABLE documents
ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE documents
SET attachments = '[]'::jsonb
WHERE attachments IS NULL;
