import { WebSocket } from 'ws';

// Set of connected dashboard WebSocket clients
export const dashboardClients = new Set();

/**
 * Handle a new connection to /dashboard-ws
 */
export function handleDashboardConnection(ws) {
  dashboardClients.add(ws);
  console.log(`[DashboardWS] Client connected. Total dashboard clients: ${dashboardClients.size}`);

  ws.on('close', () => {
    dashboardClients.delete(ws);
    console.log(`[DashboardWS] Client disconnected. Total: ${dashboardClients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[DashboardWS] Error:', err.message);
    dashboardClients.delete(ws);
  });

  // Send initial handshake
  ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
}

/**
 * Broadcast an event to all connected dashboard clients
 */
export function broadcastToDashboard(event) {
  const message = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.error('[DashboardWS] Broadcast error:', err.message);
      }
    }
  }
}
