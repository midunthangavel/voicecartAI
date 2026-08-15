-- ==============================================================================
-- Migration 008: Durable Idempotency Ledger for Safe External Side-Effects
-- ==============================================================================

CREATE TABLE IF NOT EXISTS side_effect_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  tenant_id TEXT,
  restaurant_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_side_effect_cat ON side_effect_idempotency(category, tenant_id, restaurant_id);
