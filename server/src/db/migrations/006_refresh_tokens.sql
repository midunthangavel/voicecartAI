-- ==============================================================================
-- Migration 006: Refresh Tokens Ledger for Token Rotation and Instant Revocation
-- ==============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  jti TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_jti ON refresh_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
