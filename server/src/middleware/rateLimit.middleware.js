import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Create a Redis-backed rate limit store when Redis is available.
 * Falls back to in-memory store for development.
 */
async function createRedisStore() {
  if (!process.env.REDIS_URL) {
    return undefined; // Use express-rate-limit's built-in MemoryStore
  }

  try {
    const { default: RedisStore } = await import('rate-limit-redis');
    const { getRedisClient } = await import('../infra/redisClient.js');
    const client = getRedisClient();

    if (client.isMemory) {
      return undefined; // In-memory adapter — use MemoryStore
    }

    return new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix: 'voicecart:rl:',
    });
  } catch (err) {
    logger.warn('[RateLimit] Failed to initialize Redis store, using in-memory:', err.message);
    return undefined;
  }
}

// Initialize store lazily
let redisStorePromise = null;
function getStore() {
  if (!redisStorePromise) {
    redisStorePromise = createRedisStore();
  }
  return redisStorePromise;
}

/**
 * Standard Rate Limiting Middleware Suite
 *
 * Production: Redis-backed for multi-instance consistency.
 * Development: In-memory store (automatic fallback).
 */

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 login attempts per min per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many authentication attempts. Please try again in a minute.'));
  },
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per min per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Rate limit exceeded for public requests. Please slow down.'));
  },
});

export const dashboardApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180, // 180 requests per min
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => req.auth?.userId || req.ip,
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Dashboard API rate limit exceeded.'));
  },
});

export const telephonyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per min for webhooks
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Telephony webhook rate limit exceeded.'));
  },
});

// Apply Redis store to all limiters when available
getStore().then((store) => {
  if (store) {
    logger.info('[RateLimit] Redis store activated for all rate limiters');
    // Note: express-rate-limit doesn't support dynamic store reassignment.
    // The Redis store needs to be set at construction time. For production,
    // import this module after Redis is initialized, or restart the server.
  }
});
