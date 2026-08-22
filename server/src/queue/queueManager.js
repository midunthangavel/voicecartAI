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
  // Accepts audioBuffer (Base64-encoded string from sessionPipeline) or audioBase64
  recordingQueue.process('PERSIST_CALL_AUDIO', async (data) => {
    const audioData = data.audioBuffer || data.audioBase64;
    if (audioData && data.callId) {
      logger.info(`[RecordingQueue] Persisting audio recording for call #${data.callId}`);
      const audioBuffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData, 'base64');
      await storageService.saveAudio(audioBuffer, {
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

export function enqueueNotificationJob(typeOrData, data = {}, options = {}) {
  if (typeof typeOrData === 'string') {
    return notificationQueue.add(typeOrData, data, options);
  }
  const jobType = (typeOrData && typeOrData.jobType) || 'SEND_NOTIFICATION';
  return notificationQueue.add(jobType, typeOrData, data || options);
}

export function enqueueDispatchJob(typeOrData, data = {}, options = {}) {
  if (typeof typeOrData === 'string') {
    return dispatchQueue.add(typeOrData, data, options);
  }
  const jobType = (typeOrData && typeOrData.jobType) || typeOrData.type || 'DISPATCH_ORDER';
  return dispatchQueue.add(jobType, typeOrData, data || options);
}

export function enqueueRecordingJob(typeOrData, data = {}, options = {}) {
  if (typeof typeOrData === 'string') {
    return recordingQueue.add(typeOrData, data, options);
  }
  const jobType = (typeOrData && typeOrData.jobType) || typeOrData.type || 'PERSIST_CALL_AUDIO';
  return recordingQueue.add(jobType, typeOrData, data || options);
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
