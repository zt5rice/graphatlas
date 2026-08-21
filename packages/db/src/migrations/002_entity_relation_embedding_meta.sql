-- 002_entity_relation_embedding_meta.sql
-- Track the embedding model/dimension on entities and relations so vector
-- recall can guard against cross-model similarity comparisons.

ALTER TABLE graphatlas.entities
  ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS embedding_dim integer NOT NULL DEFAULT 0;

ALTER TABLE graphatlas.relations
  ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS embedding_dim integer NOT NULL DEFAULT 0;
