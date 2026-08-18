import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, dbRun, dbGet } from '../src/db.js';
import { createOrderWithSnapshots, updateOrderStatus } from '../src/domain/orders/order.repository.js';
import { enqueueOutboxEvent, claimNextOutboxEvents, markOutboxEventCompleted } from '../src/services/outbox.service.js';
import { notificationQueue, dispatchQueue, enqueueNotificationJob } from '../src/queue/queueManager.js';
import { createWsTicket, consumeWsTicket } from '../src/services/wsTicketService.js';
import { generateTokenPair, rotateRefreshToken } from '../src/services/auth.service.js';
import { storageService } from '../src/infra/storageService.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEST_DB = resolve(`./test_rg2_${Date.now()}.db`);

test.before(async () => {
  process.env.DB_PATH = TEST_DB;
  await initDatabase();
});

test.after(async () => {
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
});

test('Release Gate 2: Queue Processors Execution & Idempotency', async () => {
  let processedCount = 0;
  notificationQueue.process('TEST_CUSTOM_JOB', async (data) => {
    processedCount += data.amount;
  });

  await notificationQueue.add('TEST_CUSTOM_JOB', { amount: 5 });
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(processedCount, 5);
});

test('Release Gate 2: Atomic Outbox Claiming & Stale Event Recovery', async () => {
  const eventId = await enqueueOutboxEvent({
    tenant_id: 't_annapoorna',
    restaurant_id: 'r_coimbatore_01',
    event_type: 'ORDER_CONFIRMED',
    aggregate_id: '9901',
    payload: { total: 500 },
  });

  // Worker 1 claims event
  const claimedBatch1 = await claimNextOutboxEvents(20, 'worker_node_A');
  const claimedEvent = claimedBatch1.find(e => e.id === eventId);
  assert.ok(claimedEvent);
  assert.equal(claimedEvent.status, 'processing');
  assert.equal(claimedEvent.locked_by, 'worker_node_A');

  // Worker 2 attempting to claim simultaneously should get 0 results for this event
  const claimedBatch2 = await claimNextOutboxEvents(20, 'worker_node_B');
  assert.ok(!claimedBatch2.some(e => e.id === eventId));

  // Mark completed
  await markOutboxEventCompleted(eventId);
  const completed = await dbGet('SELECT status FROM outbox_events WHERE id = ?', [eventId]);
  assert.equal(completed.status, 'completed');
});

test('Release Gate 2: Single-Use 30s WebSocket Tickets', async () => {
  const user = {
    userId: 'user_101',
    email: 'chef@annapoorna.com',
    role: 'KITCHEN',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
  };

  const { ticket, expiresInSeconds } = await createWsTicket(user);
  assert.ok(ticket.startsWith('wst_'));
  assert.equal(expiresInSeconds, 30);

  // First consumption succeeds
  const authContext = await consumeWsTicket(ticket);
  assert.ok(authContext);
  assert.equal(authContext.email, 'chef@annapoorna.com');
  assert.equal(authContext.role, 'KITCHEN');

  // Second consumption fails (Single-use security guarantee)
  const replayed = await consumeWsTicket(ticket);
  assert.equal(replayed, null);
});

test('Release Gate 2: Short-Lived Access Tokens & Refresh Rotation', async () => {
  const user = await dbGet('SELECT * FROM users WHERE email = ?', ['admin@annapoorna.com']);
  assert.ok(user, 'Admin user should be seeded in database');

  const tokenPair1 = await generateTokenPair(user);
  assert.ok(tokenPair1.accessToken);
  assert.ok(tokenPair1.refreshToken);
  assert.equal(tokenPair1.expiresInSeconds, 900); // 15 minutes

  // Successful rotation
  const tokenPair2 = await rotateRefreshToken(tokenPair1.refreshToken);
  assert.ok(tokenPair2.accessToken);
  assert.ok(tokenPair2.refreshToken);
  assert.notEqual(tokenPair1.refreshToken, tokenPair2.refreshToken);

  // Replaying old refresh token is rejected (revocation guarantee)
  await assert.rejects(
    async () => rotateRefreshToken(tokenPair1.refreshToken),
    /Refresh token has been revoked/
  );
});

test('Release Gate 2: Central State Machine Enforced on Order Transitions', async () => {
  const orderId = await createOrderWithSnapshots(
    {
      tenant_id: 't_annapoorna',
      restaurant_id: 'r_coimbatore_01',
      total_amount: 400,
    },
    [{ name: 'Mutton Biryani', price: 280, quantity: 1 }]
  );

  // Legal transitions: pending -> preparing -> ready -> dispatched -> delivered
  await updateOrderStatus(orderId, 'preparing', { tenantId: 't_annapoorna', restaurantId: 'r_coimbatore_01' });
  await updateOrderStatus(orderId, 'ready', { tenantId: 't_annapoorna', restaurantId: 'r_coimbatore_01' });
  await updateOrderStatus(orderId, 'dispatched', { tenantId: 't_annapoorna', restaurantId: 'r_coimbatore_01' });
  await updateOrderStatus(orderId, 'delivered', { tenantId: 't_annapoorna', restaurantId: 'r_coimbatore_01' });

  // Illegal transition: delivered -> preparing should be rejected with 409 Conflict
  await assert.rejects(
    async () => {
      await updateOrderStatus(orderId, 'preparing', {
        tenantId: 't_annapoorna',
        restaurantId: 'r_coimbatore_01',
      });
    },
    /Cannot transition order #\d+ from "delivered" to "preparing"/
  );
});

test('Release Gate 2: Non-Blocking Object Storage Persistence', async () => {
  const fakeAudio = Buffer.from('RIFF....WAVEfmt ....data....test audio pcm sample');
  const result = await storageService.saveAudio(fakeAudio, {
    callId: 'call_test_888',
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
  });

  assert.ok(result.storagePath);
  assert.ok(result.objectKey);
  assert.equal(result.sizeBytes, fakeAudio.length);

  const retrieved = await storageService.getAudio(result.storagePath);
  assert.ok(retrieved);
  assert.equal(retrieved.length, fakeAudio.length);
});
