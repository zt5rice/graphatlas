# Sources & Provenance

GraphAtlas is an original implementation. Its architecture was informed by a
published reference architecture for enterprise multi-RAG platforms, which I
studied before building. This file records where each idea or term came from so
that every technical claim in this repository is defensible.

---

## Architectural influences

| Term / concept | Where it came from |
|---|---|
| LightRAG (`lightrag-hku`) as graph extraction engine | Public open-source library (HKUDS/LightRAG); the pattern also appears in enterprise multi-RAG reference designs |
| `pgvector` (HNSW / cosine) | Public PostgreSQL extension |
| Reciprocal Rank Fusion (RRF, K=60) | Established IR technique; also used in enterprise multi-RAG reference designs |
| `tsvector` / `pg_trgm` keyword search | Standard PostgreSQL full-text search; pattern appears in reference designs |
| Hono + Bun API layer | Public frameworks (hono.dev) |
| Apache AGE | Considered and **not used** — graph traversal here uses relational tables |
| Benchmark methodology (LLM-as-judge, Hit@k, faithfulness) | Established practice; my prompts live in `benchmark/judge.ts` |
| React Flow graph explorer | Public library (reactflow.dev) |

---

## What is my own work

Everything below was designed and implemented by me:

| Area | Contents |
|---|---|
| `packages/core` | Retrieval fusion (keyword/vector/graph + RRF), mode router, per-path diagnostics |
| `apps/api` | Typed Hono/TypeScript API, SSE streaming, ingestion + job endpoints |
| `apps/web` | Graph explorer, QA chat UI, evidence panels, tool-trace timeline |
| `extractor/` | Python ingestion pipeline (chunk, entity/relation extraction, ETL into runtime schema) |
| `benchmark/` | Evaluation runner, golden set harness, LLM-judge |
| `tests/` | Unit, integration, and Playwright E2E scenarios |

Work was planned and tracked ticket-by-ticket in Linear and shipped through
27 pull requests (one PR per ticket).

---

## Other public sources

- **LightRAG** — https://github.com/HKUDS/LightRAG
- **pgvector** — https://github.com/pgvector/pgvector
- **Apache AGE** — https://age.apache.org/
- **Hono** — https://hono.dev/
- **React Flow** — https://reactflow.dev/
- **OpenAI function calling / tool use** — public documentation

---

## Honesty notes

- The corpus (`data/corpus/`) is **fully fictional** (Aurora Dynamics) — no real
  people or companies.
- **Every benchmark number** in the README traces to `benchmark/results/*.json`.
- No figures are pre-set, estimated, or copied from any reference material.
