import { createSession, getSession, updateSession, deleteSession, listActiveSessions } from './sessionStore.js';
import { redisClient } from './redisClient.js';
import { logger } from '../utils/logger.js';

const SESSION_PREFIX = 'vc:session:';

/**
 * List active sessions using SCAN instead of KEYS for production safety.
 *
 * KEYS is O(N) and blocks the Redis event loop. SCAN iterates
 * incrementally and never blocks other operations.
 *
 * This function is an enhancement to the sessionStore's built-in
 * listActiveSessions, using SCAN when connected to real Redis.
 */
export async function listActiveSessionsSafe() {
  const client = redisClient;

  // InMemoryRedisAdapter already handles SCAN correctly
  if (client.isMemory) {
    return listActiveSessions();
  }

  const keys = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', `${SESSION_PREFIX}*`, 'COUNT', 500);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  const sessions = [];
  for (const key of keys) {
    try {
      const data = await client.get(key);
      if (data) {
        sessions.push(typeof data === 'string' ? JSON.parse(data) : data);
      }
    } catch (err) {
      logger.warn(`[SessionScanner] Failed to parse session ${key}:`, err.message);
    }
  }

  return sessions;
}
