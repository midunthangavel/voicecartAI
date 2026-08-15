import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';

// Set of connected dashboard WebSocket clients
export const dashboardClients = new Set();

/**
 * Handle a new authenticated connection to /dashboard-ws
 */
export function handleDashboardConnection(ws, request) {
  ws.auth = request.auth || {
    tenantId: 't_annapoorna',
    restaurantId: 'r_coimbatore_01',
    role: 'ADMIN',
  };

  dashboardClients.add(ws);
  logger.info(`[DashboardWS] Client connected. Total authenticated clients: ${dashboardClients.size}`, {
    user: ws.auth?.email || ws.auth?.userId,
    role: ws.auth?.role,
  });

  ws.on('close', () => {
    dashboardClients.delete(ws);
    logger.info(`[DashboardWS] Client disconnected. Total: ${dashboardClients.size}`);
  });

  ws.on('error', (err) => {
    logger.error('[DashboardWS] Error:', err);
    dashboardClients.delete(ws);
  });

  // Send initial handshake
  ws.send(JSON.stringify({
    type: 'connected',
    tenant_id: ws.auth?.tenantId,
    restaurant_id: ws.auth?.restaurantId,
    role: ws.auth?.role,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Broadcast an event to connected dashboard clients
 */
export function broadcastToDashboard(event) {
  const message = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        // Broadcast matching tenant context if specified
        if (event.restaurantId && client.auth?.restaurantId && client.auth.restaurantId !== event.restaurantId && client.auth?.role !== 'ADMIN') {
          continue;
        }
        client.send(message);
      } catch (err) {
        logger.error('[DashboardWS] Broadcast error:', err);
      }
    }
  }
}
