# Sources & Provenance

GraphAtlas is an original implementation, but several blueprints were validated
against the author's course materials (accessed locally) and public industry sources.
This file records where each idea/term came from so every technical claim is defensible.

## Blueprints confirmed in course materials

| Term / concept | Course material evidence |
|---|---|
| `lightrag-hku` (LightRAG) | Pinned as the graph extraction engine; public open-source library (HKUDS/LightRAG) |
| `pgvector` (PostgreSQL vector extension) | Vector storage layer with HNSW/cosine; public extension |
| Reciprocal Rank Fusion (RRF, K=60) | Three-path recall (lexical/literal/vector) fused with RRF and normalized scores |
| `tsvector` / `pg_trgm` keyword search | `to_tsvector('simple', ...)` generated column + GIN (`gin_trgm_ops`) in the reference Traditional-RAG module |
| Hono + Bun (TypeScript) API layer | Unified API/gateway runtimes in the reference platform |
| Apache AGE (optional) | Referenced as optional graph layer; **not required** in this project (graph traversal uses relational tables) |
| Benchmark methodology (cliff analysis, channel A/B) | Used as inspiration; this repo reports only its own measured numbers |

## Other sources

- **LightRAG** — https://github.com/HKUDS/LightRAG (public)
- **pgvector** — https://github.com/pgvector/pgvector (public)
- **Apache AGE** — https://age.apache.org/ (public)
- **Hono** — https://hono.dev/ (public)
- **React Flow** — https://reactflow.dev/ (public)
- **OpenAI function calling / tool use** — public documentation
- **LLM-as-judge evaluation** — established practice; prompts are in
  `benchmark/judge.ts`

## Honesty notes

- The corpus (`data/corpus/`) is fully fictional (Aurora Dynamics) — no real people
  or companies.
- Every benchmark number traces to `benchmark/results/*.json`.
- Terms like `tsvector`/`pg_trgm`/Hono/Bun were independently verified to exist in
  the course materials before use (see PLAN.md §2.2).
