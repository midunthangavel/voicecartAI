-- Add POS Synchronization Audit Table
CREATE TABLE IF NOT EXISTS pos_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  order_id INTEGER REFERENCES orders(id),
  pos_provider TEXT NOT NULL, -- 'petpooja' | 'urbanpiper' | 'ondc'
  pos_order_id TEXT,
  sync_status TEXT NOT NULL, -- 'success' | 'failed' | 'retrying'
  request_payload TEXT,
  response_payload TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
