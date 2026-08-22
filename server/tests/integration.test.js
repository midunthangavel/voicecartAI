import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

let server;
let BASE_URL;
let authToken;
const TEST_DB = resolve(`./test_integ_${Date.now()}.db`);

async function getAuthToken() {
  if (authToken) return authToken;
  const authRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@annapoorna.com', password: 'Annapoorna@123' }),
  });
  const authData = await authRes.json();
  if (!authRes.ok) {
    throw new Error(`Login failed in test: ${JSON.stringify(authData)}`);
  }
  authToken = authData.token || authData.accessToken;
  return authToken;
}

test.before(async () => {
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

  await getAuthToken();
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(`${TEST_DB}-wal`)) unlinkSync(`${TEST_DB}-wal`);
    if (existsSync(`${TEST_DB}-shm`)) unlinkSync(`${TEST_DB}-shm`);
  } catch {}
});

test('Integration Test: GET /api/stats (Authenticated Dashboard Statistics)', async () => {
  const token = await getAuthToken();
  const res = await fetch(`${BASE_URL}/api/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  
  assert.ok('total_calls' in data);
  assert.ok('active_calls' in data);
  assert.ok('confirmed_orders' in data);
  assert.ok('revenue' in data);
});

test('Integration Test: GET /api/stats without token returns 401', async () => {
  const res = await fetch(`${BASE_URL}/api/stats`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'AUTH_REQUIRED');
});

test('Integration Test: GET /api/catalog (Public Menu Items)', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog?tenant_id=t_annapoorna&restaurant_id=r_coimbatore_01`);
  assert.equal(res.status, 200);
  const items = await res.json();
  
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);
  assert.ok('name' in items[0]);
  assert.ok('price' in items[0]);
});

test('Integration Test: POST /voice requires telephony signature (returns 403)', async () => {
  const res = await fetch(`${BASE_URL}/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=CAtest123&From=%2B919876543210',
  });
  
  // Telephony endpoints now require valid provider signatures (Phase 1.2)
  assert.equal(res.status, 403);
});

test('Integration Test: POST /api/missed-call requires telephony signature (returns 403)', async () => {
  const res = await fetch(`${BASE_URL}/api/missed-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: '+919876543210' }),
  });
  
  // Missed-call endpoints now require valid provider signatures (Phase 1.2)
  assert.equal(res.status, 403);
});

test('Integration Test: POST /api/telephony/dtmf requires telephony signature (returns 403)', async () => {
  const res = await fetch(`${BASE_URL}/api/telephony/dtmf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'Digits=1&Caller=%2B919876543210',
  });
  
  // DTMF endpoints now require valid provider signatures (Phase 1.2)
  assert.equal(res.status, 403);
});

test('Integration Test: GET /pin/:orderId (Mobile Map Pin Drop Page)', async () => {
  const res = await fetch(`${BASE_URL}/pin/ORD-999?lat=11.006&lng=76.9543`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Confirm Your Delivery Location'));
  assert.ok(html.includes('ORD-999'));
});

test('Integration Test: POST /api/pin-confirm requires token field (returns 400)', async () => {
  const res = await fetch(`${BASE_URL}/api/pin-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-999', lat: 11.0060, lng: 76.9543 }),
  });
  
  // Pin-confirm now requires a valid 'token' field, not raw orderId (Phase 1.3)
  assert.equal(res.status, 400);
});

test('Integration Test: Zod Schema validation rejects malformed order status update', async () => {
  const token = await getAuthToken();
  const res = await fetch(`${BASE_URL}/api/orders/1`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: 'invalid_status_xyz' }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});
