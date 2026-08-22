-- ==============================================================================
-- Migration 009: Production Hardening — Indexes & Webhook Deduplication
-- ==============================================================================
-- NOTE: ALTER TABLE statements are handled by the migration runner's safeAddColumn()
-- to avoid failures on existing columns. This file only contains idempotent DDL.

-- ── 1. Critical Query-Performance Indexes ──
CREATE INDEX IF NOT EXISTS idx_orders_tenant_restaurant_created_v2
  ON orders(tenant_id, restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_tenant_restaurant_started_v2
  ON calls(tenant_id, restaurant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_call_timestamp
  ON call_logs(call_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_outbox_pending_drain
  ON outbox_events(status, scheduled_at, id);

CREATE INDEX IF NOT EXISTS idx_jobs_pending_drain
  ON durable_job_queue(queue_name, status, scheduled_at, id);

CREATE INDEX IF NOT EXISTS idx_audit_restaurant_chain
  ON audit_logs(restaurant_id, id DESC);

-- ── 2. Webhook Deduplication Table ──
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhooks_provider_event ON processed_webhooks(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_processed_at ON processed_webhooks(processed_at);
