# GraphAtlas API

Base: `http://localhost:3001/api/v1` (dev). Write/admin routes accept
`Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set (dev defaults to open).

## Health

`GET /health` → `{ status, service, db, time }`

## Documents

- `POST /documents` — multipart `file` (+ optional `title`); md/txt/csv only.
  → `201 DocumentRecord`
- `GET /documents` — list (newest first) → `DocumentRecord[]`
- `GET /documents/:id` — detail → `DocumentRecord` | `404`
- `POST /documents/:id/ingest` — async pipeline (extract → ETL) → `202 { job_id }`

`DocumentRecord`: `{ id, title, kind, status, fileType, metadata, createdAt, updatedAt }`

## Jobs

- `GET /jobs/:id` → `{ id, documentId, status, stage, error, timings, createdAt, updatedAt }`
  - status: `queued | running | ready | failed`; stage: `extracting | etl | done | failed`
  - `timings`: `{ extraction_ms, etl_ms, total_ms }`

## Search

`POST /search` — body:

```json
{ "query": "...", "mode": "local|global|mix", "top_k": 10, "min_score": 0, "document_ids": [] }
```

→ `{ query, mode, mode_source, results[], evidence, diagnostics[], fusion }`

- `results[]`: `{ chunk_id, document_id, snippet, text, score, match_types, rank_details[] }`
- `evidence`: `{ entities[], relations[] }`; `diagnostics[]`: per-path `ok|skipped|failed`
- Validation: `query` required (≤2000 chars), `top_k` 1–30, `min_score` 0–1.

## Chat (SSE)

`POST /chat` — body `{ query, history? }` → `text/event-stream`:

```text
event: session    data: { "session_id": "..." }
event: tool_call  data: { "step", "tool", "input" }
event: evidence   data: { "tool", "output" }
event: delta      data: { "text" }        # streamed answer tokens
event: done       data: { "answer", "trace", "tool_calls" }
event: error      data: { "message" }
```

## Graph

- `GET /graph?entity=<name>&depth=1|2` — 1-hop neighborhood → `{ entity, depth, nodes[], edges[] }`
- `GET /graph` — overview graph (all entities/relations, capped)
- `nodes[]`: `{ id, label, type, description }`; `edges[]`: `{ id, source, target, label, weight }`
