import crypto from 'crypto';
import { redisClient } from '../infra/redisClient.js';

const TICKET_TTL_SECONDS = 30; // 30 seconds for dashboard & web
const STREAM_TICKET_TTL_SECONDS = 60; // 60 seconds for telephony streams

/**
 * Generate a single-use short-lived WebSocket authentication ticket for dashboard/web
 * Persisted in Redis / distributed cache with TTL for multi-instance scalability.
 */
export async function createWsTicket(userContext) {
  const ticket = `wst_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;

  const authData = {
    userId: userContext.userId || userContext.sub,
    email: userContext.email,
    name: userContext.name,
    tenantId: userContext.tenantId || userContext.tenant_id,
    restaurantId: userContext.restaurantId || userContext.restaurant_id,
    role: userContext.role || 'STAFF',
  };

  await redisClient.set(`wst:${ticket}`, JSON.stringify(authData), 'EX', TICKET_TTL_SECONDS);

  return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
}

/**
 * Consume and immediately invalidate a single-use WebSocket ticket.
 *
 * SECURITY: Uses GETDEL (atomic get-and-delete) to prevent race conditions
 * where two concurrent requests could both consume the same ticket.
 * Previously used separate GET + DEL which allowed a TOCTOU vulnerability.
 */
export async function consumeWsTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;

  const key = `wst:${ticket}`;

  // Atomic get-and-delete — prevents race condition
  const record = await redisClient.getdel(key);
  if (!record) return null;

  try {
    return typeof record === 'string' ? JSON.parse(record) : record;
  } catch {
    return null;
  }
}

/**
 * Generate a single-use signed stream ticket for Twilio/Exotel media streams
 * Persisted in Redis / distributed cache with TTL.
 */
export async function createStreamTicket(callMetadata = {}) {
  const ticket = `strm_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;

  const metaData = {
    callSid: callMetadata.callSid,
    provider: callMetadata.provider || 'twilio',
    callerPhone: callMetadata.callerPhone,
    tenantId: callMetadata.tenantId,
    restaurantId: callMetadata.restaurantId,
  };

  await redisClient.set(`strm:${ticket}`, JSON.stringify(metaData), 'EX', STREAM_TICKET_TTL_SECONDS);

  return ticket;
}

/**
 * Consume and invalidate a single-use stream ticket atomically.
 *
 * SECURITY: Uses GETDEL for atomic consumption, same as consumeWsTicket.
 */
export async function consumeStreamTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;

  const key = `strm:${ticket}`;

  // Atomic get-and-delete — prevents race condition
  const record = await redisClient.getdel(key);
  if (!record) return null;

  try {
    return typeof record === 'string' ? JSON.parse(record) : record;
  } catch {
    return null;
  }
}
