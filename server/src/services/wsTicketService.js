import crypto from 'crypto';

const TICKET_TTL_MS = 30 * 1000; // 30 seconds for dashboard & web
const STREAM_TICKET_TTL_MS = 60 * 1000; // 60 seconds for telephony streams

const activeTickets = new Map();
const activeStreamTickets = new Map();

/**
 * Generate a single-use short-lived WebSocket authentication ticket for dashboard/web
 */
export function createWsTicket(userContext) {
  const ticket = `wst_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;

  activeTickets.set(ticket, {
    auth: {
      userId: userContext.userId || userContext.sub,
      email: userContext.email,
      name: userContext.name,
      tenantId: userContext.tenantId || userContext.tenant_id,
      restaurantId: userContext.restaurantId || userContext.restaurant_id,
      role: userContext.role || 'STAFF',
    },
    expiresAt: Date.now() + TICKET_TTL_MS,
  });

  return { ticket, expiresInSeconds: 30 };
}

/**
 * Consume and immediately invalidate a single-use WebSocket ticket
 */
export function consumeWsTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;

  const record = activeTickets.get(ticket);
  if (!record) return null;

  // Single-use: delete immediately
  activeTickets.delete(ticket);

  if (Date.now() > record.expiresAt) {
    return null; // Expired
  }

  return record.auth;
}

/**
 * Generate a single-use signed stream ticket for Twilio/Exotel media streams
 */
export function createStreamTicket(callMetadata = {}) {
  const ticket = `strm_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;

  activeStreamTickets.set(ticket, {
    metadata: {
      callSid: callMetadata.callSid,
      provider: callMetadata.provider || 'twilio',
      callerPhone: callMetadata.callerPhone,
      tenantId: callMetadata.tenantId,
      restaurantId: callMetadata.restaurantId,
    },
    expiresAt: Date.now() + STREAM_TICKET_TTL_MS,
  });

  return ticket;
}

/**
 * Consume and invalidate a single-use stream ticket
 */
export function consumeStreamTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;

  const record = activeStreamTickets.get(ticket);
  if (!record) return null;

  activeStreamTickets.delete(ticket);

  if (Date.now() > record.expiresAt) {
    return null;
  }

  return record.metadata;
}

/**
 * Cleanup expired tickets periodic sweep
 */
setInterval(() => {
  const now = Date.now();
  for (const [ticket, record] of activeTickets.entries()) {
    if (now > record.expiresAt) activeTickets.delete(ticket);
  }
  for (const [ticket, record] of activeStreamTickets.entries()) {
    if (now > record.expiresAt) activeStreamTickets.delete(ticket);
  }
}, 60000);
