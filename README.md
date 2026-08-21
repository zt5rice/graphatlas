# GraphAtlas — Multi-Engine GraphRAG Enterprise Knowledge Platform

> Status: Day 1 in progress (scaffold). Detailed plan: [PLAN.md](./PLAN.md) ·
> [中文版](./PLAN-cn.md) · Linear ticket plan: [docs/LINEAR_PLAN.md](./docs/LINEAR_PLAN.md)

GraphAtlas ingests organizational documents (org chart, teams, projects, customers,
runbooks), builds a knowledge graph via LLM entity/relation extraction, and answers
questions through a hand-written multi-engine retriever that fuses keyword
(PostgreSQL tsvector/trigram), dense vector (pgvector), and graph traversal with
Reciprocal Rank Fusion — behind a typed Hono/TypeScript API and a React graph explorer.

## Architecture

```mermaid
flowchart LR
  UI[React + React Flow frontend] <-->|REST + SSE| API[Hono / Bun API + Agent]
  API --> RET[packages/core: multi-engine retriever]
  RET --> PG[(PostgreSQL 17 + pgvector)]
  RET --> KW[keyword: tsvector / ILIKE]
  RET --> VEC[vector: pgvector cosine + HNSW]
  RET --> GRA[graph: BFS over entities/relations]
  RET --> RRF[RRF k=60 fusion + diagnostics]
  API -.spawns job.-> EXT[Python extractor: lightrag-hku]
  EXT -.ETL.-> PG
  BENCH[benchmark: 50-question golden set] --> API
  BENCH --> RES[benchmark/results/*.json]
```

## Quick start (Day 1 scaffold)

```bash
bun install
cp .env.example .env
# DB: `docker compose up -d` OR use local Homebrew postgresql@17 + pgvector
bun run dev:all
```

Open http://localhost:3000 (web) and http://localhost:3001/health (API).

## Monorepo layout

```txt
apps/api/        Hono + Bun API (documents, jobs, search, chat, graph, eval)
apps/web/        React + Vite + Tailwind frontend
packages/core/   retrieval primitives: keyword/vector/graph recall, RRF, mode router, BFS
packages/db/     PostgreSQL + pgvector migrations and query builders
packages/contracts/ shared types
extractor/       Python 3.11 + lightrag-hku graph extraction (Day 2)
data/            corpus + 50-question golden set (Day 1)
benchmark/       evaluation runner (Day 3)
```

## Honesty policy

Every number in this README (performance, accuracy) is measured by this repo's own
benchmark scripts and traced to `benchmark/results/*.json`. No preset figures.
