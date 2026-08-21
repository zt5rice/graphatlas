"""LightRAG staging ingestion: ainsert -> PG storage -> product counts."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from lightrag import LightRAG
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc

from orgrag_extract.config import Settings, configure_postgres_env, get_settings

logger = logging.getLogger("orgrag_extract")


@dataclass(frozen=True)
class IngestResult:
    workspace: str
    chunks: int
    entities: int
    relations: int
    file: str


async def _llm_func(prompt: str, system_prompt: str | None = None, history_messages: list | None = None, **kwargs):
    s = get_settings()
    return await openai_complete_if_cache(
        s.agent_model,
        prompt,
        system_prompt=system_prompt,
        history_messages=history_messages or [],
        api_key=s.agent_api_key,
        base_url=s.agent_base_url,
        **kwargs,
    )


async def _embedding_func(texts: list[str]):
    s = get_settings()
    return await openai_embed.func(
        texts,
        model=s.embedding_model,
        api_key=s.embedding_api_key,
        base_url=s.embedding_base_url,
        embedding_dim=s.embedding_dimensions,
        max_token_size=8192,
    )


def build_lightrag(workspace: str, settings: Settings) -> LightRAG:
    configure_postgres_env()
    rag = LightRAG(
        working_dir=settings.working_dir,
        workspace=workspace,
        llm_model_func=_llm_func,
        llm_model_name=settings.agent_model,
        embedding_func=EmbeddingFunc(
            embedding_dim=settings.embedding_dimensions,
            max_token_size=8192,
            func=_embedding_func,
            model_name=settings.embedding_model,
        ),
        kv_storage="PGKVStorage",
        vector_storage="PGVectorStorage",
        doc_status_storage="PGDocStatusStorage",
        graph_storage="PGGraphStorage",
        addon_params={"language": "English"},
        log_level="WARNING",
    )
    return rag


async def ingest_file(workspace: str, path: str) -> IngestResult:
    settings = get_settings()
    rag = build_lightrag(workspace, settings)
    await rag.initialize_storages()

    text = Path(path).read_text(encoding="utf-8")
    await rag.ainsert(
        text,
        file_path=path,
        chunk_token_size=settings.chunk_token_size,
        chunk_overlap_token_size=settings.chunk_overlap_token_size,
    )

    graph = await rag.get_knowledge_graph(node_label="*", max_depth=3)
    entities = len(getattr(graph, "nodes", []) or [])
    relations = len(getattr(graph, "edges", []) or [])
    chunks = len(getattr(rag, "chunks", {}) or {})

    return IngestResult(
        workspace=workspace,
        chunks=chunks,
        entities=entities,
        relations=relations,
        file=path,
    )


async def cleanup_workspace(workspace: str) -> None:
    """Drop all LightRAG PG rows for the staging workspace (idempotent)."""
    import psycopg

    s = get_settings()
    with psycopg.connect(s.database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public' AND tablename LIKE %s
                """,
                (f"%{workspace}%",),
            )
            tables = [r[0] for r in cur.fetchall()]
            for table in tables:
                cur.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
            logger.info("cleanup: dropped %d staging tables for workspace=%s", len(tables), workspace)
