import { JobQueue } from './jobQueue.js';

// Dedicated Named Queues for Asynchronous Voice Side Effects
export const notificationQueue = new JobQueue('notifications', { concurrency: 10, maxRetries: 3 });
export const dispatchQueue = new JobQueue('dispatch', { concurrency: 5, maxRetries: 3 });
export const recordingQueue = new JobQueue('recordings', { concurrency: 3, maxRetries: 2 });

export function enqueueNotificationJob(data) {
  return notificationQueue.enqueue(data);
}

export function enqueueDispatchJob(data) {
  return dispatchQueue.enqueue(data);
}

export function enqueueRecordingJob(data) {
  return recordingQueue.enqueue(data);
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
  enqueueNotificationJob,
  enqueueDispatchJob,
  enqueueRecordingJob,
  getAllQueueStats,
};
