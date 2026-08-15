import { JobQueue } from './jobQueue.js';
import { sendOrderReceipt, sendPinDropRequest } from '../services/whatsappService.js';
import { storageService } from '../infra/storageService.js';
import { claimIdempotencyKey } from '../infra/idempotencyStore.js';
import { logger } from '../utils/logger.js';

// Dedicated Named Queues for Asynchronous Voice Side Effects
export const notificationQueue = new JobQueue('notifications', { concurrency: 10, maxRetries: 3 });
export const dispatchQueue = new JobQueue('dispatch', { concurrency: 5, maxRetries: 3 });
export const recordingQueue = new JobQueue('recordings', { concurrency: 3, maxRetries: 2 });

/**
 * Register explicit worker processors for all queues with durable idempotency
 */
export function initQueueProcessors() {
  // 1. Notification Processors
  const processNotification = async (data) => {
    const idempotencyKey = data.idempotencyKey || `notif_${data.type || 'receipt'}_${data.orderId || data.phone}`;
    const acquired = await claimIdempotencyKey(idempotencyKey, 'notification', data.tenantId, data.restaurantId);

    if (!acquired) {
      logger.info(`[NotificationQueue] Skipping duplicate notification for idempotency key: ${idempotencyKey}`);
      return { skipped: true, idempotencyKey };
    }

    logger.info(`[NotificationQueue] Processing notification for order #${data.orderId} to ${data.phone}`);

    if (data.type === 'order_receipt' || !data.type) {
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

    return { success: true, idempotencyKey };
  };

  notificationQueue.process('SEND_NOTIFICATION', processNotification);

  // 2. Kitchen / Dispatch Processors
  const processDispatch = async (data) => {
    const idempotencyKey = data.idempotencyKey || `dispatch_${data.orderId}_${data.status || 'pending'}`;
    const acquired = await claimIdempotencyKey(idempotencyKey, 'dispatch', data.tenantId, data.restaurantId);

    if (!acquired) {
      logger.info(`[DispatchQueue] Skipping duplicate dispatch for idempotency key: ${idempotencyKey}`);
      return { skipped: true, idempotencyKey };
    }

    logger.info(`[DispatchQueue] Dispatching order #${data.orderId} (Status: ${data.status || 'confirmed'}) to kitchen`);
    return { success: true, orderId: data.orderId };
  };

  dispatchQueue.process('DISPATCH_ORDER', processDispatch);

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

  logger.info('[Queues] All dedicated queue worker processors initialized.');
}

// Initialize processors immediately
initQueueProcessors();

export function enqueueNotificationJob(type, data, options = {}) {
  return notificationQueue.add(type, data, options);
}

export function enqueueDispatchJob(type, data, options = {}) {
  return dispatchQueue.add(type, data, options);
}

export function enqueueRecordingJob(type, data, options = {}) {
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
