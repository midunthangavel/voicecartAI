import { dbRun, dbGet } from '../db.js';
import { redisClient } from './redisClient.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TTL_HOURS = 24;

/**
 * Claim an idempotency key atomically across distributed database and Redis.
 * Returns true if this is the first execution (claim acquired).
 * Returns false if key was already claimed (duplicate execution prevented).
 *
 * Now includes an expires_at column for automated cleanup.
 */
export async function claimIdempotencyKey(key, category = 'default', tenantId = null, restaurantId = null) {
  if (!key) return true;

  const redisKey = `idem:${key}`;

  // 1. Check Redis if available
  try {
    const exists = await redisClient.get(redisKey);
    if (exists) {
      logger.info(`[Idempotency] Duplicate side-effect skipped via Redis key: ${key}`);
      return false;
    }
  } catch (err) {
    logger.warn('[Idempotency] Redis check failed, falling through to DB:', err.message);
  }

  // 2. Atomic Database Insert with TTL
  try {
    await dbRun(
      `INSERT INTO side_effect_idempotency (idempotency_key, category, tenant_id, restaurant_id, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '+${DEFAULT_TTL_HOURS} hours'))`,
      [key, category, tenantId, restaurantId]
    );

    // Cache in Redis for the same TTL
    try {
      await redisClient.set(redisKey, '1', 'EX', DEFAULT_TTL_HOURS * 3600);
    } catch (err) {
      logger.warn('[Idempotency] Redis cache set failed:', err.message);
    }

    return true; // Claimed successfully
  } catch (err) {
    // Unique constraint violation — key was already claimed
    logger.info(`[Idempotency] Duplicate side-effect skipped via DB ledger: ${key}`);
    return false;
  }
}

/**
 * Clean up expired idempotency keys from the database.
 * Should be called periodically (e.g., hourly) to prevent unbounded growth.
 */
export async function cleanupExpiredIdempotencyKeys() {
  try {
    const result = await dbRun(
      `DELETE FROM side_effect_idempotency WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`
    );
    if (result.changes > 0) {
      logger.info(`[Idempotency] Cleaned up ${result.changes} expired keys`);
    }
    return result.changes;
  } catch (err) {
    logger.error('[Idempotency] Cleanup failed:', err.message);
    return 0;
  }
}
