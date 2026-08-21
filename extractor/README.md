# orgrag-extract — GraphAtlas graph extraction sidecar

Python 3.11 + `lightrag-hku==1.5.0` sidecar that turns a raw document into a
LightRAG **staging workspace** (LLM entity/relation extraction, gleaning, cross-chunk
merge, chunk/entity/relation embeddings in pgvector). The runtime ETL (ZHA-62) copies
staging products into the `graphatlas` runtime schema.

## Usage

```bash
uv sync                 # create venv + install pinned deps
uv run orgrag-extract ingest data/corpus/01-org-chart.md --workspace staging_<doc_id>
uv run orgrag-extract cleanup --workspace staging_<doc_id>   # drop staging data (after ETL)
```

Configuration is read from the repo root `.env` (same variables as the API):
`DATABASE_URL`, `AGENT_*`, `EMBEDDING_*`, `LIGHTRAG_WORKING_DIR`,
`CHUNK_TOKEN_SIZE`, `CHUNK_OVERLAP_TOKEN_SIZE`.

## Design notes

- `ainsert` runs the full graph-build chain: chunking -> LLM extraction -> gleaning ->
  cross-chunk merge -> write to PG storage (pgvector), all inside the staging workspace.
- The extractor performs **no retrieval** — it only builds graph products. Retrieval is
  implemented in TypeScript (`packages/core`, Day 3).
- Language is pinned to **English** in extraction prompts (corpus is English).
