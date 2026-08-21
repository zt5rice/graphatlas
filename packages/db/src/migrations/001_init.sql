-- 001_init.sql — GraphAtlas runtime schema
-- Token __EMBEDDING_DIM__ is replaced with EMBEDDING_DIMENSIONS at apply time.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS graphatlas;

CREATE TABLE graphatlas.documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('md', 'txt', 'csv')),
  status      text NOT NULL DEFAULT 'uploaded'
              CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
  file_type   text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE graphatlas.chunks (
  id              text PRIMARY KEY,
  document_id     uuid NOT NULL REFERENCES graphatlas.documents(id) ON DELETE CASCADE,
  chunk_index     integer NOT NULL,
  text            text NOT NULL,
  text_search     tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
  embedding       vector(__EMBEDDING_DIM__),
  embedding_model text NOT NULL,
  embedding_dim   integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE graphatlas.entities (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  entity_type      text NOT NULL DEFAULT 'UNKNOWN',
  description      text NOT NULL DEFAULT '',
  source_chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding        vector(__EMBEDDING_DIM__),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE graphatlas.relations (
  id               text PRIMARY KEY,
  src_id           text NOT NULL REFERENCES graphatlas.entities(id) ON DELETE CASCADE,
  tgt_id           text NOT NULL REFERENCES graphatlas.entities(id) ON DELETE CASCADE,
  keywords         text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  weight           double precision NOT NULL DEFAULT 1.0,
  source_chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding        vector(__EMBEDDING_DIM__),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src_id, tgt_id)
);

CREATE TABLE graphatlas.jobs (
  id          text PRIMARY KEY,
  document_id uuid REFERENCES graphatlas.documents(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  stage       text NOT NULL DEFAULT 'queued',
  error       jsonb,
  timings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE graphatlas.facts (
  id              text PRIMARY KEY,
  content         text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  source_chunk_id text REFERENCES graphatlas.chunks(id) ON DELETE SET NULL,
  submitted_by    text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE graphatlas.eval_runs (
  id           text PRIMARY KEY,
  mode         text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  metrics      jsonb,
  per_question jsonb
);

-- keyword + vector indexes
CREATE INDEX idx_chunks_document          ON graphatlas.chunks (document_id, chunk_index);
CREATE INDEX idx_chunks_text_search       ON graphatlas.chunks USING GIN (text_search);
CREATE INDEX idx_chunks_text_trgm         ON graphatlas.chunks USING GIN (text gin_trgm_ops);
CREATE INDEX idx_chunks_embedding_hnsw    ON graphatlas.chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_entities_name            ON graphatlas.entities (name);
CREATE INDEX idx_entities_embedding_hnsw  ON graphatlas.entities USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_relations_src            ON graphatlas.relations (src_id);
CREATE INDEX idx_relations_tgt            ON graphatlas.relations (tgt_id);
CREATE INDEX idx_relations_embedding_hnsw ON graphatlas.relations USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_jobs_document            ON graphatlas.jobs (document_id);
CREATE INDEX idx_facts_status             ON graphatlas.facts (status);
