# Supabase Setup Instructions

## 1. Run SQL Migration

1. Go to your Supabase project: https://cerlvjwbausxbkeppqrq.supabase.co
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the contents of `supabase_migration.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Verify the tables were created:
   - `search_results` table
   - `saved_searches` table
   - All indexes created successfully

## 2. Add Environment Variables

Add these to your backend `.env` file:

```bash
SUPABASE_URL=https://cerlvjwbausxbkeppqrq.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlcmx2andiYXVzeGJrZXBwcXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjE1MDYsImV4cCI6MjA4NTA5NzUwNn0.m-qYR2dKeptWEnbeJJ6w12asBaMZ5-py2DO6KHBzY7o
```

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

This will install `supabase-py` which was added to `requirements.txt`.

## 4. Test the Integration

1. Start your backend server
2. Create a search from the frontend
3. Check Supabase dashboard → Table Editor → `search_results` to see if the job was saved
4. Wait 1+ hour (or manually expire Redis) and verify the job still appears in the sidebar (loaded from Supabase)

## Features Implemented

✅ **Supabase Persistence**: Jobs persist for 7 days (with sliding TTL)  
✅ **Personal/Shared Tabs**: Sidebar has two tabs for organizing searches  
✅ **Share Functionality**: Copy shareable links from sidebar  
✅ **Save to Shared**: "Add to Shared" button when viewing shared links  
✅ **Rename Searches**: Click pencil icon to rename searches in Personal tab  
✅ **Client ID**: Automatic UUID generation and storage in localStorage  
✅ **Sliding TTL**: Viewing a search resets its expiration to 7 days  

## Troubleshooting

### Jobs not appearing in Supabase
- Check that `SUPABASE_URL` and `SUPABASE_KEY` are set correctly
- Check backend logs for Supabase errors
- Verify the SQL migration ran successfully

### Sidebar shows "No searches yet"
- Check browser console for errors
- Verify the `/jobs` endpoint is working (check Network tab)
- Ensure `X-Client-ID` header is being sent (check in Network tab)

### Share button not working
- Check browser console for clipboard API errors
- Some browsers require HTTPS for clipboard API
- Fallback: URL is logged to console, you can copy manually
