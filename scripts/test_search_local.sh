#!/usr/bin/env bash
# Quick local test for /search with X-Client-ID.
# Prerequisites: Redis running, backend running on port 8000.
#
# Terminal 1: redis-server   (or: docker run -d -p 6379:6379 redis:alpine)
# Terminal 2: cd project && uvicorn holiday_destination_finder.api:app --reload --host 127.0.0.1 --port 8000
# Terminal 3: ./scripts/test_search_local.sh

set -e
BASE="${1:-http://127.0.0.1:8000}"

echo "Testing $BASE/search with X-Client-ID header..."
resp=$(curl -s -w "\n%{http_code}" "$BASE/search?origin=WRO&start=2026-02-01&end=2026-02-28&trip_length=7&top_n=5&providers=serpapi" \
  -H "X-Client-ID: test-client-local-$(date +%s)")

body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)

echo "HTTP status: $code"
echo "Body: $body"

if [ "$code" = "202" ]; then
  if echo "$body" | grep -q '"job_id"'; then
    echo "OK: search accepted, job_id returned."
    exit 0
  fi
fi
echo "FAIL: expected HTTP 202 and {\"job_id\":\"...\"}"
exit 1
