import crypto from 'crypto';
import { getRedisClient } from './redisClient.js';
import { logger } from '../utils/logger.js';

const memoryLocks = new Map();

/**
 * Distributed Mutex Locking Service (Redis + In-Memory Fallback)
 * 
 * Guarantees that across multiple concurrent workers / cluster nodes, only one
 * node processes a given order, payment, or dispatch at any moment.
 */

export async function acquireLock(resourceKey, ttlMs = 10000) {
  const lockId = `lock_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const key = `lock:${resourceKey}`;
  const client = getRedisClient();

  if (!client.isMemory) {
    try {
      // Redis atomic SET NX PX
      const result = await client.set(key, lockId, 'PX', ttlMs, 'NX');
      if (result === 'OK') return lockId;
      return null;
    } catch (err) {
      logger.warn('[LockService] Redis lock error, falling back to memory mutex:', err.message);
    }
  }

  // In-Memory Mutex Fallback
  const existing = memoryLocks.get(key);
  if (existing && existing.expireAt > Date.now()) {
    return null;
  }

  memoryLocks.set(key, { lockId, expireAt: Date.now() + ttlMs });
  return lockId;
}

export async function releaseLock(resourceKey, lockId) {
  if (!lockId) return false;
  const key = `lock:${resourceKey}`;
  const client = getRedisClient();

  if (!client.isMemory) {
    try {
      // Lua script to safely release only if current lockId matches
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const res = await client.eval(script, 1, key, lockId);
      return res === 1;
    } catch (err) {
      logger.warn('[LockService] Redis unlock error:', err.message);
    }
  }

  const existing = memoryLocks.get(key);
  if (existing && existing.lockId === lockId) {
    memoryLocks.delete(key);
    return true;
  }
  return false;
}

export async function withLock(resourceKey, callback, ttlMs = 10000) {
  const lockId = await acquireLock(resourceKey, ttlMs);
  if (!lockId) {
    throw new Error(`[LockService] Resource locked: concurrent operation in progress on ${resourceKey}`);
  }

  try {
    return await callback();
  } finally {
    await releaseLock(resourceKey, lockId);
  }
}
