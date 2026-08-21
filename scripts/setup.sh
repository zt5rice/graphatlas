#!/usr/bin/env bash
set -euo pipefail

echo "==> GraphAtlas setup"

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is required (https://bun.sh)"; exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example (edit it with real keys)"
fi

echo "==> Installing workspace dependencies"
bun install

echo "==> Starting PostgreSQL"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose up -d
elif command -v pg_isready >/dev/null 2>&1 && pg_isready -q; then
  echo "    PostgreSQL already running locally"
elif command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q "postgresql@17.*started"; then
  echo "    Homebrew postgresql@17 service running"
else
  echo "WARN: no running PostgreSQL found. Start it via:"
  echo "      docker compose up -d   (requires Docker)"
  echo "   or brew services start postgresql@17"
fi

echo "==> Done. Next: bun run dev:all (or bun run db:init once migrations exist)"
