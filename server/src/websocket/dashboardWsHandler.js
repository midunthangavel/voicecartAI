import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';

// Set of connected dashboard WebSocket clients
export const dashboardClients = new Set();

/**
 * Handle a new authenticated connection to /dashboard-ws
 */
export function handleDashboardConnection(ws, request) {
  ws.auth = request.auth || null;

  if (!ws.auth) {
    ws.close(4001, 'Authentication Required');
    return;
  }

  dashboardClients.add(ws);
  logger.info(`[DashboardWS] Client connected (User: ${ws.auth.email || ws.auth.userId}, Role: ${ws.auth.role}, Restaurant: ${ws.auth.restaurantId})`);

  ws.on('close', () => {
    dashboardClients.delete(ws);
  });

  ws.on('error', (err) => {
    logger.error('[DashboardWS] Error:', err);
    dashboardClients.delete(ws);
  });

  // Send initial handshake
  ws.send(JSON.stringify({
    type: 'connected',
    tenant_id: ws.auth.tenantId,
    restaurant_id: ws.auth.restaurantId,
    role: ws.auth.role,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Broadcast an event strictly to matching tenant and restaurant dashboard clients
 */
export function broadcastToDashboard(event) {
  const message = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN && client.auth) {
      try {
        // Enforce strict tenant boundary
        if (event.tenantId && client.auth.tenantId && client.auth.tenantId !== event.tenantId) {
          continue;
        }

        // Enforce restaurant boundary (ADMIN role can see all within their tenant)
        if (event.restaurantId && client.auth.restaurantId && client.auth.restaurantId !== event.restaurantId && client.auth.role !== 'ADMIN') {
          continue;
        }

        client.send(message);
      } catch (err) {
        logger.error('[DashboardWS] Broadcast error:', err);
      }
    }
  }
}
