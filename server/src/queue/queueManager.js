import { JobQueue } from './jobQueue.js';
import { sendOrderReceipt, sendPinDropRequest } from '../services/whatsappService.js';
import { storageService } from '../infra/storageService.js';
import { logger } from '../utils/logger.js';

// Dedicated Named Queues for Asynchronous Voice Side Effects
export const notificationQueue = new JobQueue('notifications', { concurrency: 10, maxRetries: 3 });
export const dispatchQueue = new JobQueue('dispatch', { concurrency: 5, maxRetries: 3 });
export const recordingQueue = new JobQueue('recordings', { concurrency: 3, maxRetries: 2 });

// Idempotency ledger for side-effects
const processedIdempotencyKeys = new Set();

/**
 * Register default worker processors for all queues
 */
export function initQueueProcessors() {
  // 1. Notification Processor
  notificationQueue.process('SEND_NOTIFICATION', async (data) => {
    const idempotencyKey = data.idempotencyKey || `notif_${data.type}_${data.orderId || data.phone}`;
    if (processedIdempotencyKeys.has(idempotencyKey)) {
      logger.info(`[NotificationQueue] Skipping duplicate notification for idempotency key: ${idempotencyKey}`);
      return { skipped: true, idempotencyKey };
    }

    logger.info(`[NotificationQueue] Processing notification for order #${data.orderId} to ${data.phone}`);

    if (data.type === 'order_receipt') {
      await sendOrderReceipt(data.phone, {
        id: data.orderId,
        items: data.items,
        total: data.total,
        address: data.address,
        landmark: data.landmark,
      });
    } else if (data.type === 'pin_drop_request') {
      await sendPinDropRequest(data.phone, data.orderId);
    }

    processedIdempotencyKeys.add(idempotencyKey);
    return { success: true, idempotencyKey };
  });

  // Default fallback handler for notification queue
  notificationQueue.process('__default__', async (data) => {
    return notificationQueue.processors.get('SEND_NOTIFICATION')(data);
  });

  // 2. Kitchen / Dispatch Processor
  dispatchQueue.process('DISPATCH_ORDER', async (data) => {
    const idempotencyKey = data.idempotencyKey || `dispatch_${data.orderId}_${data.status}`;
    if (processedIdempotencyKeys.has(idempotencyKey)) {
      logger.info(`[DispatchQueue] Skipping duplicate dispatch for idempotency key: ${idempotencyKey}`);
      return { skipped: true, idempotencyKey };
    }

    logger.info(`[DispatchQueue] Dispatching order #${data.orderId} (Status: ${data.status}) to kitchen`);
    processedIdempotencyKeys.add(idempotencyKey);
    return { success: true, orderId: data.orderId };
  });

  dispatchQueue.process('__default__', async (data) => {
    return dispatchQueue.processors.get('DISPATCH_ORDER')(data);
  });

  // 3. Audio Recording Storage Processor
  recordingQueue.process('PERSIST_CALL_AUDIO', async (data) => {
    if (data.audioBuffer && data.callId) {
      logger.info(`[RecordingQueue] Persisting audio recording for call #${data.callId}`);
      await storageService.saveAudio(data.audioBuffer, {
        callId: data.callId,
        tenantId: data.tenantId,
        restaurantId: data.restaurantId,
      });
    }
    return { success: true, callId: data.callId };
  });

  recordingQueue.process('__default__', async (data) => {
    return recordingQueue.processors.get('PERSIST_CALL_AUDIO')(data);
  });

  logger.info('[Queues] All dedicated queue worker processors initialized.');
}

// Initialize processors immediately
initQueueProcessors();

export function enqueueNotificationJob(data, options = {}) {
  const type = data.type ? 'SEND_NOTIFICATION' : '__default__';
  return notificationQueue.add(type, data, options);
}

export function enqueueDispatchJob(data, options = {}) {
  const type = data.type ? 'DISPATCH_ORDER' : '__default__';
  return dispatchQueue.add(type, data, options);
}

export function enqueueRecordingJob(data, options = {}) {
  const type = data.type ? 'PERSIST_CALL_AUDIO' : '__default__';
  return recordingQueue.add(type, data, options);
}

export function getAllQueueStats() {
  return {
    notifications: notificationQueue.getStats(),
    dispatch: dispatchQueue.getStats(),
    recordings: recordingQueue.getStats(),
  };
}

export default {
  notificationQueue,
  dispatchQueue,
  recordingQueue,
  initQueueProcessors,
  enqueueNotificationJob,
  enqueueDispatchJob,
  enqueueRecordingJob,
  getAllQueueStats,
};
