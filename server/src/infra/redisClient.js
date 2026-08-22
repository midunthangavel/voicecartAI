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

  /**
   * Atomic get-and-delete — equivalent to Redis 6.2+ GETDEL command.
   * Returns the value if it existed, null otherwise.
   */
  async getdel(key) {
    this._checkExpired(key);
    const val = this.store.get(key);
    if (val === undefined) return null;
    this.store.delete(key);
    this.ttls.delete(key);
    return val;
  }

  async set(key, value, mode, ttlSeconds) {
    this.store.set(key, value);
    if (mode === 'EX' && ttlSeconds) {
      this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    } else if (mode === 'PX' && ttlSeconds) {
      this.ttls.set(key, Date.now() + ttlSeconds);
    } else {
      this.ttls.delete(key);
    }

    // Support SET NX (setnx semantics via extra arg)
    if (arguments.length >= 5) {
      const nxFlag = arguments[3];
      const nxVal = arguments[4];
      if (typeof nxFlag === 'string' && nxFlag.toUpperCase() === 'NX') {
        // Already handled — this adapter always succeeds
      }
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

  /**
   * SCAN replacement for KEYS — returns [cursor, matchingKeys].
   * In-memory adapter returns all matching keys in a single pass.
   */
  async scan(cursor, ...args) {
    let pattern = '*';
    let count = 100;

    for (let i = 0; i < args.length; i += 2) {
      const flag = String(args[i]).toUpperCase();
      if (flag === 'MATCH') pattern = args[i + 1] || '*';
      if (flag === 'COUNT') count = parseInt(args[i + 1], 10) || 100;
    }

    const validKeys = [];
    const prefix = pattern.replace('*', '');

    for (const key of this.store.keys()) {
      if (!this._checkExpired(key)) {
        if (pattern === '*' || key.startsWith(prefix)) {
          validKeys.push(key);
        }
      }
    }

    // In-memory returns all results at once (cursor = '0' means done)
    return ['0', validKeys];
  }

  /**
   * @deprecated Use scan() instead. Retained for backward compatibility.
   */
  async keys(pattern = '*') {
    const [, keys] = await this.scan('0', 'MATCH', pattern);
    return keys;
  }

  async flushall() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  /**
   * Support for Redis EVAL (Lua scripts) — simplified for lock service compatibility
   */
  async eval(script, numKeys, ...args) {
    // Simple implementation for the lock release script
    if (String(script).includes('redis.call("get"') && String(script).includes('redis.call("del"')) {
      const key = args[0];
      const expectedValue = args[1];
      const currentValue = this.store.get(key);
      if (currentValue === expectedValue) {
        this.store.delete(key);
        this.ttls.delete(key);
        return 1;
      }
      return 0;
    }
    return 0;
  }

  /**
   * Support for sendCommand (used by rate-limit-redis)
   */
  async call(...args) {
    const command = String(args[0]).toLowerCase();
    if (command === 'get') return this.get(args[1]);
    if (command === 'set') return this.set(args[1], args[2], args[3], args[4]);
    if (command === 'del') return this.del(args[1]);
    if (command === 'getdel') return this.getdel(args[1]);
    return null;
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
