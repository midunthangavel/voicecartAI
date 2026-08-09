/**
 * SQLite Database Layer
 * Tables: merchants, catalog, calls, orders, call_logs,
 *         customer_profiles, customer_addresses, call_recordings, scheduled_orders
 */

import sqlite3Pkg from 'sqlite3';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const sqlite3 = sqlite3Pkg.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.DB_PATH || resolve(__dirname, '..', 'voicecart.db');

let db;

export function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('[DB] Connection error:', err.message);
      else console.log('[DB] Connected to', DB_PATH);
    });
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

export function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = getDb();

    db.serialize(() => {
      // ── Merchants ──
      db.run(`
        CREATE TABLE IF NOT EXISTS merchants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          address TEXT,
          pos_provider TEXT DEFAULT 'direct',
          pos_api_key TEXT,
          ondc_provider_id TEXT,
          active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Catalog (menu items) ──
      db.run(`
        CREATE TABLE IF NOT EXISTS catalog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          merchant_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          name_tamil TEXT,
          category TEXT DEFAULT 'food',
          price REAL NOT NULL,
          variants TEXT DEFAULT '{}',
          stt_hints TEXT DEFAULT '[]',
          dietary_tags TEXT DEFAULT '[]',
          is_special INTEGER DEFAULT 0,
          available INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (merchant_id) REFERENCES merchants(id)
        )
      `);

      // ── Calls ──
      db.run(`
        CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_sid TEXT UNIQUE,
          caller_phone TEXT,
          source TEXT DEFAULT 'twilio',
          status TEXT DEFAULT 'active',
          language TEXT DEFAULT 'en-IN',
          session_state TEXT DEFAULT '{}',
          transcript TEXT DEFAULT '[]',
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ended_at DATETIME,
          duration_seconds INTEGER DEFAULT 0,
          latency_avg_ms INTEGER DEFAULT 0
        )
      `);

      // ── Orders ──
      db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_id INTEGER,
          merchant_id INTEGER,
          caller_phone TEXT,
          items TEXT NOT NULL DEFAULT '[]',
          total_amount REAL DEFAULT 0,
          delivery_address TEXT,
          status TEXT DEFAULT 'pending',
          dispatch_mode TEXT DEFAULT 'direct',
          ondc_order_id TEXT,
          payment_link TEXT,
          payment_status TEXT DEFAULT 'pending',
          sms_sent INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (call_id) REFERENCES calls(id),
          FOREIGN KEY (merchant_id) REFERENCES merchants(id)
        )
      `);

      // ── Call Logs (detailed event log per call) ──
      db.run(`
        CREATE TABLE IF NOT EXISTS call_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          direction TEXT DEFAULT 'system',
          content TEXT,
          latency_ms INTEGER,
          metadata TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (call_id) REFERENCES calls(id)
        )
      `);

      // ── Customer Profiles ──
      db.run(`
        CREATE TABLE IF NOT EXISTS customer_profiles (
          phone TEXT PRIMARY KEY,
          name TEXT,
          preferred_language TEXT DEFAULT 'mixed',
          dietary_preference TEXT DEFAULT 'none',
          total_orders INTEGER DEFAULT 0,
          last_order_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Customer Addresses (Landmark Geocoded) ──
      db.run(`
        CREATE TABLE IF NOT EXISTS customer_addresses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT NOT NULL,
          label TEXT DEFAULT 'Home',
          spoken_address TEXT,
          landmark TEXT,
          formatted_address TEXT,
          latitude REAL,
          longitude REAL,
          is_default INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(phone, label)
        )
      `);

      // ── Call Recordings (Dispute Resolution) ──
      db.run(`
        CREATE TABLE IF NOT EXISTS call_recordings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_id INTEGER NOT NULL,
          call_sid TEXT,
          audio_path TEXT NOT NULL,
          duration_seconds INTEGER DEFAULT 0,
          transcript_summary TEXT,
          dispute_status TEXT DEFAULT 'clean',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (call_id) REFERENCES calls(id)
        )
      `);

      // ── Scheduled Orders ──
      db.run(`
        CREATE TABLE IF NOT EXISTS scheduled_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER,
          caller_phone TEXT NOT NULL,
          items TEXT NOT NULL DEFAULT '[]',
          delivery_address TEXT,
          scheduled_for DATETIME NOT NULL,
          status TEXT DEFAULT 'scheduled',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id)
        )
      `);

      // ── Seed a demo merchant ──
      db.get('SELECT COUNT(*) as count FROM merchants', (err, row) => {
        if (!err && row.count === 0) {
          db.run(`
            INSERT INTO merchants (name, phone, address, pos_provider)
            VALUES ('Anbu Biryani House', '+919876543210', '123 Avinashi Road, Coimbatore', 'direct')
          `, function (err) {
            if (err) return;
            const merchantId = this.lastID;
            const items = [
              ['Chicken Biryani', 'சிக்கன் பிரியாணி', 'biryani', 220, '{"size":["regular","family"]}', '["chicken biryani","chiken biriyani","kozhi biryani"]'],
              ['Mutton Biryani', 'மட்டன் பிரியாணி', 'biryani', 280, '{"size":["regular","family"]}', '["mutton biryani","aatu biryani"]'],
              ['Paneer Butter Masala', 'பன்னீர் பட்டர் மசாலா', 'curry', 180, '{"spice":["mild","medium","spicy"]}', '["paneer butter masala","paneer masala"]'],
              ['Butter Naan', 'பட்டர் நான்', 'bread', 45, '{}', '["butter naan","naan","nan"]'],
              ['Garlic Naan', 'கார்லிக் நான்', 'bread', 55, '{}', '["garlic naan","poondu naan"]'],
              ['Kothu Parotta', 'கொத்து பரோட்டா', 'main', 150, '{"type":["egg","chicken","veg"]}', '["kothu parotta","kothu porotta","kotthu"]'],
              ['Thums Up', 'தம்ஸ் அப்', 'beverage', 40, '{"size":["300ml","600ml"]}', '["thums up","thumbs up","thumps up"]'],
              ['Masala Chai', 'மசாலா டீ', 'beverage', 30, '{}', '["masala chai","tea","chai"]'],
              ['Gulab Jamun', 'குலாப் ஜாமூன்', 'dessert', 60, '{}', '["gulab jamun","gulab jamoon"]'],
              ['Chicken 65', 'சிக்கன் 65', 'starter', 170, '{}', '["chicken 65","chicken sixty five"]'],
            ];
            const stmt = db.prepare(`
              INSERT INTO catalog (merchant_id, name, name_tamil, category, price, variants, stt_hints)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const item of items) {
              stmt.run(merchantId, ...item);
            }
            stmt.finalize();
            console.log('[DB] Seeded demo merchant and catalog');
          });
        }
      });
    });

    resolve();
  });
}

// ══════════════════════════════════════════════
// ── Generic Query Helpers ──
// ══════════════════════════════════════════════

export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ══════════════════════════════════════════════
// ── Domain Query Helpers ──
// ══════════════════════════════════════════════

/**
 * Get all saved addresses for a caller (sorted by is_default desc)
 */
export async function getSavedAddresses(phone) {
  return dbAll(
    'SELECT * FROM customer_addresses WHERE phone = ? ORDER BY is_default DESC, created_at DESC',
    [phone]
  );
}

/**
 * Save or update a customer address (upsert by phone + label)
 */
export async function saveCustomerAddress({ phone, label = 'Home', spoken_address, landmark, formatted_address, latitude, longitude, is_default = 0 }) {
  return dbRun(
    `INSERT INTO customer_addresses (phone, label, spoken_address, landmark, formatted_address, latitude, longitude, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(phone, label) DO UPDATE SET
       spoken_address = excluded.spoken_address,
       landmark = excluded.landmark,
       formatted_address = excluded.formatted_address,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       is_default = excluded.is_default`,
    [phone, label, spoken_address, landmark, formatted_address, latitude, longitude, is_default]
  );
}

/**
 * Get customer profile by phone number
 */
export async function getCustomerProfile(phone) {
  return dbGet('SELECT * FROM customer_profiles WHERE phone = ?', [phone]);
}

/**
 * Create or update customer profile (upsert by phone)
 */
export async function upsertCustomerProfile({ phone, name, preferred_language, dietary_preference }) {
  return dbRun(
    `INSERT INTO customer_profiles (phone, name, preferred_language, dietary_preference)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET
       name = COALESCE(excluded.name, customer_profiles.name),
       preferred_language = COALESCE(excluded.preferred_language, customer_profiles.preferred_language),
       dietary_preference = COALESCE(excluded.dietary_preference, customer_profiles.dietary_preference)`,
    [phone, name || null, preferred_language || 'mixed', dietary_preference || 'none']
  );
}

/**
 * Get the most recent order for a phone number (for "Repeat Last Order")
 */
export async function getLastOrderForPhone(phone) {
  return dbGet(
    `SELECT o.*, c.transcript FROM orders o
     LEFT JOIN calls c ON o.call_id = c.id
     WHERE o.caller_phone = ? AND o.status = 'confirmed'
     ORDER BY o.created_at DESC LIMIT 1`,
    [phone]
  );
}

/**
 * Save a call recording entry for dispute resolution
 */
export async function saveCallRecording({ call_id, call_sid, audio_path, duration_seconds, transcript_summary }) {
  return dbRun(
    `INSERT INTO call_recordings (call_id, call_sid, audio_path, duration_seconds, transcript_summary)
     VALUES (?, ?, ?, ?, ?)`,
    [call_id, call_sid || null, audio_path, duration_seconds || 0, transcript_summary || null]
  );
}

/**
 * Increment the customer's total_orders counter and set last_order_at
 */
export async function incrementCustomerOrders(phone) {
  return dbRun(
    `UPDATE customer_profiles SET total_orders = total_orders + 1, last_order_at = CURRENT_TIMESTAMP WHERE phone = ?`,
    [phone]
  );
}
