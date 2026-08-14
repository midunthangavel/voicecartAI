import sqlite3 from 'sqlite3';
import { runMigrations } from './db/migrations/migrationRunner.js';
import { seedDatabase } from './db/seed.js';

let db = null;
const DB_PATH = process.env.DB_PATH || './voicecart.db';

/**
 * Initialize Database Connection, apply migrations, and seed demo tenant
 */
export async function initDatabase() {
  const dbPath = process.env.DB_PATH || './voicecart.db';
  if (db) return db;

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('[DB] Connection error:', err.message);
        return reject(err);
      }
      console.log(`[DB] Connected to SQLite database at ${dbPath}`);

      // Enable WAL mode & foreign keys for concurrency and integrity
      db.run('PRAGMA journal_mode = WAL;');
      db.run('PRAGMA foreign_keys = ON;');

      try {
        // Run SQL schema migrations
        await runMigrations(db);
        // Seed initial multi-tenant demo data
        await seedDatabase(db);
        resolve(db);
      } catch (migrationErr) {
        console.error('[DB] Initialization error:', migrationErr);
        reject(migrationErr);
      }
    });
  });
}

/**
 * Executes an INSERT, UPDATE, or DELETE query and returns { lastID, changes }
 */
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Executes a SELECT query and returns the first row
 */
export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Executes a SELECT query and returns all matching rows
 */
export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// ── Customer Profile & Address Helpers (Backward Compatible) ──

export async function getCustomerProfile(phone, restaurantId = 'r_coimbatore_01') {
  return dbGet('SELECT * FROM customers WHERE phone = ? AND restaurant_id = ?', [phone, restaurantId]);
}

export async function upsertCustomerProfile({ phone, restaurant_id = 'r_coimbatore_01', name = null, dietary_preference = 'none', preferred_language = 'mixed' }) {
  const existing = await getCustomerProfile(phone, restaurant_id);
  if (existing) {
    if (name || dietary_preference !== 'none') {
      await dbRun(
        `UPDATE customers SET 
           name = COALESCE(?, name), 
           dietary_preference = COALESCE(?, dietary_preference),
           preferred_language = COALESCE(?, preferred_language),
           updated_at = CURRENT_TIMESTAMP 
         WHERE phone = ? AND restaurant_id = ?`,
        [name, dietary_preference, preferred_language, phone, restaurant_id]
      );
    }
    return getCustomerProfile(phone, restaurant_id);
  }

  const res = await dbRun(
    `INSERT INTO customers (restaurant_id, phone, name, dietary_preference, preferred_language) 
     VALUES (?, ?, ?, ?, ?)`,
    [restaurant_id, phone, name, dietary_preference, preferred_language]
  );
  return { id: res.lastID, restaurant_id, phone, name, dietary_preference, preferred_language, total_orders: 0 };
}

export async function incrementCustomerOrders(phone, restaurantId = 'r_coimbatore_01') {
  return dbRun(
    'UPDATE customers SET total_orders = total_orders + 1, updated_at = CURRENT_TIMESTAMP WHERE phone = ? AND restaurant_id = ?',
    [phone, restaurantId]
  );
}

export async function getSavedAddresses(phone, restaurantId = 'r_coimbatore_01') {
  const customer = await getCustomerProfile(phone, restaurantId);
  if (!customer) return [];
  try {
    return await dbAll('SELECT * FROM customer_addresses WHERE customer_id = ? OR phone = ? ORDER BY is_default DESC, id DESC', [customer.id, phone]);
  } catch {
    return await dbAll('SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC', [customer.id]);
  }
}

export async function saveCustomerAddress({ phone, restaurant_id = 'r_coimbatore_01', label = 'Home', spoken_address, landmark = null, formatted_address = null, latitude = null, longitude = null, is_default = 0 }) {
  const customer = await upsertCustomerProfile({ phone, restaurant_id });
  if (is_default) {
    await dbRun('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [customer.id]);
  }
  try {
    return await dbRun(
      `INSERT INTO customer_addresses (customer_id, phone, label, spoken_address, landmark, formatted_address, latitude, longitude, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, phone, label, spoken_address, landmark, formatted_address, latitude, longitude, is_default]
    );
  } catch {
    return await dbRun(
      `INSERT INTO customer_addresses (customer_id, label, spoken_address, landmark, formatted_address, latitude, longitude, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, label, spoken_address, landmark, formatted_address, latitude, longitude, is_default]
    );
  }
}

export async function getLastOrderForPhone(phone, restaurantId = 'r_coimbatore_01') {
  const customer = await getCustomerProfile(phone, restaurantId);
  if (!customer) return null;
  return dbGet('SELECT * FROM orders WHERE customer_id = ? AND restaurant_id = ? ORDER BY created_at DESC LIMIT 1', [customer.id, restaurantId]);
}

export async function saveCallRecording({ call_id, call_sid, audio_path, duration_seconds = 0, dispute_status = 'none' }) {
  return dbRun(
    `INSERT INTO call_recordings (call_id, call_sid, audio_path, duration_seconds, dispute_status)
     VALUES (?, ?, ?, ?, ?)`,
    [call_id, call_sid, audio_path, duration_seconds, dispute_status]
  );
}

export default {
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
  getCustomerProfile,
  upsertCustomerProfile,
  incrementCustomerOrders,
  getSavedAddresses,
  saveCustomerAddress,
  getLastOrderForPhone,
  saveCallRecording,
};
