-- 003_document_kinds.sql — accept PDF / DOCX / XML / JSON uploads.
--
-- The parser normalizes every format to markdown before staging, so the downstream
-- schema (chunks / entities / relations) is unchanged; only the accept-list widens.
-- Widening a CHECK constraint is a table rewrite in older Postgres, so keep this
-- migration additive and never shrink the list in place.

ALTER TABLE graphatlas.documents
  DROP CONSTRAINT IF EXISTS documents_kind_check;

ALTER TABLE graphatlas.documents
  ADD CONSTRAINT documents_kind_check
  CHECK (kind IN ('md', 'txt', 'csv', 'pdf', 'docx', 'xml', 'json'));
