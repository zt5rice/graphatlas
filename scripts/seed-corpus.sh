#!/usr/bin/env bash
set -euo pipefail

# Uploads every markdown corpus file via the GraphAtlas API and triggers ingestion.
# Prereq: API running (bun run dev:api) and .env configured.

API_URL="${API_URL:-http://localhost:3001}"

for file in data/corpus/*.md; do
  title="$(basename "$file")"
  echo "==> uploading $title"
  doc="$(curl -s -F "title=$title" -F "file=@$file;type=text/markdown" "$API_URL/api/v1/documents")"
  id="$(echo "$doc" | jq -r '.id')"
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "!! upload failed: $doc" >&2
    exit 1
  fi
  job="$(curl -s -X POST "$API_URL/api/v1/documents/$id/ingest")"
  jid="$(echo "$job" | jq -r '.job_id')"
  echo "   doc=$id job=$jid"
done

echo "done. Poll jobs at $API_URL/api/v1/jobs/<job_id>"
