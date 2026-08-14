-- ==============================================================================
-- Migration 002: Observability, State Audit Logs & Turn Latency Metrics
-- Compatible with SQLite and PostgreSQL
-- ==============================================================================

-- 1. State Mutation Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 't_annapoorna',
  restaurant_id TEXT NOT NULL DEFAULT 'r_coimbatore_01',
  actor_type TEXT NOT NULL, -- 'ai_agent' | 'staff' | 'kitchen' | 'system' | 'customer'
  actor_id TEXT,
  action TEXT NOT NULL, -- 'CREATE_ORDER' | 'UPDATE_STATUS' | 'UPDATE_PRICE' | 'DISPATCH_ORDER'
  resource_type TEXT NOT NULL, -- 'order' | 'catalog_item' | 'customer' | 'call'
  resource_id TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Granular Voice Turn Latency Metrics
CREATE TABLE IF NOT EXISTS turn_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id INTEGER,
  session_id TEXT NOT NULL,
  turn_number INTEGER DEFAULT 1,
  vad_ms INTEGER DEFAULT 0,
  stt_ms INTEGER DEFAULT 0,
  llm_ms INTEGER DEFAULT 0,
  tts_ms INTEGER DEFAULT 0,
  total_ms INTEGER DEFAULT 0,
  provider_llm TEXT,
  provider_tts TEXT,
  language TEXT DEFAULT 'en-IN',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_restaurant ON audit_logs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_turn_metrics_session ON turn_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_turn_metrics_call ON turn_metrics(call_id);
