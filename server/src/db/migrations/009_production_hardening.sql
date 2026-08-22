-- ==============================================================================
-- Migration 009: Production Hardening — Webhook Deduplication Table
-- ==============================================================================
-- NOTE: ALTER TABLE statements are handled by the migration runner's safeAddColumn().
-- NOTE: Index creation is handled by the migration runner's safeCreateIndex()
-- to avoid failures when tables don't exist in fresh test databases.

-- ── Webhook Deduplication Table ──
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, event_id)
);
