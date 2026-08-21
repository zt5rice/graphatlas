"""Environment configuration shared by the extractor CLI."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import unquote, urlparse


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _agent_api_key() -> str:
    """Prefer AGENT_API_KEY; fall back to the OpenCode Go gateway token."""
    value = os.getenv("AGENT_API_KEY", "").strip()
    if value:
        return value
    value = os.getenv("OPENCODE_CODEX_API_KEY", "").strip()
    if value:
        return value
    raise RuntimeError("Missing AGENT_API_KEY (or OPENCODE_CODEX_API_KEY)")


@dataclass(frozen=True)
class Settings:
    database_url: str
    agent_base_url: str
    agent_model: str
    agent_api_key: str
    embedding_base_url: str
    embedding_model: str
    embedding_dimensions: int
    embedding_api_key: str
    working_dir: str
    chunk_token_size: int
    chunk_overlap_token_size: int


def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL", "postgres://graphatlas:graphatlas@localhost:5432/graphatlas"
        ),
        agent_base_url=_require("AGENT_BASE_URL"),
        agent_model=_require("AGENT_MODEL"),
        agent_api_key=_agent_api_key(),
        embedding_base_url=_require("EMBEDDING_BASE_URL"),
        embedding_model=_require("EMBEDDING_MODEL"),
        embedding_dimensions=int(os.getenv("EMBEDDING_DIMENSIONS", "1536")),
        embedding_api_key=os.getenv("EMBEDDING_API_KEY", ""),
        working_dir=os.getenv("LIGHTRAG_WORKING_DIR", ".graph-rag-workdir"),
        chunk_token_size=int(os.getenv("CHUNK_TOKEN_SIZE", "512")),
        chunk_overlap_token_size=int(os.getenv("CHUNK_OVERLAP_TOKEN_SIZE", "64")),
    )


def configure_postgres_env() -> None:
    """Split a single DATABASE_URL into the POSTGRES_* vars LightRAG expects."""
    p = urlparse(os.getenv("DATABASE_URL", ""))
    if not p.hostname:
        raise RuntimeError("DATABASE_URL must include a host")
    os.environ["POSTGRES_HOST"] = p.hostname
    os.environ["POSTGRES_PORT"] = str(p.port or 5432)
    os.environ["POSTGRES_USER"] = unquote(p.username or "")
    os.environ["POSTGRES_PASSWORD"] = unquote(p.password or "")
    os.environ["POSTGRES_DATABASE"] = unquote(p.path.lstrip("/"))
    os.environ.setdefault("POSTGRES_VECTOR_INDEX_TYPE", "HNSW")
