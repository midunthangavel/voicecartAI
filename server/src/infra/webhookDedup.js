import { dbRun } from '../db.js';
import { logger } from '../utils/logger.js';

/**
 * Webhook Deduplication Service
 *
 * Prevents duplicate processing of webhooks from external providers
 * (Razorpay, Twilio, Exotel) by recording processed event IDs in the
 * processed_webhooks table (created in migration 009).
 *
 * Usage pattern:
 *   if (await isWebhookDuplicate('razorpay', eventId)) return;
 *   // ... process webhook ...
 */

/**
 * Check if a webhook event has already been processed.
 * If not, atomically claim it for processing.
 *
 * @param {string} provider - Provider name (e.g., 'razorpay', 'twilio', 'exotel')
 * @param {string} eventId - Unique event identifier from the provider
 * @returns {Promise<boolean>} - true if this is a duplicate (skip processing)
 */
export async function isWebhookDuplicate(provider, eventId) {
  if (!provider || !eventId) return false;

  try {
    await dbRun(
      'INSERT INTO processed_webhooks (provider, event_id) VALUES (?, ?)',
      [provider, eventId]
    );
    return false; // First time — proceed with processing
  } catch (err) {
    // UNIQUE constraint violation → already processed
    logger.info(`[WebhookDedup] Duplicate ${provider} webhook skipped: ${eventId}`);
    return true;
  }
}

/**
 * Clean up old webhook records to prevent unbounded table growth.
 * Keeps records for 7 days (sufficient for any provider retry window).
 */
export async function cleanupOldWebhooks() {
  try {
    const result = await dbRun(
      `DELETE FROM processed_webhooks WHERE processed_at < datetime('now', '-7 days')`
    );
    if (result.changes > 0) {
      logger.info(`[WebhookDedup] Cleaned up ${result.changes} old webhook records`);
    }
    return result.changes;
  } catch (err) {
    logger.error('[WebhookDedup] Cleanup failed:', err.message);
    return 0;
  }
}
