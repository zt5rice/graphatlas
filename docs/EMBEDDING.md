> 🌐 **Language / 语言:** [English](https://github.com/zt5rice/graphatlas/blob/main/docs/EMBEDDING.md) | [中文版](https://github.com/zt5rice/graphatlas/blob/main/docs/EMBEDDING-CN.md)

# GraphAtlas Embedding Strategy

> Maps to PLAN.md §1.2 (embedding decision) and §4 (data-model dimensions).
> Principle: **OpenAI-compatible endpoint + env-configurable**, default `text-embedding-3-small`,
> with seamless local switching.

## 1. Default (cloud API)

| Item | Value |
|---|---|
| Model | `text-embedding-3-small` |
| Dimensions | 1536 (must match pgvector `vector(1536)`) |
| Price | $0.02 / 1M tokens (Batch API $0.01) |
| Context | 8191 tokens |

At this project's scale (10–15 documents, chunk 512 tokens, overlap 64), full indexing is
≈ 1–5M tokens, costing about **$0.02–$0.10** — negligible; query embeddings are a few hundred
tokens per call, effectively free.

## 2. Alternative model comparison (approx. 2026-08)

| Model | Dims | Price ($/1M tokens) | Notes |
|---|---|---|---|
| `text-embedding-3-small` (default) | 1536 | $0.02 | Best value |
| `text-embedding-3-large` | 3072 (reducible) | $0.13 | Slightly better quality, 6.5x cost — not worth it here |
| `text-embedding-ada-002` | 1536 | $0.10 | Legacy model; officially recommended to migrate to 3rd gen |
| Cohere `embed-v4` | 1024 | ~$0.12 | Multimodal, 128K context, free trial quota |
| Jina `jina-embeddings-v2-base-*` | 768–1024 | hosted ~$0.02–$0.05 (varies by channel) | Open weights, can run locally for free |
| **`bge-m3` (local, recommended)** | **1024** | **$0 (self-hosted)** | Multilingual, 8192 context, runs on CPU |
| `nomic-embed-text` (local) | 768 | $0 (self-hosted) | Lightweight, one-command Ollama pull |
| `mxbai-embed-large` (local) | 1024 | $0 (self-hosted) | Strong on English retrieval |

## 3. Local deployment (recommended: Ollama + bge-m3)

### 3.1 Ollama (simplest)

```bash
# Install and pull the model (~570M params, fp16 ≈ 1.1GB — trivial on M4 Max + 64GB)
brew install ollama
ollama pull bge-m3
ollama serve
```

`.env`:

```bash
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=
```

Ollama ships an OpenAI-compatible `/v1/embeddings` endpoint, so both the Bun API and the
Python extractor (lightrag-hku) need **no code changes — only env changes**.

### 3.2 Hugging Face TEI (alternative)

```bash
docker run -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-m3
```

Newer versions expose an OpenAI-compatible `/v1/embeddings`:

```bash
EMBEDDING_BASE_URL=http://localhost:8080/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=
```

### 3.3 sentence-transformers (direct from the Python sidecar)

> Note: PLAN.md §1.2 deliberately excludes LangChain. `HuggingFaceEmbeddings` is only a
> LangChain wrapper around sentence-transformers; **this project uses `sentence-transformers`
> directly and does not introduce LangChain**.

The extractor is Python (lightrag-hku) anyway, so the ETL stage can compute embeddings locally
and write them straight into pgvector:

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-m3", device="mps")  # MPS available on M4 Max
embeddings = model.encode(chunks, normalize_embeddings=True)
```

However, **the query side (Bun API) also needs query embeddings**, so it's recommended to
still go through the Ollama/TEI HTTP endpoint so indexing and querying share one entry point;
direct Python is only suitable for batch indexing.

## 4. How to switch models (three steps)

1. **Change env**: update `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS`.
2. **Change schema dimensions**: pgvector `vector(n)` must equal the new model's dimensions
   (e.g., bge-m3 → `vector(1024)`); regenerate the migration.
3. **Full re-embed**: re-run document ingestion/ETL to re-embed chunks/entities/relations;
   then re-run the 50-question benchmark to compare quality.

> ⚠️ Indexing and querying must use **the same model**, otherwise cosine similarity is
> meaningless. Switching models always triggers a full re-embed (minutes at this scale).

## 5. Local deployment: benefits and costs

**Benefits**

- Zero API cost (embeddings are free; only electricity);
- Data never leaves the machine — a plus for enterprise knowledge-base scenarios;
- Resume point: "self-hosted local embeddings (bge-m3 / sentence-transformers) + pgvector";
- `bge-m3` is multilingual: the English corpus works today, and switching to a Chinese corpus
  later requires no model change.

**Costs (non-monetary)**

- Must maintain an Ollama/Docker service and model versions;
- Model switches require a dimension migration + full re-embed;
- Local model quality must be verified by benchmark (no preset numbers).

## 6. Hardware requirements (M4 Max + 64GB)

| Item | Assessment |
|---|---|
| Model memory | bge-m3 fp16 ≈ 1.1GB; a few GB at runtime — 64GB is more than enough |
| Speed | M4 Max (16-core CPU + 40-core GPU + unified memory) embeds 10–15 documents in seconds to ~1 minute |
| Acceleration | PyTorch MPS available; CPU alone is enough at this scale |
| Headroom | Larger models later (bge-large / mxbai-embed-large, etc.) are no problem |

## 7. Recommended strategy

1. Development: use `text-embedding-3-small` to get the pipeline working and capture a
   50-question benchmark baseline;
2. Switch to local `bge-m3` (Ollama) and re-run the benchmark to compare recall/answer quality;
3. Keep OpenAI as an env alternative for easy A/B comparison.
