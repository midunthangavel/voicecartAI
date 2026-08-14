import { readdirSync, readFileSync } from 'fs';
import { resolve as pathResolve, join } from 'path';

/**
 * Migration runner that reads .sql migration files and executes them idempotently
 */
export async function runMigrations(db) {
  const migrationsDir = pathResolve('src', 'db', 'migrations');
  console.log('[Migrations] Checking database schema migrations in:', migrationsDir);

  // 1. Ensure migrations ledger exists
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // 2. Query applied migrations
  const applied = await new Promise((resolve, reject) => {
    db.all('SELECT version FROM schema_migrations', (err, rows) => {
      if (err) return reject(err);
      resolve(new Set((rows || []).map(r => r.version)));
    });
  });

  // Helper to safely add column if it doesn't already exist
  const safeAddColumn = async (table, column, def) => {
    return new Promise((resolve) => {
      db.all(`PRAGMA table_info(${table})`, (err, cols) => {
        if (err || !cols) return resolve();
        const exists = cols.some(c => c.name === column);
        if (!exists) {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`, () => resolve());
        } else {
          resolve();
        }
      });
    });
  };

  // Safe schema upgrade for legacy MVP tables
  const orderColumns = [
    ['restaurant_id', "TEXT DEFAULT 'r_coimbatore_01'"],
    ['customer_id', 'INTEGER'],
    ['subtotal', 'REAL DEFAULT 0'],
    ['tax', 'REAL DEFAULT 0'],
    ['delivery_fee', 'REAL DEFAULT 0'],
    ['discount', 'REAL DEFAULT 0'],
    ['currency', "TEXT DEFAULT 'INR'"],
    ['landmark', 'TEXT'],
    ['scheduled_for', 'TIMESTAMP'],
    ['version', 'INTEGER DEFAULT 1'],
    ['dispute_status', "TEXT DEFAULT 'none'"],
    ['dispute_reason', 'TEXT'],
    ['dispute_resolved_by', 'TEXT'],
    ['dispute_notes', 'TEXT'],
  ];

  for (const [col, def] of orderColumns) {
    await safeAddColumn('orders', col, def);
  }

  const callColumns = [
    ['restaurant_id', "TEXT DEFAULT 'r_coimbatore_01'"],
    ['provider', "TEXT DEFAULT 'twilio'"],
    ['provider_call_id', 'TEXT'],
    ['customer_id', 'INTEGER'],
    ['order_id', 'INTEGER'],
    ['answered_at', 'TIMESTAMP'],
  ];

  for (const [col, def] of callColumns) {
    await safeAddColumn('calls', col, def);
  }

  const recordingColumns = [
    ['dispute_status', "TEXT DEFAULT 'none'"],
    ['dispute_reason', 'TEXT'],
    ['dispute_notes', 'TEXT'],
    ['resolved_at', 'TIMESTAMP'],
  ];

  for (const [col, def] of recordingColumns) {
    await safeAddColumn('call_recordings', col, def);
  }

  await safeAddColumn('customers', 'restaurant_id', "TEXT DEFAULT 'r_coimbatore_01'");
  await safeAddColumn('customer_addresses', 'customer_id', 'INTEGER');

  // 3. Find and sort SQL files
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!applied.has(file)) {
      console.log(`[Migrations] Applying migration: ${file}...`);
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf-8');

      await new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) {
            console.error(`[Migrations] Migration failed on ${file}:`, err.message);
            return reject(err);
          }
          resolve();
        });
      });

      await new Promise((resolve, reject) => {
        db.run('INSERT INTO schema_migrations (version) VALUES (?)', [file], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      console.log(`[Migrations] Successfully applied: ${file}`);
    }
  }

  // 4. Create high-performance indexes safely
  const safeCreateIndex = async (indexName, sql) => {
    return new Promise((resolve) => {
      db.run(sql, () => resolve());
    });
  };

  await safeCreateIndex('idx_customers_phone', 'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)');
  await safeCreateIndex('idx_catalog_restaurant', 'CREATE INDEX IF NOT EXISTS idx_catalog_restaurant ON catalog_items(restaurant_id)');
  await safeCreateIndex('idx_orders_restaurant', 'CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id)');
  await safeCreateIndex('idx_orders_status', 'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
  await safeCreateIndex('idx_calls_restaurant', 'CREATE INDEX IF NOT EXISTS idx_calls_restaurant ON calls(restaurant_id)');
  await safeCreateIndex('idx_order_items_order', 'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)');

  console.log('[Migrations] All schema migrations and performance indexes are up to date.');
}
