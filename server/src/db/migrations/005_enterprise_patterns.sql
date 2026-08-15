-- ==============================================================================
-- Migration 005: Enterprise Outbox Pattern, Optimistic Locks, Tamper-Evident Audits & AI Telemetry
-- ==============================================================================

-- 1. Transactional Outbox Events (Guaranteed Event Delivery)
CREATE TABLE IF NOT EXISTS outbox_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 't_annapoorna',
  restaurant_id TEXT NOT NULL DEFAULT 'r_coimbatore_01',
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, scheduled_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- 2. AI Usage & Token Spend Tracker
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 't_annapoorna',
  restaurant_id TEXT NOT NULL DEFAULT 'r_coimbatore_01',
  call_id INTEGER,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost_inr REAL DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON ai_usage_logs(tenant_id, created_at DESC);

-- 3. Dynamic Feature Flags Engine
CREATE TABLE IF NOT EXISTS feature_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'global',
  flag_key TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, flag_key)
);

INSERT OR IGNORE INTO feature_flags (tenant_id, flag_key, enabled, description) VALUES
  ('global', 'enable_outbox_worker', 1, 'Process asynchronous transactional outbox events'),
  ('global', 'enable_prompt_guard', 1, 'Sanitize user speech and isolate system prompt boundaries'),
  ('global', 'enable_audit_chain', 1, 'Compute SHA-256 Merkle hash chain for immutable audit logs'),
  ('global', 'enable_query_profiler', 1, 'Log execution time warnings for slow database queries (>100ms)');
