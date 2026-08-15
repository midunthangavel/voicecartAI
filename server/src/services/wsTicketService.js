import crypto from 'crypto';

const TICKET_TTL_MS = 30 * 1000; // 30 seconds
const activeTickets = new Map();

/**
 * Generate a single-use short-lived WebSocket authentication ticket
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
 * Cleanup expired tickets periodic sweep
 */
setInterval(() => {
  const now = Date.now();
  for (const [ticket, record] of activeTickets.entries()) {
    if (now > record.expiresAt) {
      activeTickets.delete(ticket);
    }
  }
}, 60000);
