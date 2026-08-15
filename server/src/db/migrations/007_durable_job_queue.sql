-- ==============================================================================
-- Migration 007: Durable Job Queue for True Process Crash and Restart Durability
-- ==============================================================================

CREATE TABLE IF NOT EXISTS durable_job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  locked_at TIMESTAMP,
  locked_by TEXT,
  last_error TEXT,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_durable_queue ON durable_job_queue(queue_name, status, scheduled_at);
