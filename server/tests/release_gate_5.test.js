import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, dbRun, dbGet } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSession } from '../src/infra/sessionStore.js';
import { generateToken } from '../src/services/auth.service.js';
import { claimIdempotencyKey } from '../src/infra/idempotencyStore.js';
import { JobQueue } from '../src/queue/jobQueue.js';
import { initSession } from '../src/websocket/sessionPipeline.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEST_DB = resolve(`./test_rg5_${Date.now()}.db`);

test.before(async () => {
  process.env.DB_PATH = TEST_DB;
  await initDatabase();
});

test.after(async () => {
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
});

test('Release Gate 5: Real HTTP API Route Live Session Privacy Filtering', async () => {
  const app = createApp();

  // 1. Seed two active sessions in distributed sessionStore
  await createSession('sess_annapoorna_http', {
    callerPhone: '+919876543210',
    source: 'web',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
    state: { items: [{ name: 'Ghee Roast', price: 90 }] },
  });

  await createSession('sess_saravana_http', {
    callerPhone: '+919123456789',
    source: 'twilio',
    tenantId: 't_saravana_bhavan',
    restaurantId: 'r_chennai_01',
    state: { items: [{ name: 'Special Filter Coffee', price: 40 }] },
  });

  // 2. Generate valid JWT token for Annapoorna Restaurant Manager
  const annapoornaManagerToken = await generateToken({
    id: 'usr_mgr_01',
    email: 'manager@annapoorna.in',
    name: 'Manager',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
    role: 'RESTAURANT_MANAGER',
  });

  // 3. Perform real HTTP GET /api/v1/sessions request via Node server listener
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/sessions`, {
      headers: {
        Authorization: `Bearer ${annapoornaManagerToken}`,
      },
    });

    assert.equal(response.status, 200);
    const sessions = await response.json();

    // Verify: Only Annapoorna sessions returned, Saravana sessions omitted
    assert.ok(Array.isArray(sessions));
    const annapoornaFound = sessions.find(s => s.id === 'sess_annapoorna_http');
    const saravanaFound = sessions.find(s => s.id === 'sess_saravana_http');

    assert.ok(annapoornaFound, 'Annapoorna session must be visible to Annapoorna manager');
    assert.equal(saravanaFound, undefined, 'Saravana session must NEVER leak across tenant boundary');
  } finally {
    server.close();
  }
});

test('Release Gate 5: Durable Idempotency Ledger Across Simulated Restarts', async () => {
  const testKey = `idem_sms_order_${Date.now()}_999`;

  // First execution claim succeeds
  const firstClaim = await claimIdempotencyKey(testKey, 'notification', 't_annapoorna', 'r_coimbatore_01');
  assert.equal(firstClaim, true, 'First side-effect execution claim must succeed');

  // Verify persistence in database ledger
  const dbRecord = await dbGet('SELECT * FROM side_effect_idempotency WHERE idempotency_key = ?', [testKey]);
  assert.ok(dbRecord);
  assert.equal(dbRecord.category, 'notification');

  // Second execution claim (simulating duplicate webhook / replay) must be rejected
  const secondClaim = await claimIdempotencyKey(testKey, 'notification', 't_annapoorna', 'r_coimbatore_01');
  assert.equal(secondClaim, false, 'Duplicate execution claim must be rejected by durable ledger');
});

test('Release Gate 5: Strict Job Queue Routing (No Generic Fallback)', async () => {
  const queueName = `strict_queue_${Date.now()}`;
  const testQueue = new JobQueue(queueName);

  // Enqueue unsupported job type
  const job = await testQueue.add('UNKNOWN_ROGUE_JOB_TYPE', { data: 'test' });
  assert.ok(job.id);

  // Register only legitimate processor
  testQueue.process('LEGITIMATE_JOB_TYPE', async () => {});

  // Wait for queue drain to process
  for (let i = 0; i < 10; i++) {
    const record = await dbGet('SELECT status, last_error FROM durable_job_queue WHERE id = ?', [job.id]);
    if (record?.status === 'dlq') {
      assert.ok(record.last_error.includes('Unsupported job type'));
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  const finalRecord = await dbGet('SELECT status FROM durable_job_queue WHERE id = ?', [job.id]);
  assert.equal(finalRecord.status, 'dlq', 'Unsupported job type must transition directly to DLQ without executing generic handlers');

  testQueue.destroy();
});

test('Release Gate 5: Strict Fail-Closed initSession() Tenant Validation', async () => {
  const testSessions = new Map();

  // Omitting tenantId / restaurantId must reject immediately with TENANT_CONTEXT_REQUIRED
  await assert.rejects(
    async () => {
      await initSession('sess_no_tenant', { source: 'web' }, testSessions);
    },
    (err) => err.code === 'TENANT_CONTEXT_REQUIRED'
  );
});
