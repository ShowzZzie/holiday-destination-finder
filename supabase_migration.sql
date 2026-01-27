-- Supabase Migration Script for Holiday Destination Finder
-- Run this in Supabase SQL Editor: https://cerlvjwbausxbkeppqrq.supabase.co/project/_/sql/new

-- Create search_results table
CREATE TABLE IF NOT EXISTS search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  params JSONB NOT NULL,  -- Search parameters (origin, dates, etc.)
  result JSONB NOT NULL,   -- Full search result payload
  status TEXT NOT NULL,    -- 'done' | 'failed'
  custom_name TEXT,         -- User-defined custom name (nullable, defaults to null)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- For sliding TTL
);

-- Create indexes for search_results
CREATE INDEX IF NOT EXISTS idx_search_results_client_id ON search_results(client_id);
CREATE INDEX IF NOT EXISTS idx_search_results_job_id ON search_results(job_id);
CREATE INDEX IF NOT EXISTS idx_search_results_expires_at ON search_results(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_results_last_accessed ON search_results(last_accessed_at);

-- Junction table to track which searches users have saved (for "Shared" tab)
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, job_id),  -- Prevent duplicate saves
  FOREIGN KEY (job_id) REFERENCES search_results(job_id) ON DELETE CASCADE
);

-- Create indexes for saved_searches
CREATE INDEX IF NOT EXISTS idx_saved_searches_client_id ON saved_searches(client_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_job_id ON saved_searches(job_id);

-- Enable Row Level Security (RLS) - optional, but recommended for security
-- This allows public read access but restricts writes to authenticated users
-- For now, we'll keep it simple and allow all operations via the anon key
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations via anon key (since we're using client_id for user identification)
CREATE POLICY "Allow all operations on search_results" ON search_results
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on saved_searches" ON saved_searches
  FOR ALL USING (true) WITH CHECK (true);

-- Optional: Create a function to automatically clean up expired searches
-- This can be run manually or via a scheduled job
CREATE OR REPLACE FUNCTION cleanup_expired_searches()
RETURNS void AS $$
BEGIN
  DELETE FROM search_results WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Migration: Add per-user custom names and soft delete for saved searches
-- ============================================================================

-- Add custom_name and deleted_at to saved_searches table
ALTER TABLE saved_searches 
ADD COLUMN IF NOT EXISTS custom_name TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_saved_searches_deleted_at ON saved_searches(deleted_at);

-- Create hidden_searches table for Personal tab deletions
CREATE TABLE IF NOT EXISTS hidden_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, job_id),
  FOREIGN KEY (job_id) REFERENCES search_results(job_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hidden_searches_client_id ON hidden_searches(client_id);
CREATE INDEX IF NOT EXISTS idx_hidden_searches_job_id ON hidden_searches(job_id);

-- Enable RLS for hidden_searches
ALTER TABLE hidden_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on hidden_searches" ON hidden_searches
  FOR ALL USING (true) WITH CHECK (true);


-- Migration: Add per-user custom names and soft delete for saved searches
-- Run this in Supabase SQL Editor: https://cerlvjwbausxbkeppqrq.supabase.co/project/_/sql/new

-- Add custom_name and deleted_at to saved_searches table
ALTER TABLE saved_searches 
ADD COLUMN IF NOT EXISTS custom_name TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_saved_searches_deleted_at ON saved_searches(deleted_at);

-- Create hidden_searches table for Personal tab deletions
CREATE TABLE IF NOT EXISTS hidden_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, job_id),
  FOREIGN KEY (job_id) REFERENCES search_results(job_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hidden_searches_client_id ON hidden_searches(client_id);
CREATE INDEX IF NOT EXISTS idx_hidden_searches_job_id ON hidden_searches(job_id);

-- Enable RLS for hidden_searches
ALTER TABLE hidden_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on hidden_searches" ON hidden_searches
  FOR ALL USING (true) WITH CHECK (true);
