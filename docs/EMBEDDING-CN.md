> 🌐 **语言 / Language:** [中文版](https://github.com/zt5rice/graphatlas/blob/main/docs/EMBEDDING-CN.md) | [English](https://github.com/zt5rice/graphatlas/blob/main/docs/EMBEDDING.md)

# GraphAtlas Embedding 方案说明

> 对应 PLAN.md §1.2（Embedding 决策）与 §4（数据模型维度说明）。
> 原则：**OpenAI 兼容端点 + env 可配**，默认 `text-embedding-3-small`，本地可无缝切换。

## 1. 默认方案（云端 API）

| 项 | 值 |
|---|---|
| 模型 | `text-embedding-3-small` |
| 维度 | 1536（必须与 pgvector `vector(1536)` 一致） |
| 价格 | $0.02 / 1M tokens（Batch API $0.01） |
| 上下文 | 8191 tokens |

本项目规模（10–15 篇文档，chunk 512 token、overlap 64）全量索引约 1–5M token，
成本约 **$0.02–$0.10**，可忽略；query embedding 每次几百 token，几乎不花钱。

## 2. 备选模型对比（约 2026-08）

| 模型 | 维度 | 价格（$/1M tokens） | 备注 |
|---|---|---|---|
| `text-embedding-3-small`（默认） | 1536 | $0.02 | 性价比最高 |
| `text-embedding-3-large` | 3072（可降维） | $0.13 | 质量略好，贵 6.5 倍，本项目不值得 |
| `text-embedding-ada-002` | 1536 | $0.10 | legacy 旧模型，官方推荐迁移到 3 代 |
| Cohere `embed-v4` | 1024 | ~$0.12 | 多模态、128K 上下文，有免费试用额度 |
| Jina `jina-embeddings-v2-base-*` | 768–1024 | 托管约 $0.02–$0.05（渠道差异大） | 开源权重，可本地免费跑 |
| **`bge-m3`（本地，推荐）** | **1024** | **$0（自托管）** | 多语言（中英都好）、8192 上下文、CPU 可跑 |
| `nomic-embed-text`（本地） | 768 | $0（自托管） | 轻量，Ollama 一键拉取 |
| `mxbai-embed-large`（本地） | 1024 | $0（自托管） | 英文检索强 |

## 3. 本地部署（推荐：Ollama + bge-m3）

### 3.1 Ollama（最简单）

```bash
# 安装并拉取模型（约 570M 参数，fp16 约 1.1GB，M4 Max + 64GB 毫无压力）
brew install ollama
ollama pull bge-m3
ollama serve
```

`.env` 配置：

```bash
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=
```

Ollama 自带 OpenAI 兼容 `/v1/embeddings` 端点，Bun API 与 Python 抽取器（lightrag-hku）
都无需改代码，只改 env 即可。

### 3.2 Hugging Face TEI（备选）

```bash
docker run -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-m3
```

较新版本提供 OpenAI 兼容 `/v1/embeddings`：

```bash
EMBEDDING_BASE_URL=http://localhost:8080/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=
```

### 3.3 sentence-transformers（Python 侧车直连）

> 注意：PLAN.md §1.2 刻意排除 LangChain。`HuggingFaceEmbeddings` 只是 LangChain 对
> sentence-transformers 的封装；**本项目直接用 `sentence-transformers` 本体，
> 不引入 LangChain**。

抽取器（extractor）本来就是 Python（lightrag-hku），可在 ETL 阶段直接本地计算
embedding 写入 pgvector：

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-m3", device="mps")  # M4 Max 可用 MPS
embeddings = model.encode(chunks, normalize_embeddings=True)
```

但**查询端（Bun API）也需要算 query embedding**，所以建议仍走 Ollama/TEI 的
HTTP 端点，让索引与查询共用同一入口；纯 Python 直连仅适合做批量索引。

## 4. 如何切换模型（三步）

1. **改 env**：更新 `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS`。
2. **改 schema 维度**：pgvector `vector(n)` 必须等于新模型的维度
   （如 bge-m3 → `vector(1024)`），重新生成迁移。
3. **全量重新 embedding**：重跑文档摄取/ETL，重嵌 chunk/entity/relation；
   再跑 50 题 benchmark 对比质量。

> ⚠️ 索引与查询必须使用**同一个模型**，否则余弦相似度没有意义。
> 切换模型必然触发全量重嵌（本项目规模只需几分钟）。

## 5. 本地部署的收益与成本

**收益**

- 零 API 成本（embedding 免费，只有电费）；
- 数据不出本机，企业知识库场景是加分项；
- 简历亮点："本地自托管 embedding（bge-m3 / sentence-transformers）+ pgvector"；
- `bge-m3` 多语言，英文语料可用，以后换中文语料不用换模型。

**成本（非金钱）**

- 需维护 Ollama/Docker 服务与模型版本；
- 换模型要改维度迁移 + 全量重嵌；
- 本地模型质量需用 benchmark 实测确认（不预设数字）。

## 6. 硬件要求（M4 Max + 64GB）

| 项 | 评估 |
|---|---|
| 模型内存 | bge-m3 fp16 约 1.1GB，加载后运行占用几个 GB，64GB 绰绰有余 |
| 速度 | M4 Max（16 核 CPU + 40 核 GPU + 统一内存）跑 10–15 篇文档全量嵌入仅需几秒到一分钟 |
| 加速 | 可用 PyTorch MPS；本规模直接 CPU 也够 |
| 扩展 | 以后换更大模型（bge-large / mxbai-embed-large 等）也毫无压力 |

## 7. 建议策略

1. 开发期先用 `text-embedding-3-small` 跑通链路、拿到 50 题 benchmark 基线；
2. 切本地 `bge-m3`（Ollama）再跑一遍 benchmark，对比召回/答案质量；
3. 保留 OpenAI 作为 env 备选，方便随时 A/B 对比。
