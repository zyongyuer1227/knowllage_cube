ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS business_path JSONB,
  ADD COLUMN IF NOT EXISTS legal_path JSONB;

UPDATE documents
SET business_path = to_jsonb(ARRAY_REMOVE(ARRAY[business_domain, business_subdomain], NULL))
WHERE business_path IS NULL
  AND (business_domain IS NOT NULL OR business_subdomain IS NOT NULL);

UPDATE documents
SET legal_path = to_jsonb(ARRAY_REMOVE(ARRAY[legal_level], NULL))
WHERE legal_path IS NULL
  AND legal_level IS NOT NULL;
