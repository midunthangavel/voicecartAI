import { dbRun, dbGet } from '../db.js';
import { redisClient } from './redisClient.js';
import { logger } from '../utils/logger.js';

/**
 * Claim an idempotency key atomically across distributed database and Redis.
 * Returns true if this is the first execution (claim acquired).
 * Returns false if key was already claimed (duplicate execution prevented).
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
  } catch {}

  // 2. Atomic Database Insert
  try {
    await dbRun(
      'INSERT INTO side_effect_idempotency (idempotency_key, category, tenant_id, restaurant_id) VALUES (?, ?, ?, ?)',
      [key, category, tenantId, restaurantId]
    );

    // Cache in Redis for 24 hours
    try {
      await redisClient.set(redisKey, '1', 'EX', 86400);
    } catch {}

    return true; // Claimed successfully
  } catch (err) {
    // Unique constraint violation
    logger.info(`[Idempotency] Duplicate side-effect skipped via DB ledger: ${key}`);
    return false;
  }
}
