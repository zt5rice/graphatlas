"""Unit tests for the extractor config (no network, no DB)."""

import pytest

from orgrag_extract.config import _agent_api_key, get_settings

BASE_ENV = {
    "DATABASE_URL": "postgres://localhost:5432/graphatlas",
    "AGENT_BASE_URL": "https://opencode.ai/zen/go/v1",
    "AGENT_MODEL": "deepseek-v4-flash",
    "AGENT_API_KEY": "",
    "EMBEDDING_BASE_URL": "https://openrouter.ai/api/v1",
    "EMBEDDING_MODEL": "text-embedding-3-small",
    "EMBEDDING_DIMENSIONS": "1536",
    "EMBEDDING_API_KEY": "sk-or-test",
}


def apply_env(monkeypatch):
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)


def test_get_settings_reads_env(monkeypatch):
    apply_env(monkeypatch)
    monkeypatch.setenv("CHUNK_TOKEN_SIZE", "512")
    monkeypatch.setenv("CHUNK_OVERLAP_TOKEN_SIZE", "64")
    settings = get_settings()
    assert settings.agent_model == "deepseek-v4-flash"
    assert settings.embedding_model == "text-embedding-3-small"
    assert settings.embedding_dimensions == 1536
    assert settings.chunk_token_size == 512
    assert settings.chunk_overlap_token_size == 64


def test_agent_api_key_falls_back_to_opencode(monkeypatch):
    apply_env(monkeypatch)
    monkeypatch.setenv("AGENT_API_KEY", "")
    monkeypatch.setenv("OPENCODE_CODEX_API_KEY", "sk-opencode-test")
    assert _agent_api_key() == "sk-opencode-test"


def test_agent_api_key_raises_when_missing(monkeypatch):
    apply_env(monkeypatch)
    monkeypatch.delenv("AGENT_API_KEY")
    monkeypatch.delenv("OPENCODE_CODEX_API_KEY")
    with pytest.raises(RuntimeError, match="AGENT_API_KEY"):
        _agent_api_key()


def test_missing_agent_base_url_raises(monkeypatch):
    apply_env(monkeypatch)
    monkeypatch.delenv("AGENT_BASE_URL")
    with pytest.raises(RuntimeError, match="AGENT_BASE_URL"):
        get_settings()


def test_invalid_embedding_dimensions_raise(monkeypatch):
    apply_env(monkeypatch)
    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "abc")
    with pytest.raises(Exception):
        get_settings()
