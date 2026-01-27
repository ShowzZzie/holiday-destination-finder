#!/usr/bin/env bash
# Local testing script for backend and frontend
# Prerequisites: Redis running on localhost:6379

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BASE_DIR"

echo "🧪 Testing Holiday Destination Finder Locally"
echo "=============================================="
echo ""

# Check Redis
echo "1️⃣ Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
  echo "   ✅ Redis is running"
else
  echo "   ❌ Redis is NOT running"
  echo "   Please start Redis: redis-server (or docker run -d -p 6379:6379 redis:alpine)"
  exit 1
fi

# Check .env
echo ""
echo "2️⃣ Checking environment variables..."
if [ -f .env ]; then
  echo "   ✅ .env file exists"
  if grep -q "SUPABASE_URL" .env && grep -q "SUPABASE_KEY" .env; then
    echo "   ✅ Supabase credentials found"
  else
    echo "   ⚠️  Supabase credentials missing in .env"
  fi
else
  echo "   ⚠️  .env file not found"
fi

# Test backend
echo ""
echo "3️⃣ Testing backend API..."
source .venv/bin/activate

# Start backend in background
echo "   Starting backend server..."
uvicorn holiday_destination_finder.api:app --host 127.0.0.1 --port 8000 > /tmp/hdf_backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

# Check if backend started
if curl -s http://127.0.0.1:8000/health > /dev/null; then
  echo "   ✅ Backend is running on http://127.0.0.1:8000"
else
  echo "   ❌ Backend failed to start"
  echo "   Check logs: tail -f /tmp/hdf_backend.log"
  kill $BACKEND_PID 2>/dev/null || true
  exit 1
fi

# Test search endpoint with client_id
echo ""
echo "4️⃣ Testing /search endpoint with X-Client-ID..."
CLIENT_ID="test-client-$(date +%s)"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "http://127.0.0.1:8000/search?origin=WRO&start=2026-02-01&end=2026-02-28&trip_length=7&top_n=5&providers=serpapi" \
  -H "X-Client-ID: $CLIENT_ID")

BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "202" ]; then
  if echo "$BODY" | grep -q '"job_id"'; then
    JOB_ID=$(echo "$BODY" | grep -o '"job_id":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ Search created successfully"
    echo "   Job ID: $JOB_ID"
    echo "   Client ID used: $CLIENT_ID"
  else
    echo "   ⚠️  Got 202 but no job_id in response"
  fi
else
  echo "   ❌ Search failed: HTTP $HTTP_CODE"
  echo "   Response: $BODY"
fi

# Test /jobs endpoint
echo ""
echo "5️⃣ Testing /jobs endpoint..."
JOBS_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "http://127.0.0.1:8000/jobs?type=personal" \
  -H "X-Client-ID: $CLIENT_ID")

JOBS_BODY=$(echo "$JOBS_RESPONSE" | head -n -1)
JOBS_CODE=$(echo "$JOBS_RESPONSE" | tail -n 1)

if [ "$JOBS_CODE" = "200" ]; then
  echo "   ✅ /jobs endpoint working"
  JOBS_COUNT=$(echo "$JOBS_BODY" | grep -o '"job_id"' | wc -l | tr -d ' ')
  echo "   Found $JOBS_COUNT jobs"
else
  echo "   ⚠️  /jobs returned HTTP $JOBS_CODE"
fi

# Cleanup
echo ""
echo "6️⃣ Cleaning up..."
kill $BACKEND_PID 2>/dev/null || true
sleep 1

echo ""
echo "✅ Backend tests completed!"
echo ""
echo "Next: Start frontend with 'cd frontend && npm run dev'"
echo "Then test in browser: http://localhost:3000"
