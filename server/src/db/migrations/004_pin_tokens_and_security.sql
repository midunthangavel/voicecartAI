-- ==============================================================================
-- Migration 004: Single-Use Secure PIN Drop Tokens & Security Constraints
-- ==============================================================================

-- 1. Single-Use Cryptographic PIN Confirmation Tokens
CREATE TABLE IF NOT EXISTS pin_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  phone TEXT,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 2. Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_pin_tokens_hash ON pin_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pin_tokens_order ON pin_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_restaurant ON orders(tenant_id, restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_tenant_restaurant ON catalog_items(tenant_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_restaurant ON calls(tenant_id, restaurant_id, started_at DESC);
