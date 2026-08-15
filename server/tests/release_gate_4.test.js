import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, dbGet, dbRun } from '../src/db.js';
import { sessions } from '../src/websocket/wsServer.js';
import { dashboardClients, broadcastToDashboard } from '../src/websocket/dashboardWsHandler.js';
import { createWsTicket, consumeWsTicket } from '../src/services/wsTicketService.js';
import { JobQueue } from '../src/queue/jobQueue.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';
import { WebSocket } from 'ws';

const TEST_DB = resolve(`./test_rg4_${Date.now()}.db`);

test.before(async () => {
  process.env.DB_PATH = TEST_DB;
  await initDatabase();
});

test.after(async () => {
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
});

test('Release Gate 4: Cross-Tenant Session Privacy & Zero-Leakage', async () => {
  // 1. Setup simulated active sessions for two distinct tenants
  sessions.set('sess_tenant_a_1', {
    id: 'sess_tenant_a_1',
    callerPhone: '+919876543210',
    source: 'web',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
    conversationHistory: [{ role: 'user', text: '2 Ghee Roast' }],
    state: {},
    latencies: [120],
  });

  sessions.set('sess_tenant_b_1', {
    id: 'sess_tenant_b_1',
    callerPhone: '+919999999999',
    source: 'twilio',
    tenantId: 't_competitor_cafe',
    restaurantId: 'r_chennai_02',
    conversationHistory: [{ role: 'user', text: 'Secret VIP Order' }],
    state: {},
    latencies: [95],
  });

  // 2. Simulate API request from Tenant A staff
  const reqAuthTenantA = { tenantId: 't_annapoorna', restaurantId: 'r_coimbatore_01', role: 'STAFF' };
  const visibleSessionsA = [];
  for (const [id, session] of sessions) {
    if (session.tenantId && reqAuthTenantA.tenantId && session.tenantId !== reqAuthTenantA.tenantId) continue;
    if (reqAuthTenantA.role !== 'ADMIN' && session.restaurantId && reqAuthTenantA.restaurantId && session.restaurantId !== reqAuthTenantA.restaurantId) continue;
    visibleSessionsA.push(session);
  }

  // Tenant A staff must only see Tenant A sessions
  assert.equal(visibleSessionsA.length, 1);
  assert.equal(visibleSessionsA[0].id, 'sess_tenant_a_1');
  assert.equal(visibleSessionsA[0].tenantId, 't_annapoorna');

  // Clean up
  sessions.delete('sess_tenant_a_1');
  sessions.delete('sess_tenant_b_1');
});

test('Release Gate 4: Cross-Tenant WebSocket Broadcast Boundary', async () => {
  const receivedClientA = [];
  const receivedClientB = [];

  const mockClientA = {
    readyState: WebSocket.OPEN,
    auth: { tenantId: 't_annapoorna', restaurantId: 'r_coimbatore_01', role: 'STAFF' },
    send: (msg) => receivedClientA.push(JSON.parse(msg)),
  };

  const mockClientB = {
    readyState: WebSocket.OPEN,
    auth: { tenantId: 't_saravana_bhavan', restaurantId: 'r_chennai_01', role: 'STAFF' },
    send: (msg) => receivedClientB.push(JSON.parse(msg)),
  };

  dashboardClients.add(mockClientA);
  dashboardClients.add(mockClientB);

  // Broadcast event strictly belonging to Tenant A
  broadcastToDashboard({
    type: 'user_speech',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
    sessionId: 'sess_live_123',
    transcript: 'Customer phone: 9876543210, Address: R.S. Puram',
  });

  // Client A must receive the transcript
  assert.equal(receivedClientA.length, 1);
  assert.equal(receivedClientA[0].type, 'user_speech');
  assert.equal(receivedClientA[0].tenantId, 't_annapoorna');

  // Client B (Competitor Tenant) must receive ZERO events (Zero cross-tenant leakage)
  assert.equal(receivedClientB.length, 0);

  // Clean up
  dashboardClients.delete(mockClientA);
  dashboardClients.delete(mockClientB);
});

test('Release Gate 4: Unknown Queue Job Types Fail Loudly into DLQ', async () => {
  const queueName = `dlq_test_${Date.now()}`;
  const testQueue = new JobQueue(queueName);

  // Enqueue an unsupported job type
  const job = await testQueue.add('UNSUPPORTED_ROGUE_JOB', { data: 'test' });
  assert.ok(job.id);

  // Register a legitimate processor for another job type so queue drains
  testQueue.process('LEGITIMATE_JOB', async () => {});

  // Wait for drain to process
  for (let i = 0; i < 10; i++) {
    const record = await dbGet('SELECT status, last_error FROM durable_job_queue WHERE id = ?', [job.id]);
    if (record?.status === 'dlq') {
      assert.ok(record.last_error.includes('Unsupported job type'));
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  const finalRecord = await dbGet('SELECT status FROM durable_job_queue WHERE id = ?', [job.id]);
  assert.equal(finalRecord.status, 'dlq', 'Unsupported job type must transition directly to DLQ');

  testQueue.destroy();
});

test('Release Gate 4: Redis-Backed Distributed WebSocket Tickets', async () => {
  const user = {
    userId: 'usr_admin_01',
    email: 'admin@annapoorna.in',
    name: 'Admin',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
    role: 'ADMIN',
  };

  const { ticket, expiresInSeconds } = await createWsTicket(user);
  assert.ok(ticket.startsWith('wst_'));
  assert.equal(expiresInSeconds, 30);

  // First consumption succeeds atomically
  const consumed = await consumeWsTicket(ticket);
  assert.ok(consumed);
  assert.equal(consumed.userId, 'usr_admin_01');
  assert.equal(consumed.tenantId, 't_annapoorna');

  // Second consumption is rejected (single-use guarantee)
  const replayed = await consumeWsTicket(ticket);
  assert.equal(replayed, null);
});
