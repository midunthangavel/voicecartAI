import { fetchPendingOutboxEvents, markOutboxEventCompleted, markOutboxEventFailed } from '../services/outbox.service.js';
import { enqueueNotificationJob, enqueueDispatchJob } from '../queue/queueManager.js';
import { broadcastToDashboard } from '../websocket/dashboardWsHandler.js';
import { withLock } from '../infra/lockService.js';
import { logger } from '../utils/logger.js';

let isRunning = false;
let workerTimer = null;

/**
 * Process a single outbox event with distributed lock
 */
async function processOutboxEvent(event) {
  const lockKey = `outbox:${event.id}`;

  await withLock(lockKey, async () => {
    logger.info(`[OutboxWorker] Processing event #${event.id} (${event.event_type}) for aggregate ${event.aggregate_type}:${event.aggregate_id}`);

    switch (event.event_type) {
      case 'ORDER_CONFIRMED': {
        const { orderId, phone, items, total, address, landmark } = event.payload;

        // 1. Enqueue WhatsApp notification job
        if (phone) {
          await enqueueNotificationJob({
            type: 'order_receipt',
            phone,
            orderId,
            items,
            total,
            address,
            landmark,
          });
        }

        // 2. Enqueue Kitchen Dispatch job
        await enqueueDispatchJob({
          orderId,
          restaurantId: event.restaurant_id,
          tenantId: event.tenant_id,
          status: 'confirmed',
          items,
        });

        // 3. Broadcast to Dashboard
        broadcastToDashboard({
          type: 'order_confirmed',
          orderId,
          restaurantId: event.restaurant_id,
          total,
          items,
        });
        break;
      }

      case 'ORDER_STATUS_CHANGED': {
        const { orderId, status, phone } = event.payload;
        broadcastToDashboard({
          type: 'order_status_updated',
          orderId,
          status,
          restaurantId: event.restaurant_id,
        });
        break;
      }

      case 'PIN_LOCATION_CONFIRMED': {
        const { orderId, lat, lng } = event.payload;
        broadcastToDashboard({
          type: 'pin_confirmed',
          orderId,
          lat,
          lng,
          restaurantId: event.restaurant_id,
        });
        break;
      }

      default:
        logger.warn(`[OutboxWorker] Unknown event_type: ${event.event_type}`);
    }

    await markOutboxEventCompleted(event.id);
  }, 5000);
}

/**
 * Single worker poll cycle
 */
export async function pollOutboxQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    const events = await fetchPendingOutboxEvents(10);
    for (const event of events) {
      try {
        await processOutboxEvent(event);
      } catch (err) {
        logger.error(`[OutboxWorker] Event #${event.id} delivery failed:`, err);
        await markOutboxEventFailed(event.id, err.message);
      }
    }
  } catch (err) {
    logger.error('[OutboxWorker] Queue poll error:', err);
  } finally {
    isRunning = false;
  }
}

/**
 * Initialize background outbox poller
 */
export function initOutboxWorker(intervalMs = 3000) {
  if (workerTimer) clearInterval(workerTimer);
  logger.info('[Workers] Transactional Outbox Worker initialized.');
  pollOutboxQueue();
  workerTimer = setInterval(pollOutboxQueue, intervalMs);
  return workerTimer;
}

export default initOutboxWorker;
