-- ==============================================================================
-- Migration 001: Initial Multi-Tenant Production Schema for VoiceCart AI
-- Compatible with SQLite and PostgreSQL
-- ==============================================================================

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tenants (Multi-tenant SaaS root)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Users & Staff
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT,
  role TEXT DEFAULT 'staff',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Restaurants / Merchants
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  phone_number TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Catalog Categories
CREATE TABLE IF NOT EXISTS catalog_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  name_tamil TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

-- 7. Catalog Items
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  category_id INTEGER REFERENCES catalog_categories(id),
  sku TEXT,
  name TEXT NOT NULL,
  name_tamil TEXT,
  description TEXT,
  price REAL NOT NULL CHECK(price >= 0),
  available INTEGER DEFAULT 1,
  is_special INTEGER DEFAULT 0,
  dietary_tags TEXT DEFAULT 'none',
  stt_hints TEXT DEFAULT '[]',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Catalog Item Variants
CREATE TABLE IF NOT EXISTS catalog_item_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta REAL DEFAULT 0,
  active INTEGER DEFAULT 1
);

-- 9. Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  phone TEXT NOT NULL,
  name TEXT,
  preferred_language TEXT DEFAULT 'mixed',
  dietary_preference TEXT DEFAULT 'none',
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, phone)
);

-- 10. Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'Home',
  spoken_address TEXT NOT NULL,
  formatted_address TEXT,
  landmark TEXT,
  latitude REAL,
  longitude REAL,
  is_default INTEGER DEFAULT 0
);

-- 11. Phone Calls
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL DEFAULT 'r_coimbatore_01',
  call_sid TEXT UNIQUE,
  provider TEXT DEFAULT 'twilio',
  provider_call_id TEXT,
  customer_id INTEGER REFERENCES customers(id),
  caller_phone TEXT,
  source TEXT DEFAULT 'twilio',
  status TEXT DEFAULT 'active',
  language TEXT DEFAULT 'en-IN',
  latency_avg_ms INTEGER DEFAULT 0,
  order_id INTEGER,
  session_state TEXT DEFAULT '{}',
  transcript TEXT DEFAULT '[]',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  answered_at TIMESTAMP,
  ended_at TIMESTAMP
);

-- 12. Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  current_state TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Conversation Messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  language TEXT,
  confidence REAL DEFAULT 1.0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Authoritative Orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL DEFAULT 'r_coimbatore_01',
  call_id INTEGER REFERENCES calls(id),
  customer_id INTEGER REFERENCES customers(id),
  ondc_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
  currency TEXT DEFAULT 'INR',
  payment_status TEXT DEFAULT 'pending',
  payment_link TEXT,
  delivery_address TEXT,
  landmark TEXT,
  items TEXT,
  scheduled_for TIMESTAMP,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Order Items Snapshots
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  catalog_item_id INTEGER REFERENCES catalog_items(id),
  item_name_snapshot TEXT NOT NULL,
  unit_price_snapshot REAL NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  line_total REAL NOT NULL
);

-- 16. Call Recordings
CREATE TABLE IF NOT EXISTS call_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
  call_sid TEXT,
  audio_path TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  dispute_status TEXT DEFAULT 'none',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
