#!/usr/bin/env bash
set -euo pipefail

echo "==> Starting GraphAtlas dev stack (API :3001, web :5173)"

bun run --cwd apps/api dev &
API_PID=$!

bun run --cwd apps/web dev &
WEB_PID=$!

trap 'echo "==> Stopping dev stack"; kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM
wait
