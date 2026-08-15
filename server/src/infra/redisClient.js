import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

/**
 * Universal Redis Client Adapter
 * 
 * In Production: Connects strictly to Redis via REDIS_URL and fails closed.
 * In Development/Test: Zero-config high-speed in-memory fallback.
 */

class InMemoryRedisAdapter {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.isMemory = true;
    logger.info('[Redis] Running in local development In-Memory adapter mode.');
  }

  async get(key) {
    this._checkExpired(key);
    const val = this.store.get(key);
    return val !== undefined ? val : null;
  }

  async set(key, value, mode, ttlSeconds) {
    this.store.set(key, value);
    if (mode === 'EX' && ttlSeconds) {
      this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    } else {
      this.ttls.delete(key);
    }
    return 'OK';
  }

  async del(key) {
    this.ttls.delete(key);
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key) {
    this._checkExpired(key);
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key, ttlSeconds) {
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    return 1;
  }

  async keys(pattern = '*') {
    const validKeys = [];
    for (const key of this.store.keys()) {
      if (!this._checkExpired(key)) {
        if (pattern === '*' || key.startsWith(pattern.replace('*', ''))) {
          validKeys.push(key);
        }
      }
    }
    return validKeys;
  }

  async flushall() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  _checkExpired(key) {
    const expireAt = this.ttls.get(key);
    if (expireAt && Date.now() > expireAt) {
      this.store.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }
}

let redisInstance = null;

export function getRedisClient() {
  if (redisInstance) return redisInstance;

  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !redisUrl) {
    throw new Error('[Fatal Error] REDIS_URL environment variable is mandatory for production deployments.');
  }

  if (redisUrl) {
    try {
      logger.info(`[Redis] Connecting to external Redis cluster at ${redisUrl}...`);
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      client.on('connect', () => logger.info('[Redis] Connected successfully to Redis server.'));
      client.on('error', (err) => {
        if (isProduction) {
          logger.error('[Redis:Fatal] Production Redis connection error:', err.message);
        } else {
          logger.warn('[Redis] Development Redis error:', err.message);
        }
      });

      redisInstance = client;
    } catch (err) {
      if (isProduction) {
        throw new Error(`[Fatal] Failed to initialize production Redis client: ${err.message}`);
      }
      logger.warn('[Redis] Development instantiation fallback to in-memory:', err.message);
      redisInstance = new InMemoryRedisAdapter();
    }
  } else {
    redisInstance = new InMemoryRedisAdapter();
  }

  return redisInstance;
}

export const redisClient = getRedisClient();
export default redisClient;
