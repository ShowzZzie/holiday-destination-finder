# Local Testing Checklist

## Prerequisites

1. **Start Redis** (required):
   ```bash
   redis-server
   # OR if you have Docker:
   docker run -d -p 6379:6379 --name redis-test redis:alpine
   ```

2. **Verify Redis is running**:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

## Backend Tests

### ✅ Test 1: API Health Check
```bash
curl http://127.0.0.1:8000/health
# Expected: {"status":"ok"}
```

### ✅ Test 2: Search with Client ID
```bash
curl "http://127.0.0.1:8000/search?origin=WRO&start=2026-02-01&end=2026-02-28&trip_length=7&top_n=5&providers=serpapi" \
  -H "X-Client-ID: test-client-123"
# Expected: HTTP 202, {"job_id":"..."}
```

### ✅ Test 3: Get Jobs (Personal)
```bash
curl "http://127.0.0.1:8000/jobs?type=personal" \
  -H "X-Client-ID: test-client-123"
# Expected: HTTP 200, JSON array of jobs
```

### ✅ Test 4: Get Jobs (Shared)
```bash
curl "http://127.0.0.1:8000/jobs?type=shared" \
  -H "X-Client-ID: test-client-123"
# Expected: HTTP 200, JSON array (may be empty)
```

## Frontend Tests (Browser: http://localhost:3000)

### ✅ Test 5: Create a Search
1. Fill in search form
2. Click "Search Destinations"
3. **Verify**: Job appears in Personal tab sidebar
4. **Verify**: "Add to Shared" button does NOT appear (it's your own search)

### ✅ Test 6: Share Button
1. In Personal tab, hover over a job item
2. **Verify**: Share icon (link/share icon) is visible
3. Click share icon
4. **Verify**: URL copies to clipboard
5. **Verify**: Icon changes to checkmark temporarily

### ✅ Test 7: Rename Functionality
1. In Personal tab, click pencil icon on a job
2. **Verify**: Input field appears
3. Type a custom name
4. Press Enter or click outside
5. **Verify**: Name updates without page reload
6. **Verify**: Custom name displays instead of default format

### ✅ Test 8: Tab Switching
1. Switch from Personal to Shared tab
2. **Verify**: No brief "no results" flash
3. **Verify**: Shows "Loading..." or content immediately
4. Switch back to Personal
5. **Verify**: Smooth transition, no flash

### ✅ Test 9: Shared Link Access
1. Copy a shared link (from share button)
2. Open in new browser/incognito window
3. **Verify**: Search loads automatically
4. **Verify**: "Add to Shared" button appears (it's not your search)
5. Click "Add to Shared"
6. **Verify**: Button changes to "Added to Shared" with checkmark
7. **Verify**: Job appears in Shared tab

### ✅ Test 10: Title Truncation
1. Create a search with long origin name
2. **Verify**: Title truncates properly with "..."
3. **Verify**: Hover shows full title in tooltip
4. **Verify**: No horizontal overflow

## Quick Test Script

Run the automated test:
```bash
./scripts/test_local.sh
```

## Manual Server Start

**Terminal 1 - Backend:**
```bash
cd /Users/jk/!Projects/holiday_destination_finder/holiday-destination-finder
source .venv/bin/activate
export REDIS_URL=redis://localhost:6379
uvicorn holiday_destination_finder.api:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd /Users/jk/!Projects/holiday_destination_finder/holiday-destination-finder/frontend
npm run dev
```

**Terminal 3 - Redis (if not running):**
```bash
redis-server
# OR
docker run -d -p 6379:6379 redis:alpine
```

## Expected Results

- ✅ Backend starts without errors
- ✅ Frontend starts without errors  
- ✅ Search creates job with client_id
- ✅ Share button visible and works
- ✅ Rename works without reload
- ✅ "Add to Shared" only shows for shared jobs
- ✅ Tab switching is smooth
- ✅ Titles truncate properly
