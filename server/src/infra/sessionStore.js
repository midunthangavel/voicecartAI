import redisClient from './redisClient.js';

const SESSION_PREFIX = 'voicecart:session:';
const DEFAULT_TTL_SECONDS = 3600; // 1 hour TTL

/**
 * Ephemeral Voice Session Store
 * 
 * Implements ultra-fast Redis-backed ephemeral voice state management
 * with distributed multi-instance discovery.
 */

export async function createSession(sessionId, initialData = {}, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const tenantId = initialData.tenantId || initialData.tenant_id;
  const restaurantId = initialData.restaurantId || initialData.restaurant_id;

  const payload = {
    ...initialData,
    id: sessionId,
    tenantId,
    restaurantId,
    createdAt: initialData.createdAt || new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };

  await redisClient.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
  return payload;
}

export async function getSession(sessionId) {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const raw = await redisClient.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function updateSession(sessionId, partialData = {}, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const current = await getSession(sessionId);
  if (!current) return null;

  const updated = {
    ...current,
    ...partialData,
    lastActivity: new Date().toISOString(),
  };

  const key = `${SESSION_PREFIX}${sessionId}`;
  await redisClient.set(key, JSON.stringify(updated), 'EX', ttlSeconds);
  return updated;
}

export async function deleteSession(sessionId) {
  const key = `${SESSION_PREFIX}${sessionId}`;
  return await redisClient.del(key);
}

export async function touchSession(sessionId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const key = `${SESSION_PREFIX}${sessionId}`;
  return await redisClient.expire(key, ttlSeconds);
}

/**
 * List all active sessions across cluster filtered by tenant and restaurant
 */
export async function listActiveSessions(tenantId = null, restaurantId = null) {
  // Use SCAN instead of KEYS to avoid blocking the Redis event loop (O(N) operation)
  const allKeys = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await redisClient.scan(cursor, 'MATCH', `${SESSION_PREFIX}*`, 'COUNT', 500);
    cursor = nextCursor;
    allKeys.push(...batch);
  } while (cursor !== '0');

  const active = [];

  for (const key of allKeys) {
    const raw = await redisClient.get(key);
    if (raw) {
      try {
        const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const sTenant = session.tenantId || session.tenant_id;
        const sRest = session.restaurantId || session.restaurant_id;

        if (tenantId && sTenant && sTenant !== tenantId) continue;
        if (restaurantId && sRest && sRest !== restaurantId) continue;

        active.push(session);
      } catch (err) {
        // Warn instead of silently swallowing parse errors
        console.warn(`[SessionStore] Failed to parse session ${key}:`, err.message);
      }
    }
  }

  return active;
}
