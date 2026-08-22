#!/usr/bin/env bash
set -euo pipefail

# GraphAtlas E2E: Playwright (A: upload->ingest->graph, B: chat->citation) + C: /search smoke.
# Requires: .env configured (DB + AGENT_*/EMBEDDING_* present but not called in E2E_MODE ingest).

API_PORT=3001
WEB_PORT=5173

echo "==> Building web"
bun run build:web >/dev/null

echo "==> Starting API (E2E_MODE)"
E2E_MODE=1 bun --env-file=../../.env --cwd apps/api src/index.ts >/tmp/graphatlas-e2e-api.log 2>&1 &
API_PID=$!

echo "==> Starting web preview"
bun --cwd apps/web preview --port "$WEB_PORT" >/tmp/graphatlas-e2e-web.log 2>&1 &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Waiting for API health"
for i in $(seq 1 30); do
  if curl -s "http://localhost:$API_PORT/health" | grep -q '"status":"ok"'; then break; fi
  sleep 1
done
curl -sf "http://localhost:$API_PORT/health" >/dev/null

echo "==> Scenario C: /search smoke (via API)"
RESP=$(curl -s -X POST "http://localhost:$API_PORT/api/v1/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"Who is the CEO?","top_k":5}')
echo "$RESP" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["query"] == "Who is the CEO?", "query echo"
assert isinstance(d["results"], list), "results"
assert len(d["diagnostics"]) == 3, "diagnostics"
print("search smoke OK (results=%d, diag=%d)" % (len(d["results"]), len(d["diagnostics"])))
'

echo "==> Playwright scenarios A + B"
bunx playwright test -c tests/playwright.config.ts

echo "==> E2E passed"
