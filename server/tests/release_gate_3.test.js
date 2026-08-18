import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, dbRun, dbGet } from '../src/db.js';
import { JobQueue } from '../src/queue/jobQueue.js';
import { createOrderWithSnapshots, getRecentOrders } from '../src/domain/orders/order.repository.js';
import { getActiveCatalogItems } from '../src/domain/catalog/catalog.repository.js';
import { createStreamTicket, consumeStreamTicket } from '../src/services/wsTicketService.js';
import { rotateRefreshToken } from '../src/services/auth.service.js';
import { SignJWT } from 'jose';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEST_DB = resolve(`./test_rg3_${Date.now()}.db`);
const JWT_KEY = new TextEncoder().encode('voicecart_development_jwt_secret_coimbatore_2026_minimum_32_characters');

test.before(async () => {
  process.env.DB_PATH = TEST_DB;
  await initDatabase();
});

test.after(async () => {
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
});

test('Release Gate 3: Signed Telephony Stream Tickets (Twilio/Exotel)', async () => {
  const streamTicket = await createStreamTicket({
    callSid: 'CA_test_call_123',
    callerPhone: '+919876543210',
    provider: 'twilio',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
  });

  assert.ok(streamTicket.startsWith('strm_'));

  // First consumption succeeds
  const meta = await consumeStreamTicket(streamTicket);
  assert.ok(meta);
  assert.equal(meta.callSid, 'CA_test_call_123');
  assert.equal(meta.provider, 'twilio');

  // Second consumption is rejected (single-use security guarantee)
  const replayed = await consumeStreamTicket(streamTicket);
  assert.equal(replayed, null);
});

test('Release Gate 3: Strict Fail-Closed Tenant Context across Repositories', async () => {
  // 1. Order create fails closed
  await assert.rejects(
    async () => {
      await createOrderWithSnapshots({ total_amount: 100 }, []);
    },
    (err) => err.code === 'TENANT_CONTEXT_REQUIRED'
  );

  // 2. Order query fails closed
  await assert.rejects(
    async () => {
      await getRecentOrders({});
    },
    (err) => err.code === 'TENANT_CONTEXT_REQUIRED'
  );

  // 3. Catalog query fails closed
  await assert.rejects(
    async () => {
      await getActiveCatalogItems({});
    },
    (err) => err.code === 'TENANT_CONTEXT_REQUIRED'
  );
});

test('Release Gate 3: Refresh Token JTI Record Existence Enforced', async () => {
  // Generate a cryptographically valid token whose JTI is NOT in refresh_tokens table
  const unpersistedToken = await new SignJWT({
    sub: 'usr_admin_01',
    jti: 'jti_unregistered_attack_token',
    type: 'REFRESH',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('voicecart-api')
    .setAudience('voicecart-dashboard')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_KEY);

  // Attempting to rotate an unregistered JTI must fail with INVALID_REFRESH_TOKEN
  await assert.rejects(
    async () => {
      await rotateRefreshToken(unpersistedToken);
    },
    (err) => err.code === 'INVALID_REFRESH_TOKEN'
  );
});

test('Release Gate 3: Database-Backed Durable Queue Worker Crash & Recovery', async () => {
  const queueName = `crash_test_${Date.now()}`;
  const producerQueue = new JobQueue(queueName);

  // 1. Enqueue job into database (status: pending)
  const job = await producerQueue.add('DURABLE_PAYMENT_SYNC', { orderId: 'ORD-CRASH-777', amount: 850 });
  assert.ok(job.id);
  producerQueue.destroy(); // Simulate worker process death

  // 2. Verify job is persisted in database
  const dbJob = await dbGet('SELECT * FROM durable_job_queue WHERE id = ?', [job.id]);
  assert.ok(dbJob);

  // 3. Start a new worker instance (simulating process restart)
  const restartedWorkerQueue = new JobQueue(queueName);
  let processedData = null;

  restartedWorkerQueue.process('DURABLE_PAYMENT_SYNC', async (data) => {
    processedData = data;
  });

  // Wait for restarted worker to claim and process the job
  for (let i = 0; i < 10; i++) {
    if (processedData) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  assert.ok(processedData, 'Restarted worker should have claimed and processed the job from database');
  assert.equal(processedData.orderId, 'ORD-CRASH-777');
  assert.equal(processedData.amount, 850);

  // 4. Verify job status updated to completed in database
  const completedJob = await dbGet('SELECT status FROM durable_job_queue WHERE id = ?', [job.id]);
  assert.equal(completedJob.status, 'completed');

  restartedWorkerQueue.destroy();
});
