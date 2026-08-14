import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

let server;
let BASE_URL;
const TEST_DB = resolve('./test_integration.db');

test.before(async () => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  process.env.DB_PATH = TEST_DB;
  await initDatabase();

  const app = createApp();
  server = createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE_URL = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
});

test('Integration Test: GET /api/stats (Dashboard Statistics)', async () => {
  const res = await fetch(`${BASE_URL}/api/stats`);
  assert.equal(res.status, 200);
  const data = await res.json();
  
  assert.ok('total_calls' in data);
  assert.ok('active_calls' in data);
  assert.ok('confirmed_orders' in data);
  assert.ok('revenue' in data);
});

test('Integration Test: GET /api/catalog (Menu Items)', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog`);
  assert.equal(res.status, 200);
  const items = await res.json();
  
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);
  assert.ok('name' in items[0]);
  assert.ok('price' in items[0]);
});

test('Integration Test: POST /voice (Twilio Voice Webhook)', async () => {
  const res = await fetch(`${BASE_URL}/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=CAtest123&From=%2B919876543210',
  });
  
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(text.includes('/media-stream'));
});

test('Integration Test: POST /api/missed-call (Missed Call Webhook)', async () => {
  const res = await fetch(`${BASE_URL}/api/missed-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: '+919876543210' }),
  });
  
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok('success' in data);
});

test('Integration Test: POST /api/telephony/dtmf (IVR Digit Handler)', async () => {
  const res = await fetch(`${BASE_URL}/api/telephony/dtmf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'Digits=1&Caller=%2B919876543210',
  });
  
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.ok(xml.includes('Repeating your last order'));
});

test('Integration Test: GET /pin/:orderId (Mobile Map Pin Drop Page)', async () => {
  const res = await fetch(`${BASE_URL}/pin/ORD-999?lat=11.006&lng=76.9543`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Confirm Your Location'));
  assert.ok(html.includes('ORD-999'));
});

test('Integration Test: POST /api/pin-confirm (Location Confirmation)', async () => {
  const res = await fetch(`${BASE_URL}/api/pin-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-999', lat: 11.0060, lng: 76.9543 }),
  });
  
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
});
