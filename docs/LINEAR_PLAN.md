# GraphAtlas — Linear Project & Ticket Plan

Source of truth for creating the Linear project, milestones, and issues. One ticket = one PR
(per `ticket-gated-git-flow` conventions).

## Project config

- **Project**: GraphAtlas — Multi-Engine GraphRAG Enterprise Knowledge Platform
- **Linear team**: ZHA — reuse the existing team; the team id is stored in the local-only
  execution plan (`PLAN.local.md`) and confirmed at creation time.
- **Repo**: `git@github.com:zt5rice/graphatlas.git`
- **Default branch**: `main`

## Conventions (ticket-gated git flow)

- One PR per ticket; a ticket is marked **Done** only after its PR is approved/merged/closed.
- Branch: `feat/<issue编号>-<kebab-slug>` (e.g. `feat/ZHA-42-db-migrations`); use `fix/` for
  bugs, `docs/` for docs.
- Commit & PR title prefix: `<ISSUE>: type(scope): description` (e.g. `ZHA-42: feat(db): add runtime migrations`).
- Status lifecycle: Todo → In Progress → (PR) → Done; abandoned → Canceled.
- Verification gate before Done: `bun test`, `bun run typecheck`, `npm run build` (frontend),
  integration/e2e per ticket.

## Milestones & Tickets

### Milestone 1 — Day 1: Scaffold, DB schema, corpus & eval draft

| # | Ticket | PR content | Branch slug | Acceptance / gate |
|---|---|---|---|---|
| GA-01 | Scaffold monorepo & dev environment | Bun workspaces (`apps/api`, `apps/web`, `packages/*`), Vite+Tailwind app, docker-compose (postgres:17 + pgvector), `.env.example`, `.gitignore`, `AGENTS.md`, README skeleton, `scripts/setup.sh` | `repo-scaffold` | `bun install`, `docker compose up -d`, `bun run dev:all` starts API+web |
| GA-02 | Runtime DB migrations & connection layer | schema `graphatlas`: `documents`, `chunks` (tsvector generated + embedding), `entities`, `relations`, `jobs`, `facts`, `eval_runs`; HNSW + GIN indexes; migration runner in `packages/db` | `db-migrations` | `bun run db:init` clean on fresh PG; tables/indexes verified |
| GA-03 | Documents & jobs API skeleton | `POST /documents` (multipart md/txt/csv), list/detail, `POST /documents/:id/ingest` → job, `GET /jobs/:id`, stub pipeline | `documents-jobs-api` | curl upload returns job; integration test |
| GA-04 | English corpus (10–15 org docs) | `data/corpus/`: org chart, teams, projects, customers, runbooks (md/txt/csv) | `corpus` | files parse; consistent front matter |
| GA-05 | Golden question set draft (50) | `data/eval/golden_questions.json`: 15 single-hop, 15 multi-hop, 10 global, 10 hard | `golden-questions` | JSON schema test passes; category balance |
| GA-06 | CI pipeline (GitHub Actions) | lint + typecheck + `bun test` + frontend build on PR | `ci-pipeline` | PR CI green |

### Milestone 2 — Day 2: Extraction pipeline (LightRAG staging + ETL)

| # | Ticket | PR content | Branch slug | Acceptance / gate |
|---|---|---|---|---|
| GA-07 | Python extractor package (lightrag-hku) | `extractor/` (uv + Python 3.11), pinned `lightrag-hku==1.5.0`, env config, per-doc `ainsert` staging, staging cleanup, CLI | `extractor-lightrag` | CLI ingests a fixture doc into staging; entity/relation counts logged |
| GA-08 | ETL staging → runtime schema | copy chunks/entities/relations; embeddings (same model); tsvector backfill; `source_chunk_ids` mapping; idempotent rerun | `etl-runtime` | integration test: counts + 1:1 chunk-id alignment |
| GA-09 | Ingest worker orchestration (Bun) | job lifecycle `uploaded→processing→ready/failed`, stage timings, error capture, spawn extractor | `ingest-worker` | 3 fixture docs via API → jobs `ready`; timings recorded |
| GA-10 | Ingestion integration tests & fixtures | fixtures + tests for GA-07/08/09; corpus + golden set finalized | `ingest-tests` | `bun test integration` green |

### Milestone 3 — Day 3: Multi-engine retrieval + /search + benchmark runner

| # | Ticket | PR content | Branch slug | Acceptance / gate |
|---|---|---|---|---|
| GA-11 | Keyword recall path | `tsvector('simple')` + `plainto_tsquery` + `ts_rank`; ILIKE literal (phrase + compact); optional `pg_trgm` | `keyword-recall` | unit tests; ranked chunks returned |
| GA-12 | Vector recall path | embed query; cosine (`<=>`) on chunks/entities/relations; HNSW; model/dim guard | `vector-recall` | integration test returns expected top entities |
| GA-13 | Graph recall path | seed entities (query mention + vector hits); cycle-safe BFS (MAX_HOP=2); edges/entities/chunks | `graph-recall` | unit tests (cycles/depth); multi-hop integration test |
| GA-14 | RRF fusion + diagnostics + mode router | RRF `K=60`, `rank_details`, `match_types`, normalized scores, per-path diagnostics; local/global/mix router (rule → LLM → mix) | `rrf-mode-router` | unit tests (RRF math, router rules) green |
| GA-15 | `/search` endpoint & tests | request/response contracts, filters (`source_id`, `top_k`), serializers, errors | `search-endpoint` | curl returns evidence + diagnostics; integration tests green |
| GA-16 | Benchmark runner v1 | `benchmark/run.ts`: modes, 50-Q loader, metrics (recall/hit/faithfulness/latency/cost), JSON results, `--summary` | `benchmark-runner` | smoke run on 5 Qs; JSON valid |

### Milestone 4 — Day 4: Agent + frontend + e2e

| # | Ticket | PR content | Branch slug | Acceptance / gate |
|---|---|---|---|---|
| GA-17 | Agent tool loop | tools `search_hybrid` / `graph_neighbors` / `get_document` / `lookup_entity`; OpenAI-compatible tool calls; max 4 iterations; citation requirement; trace | `agent-loop` | unit tests with mocked LLM; trace captured |
| GA-18 | `/chat` SSE streaming endpoint | events `session/tool_call/evidence/delta/done`, error events, `history` param | `chat-sse` | e2e sees full event sequence |
| GA-19 | Frontend scaffold & API client | Vite+Tailwind+React Flow; routes (Upload/Jobs, Graph, Chat, Eval); typed API client; dark theme | `frontend-scaffold` | `npm run build` green; pages render |
| GA-20 | Graph Explorer (React Flow) | fetch nodes/edges, 1-hop expand, type colors, weight layering, search box | `graph-explorer` | manual QA + component test |
| GA-21 | QA chat UI | streaming chat, evidence cards (cited chunks), tool trace timeline | `qa-chat-ui` | manual QA + component test |
| GA-22 | E2E tests (Playwright) | scenarios A upload→ingest→graph, B chat→citation, C eval smoke; `scripts/e2e.sh` | `e2e-tests` | `bun run e2e` green |

### Milestone 5 — Day 5: Benchmark, docs, release

| # | Ticket | PR content | Branch slug | Acceptance / gate |
|---|---|---|---|---|
| GA-23 | Benchmark full run + measured results | 4 modes × 50 Qs; LLM-as-judge; results JSON in `benchmark/results/`; `docs/BENCHMARK.md` table | `benchmark-run` | all results JSON committed; numbers trace to JSON (no fabrication) |
| GA-24 | README & docs polish | README (mermaid arch, quick start, tech→code map, demo video slot, measured results), `docs/API.md`, `docs/SOURCES.md` (provenance), LICENSE | `docs-polish` | reviewer can reproduce from README |
| GA-25 | Demo video + v1.0 release | 5–8 min demo (upload → graph → QA → eval), link in README, tag `v1.0`, GitHub release | `demo-release` | video link live; tag pushed; release created |

## Creation notes

- Create the project, then milestones 1–5 (labels "Day 1"…"Day 5"), then issues in order,
  associating each issue with its milestone.
- Issue keys (GA-XX) are placeholders; Linear will assign real numbers (e.g. `ZHA-42`), which
  replace `GA-XX` in branch/commit/PR prefixes.
- After Linear creation, mirror any edits back into this file so the repo stays the source of truth.

## Created identifiers (2026-08-20)

- Project: `e376b45b-b619-48c2-80fc-486946a57261` (GraphAtlas — Multi-Engine GraphRAG Enterprise Knowledge Platform)
- Team: ZHA (`f8e0f74b-c3f5-443c-ae81-c15fa9297623`)

| GA-XX | Linear identifier | GA-XX | Linear identifier |
|---|---|---|---|
| GA-01 | ZHA-55 | GA-14 | ZHA-68 |
| GA-02 | ZHA-56 | GA-15 | ZHA-69 |
| GA-03 | ZHA-57 | GA-16 | ZHA-70 |
| GA-04 | ZHA-58 | GA-17 | ZHA-71 |
| GA-05 | ZHA-59 | GA-18 | ZHA-72 |
| GA-06 | ZHA-60 | GA-19 | ZHA-73 |
| GA-07 | ZHA-61 | GA-20 | ZHA-74 |
| GA-08 | ZHA-62 | GA-21 | ZHA-75 |
| GA-09 | ZHA-63 | GA-22 | ZHA-76 |
| GA-10 | ZHA-64 | GA-23 | ZHA-77 |
| GA-11 | ZHA-65 | GA-24 | ZHA-78 |
| GA-12 | ZHA-66 | GA-25 | ZHA-79 |
| GA-13 | ZHA-67 | | |
